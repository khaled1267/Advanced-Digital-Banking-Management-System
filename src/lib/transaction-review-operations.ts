import mongoose from "mongoose";
import { BankAccount } from "@/models/BankAccount";
import { Deposit } from "@/models/Deposit";
import { SuspiciousTransactionFlag, SUSPICIOUS_FLAG_REASONS } from "@/models/SuspiciousTransactionFlag";
import { Transaction } from "@/models/Transaction";
import { TransactionReview } from "@/models/TransactionReview";
import { Withdrawal } from "@/models/Withdrawal";
import type { TransactionReviewAction, TransactionReviewTarget } from "@/lib/validation/transaction-review";
import type { UserRole } from "@/lib/authorization";

export class TransactionReviewError extends Error {
  constructor(readonly code: "NOT_FOUND" | "CONFLICT" | "INVALID_TARGET" | "ACTIVE_FLAG_EXISTS") {
    super(code);
    this.name = "TransactionReviewError";
  }
}

export type SafeReviewTarget = {
  targetType: TransactionReviewTarget["targetType"];
  targetId: string;
  reference: string;
  transactionType: string;
  amount: string;
  currency: "BDT";
  financialStatus: string;
  createdAt: Date;
  fromAccount: { maskedAccountNumber: string } | null;
  toAccount: { maskedAccountNumber: string } | null;
  description?: string;
};

function mask(accountNumber?: string | null) {
  return accountNumber ? { maskedAccountNumber: `•••• ${accountNumber.slice(-4)}` } : null;
}

export async function getReviewTarget(targetType: TransactionReviewTarget["targetType"], targetId: string): Promise<SafeReviewTarget | null> {
  if (targetType === "TRANSACTION") {
    const transaction = await Transaction.findById(targetId)
      .select("transactionId transactionType fromAccount toAccount amount currency status description createdAt")
      .lean();
    if (!transaction) return null;
    const accountIds = [transaction.fromAccount, transaction.toAccount].filter(Boolean);
    const accounts = await BankAccount.find({ _id: { $in: accountIds } }).select("_id accountNumber").lean();
    const byId = new Map(accounts.map((account) => [account._id.toString(), account.accountNumber]));
    return {
      targetType,
      targetId: transaction._id.toString(),
      reference: transaction.transactionId,
      transactionType: transaction.transactionType,
      amount: transaction.amount.toString(),
      currency: transaction.currency as "BDT",
      financialStatus: transaction.status,
      createdAt: transaction.createdAt,
      fromAccount: transaction.fromAccount ? mask(byId.get(transaction.fromAccount.toString())) : null,
      toAccount: transaction.toAccount ? mask(byId.get(transaction.toAccount.toString())) : null,
      ...(transaction.description ? { description: transaction.description } : {}),
    };
  }

  if (targetType === "DEPOSIT_REQUEST") {
    const request = await Deposit.findById(targetId).select("depositId accountId amount currency status description createdAt").lean();
    if (!request) return null;
    const account = await BankAccount.findById(request.accountId).select("accountNumber").lean();
    return {
      targetType,
      targetId: request._id.toString(),
      reference: request.depositId,
      transactionType: "DEPOSIT",
      amount: request.amount.toString(),
      currency: request.currency as "BDT",
      financialStatus: request.status,
      createdAt: request.createdAt,
      fromAccount: null,
      toAccount: mask(account?.accountNumber),
      ...(request.description ? { description: request.description } : {}),
    };
  }

  const request = await Withdrawal.findById(targetId).select("withdrawalId accountId amount currency status description createdAt").lean();
  if (!request) return null;
  const account = await BankAccount.findById(request.accountId).select("accountNumber").lean();
  return {
    targetType,
    targetId: request._id.toString(),
    reference: request.withdrawalId,
    transactionType: "WITHDRAWAL",
    amount: request.amount.toString(),
    currency: request.currency as "BDT",
    financialStatus: request.status,
    createdAt: request.createdAt,
    fromAccount: mask(account?.accountNumber),
    toAccount: null,
    ...(request.description ? { description: request.description } : {}),
  };
}

function actorSummary(actor: unknown) {
  if (typeof actor !== "object" || actor === null || !("name" in actor)) return null;
  const user = actor as { _id: unknown; name: string; role: string };
  return { id: String(user._id), name: user.name, role: user.role };
}

export async function getTransactionReview(target: TransactionReviewTarget, viewerRole: UserRole) {
  const [review, flag] = await Promise.all([
    TransactionReview.findOne(target).populate({ path: "history.actorId", select: "name role" }).lean(),
    SuspiciousTransactionFlag.findOne(target).sort({ flaggedAt: -1 })
      .populate({ path: "flaggedBy", select: "name role" })
      .lean(),
  ]);
  return {
    review: review ? {
      status: review.reviewStatus,
      note: review.reviewNote ?? null,
      updatedAt: review.reviewedAt,
      history: review.history.map((entry) => ({
        action: entry.action,
        previousStatus: entry.previousStatus ?? null,
        newStatus: entry.newStatus ?? null,
        note: entry.note ?? null,
        createdAt: entry.createdAt,
        actor: actorSummary(entry.actorId),
      })),
    } : { status: "NOT_REVIEWED" as const, note: null, updatedAt: null, history: [] },
    flag: flag ? {
      status: flag.status,
      active: flag.active,
      reason: flag.reason,
      explanation: flag.explanation ?? null,
      flaggedAt: flag.flaggedAt,
      flaggedBy: actorSummary(flag.flaggedBy),
      ...(viewerRole === "ADMIN" ? {
        reviewedAt: flag.reviewedAt ?? null,
        adminReviewNote: flag.adminReviewNote ?? null,
        history: flag.history.map((entry) => ({
          action: entry.action,
          previousStatus: entry.previousStatus ?? null,
          newStatus: entry.newStatus,
          note: entry.note ?? null,
          createdAt: entry.createdAt,
          actor: actorSummary(entry.actorId),
        })),
      } : {}),
    } : null,
  };
}

