import mongoose, { type ClientSession } from "mongoose";
import { parseBdtPaisa } from "@/lib/bdt-money";
import { BankAccount } from "@/models/BankAccount";
import { Transaction } from "@/models/Transaction";
import { Withdrawal } from "@/models/Withdrawal";
import { createNotification, formatNotificationAmount } from "@/lib/notification-operations";

export class WithdrawalOperationError extends Error {
  constructor(readonly code: "NOT_FOUND" | "CONFLICT" | "ACCOUNT_UNAVAILABLE" | "INSUFFICIENT_BALANCE") {
    super(code);
    this.name = "WithdrawalOperationError";
  }
}

async function pendingWithdrawal(withdrawalId: string, session?: ClientSession) {
  let query = Withdrawal.findOne({ _id: withdrawalId, status: "PENDING" });
  if (session) query = query.session(session);
  const withdrawal = await query;
  if (withdrawal) return withdrawal;
  const existing = await Withdrawal.exists({ _id: withdrawalId }).session(session ?? null);
  throw new WithdrawalOperationError(existing ? "CONFLICT" : "NOT_FOUND");
}

async function approveWithdrawal(
  withdrawalId: string,
  reviewerId: mongoose.Types.ObjectId,
  session: ClientSession,
) {
  const withdrawal = await pendingWithdrawal(withdrawalId, session);
  const account = await BankAccount.findOne({ _id: withdrawal.accountId, status: "ACTIVE" })
    .select("_id")
    .session(session);
  if (!account) throw new WithdrawalOperationError("ACCOUNT_UNAVAILABLE");

  const amount = withdrawal.amount.toString();
  const amountPaisa = parseBdtPaisa(amount);
  if (amountPaisa === null || amountPaisa <= BigInt("0")) {
    throw new WithdrawalOperationError("INSUFFICIENT_BALANCE");
  }
  const debit = mongoose.Types.Decimal128.fromString("-" + amount);
  const accountUpdate = await BankAccount.updateOne(
    {
      _id: account._id,
      status: "ACTIVE",
      balance: { $gte: withdrawal.amount },
    },
    { $inc: { balance: debit } },
    { session },
  );
  if (accountUpdate.matchedCount !== 1) {
    const current = await BankAccount.findById(account._id).select("status balance").session(session);
    if (!current || current.status !== "ACTIVE") throw new WithdrawalOperationError("ACCOUNT_UNAVAILABLE");
    const availablePaisa = parseBdtPaisa(current.balance.toString());
    if (availablePaisa === null || availablePaisa < amountPaisa) {
      throw new WithdrawalOperationError("INSUFFICIENT_BALANCE");
    }
    throw new WithdrawalOperationError("CONFLICT");
  }

  const [transaction] = await Transaction.create([{
    transactionType: "WITHDRAWAL",
    fromAccount: account._id,
    amount: withdrawal.amount,
    currency: "BDT",
    status: "COMPLETED",
    description: withdrawal.description,
    createdBy: withdrawal.customerId,
  }], { session });

  const transitioned = await Withdrawal.updateOne(
    { _id: withdrawal._id, status: "PENDING" },
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
  if (transitioned.modifiedCount !== 1) throw new WithdrawalOperationError("CONFLICT");
  return withdrawal._id.toString();
}

export async function reviewWithdrawalRequest(
  withdrawalId: string,
  reviewerId: mongoose.Types.ObjectId,
  action: "APPROVE" | "REJECT",
  rejectionReason?: string,
) {
  if (action === "REJECT") {
    const session = await mongoose.startSession();
    try {
      let rejectedId: string | undefined;
      await session.withTransaction(async () => {
        const withdrawal = await pendingWithdrawal(withdrawalId, session);
        const updated = await Withdrawal.findOneAndUpdate(
          { _id: withdrawal._id, status: "PENDING" },
          { $set: { status: "REJECTED", reviewedBy: reviewerId, reviewedAt: new Date(), rejectionReason } },
          { returnDocument: "after", runValidators: true, session },
        );
        if (!updated) throw new WithdrawalOperationError("CONFLICT");
        const amount = formatNotificationAmount(withdrawal.amount.toString());
        await createNotification({
          userId: withdrawal.customerId,
          type: "WITHDRAWAL_REJECTED",
          title: "Withdrawal Rejected",
          message: `Your withdrawal request of ${amount ?? "the requested amount"} was rejected.`,
          dedupeKey: `withdrawal:${withdrawal._id}:rejected`,
          relatedEntityType: "withdrawal",
          relatedEntityId: withdrawal._id,
        }, session);
        rejectedId = withdrawal._id.toString();
      });
      if (!rejectedId) throw new Error("Withdrawal rejection transaction returned no result.");
      const rejected = await Withdrawal.findById(rejectedId);
      if (!rejected) throw new Error("Rejected withdrawal could not be reloaded.");
      return rejected;
    } finally {
      await session.endSession();
    }
  }

  const session = await mongoose.startSession();
  try {
    let approvedId: string | undefined;
    await session.withTransaction(async () => {
      approvedId = await approveWithdrawal(withdrawalId, reviewerId, session);
    });
    if (!approvedId) throw new Error("Withdrawal approval transaction returned no result.");
    const approved = await Withdrawal.findById(approvedId);
    if (!approved) throw new Error("Approved withdrawal could not be reloaded.");
    return approved;
  } finally {
    await session.endSession();
  }
}
