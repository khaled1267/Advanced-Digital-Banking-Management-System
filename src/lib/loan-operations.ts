import mongoose, { type ClientSession, type HydratedDocument } from "mongoose";
import { formatBdtPaisa, MAX_BDT_PAISA, parseBdtPaisa } from "@/lib/bdt-money";
import { BankAccount } from "@/models/BankAccount";
import { Loan } from "@/models/Loan";
import { LoanRepayment, type LoanRepaymentDocument } from "@/models/LoanRepayment";
import { Transaction } from "@/models/Transaction";
import { createNotification, formatNotificationAmount } from "@/lib/notification-operations";
import type { ApproveLoanInput, CreateLoanInput, CreateLoanRepaymentInput } from "@/lib/validation/loan";

export class LoanOperationError extends Error {
  constructor(readonly code:
    | "NOT_FOUND"
    | "CONFLICT"
    | "APPROVED_AMOUNT_UNAVAILABLE"
    | "APPROVED_AMOUNT_LIMIT"
    | "ACCOUNT_UNAVAILABLE"
    | "BALANCE_LIMIT") {
    super(code);
    this.name = "LoanOperationError";
  }
}

export class LoanRepaymentOperationError extends Error {
  constructor(readonly code:
    | "NOT_FOUND"
    | "LOAN_NOT_REPAYABLE"
    | "OUTSTANDING_UNAVAILABLE"
    | "SOURCE_ACCOUNT_UNAVAILABLE"
    | "INSUFFICIENT_BALANCE"
    | "MINIMUM_BALANCE"
    | "OVERPAYMENT"
    | "IDEMPOTENCY_CONFLICT"
    | "OUTSTANDING_CHANGED") {
    super(code);
    this.name = "LoanRepaymentOperationError";
  }
}

type LoanRepaymentResult = {
  repayment: HydratedDocument<LoanRepaymentDocument>;
  outstandingBalance: string;
  replayed: boolean;
};

async function findMatchingLoanRepayment(
  customerId: mongoose.Types.ObjectId,
  loanId: string,
  input: CreateLoanRepaymentInput,
  session?: ClientSession,
) {
  let query = LoanRepayment.findOne({ customerId, idempotencyKey: input.idempotencyKey });
  if (session) query = query.session(session);
  const repayment = await query;
  if (!repayment) return null;

  const requestedPaisa = parseBdtPaisa(input.amount);
  const storedPaisa = parseBdtPaisa(repayment.amount.toString());
  const matches =
    repayment.status === "COMPLETED" &&
    repayment.loanId.toString() === loanId.toLowerCase() &&
    repayment.sourceAccountId.toString() === input.sourceAccountId.toLowerCase() &&
    requestedPaisa !== null &&
    requestedPaisa === storedPaisa;
  if (!matches) throw new LoanRepaymentOperationError("IDEMPOTENCY_CONFLICT");

  return {
    repayment,
    outstandingBalance: repayment.outstandingBalanceAfter.toString(),
    replayed: true,
  } satisfies LoanRepaymentResult;
}

