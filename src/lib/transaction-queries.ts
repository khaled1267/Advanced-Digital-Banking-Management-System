import type { Types } from "mongoose";
import { BankAccount } from "@/models/BankAccount";
import { Transaction } from "@/models/Transaction";
import { TransactionReview } from "@/models/TransactionReview";
import { SuspiciousTransactionFlag } from "@/models/SuspiciousTransactionFlag";
import type { TransactionQuery } from "@/lib/validation/transaction";

type TransactionFilter = Record<string, unknown>;

export function buildTransactionFilter(query: TransactionQuery): TransactionFilter {
  const conditions: TransactionFilter[] = [];
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    conditions.push({ transactionId: new RegExp(escaped, "i") });
  }
  if (query.transactionType) conditions.push({ transactionType: query.transactionType });
  if (query.status) conditions.push({ status: query.status });
  if (query.startDate || query.endDate) {
    const createdAt: { $gte?: Date; $lt?: Date } = {};
    if (query.startDate) createdAt.$gte = new Date(`${query.startDate}T00:00:00.000Z`);
    if (query.endDate) {
      const exclusiveEnd = new Date(`${query.endDate}T00:00:00.000Z`);
      exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
      createdAt.$lt = exclusiveEnd;
    }
    conditions.push({ createdAt });
  }
  return conditions.length ? { $and: conditions } : {};
}

export function accountOwnershipCondition(accountIds: Types.ObjectId[]): TransactionFilter {
  return {
    $or: [
      { fromAccount: { $in: accountIds } },
      { toAccount: { $in: accountIds } },
    ],
  };
}

export async function applyTransactionReviewFilters(filter: TransactionFilter, query: TransactionQuery): Promise<TransactionFilter> {
  const conditions: TransactionFilter[] = filter && Object.keys(filter).length ? [filter] : [];
  if (query.reviewStatus) {
    const reviewQuery: Record<string, unknown> = { targetType: "TRANSACTION" };
    if (query.reviewStatus !== "NOT_REVIEWED") reviewQuery.reviewStatus = query.reviewStatus;
    else reviewQuery.reviewStatus = { $ne: "NOT_REVIEWED" };
    const reviewIds = await TransactionReview.find(reviewQuery).distinct("targetId");
    conditions.push({ _id: query.reviewStatus === "NOT_REVIEWED" ? { $nin: reviewIds } : { $in: reviewIds } });
  }
  if (query.suspiciousStatus) {
    const activeFlagIds = await SuspiciousTransactionFlag.find({ targetType: "TRANSACTION", active: true }).distinct("targetId");
    conditions.push({ _id: query.suspiciousStatus === "FLAGGED" ? { $in: activeFlagIds } : { $nin: activeFlagIds } });
  }
  return conditions.length ? { $and: conditions } : {};
}

