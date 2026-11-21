import type { Types } from "mongoose";
import { BankAccount } from "@/models/BankAccount";
import { Transaction } from "@/models/Transaction";
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

export async function listTransactions(filter: TransactionFilter, query: TransactionQuery) {
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
  const accountMap = await getSafeAccountMap(rows as TransactionRow[]);
  const summary = { total, completed: 0, pending: 0, failed: 0 };
  for (const statusCount of statusCounts) {
    if (statusCount._id === "COMPLETED") summary.completed = statusCount.count;
    if (statusCount._id === "PENDING") summary.pending = statusCount.count;
    if (statusCount._id === "FAILED") summary.failed = statusCount.count;
  }

  return {
    transactions: (rows as TransactionRow[]).map((row) => toSafeTransaction(row, accountMap)),
    total,
    page: query.page,
    limit: query.limit,
    totalPages: Math.ceil(total / query.limit),
    summary,
  };
}

export async function getSafeTransaction(row: TransactionRow | null) {
  if (!row) return null;
  const accountMap = await getSafeAccountMap([row]);
  return toSafeTransaction(row, accountMap);
}