async function executeLoanRepaymentInSession(
  customerId: mongoose.Types.ObjectId,
  loanId: string,
  input: CreateLoanRepaymentInput,
  session: ClientSession,
): Promise<LoanRepaymentResult> {
  const replay = await findMatchingLoanRepayment(customerId, loanId, input, session);
  if (replay) return replay;

  const loan = await Loan.findOne({ _id: loanId, customerId }).session(session);
  if (!loan) throw new LoanRepaymentOperationError("NOT_FOUND");
  if (loan.status !== "DISBURSED") throw new LoanRepaymentOperationError("LOAN_NOT_REPAYABLE");

  const amountPaisa = parseBdtPaisa(input.amount);
  const approvedAmountPaisa = loan.approvedAmount
    ? parseBdtPaisa(loan.approvedAmount.toString())
    : null;
  const outstandingPaisa = loan.outstandingBalance
    ? parseBdtPaisa(loan.outstandingBalance.toString())
    : approvedAmountPaisa;
  if (amountPaisa === null || amountPaisa <= BigInt("0") || outstandingPaisa === null || outstandingPaisa < BigInt("0")) {
    throw new LoanRepaymentOperationError("OUTSTANDING_UNAVAILABLE");
  }
  if (amountPaisa > outstandingPaisa) throw new LoanRepaymentOperationError("OVERPAYMENT");

  const account = await BankAccount.findOne({
    _id: input.sourceAccountId,
    userId: customerId,
    status: "ACTIVE",
    currency: "BDT",
  }).select("_id balance transactionLimits").session(session);
  if (!account) throw new LoanRepaymentOperationError("SOURCE_ACCOUNT_UNAVAILABLE");

  const accountBalancePaisa = parseBdtPaisa(account.balance.toString());
  if (accountBalancePaisa === null || accountBalancePaisa < amountPaisa) {
    throw new LoanRepaymentOperationError("INSUFFICIENT_BALANCE");
  }
  const minimumBalancePaisa = account.transactionLimits?.minimumBalance
    ? parseBdtPaisa(account.transactionLimits.minimumBalance.toString()) ?? BigInt("0")
    : BigInt("0");
  if (accountBalancePaisa - amountPaisa < minimumBalancePaisa || minimumBalancePaisa + amountPaisa > MAX_BDT_PAISA) {
    throw new LoanRepaymentOperationError("MINIMUM_BALANCE");
  }
  const minimumPriorBalance = mongoose.Types.Decimal128.fromString(formatBdtPaisa(minimumBalancePaisa + amountPaisa));

  const amountText = formatBdtPaisa(amountPaisa);
  const amount = mongoose.Types.Decimal128.fromString(amountText);
  const debit = mongoose.Types.Decimal128.fromString(`-${amountText}`);
  const accountUpdate = await BankAccount.updateOne(
    {
      _id: account._id,
      userId: customerId,
      status: "ACTIVE",
      currency: "BDT",
      balance: { $gte: minimumPriorBalance },
    },
    { $inc: { balance: debit } },
    { session },
  );
  if (accountUpdate.matchedCount !== 1) {
    const latestAccount = await BankAccount.findOne({ _id: account._id, userId: customerId })
      .select("status currency balance transactionLimits")
      .session(session);
    if (!latestAccount || latestAccount.status !== "ACTIVE" || latestAccount.currency !== "BDT") {
      throw new LoanRepaymentOperationError("SOURCE_ACCOUNT_UNAVAILABLE");
    }
    const latestBalancePaisa = parseBdtPaisa(latestAccount.balance.toString());
    if (latestBalancePaisa === null || latestBalancePaisa < amountPaisa) {
      throw new LoanRepaymentOperationError("INSUFFICIENT_BALANCE");
    }
    const latestMinimumPaisa = latestAccount.transactionLimits?.minimumBalance
      ? parseBdtPaisa(latestAccount.transactionLimits.minimumBalance.toString()) ?? BigInt("0")
      : BigInt("0");
    if (latestBalancePaisa - amountPaisa < latestMinimumPaisa) {
      throw new LoanRepaymentOperationError("MINIMUM_BALANCE");
    }
    throw new LoanRepaymentOperationError("SOURCE_ACCOUNT_UNAVAILABLE");
  }

  const remainingPaisa = outstandingPaisa - amountPaisa;
  const remainingAmount = mongoose.Types.Decimal128.fromString(formatBdtPaisa(remainingPaisa));
  const loanFilter: Record<string, unknown> = {
    _id: loan._id,
    customerId,
    status: "DISBURSED",
    ...(loan.outstandingBalance
      ? { outstandingBalance: { $gte: amount } }
      : {
          outstandingBalance: { $exists: false },
          approvedAmount: loan.approvedAmount,
        }),
  };
  const loanUpdate = loan.outstandingBalance
    ? await Loan.findOneAndUpdate(
        loanFilter,
        {
          $inc: { outstandingBalance: debit },
          ...(remainingPaisa === BigInt("0") ? { $set: { status: "PAID" } } : {}),
        },
        { returnDocument: "after", runValidators: true, session },
      )
    : await Loan.findOneAndUpdate(
        loanFilter,
        {
          $set: {
            outstandingBalance: remainingAmount,
            ...(remainingPaisa === BigInt("0") ? { status: "PAID" } : {}),
          },
        },
        { returnDocument: "after", runValidators: true, session },
      );
  if (!loanUpdate) throw new LoanRepaymentOperationError("OUTSTANDING_CHANGED");

  const [transaction] = await Transaction.create([{
    transactionType: "LOAN_REPAYMENT",
    fromAccount: account._id,
    amount,
    currency: "BDT",
    status: "COMPLETED",
    description: `Repayment for loan ${loan.loanId}`,
    createdBy: customerId,
  }], { session });
  const [repayment] = await LoanRepayment.create([{
    loanId: loan._id,
    customerId,
    sourceAccountId: account._id,
    amount,
    outstandingBalanceAfter: remainingAmount,
    currency: "BDT",
    transactionId: transaction._id,
    idempotencyKey: input.idempotencyKey,
    status: "COMPLETED",
  }], { session });

  return {
    repayment,
    outstandingBalance: remainingAmount.toString(),
    replayed: false,
  };
}