type TransactionRow = {
  _id: Types.ObjectId;
  transactionId: string;
  transactionType: string;
  fromAccount?: Types.ObjectId | null;
  toAccount?: Types.ObjectId | null;
  amount: { toString(): string };
  currency: string;
  status: string;
  description?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SafeAccountReference = { id: string; maskedAccountNumber: string } | null;
export type SafeTransaction = {
  id: string;
  transactionId: string;
  transactionType: string;
  fromAccount: SafeAccountReference;
  toAccount: SafeAccountReference;
  amount: string;
  currency: string;
  status: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  review?: {
    status: string;
    note: string | null;
    updatedAt: Date | null;
    updatedBy: { id: string; name: string; role: string } | null;
  };
  suspiciousFlag?: {
    status: string;
    reason: string;
    explanation: string | null;
    flaggedAt: Date;
    flaggedBy: { id: string; name: string; role: string } | null;
  } | null;
};

async function getSafeAccountMap(rows: TransactionRow[]) {
  const accountIds = [...new Set(rows.flatMap((row) => [row.fromAccount, row.toAccount])
    .filter((id): id is Types.ObjectId => Boolean(id))
    .map((id) => id.toString()))];
  if (!accountIds.length) return new Map<string, SafeAccountReference>();

  const accounts = await BankAccount.find({ _id: { $in: accountIds } })
    .select("accountNumber")
    .lean();
  return new Map(accounts.map((account) => [
    account._id.toString(),
    {
      id: account._id.toString(),
      maskedAccountNumber: `•••• ${account.accountNumber.slice(-4)}`,
    },
  ]));
}

function toSafeTransaction(
  row: TransactionRow,
  accountMap: Map<string, SafeAccountReference>,
): SafeTransaction {
  return {
    id: row._id.toString(),
    transactionId: row.transactionId,
    transactionType: row.transactionType,
    fromAccount: row.fromAccount ? accountMap.get(row.fromAccount.toString()) ?? null : null,
    toAccount: row.toAccount ? accountMap.get(row.toAccount.toString()) ?? null : null,
    amount: row.amount.toString(),
    currency: row.currency,
    status: row.status,
    ...(row.description ? { description: row.description } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listTransactions(filter: TransactionFilter, query: TransactionQuery, includeReview = false) {
  const projection = "transactionId transactionType fromAccount toAccount amount currency status description createdAt updatedAt";
  const [rows, total, statusCounts] = await Promise.all([
    Transaction.find(filter as never)
      .select(projection)
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    Transaction.countDocuments(filter as never),
    Transaction.aggregate<{ _id: string; count: number }>([
      { $match: filter as never },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);
  const transactionRows = rows as TransactionRow[];
  const accountMap = await getSafeAccountMap(transactionRows);
  const [reviews, flags] = includeReview && transactionRows.length ? await Promise.all([
    TransactionReview.find({ targetType: "TRANSACTION", targetId: { $in: transactionRows.map((row) => row._id) } })
      .select("targetId reviewStatus reviewNote reviewedAt updatedBy")
      .populate({ path: "updatedBy", select: "name role" }).lean(),
    SuspiciousTransactionFlag.find({ targetType: "TRANSACTION", targetId: { $in: transactionRows.map((row) => row._id) }, active: true })
      .select("targetId status reason explanation flaggedAt flaggedBy")
      .populate({ path: "flaggedBy", select: "name role" }).lean(),
  ]) : [[], []];
  const reviewById = new Map(reviews.map((review) => [review.targetId.toString(), review]));
  const flagById = new Map(flags.map((flag) => [flag.targetId.toString(), flag]));
  const summary = { total, completed: 0, pending: 0, failed: 0 };
  for (const statusCount of statusCounts) {
    if (statusCount._id === "COMPLETED") summary.completed = statusCount.count;
    if (statusCount._id === "PENDING") summary.pending = statusCount.count;
    if (statusCount._id === "FAILED") summary.failed = statusCount.count;
  }

  return {
    transactions: transactionRows.map((row) => {
      const transaction = toSafeTransaction(row, accountMap);
      if (!includeReview) return transaction;
      const review = reviewById.get(row._id.toString());
      const flag = flagById.get(row._id.toString());
      const reviewer = review?.updatedBy && typeof review.updatedBy === "object" && "name" in review.updatedBy
        ? review.updatedBy as unknown as { _id: unknown; name: string; role: string }
        : null;
      const flagger = flag?.flaggedBy && typeof flag.flaggedBy === "object" && "name" in flag.flaggedBy
        ? flag.flaggedBy as unknown as { _id: unknown; name: string; role: string }
        : null;
      return {
        ...transaction,
        review: {
          status: review?.reviewStatus ?? "NOT_REVIEWED",
          note: review?.reviewNote ?? null,
          updatedAt: review?.reviewedAt ?? null,
          updatedBy: reviewer ? { id: String(reviewer._id), name: reviewer.name, role: reviewer.role } : null,
        },
        suspiciousFlag: flag ? {
          status: flag.status,
          reason: flag.reason,
          explanation: flag.explanation ?? null,
          flaggedAt: flag.flaggedAt,
          flaggedBy: flagger ? { id: String(flagger._id), name: flagger.name, role: flagger.role } : null,
        } : null,
      };
    }),
    total,
    page: query.page,
    limit: query.limit,
    totalPages: Math.ceil(total / query.limit),
    summary,
  };
}

export async function getSafeTransaction(row: TransactionRow | null, includeReview = false) {
  if (!row) return null;
  const accountMap = await getSafeAccountMap([row]);
  const safe = toSafeTransaction(row, accountMap);
  if (!includeReview) return safe;
  const [review, flag] = await Promise.all([
    TransactionReview.findOne({ targetType: "TRANSACTION", targetId: row._id })
      .select("reviewStatus reviewNote reviewedAt updatedBy")
      .populate({ path: "updatedBy", select: "name role" }).lean(),
    SuspiciousTransactionFlag.findOne({ targetType: "TRANSACTION", targetId: row._id, active: true })
      .select("status reason explanation flaggedAt flaggedBy")
      .populate({ path: "flaggedBy", select: "name role" }).lean(),
  ]);
  const reviewer = review?.updatedBy && typeof review.updatedBy === "object" && "name" in review.updatedBy
    ? review.updatedBy as unknown as { _id: unknown; name: string; role: string }
    : null;
  const flagger = flag?.flaggedBy && typeof flag.flaggedBy === "object" && "name" in flag.flaggedBy
    ? flag.flaggedBy as unknown as { _id: unknown; name: string; role: string }
    : null;
  return {
    ...safe,
    review: {
      status: review?.reviewStatus ?? "NOT_REVIEWED",
      note: review?.reviewNote ?? null,
      updatedAt: review?.reviewedAt ?? null,
      updatedBy: reviewer ? { id: String(reviewer._id), name: reviewer.name, role: reviewer.role } : null,
    },
    suspiciousFlag: flag ? {
      status: flag.status,
      reason: flag.reason,
      explanation: flag.explanation ?? null,
      flaggedAt: flag.flaggedAt,
      flaggedBy: flagger ? { id: String(flagger._id), name: flagger.name, role: flagger.role } : null,
    } : null,
  };
}
