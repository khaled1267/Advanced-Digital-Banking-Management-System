import mongoose, { type HydratedDocument } from "mongoose";
import { BankAccount } from "@/models/BankAccount";
import { User } from "@/models/User";
import { WITHDRAWAL_STATUSES, Withdrawal, type WithdrawalDocument } from "@/models/Withdrawal";
import { escapeRequestRegex, maskAccountNumber } from "@/lib/deposit-queries";
import type { AdminWithdrawalsQuery, CustomerWithdrawalsQuery } from "@/lib/validation/withdrawal";

type WithdrawalFilter = Record<string, unknown>;

export function buildAdminWithdrawalFilter(query: AdminWithdrawalsQuery): WithdrawalFilter {
  const filter: WithdrawalFilter = {};
  if (query.status) filter.status = query.status;
  if (query.search) filter.withdrawalId = new RegExp(escapeRequestRegex(query.search), "i");
  if (query.startDate || query.endDate) {
    const createdAt: Record<string, Date> = {};
    if (query.startDate) createdAt.$gte = new Date(query.startDate + "T00:00:00.000Z");
    if (query.endDate) createdAt.$lte = new Date(query.endDate + "T23:59:59.999Z");
    filter.createdAt = createdAt;
  }
  return filter;
}

export function buildCustomerWithdrawalFilter(
  customerId: mongoose.Types.ObjectId,
  query: CustomerWithdrawalsQuery,
): WithdrawalFilter {
  return { customerId, ...(query.status ? { status: query.status } : {}) };
}

export type WithdrawalRecord = {
  id: string;
  withdrawalId: string;
  amount: string;
  currency: "BDT";
  status: (typeof WITHDRAWAL_STATUSES)[number];
  description?: string;
  rejectionReason?: string;
  transactionId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  account: { id: string; maskedAccountNumber: string; accountType: string; status: string } | null;
  customer?: { id: string; name: string; email: string } | null;
};

async function serializeWithdrawals(
  withdrawals: Array<HydratedDocument<WithdrawalDocument>>,
  includeCustomer: boolean,
) {
  const accountIds = withdrawals.map((withdrawal) => withdrawal.accountId);
  const customerIds = includeCustomer ? withdrawals.map((withdrawal) => withdrawal.customerId) : [];
  const [accounts, customers] = await Promise.all([
    BankAccount.find({ _id: { $in: accountIds } }).select("accountNumber accountType status").lean(),
    includeCustomer
      ? User.find({ _id: { $in: customerIds } }).select("name email").lean()
      : Promise.resolve([]),
  ]);
  const accountById = new Map(accounts.map((account) => [account._id.toString(), account]));
  const customerById = new Map(customers.map((customer) => [customer._id.toString(), customer]));
  return withdrawals.map((withdrawal) => {
    const account = accountById.get(withdrawal.accountId.toString());
    const customer = customerById.get(withdrawal.customerId.toString());
    return {
      id: withdrawal._id.toString(),
      withdrawalId: withdrawal.withdrawalId,
      amount: withdrawal.amount.toString(),
      currency: "BDT" as const,
      status: withdrawal.status,
      ...(withdrawal.description ? { description: withdrawal.description } : {}),
      ...(withdrawal.rejectionReason ? { rejectionReason: withdrawal.rejectionReason } : {}),
      transactionId: withdrawal.transactionId?.toString() ?? null,
      reviewedAt: withdrawal.reviewedAt?.toISOString() ?? null,
      createdAt: withdrawal.createdAt.toISOString(),
      updatedAt: withdrawal.updatedAt.toISOString(),
      account: account
        ? {
            id: account._id.toString(),
            maskedAccountNumber: maskAccountNumber(account.accountNumber),
            accountType: account.accountType,
            status: account.status,
          }
        : null,
      ...(includeCustomer
        ? { customer: customer ? { id: customer._id.toString(), name: customer.name, email: customer.email } : null }
        : {}),
    };
  });
}

async function summarize(filter: WithdrawalFilter) {
  const rows = await Withdrawal.aggregate<{ _id: string; count: number }>([
    { $match: filter },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const summary = { total: 0, pending: 0, approved: 0, rejected: 0 };
  for (const row of rows) {
    summary.total += row.count;
    if (row._id === "PENDING") summary.pending = row.count;
    if (row._id === "APPROVED") summary.approved = row.count;
    if (row._id === "REJECTED") summary.rejected = row.count;
  }
  return summary;
}

export async function listWithdrawals(
  filter: WithdrawalFilter,
  page: number,
  limit: number,
  includeCustomer: boolean,
  summaryFilter: WithdrawalFilter = filter,
) {
  const [withdrawals, total, summary] = await Promise.all([
    Withdrawal.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
    Withdrawal.countDocuments(filter),
    summarize(summaryFilter),
  ]);
  return {
    withdrawals: await serializeWithdrawals(withdrawals, includeCustomer),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    summary,
  };
}

export async function getWithdrawalDetails(filter: WithdrawalFilter, includeCustomer: boolean) {
  const withdrawal = await Withdrawal.findOne(filter);
  if (!withdrawal) return null;
  const [record] = await serializeWithdrawals([withdrawal], includeCustomer);
  return record;
}