export async function applyTransactionReview(target: TransactionReviewTarget, actorId: mongoose.Types.ObjectId, action: TransactionReviewAction) {
  const item = await getReviewTarget(target.targetType, target.targetId);
  if (!item) throw new TransactionReviewError("NOT_FOUND");
  if (action.action === "START_REVIEW" && target.targetType !== "TRANSACTION" && item.financialStatus !== "PENDING") {
    throw new TransactionReviewError("CONFLICT");
  }

  const current = await TransactionReview.findOne(target).select("reviewStatus").lean();
  const currentStatus = current?.reviewStatus ?? "NOT_REVIEWED";
  if (action.action === "START_REVIEW" && currentStatus !== "NOT_REVIEWED") throw new TransactionReviewError("CONFLICT");
  if (action.action !== "START_REVIEW" && currentStatus !== "UNDER_REVIEW") throw new TransactionReviewError("CONFLICT");

  const newStatus = action.action === "START_REVIEW" ? "UNDER_REVIEW" : action.action === "COMPLETE_REVIEW" ? "REVIEWED" : "UNDER_REVIEW";
  const now = new Date();
  const note = "note" in action ? action.note : undefined;
  const targetId = new mongoose.Types.ObjectId(target.targetId);
  const filter: Record<string, unknown> = { targetType: target.targetType, targetId };
  if (action.action === "START_REVIEW") filter.$or = [{ reviewStatus: "NOT_REVIEWED" }, { reviewStatus: { $exists: false } }];
  else filter.reviewStatus = "UNDER_REVIEW";
  try {
    const updated = await TransactionReview.findOneAndUpdate(
      filter as never,
      {
        $set: {
          reviewStatus: newStatus,
          updatedBy: actorId,
          reviewedAt: now,
          ...(note !== undefined ? { reviewNote: note } : {}),
        },
        $setOnInsert: { targetType: target.targetType, targetId },
        $push: { history: { actorId, action: action.action === "ADD_NOTE" ? "NOTE_ADDED" : action.action, previousStatus: currentStatus, newStatus, ...(note ? { note } : {}), createdAt: now } },
      },
      { upsert: action.action === "START_REVIEW", new: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
    if (!updated) throw new TransactionReviewError("CONFLICT");
    return updated;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) throw new TransactionReviewError("CONFLICT");
    throw error;
  }
}

export async function createSuspiciousFlag(
  target: TransactionReviewTarget & { reason: (typeof SUSPICIOUS_FLAG_REASONS)[number]; explanation?: string },
  actorId: mongoose.Types.ObjectId,
) {
  const item = await getReviewTarget(target.targetType, target.targetId);
  if (!item) throw new TransactionReviewError("NOT_FOUND");
  const now = new Date();
  try {
    return await SuspiciousTransactionFlag.create({
      targetType: target.targetType,
      targetId: new mongoose.Types.ObjectId(target.targetId),
      reason: target.reason,
      ...(target.explanation ? { explanation: target.explanation } : {}),
      active: true,
      status: "OPEN",
      flaggedBy: actorId,
      flaggedAt: now,
      history: [{ actorId, action: "FLAG_CREATED", newStatus: "OPEN", ...(target.explanation ? { note: target.explanation } : {}), createdAt: now }],
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) throw new TransactionReviewError("ACTIVE_FLAG_EXISTS");
    throw error;
  }
}

export async function reviewSuspiciousFlag(flagId: string, actorId: mongoose.Types.ObjectId, status: "UNDER_REVIEW" | "RESOLVED" | "DISMISSED", note?: string) {
  const current = await SuspiciousTransactionFlag.findOne({ _id: flagId, active: true }).select("status").lean();
  if (!current) {
    const exists = await SuspiciousTransactionFlag.exists({ _id: flagId });
    throw new TransactionReviewError(exists ? "CONFLICT" : "NOT_FOUND");
  }
  if (status === "UNDER_REVIEW" && current.status !== "OPEN") throw new TransactionReviewError("CONFLICT");
  if ((status === "RESOLVED" || status === "DISMISSED") && current.status !== "OPEN" && current.status !== "UNDER_REVIEW") throw new TransactionReviewError("CONFLICT");

  const now = new Date();
  const updated = await SuspiciousTransactionFlag.findOneAndUpdate(
    { _id: flagId, active: true, status: current.status },
    {
      $set: {
        status,
        ...(status === "UNDER_REVIEW" ? {} : { active: false }),
        reviewedBy: actorId,
        reviewedAt: now,
        ...(note ? { adminReviewNote: note } : {}),
      },
      $push: { history: { actorId, action: status === "UNDER_REVIEW" ? "REVIEW_STARTED" : status, previousStatus: current.status, newStatus: status, ...(note ? { note } : {}), createdAt: now } },
    },
    { new: true, runValidators: true },
  );
  if (!updated) throw new TransactionReviewError("CONFLICT");
  return updated;
}