export async function executeLoanRepayment(
  customerId: mongoose.Types.ObjectId,
  loanId: string,
  input: CreateLoanRepaymentInput,
) {
  await Promise.all([Loan.init(), LoanRepayment.init(), Transaction.init()]);
  const session = await mongoose.startSession();
  try {
    let result: LoanRepaymentResult | undefined;
    try {
      await session.withTransaction(async () => {
        result = await executeLoanRepaymentInSession(customerId, loanId, input, session);
      });
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) throw error;
      // The transaction may already be aborted. Resolve only a committed matching record outside it.
      const replay = await findMatchingLoanRepayment(customerId, loanId, input);
      if (replay) return replay;
      throw error;
    }
    if (!result) throw new Error("Loan repayment transaction returned no result.");
    return result;
  } finally {
    await session.endSession();
  }
}

function isDuplicateKeyError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

async function executeLoanDisbursement(
  loanId: string,
  adminId: mongoose.Types.ObjectId,
  session: ClientSession,
) {
  const loan = await Loan.findOne({ _id: loanId, status: "APPROVED" }).session(session);
  if (!loan) {
    const exists = await Loan.exists({ _id: loanId }).session(session);
    throw new LoanOperationError(exists ? "CONFLICT" : "NOT_FOUND");
  }

  const approvedAmount = loan.approvedAmount?.toString();
  const amountPaisa = approvedAmount ? parseBdtPaisa(approvedAmount) : null;
  if (amountPaisa === null || amountPaisa <= BigInt("0")) {
    throw new LoanOperationError("APPROVED_AMOUNT_UNAVAILABLE");
  }
  const amount = mongoose.Types.Decimal128.fromString(formatBdtPaisa(amountPaisa));

  const account = await BankAccount.findOne({
    _id: loan.accountId,
    userId: loan.customerId,
    status: "ACTIVE",
    currency: "BDT",
  }).select("_id balance").session(session);
  if (!account) throw new LoanOperationError("ACCOUNT_UNAVAILABLE");

  const balancePaisa = parseBdtPaisa(account.balance.toString());
  if (balancePaisa === null || balancePaisa + amountPaisa > MAX_BDT_PAISA) {
    throw new LoanOperationError("BALANCE_LIMIT");
  }
  const maximumPriorBalance = mongoose.Types.Decimal128.fromString(
    formatBdtPaisa(MAX_BDT_PAISA - amountPaisa),
  );
  const accountUpdate = await BankAccount.updateOne(
    {
      _id: account._id,
      userId: loan.customerId,
      status: "ACTIVE",
      currency: "BDT",
      balance: { $lte: maximumPriorBalance },
    },
    { $inc: { balance: amount } },
    { session },
  );
  if (accountUpdate.matchedCount !== 1) {
    throw new LoanOperationError("ACCOUNT_UNAVAILABLE");
  }

  const [transaction] = await Transaction.create([{
    transactionType: "LOAN_DISBURSEMENT",
    toAccount: account._id,
    loanId: loan._id,
    amount,
    currency: "BDT",
    status: "COMPLETED",
    description: `Disbursement for loan ${loan.loanId}`,
    createdBy: adminId,
  }], { session });

  const disbursedAt = new Date();
  const updatedLoan = await Loan.findOneAndUpdate(
    { _id: loan._id, status: "APPROVED" },
    {
      $set: {
        status: "DISBURSED",
        disbursedBy: adminId,
        disbursedAt,
        disbursementTransactionId: transaction._id,
      },
    },
    { returnDocument: "after", runValidators: true, session },
  );
  if (!updatedLoan) throw new LoanOperationError("CONFLICT");

  return { loan: updatedLoan, transaction, replayed: false };
}

export async function disburseApprovedLoan(
  loanId: string,
  adminId: mongoose.Types.ObjectId,
) {
  // Ensure the unique index exists before any transaction can write a disbursement.
  await Promise.all([Loan.init(), Transaction.init()]);
  const session = await mongoose.startSession();
  try {
    let result: Awaited<ReturnType<typeof executeLoanDisbursement>> | undefined;
    await session.withTransaction(async () => {
      result = await executeLoanDisbursement(loanId, adminId, session);
    });
    if (!result) throw new Error("Loan disbursement transaction returned no result.");
    return result;
  } catch (error: unknown) {
    if (isDuplicateKeyError(error)) throw new LoanOperationError("CONFLICT");
    throw error;
  } finally {
    await session.endSession();
  }
}

