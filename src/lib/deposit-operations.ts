import mongoose, { type ClientSession } from "mongoose";
import { formatBdtPaisa, MAX_BDT_PAISA, parseBdtPaisa } from "@/lib/bdt-money";
import { Deposit } from "@/models/Deposit";
import { BankAccount } from "@/models/BankAccount";
import { Transaction } from "@/models/Transaction";
import { createNotification, formatNotificationAmount } from "@/lib/notification-operations";

export class DepositOperationError extends Error {
  constructor(readonly code: "NOT_FOUND" | "CONFLICT" | "ACCOUNT_UNAVAILABLE" | "BALANCE_LIMIT") {
    super(code);
    this.name = "DepositOperationError";
  }
}

async function pendingDeposit(depositId: string, session?: ClientSession) {
  let query = Deposit.findOne({ _id: depositId, status: "PENDING" });
  if (session) query = query.session(session);
  const deposit = await query;
  if (deposit) return deposit;
  const existing = await Deposit.exists({ _id: depositId }).session(session ?? null);
  throw new DepositOperationError(existing ? "CONFLICT" : "NOT_FOUND");
}

async function approveDeposit(depositId: string, reviewerId: mongoose.Types.ObjectId, session: ClientSession) {
  const deposit = await pendingDeposit(depositId, session);
  const account = await BankAccount.findOne({ _id: deposit.accountId, status: "ACTIVE" })
    .select("_id balance")
    .session(session);
  if (!account) throw new DepositOperationError("ACCOUNT_UNAVAILABLE");

  const amountString = deposit.amount.toString();
  const amountPaisa = parseBdtPaisa(amountString);
  const balancePaisa = parseBdtPaisa(account.balance.toString());
  if (amountPaisa === null || balancePaisa === null || balancePaisa + amountPaisa > MAX_BDT_PAISA) {
    throw new DepositOperationError("BALANCE_LIMIT");
  }

  // The limit predicate and $inc are evaluated atomically by MongoDB. The
  // transaction also serializes concurrent approvals against this account.
  const maximumPriorBalance = mongoose.Types.Decimal128.fromString(
    formatBdtPaisa(MAX_BDT_PAISA - amountPaisa),
  );
  const accountUpdate = await BankAccount.updateOne(
    { _id: account._id, status: "ACTIVE", balance: { $lte: maximumPriorBalance } },
    { $inc: { balance: deposit.amount } },
    { session },
  );
  if (accountUpdate.matchedCount !== 1) throw new DepositOperationError("BALANCE_LIMIT");

  const [transaction] = await Transaction.create([{
    transactionType: "DEPOSIT",
    toAccount: account._id,
    amount: deposit.amount,
    currency: "BDT",
    status: "COMPLETED",
    description: deposit.description,
    createdBy: deposit.customerId,
  }], { session });

  const transitioned = await Deposit.updateOne(
    { _id: deposit._id, status: "PENDING" },
    {
      $set: {
        status: "APPROVED",
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        transactionId: transaction._id,
      },
    },
    { session },
  );
  if (transitioned.modifiedCount !== 1) throw new DepositOperationError("CONFLICT");
  const amount = formatNotificationAmount(amountString);
  await createNotification({
    userId: deposit.customerId,
    type: "DEPOSIT_APPROVED",
    title: "Deposit Approved",
    message: `Your deposit request of ${amount ?? "the requested amount"} has been approved.`,
    dedupeKey: `deposit:${deposit._id}:approved`,
    relatedEntityType: "deposit",
    relatedEntityId: deposit._id,
  }, session);
  return deposit._id.toString();
}

export async function reviewDepositRequest(
  depositId: string,
  reviewerId: mongoose.Types.ObjectId,
  action: "APPROVE" | "REJECT",
  rejectionReason?: string,
) {
  if (action === "REJECT") {
    const updated = await Deposit.findOneAndUpdate(
      { _id: depositId, status: "PENDING" },
      {
        $set: {
          status: "REJECTED",
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          rejectionReason,
        },
      },
      { returnDocument: "after", runValidators: true },
    );
    if (updated) return updated;
    const existing = await Deposit.exists({ _id: depositId });
    throw new DepositOperationError(existing ? "CONFLICT" : "NOT_FOUND");
  }

  const session = await mongoose.startSession();
  try {
    let approvedId: string | undefined;
    await session.withTransaction(async () => {
      approvedId = await approveDeposit(depositId, reviewerId, session);
    });
    if (!approvedId) throw new Error("Deposit approval transaction returned no result.");
    const approved = await Deposit.findById(approvedId);
    if (!approved) throw new Error("Approved deposit could not be reloaded.");
    return approved;
  } finally {
    await session.endSession();
  }
}