export async function approveLoanApplication(
  loanId: string,
  adminId: mongoose.Types.ObjectId,
  approvedAmount?: ApproveLoanInput["approvedAmount"],
) {
  const approvedAt = new Date();
  const approvedAmountDecimal = approvedAmount
    ? mongoose.Types.Decimal128.fromString(approvedAmount)
    : undefined;
  const session = await mongoose.startSession();
  let approvedLoanId: string | null = null;
  try {
    await session.withTransaction(async () => {
      const loan = await Loan.findOneAndUpdate(
        {
          _id: loanId,
          status: "FORWARDED_TO_ADMIN",
          ...(approvedAmountDecimal ? { amount: { $gte: approvedAmountDecimal } } : {}),
        },
        {
          $set: {
            status: "APPROVED",
            approvedBy: adminId,
            approvedAt,
            ...(approvedAmountDecimal ? { approvedAmount: approvedAmountDecimal } : {}),
          },
          $unset: { activeAccountId: 1 },
        },
        { returnDocument: "after", runValidators: true, session },
      );
      if (loan) {
        approvedLoanId = loan._id.toString();
        const approvedDisplayAmount = loan.approvedAmount?.toString();
        const formattedAmount = approvedDisplayAmount ? formatNotificationAmount(approvedDisplayAmount) : null;
        await createNotification({
          userId: loan.customerId,
          type: "LOAN_APPROVED",
          title: "Loan Approved",
          message: formattedAmount ? `Your loan application for ${formattedAmount} has been approved.` : "Your loan application has been approved.",
          dedupeKey: `loan:${loan._id}:approved`,
          relatedEntityType: "loan",
          relatedEntityId: loan._id,
        }, session);
      }
    });
  } finally {
    await session.endSession();
  }
  const loan = approvedLoanId ? await Loan.findById(approvedLoanId) : null;
  if (loan) return loan;
  const existing = await Loan.findById(loanId).select("status amount");
  if (!existing) throw new LoanOperationError("NOT_FOUND");
  if (existing.status !== "FORWARDED_TO_ADMIN") throw new LoanOperationError("CONFLICT");
  if (approvedAmountDecimal) {
    const approvedAmountPaisa = parseBdtPaisa(approvedAmountDecimal.toString());
    const requestedAmountPaisa = parseBdtPaisa(existing.amount.toString());
    if (
      approvedAmountPaisa !== null &&
      requestedAmountPaisa !== null &&
      approvedAmountPaisa > requestedAmountPaisa
    ) {
      throw new LoanOperationError("APPROVED_AMOUNT_LIMIT");
    }
  }
  throw new LoanOperationError("CONFLICT");
}

export async function rejectLoanApplication(
  loanId: string,
  adminId: mongoose.Types.ObjectId,
  rejectionReason: string,
) {
  const rejectedAt = new Date();
  const session = await mongoose.startSession();
  let rejectedLoanId: string | null = null;
  try {
    await session.withTransaction(async () => {
      const loan = await Loan.findOneAndUpdate(
        { _id: loanId, status: "FORWARDED_TO_ADMIN" },
        {
          $set: { status: "REJECTED", rejectedBy: adminId, rejectedAt, rejectionReason },
          $unset: { activeAccountId: 1 },
        },
        { returnDocument: "after", runValidators: true, session },
      );
      if (loan) {
        rejectedLoanId = loan._id.toString();
        await createNotification({
          userId: loan.customerId,
          type: "LOAN_REJECTED",
          title: "Loan Application Rejected",
          message: "Your loan application was not approved.",
          dedupeKey: `loan:${loan._id}:rejected`,
          relatedEntityType: "loan",
          relatedEntityId: loan._id,
        }, session);
      }
    });
  } finally {
    await session.endSession();
  }
  const loan = rejectedLoanId ? await Loan.findById(rejectedLoanId) : null;
  if (loan) return loan;
  const existing = await Loan.exists({ _id: loanId });
  throw new LoanOperationError(existing ? "CONFLICT" : "NOT_FOUND");
}

export async function createLoanApplication(
  customerId: mongoose.Types.ObjectId,
  accountId: mongoose.Types.ObjectId,
  input: CreateLoanInput,
) {
  // Ensure MongoDB has installed the unique partial index before accepting writes.
  await Loan.init();
  const [loan] = await Loan.create([{
    customerId,
    accountId,
    activeAccountId: accountId,
    amount: mongoose.Types.Decimal128.fromString(input.amount),
    currency: "BDT",
    purpose: input.purpose,
    durationMonths: input.durationMonths,
    status: "PENDING",
  }]);
  return loan;
}

export async function forwardLoanApplication(
  loanId: string,
  staffId: mongoose.Types.ObjectId,
  reviewNotes: string,
) {
  const updated = await Loan.findOneAndUpdate(
    { _id: loanId, status: "PENDING" },
    {
      $set: {
        status: "FORWARDED_TO_ADMIN",
        reviewNotes,
        reviewedBy: staffId,
        reviewedAt: new Date(),
      },
    },
    { returnDocument: "after", runValidators: true },
  );
  if (updated) return updated;
  const existing = await Loan.exists({ _id: loanId });
  throw new LoanOperationError(existing ? "CONFLICT" : "NOT_FOUND");
}
