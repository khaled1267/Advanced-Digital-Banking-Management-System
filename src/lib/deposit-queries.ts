import mongoose, { type HydratedDocument } from "mongoose";
import { DEPOSIT_STATUSES, Deposit, type DepositDocument } from "@/models/Deposit";
import { BankAccount } from "@/models/BankAccount";
import { User } from "@/models/User";
import type { AdminDepositsQuery, CustomerDepositsQuery } from "@/lib/validation/deposit";

type DepositFilter = Record<string, unknown>;

export function escapeRequestRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildAdminDepositFilter(query: AdminDepositsQuery): DepositFilter {
  const filter: DepositFilter = {};
  if (query.status) filter.status = query.status;
  if (query.search) filter.depositId = new RegExp(escapeRequestRegex(query.search), "i");
  if (query.startDate || query.endDate) {
    const createdAt: Record<string, Date> = {};
    if (query.startDate) createdAt.$gte = new Date(`${query.startDate}T00:00:00.000Z`);
    if (query.endDate) createdAt.$lte = new Date(`${query.endDate}T23:59:59.999Z`);
    filter.createdAt = createdAt;
  }
  return filter;
}

export function buildCustomerDepositFilter(
  customerId: mongoose.Types.ObjectId,
  query: CustomerDepositsQuery,
): DepositFilter {
  return { customerId, ...(query.status ? { status: query.status } : {}) };
}

export type DepositRecord = {
  id: string;
  depositId: string;
  amount: string;
  currency: "BDT";
  status: (typeof DEPOSIT_STATUSES)[number];
  description?: string;
  rejectionReason?: string;
  transactionId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  account: { id: string; maskedAccountNumber: string; accountType: string; status: string } | null;
  customer?: { id: string; name: string; email: string } | null;
};

export function maskAccountNumber(value: string) {
  return `•••• ${value.slice(-4)}`;
}

async function serializeDeposits(deposits: Array<HydratedDocument<DepositDocument>>, includeCustomer: boolean) {
  const accountIds = deposits.map((deposit) => deposit.accountId);
  const customerIds = includeCustomer ? deposits.map((deposit) => deposit.customerId) : [];
  const [accounts, customers] = await Promise.all([
    BankAccount.find({ _id: { $in: accountIds } }).select("accountNumber accountType status").lean(),
    includeCustomer ? User.find({ _id: { $in: customerIds } }).select("name email").lean() : Promise.resolve([]),
  ]);
  const accountById = new Map(accounts.map((account) => [account._id.toString(), account]));
  const customerById = new Map(customers.map((customer) => [customer._id.toString(), customer]));
  return deposits.map((deposit) => {
    const account = accountById.get(deposit.accountId.toString());
    const customer = customerById.get(deposit.customerId.toString());
    return {
      id: deposit._id.toString(),
      depositId: deposit.depositId,
      amount: deposit.amount.toString(),
      currency: "BDT" as const,
      status: deposit.status,
      ...(deposit.description ? { description: deposit.description } : {}),
      ...(deposit.rejectionReason ? { rejectionReason: deposit.rejectionReason } : {}),
      transactionId: deposit.transactionId?.toString() ?? null,
      reviewedAt: deposit.reviewedAt?.toISOString() ?? null,
      createdAt: deposit.createdAt.toISOString(),
      updatedAt: deposit.updatedAt.toISOString(),
      account: account
        ? { id: account._id.toString(), maskedAccountNumber: maskAccountNumber(account.accountNumber), accountType: account.accountType, status: account.status }
        : null,
      ...(includeCustomer ? {
        customer: customer ? { id: customer._id.toString(), name: customer.name, email: customer.email } : null,
      } : {}),
    };
  });
}

async function summarize(filter: DepositFilter) {
  const counts = await Deposit.aggregate<{ _id: string; count: number }>([
    { $match: filter },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const summary = { total: 0, pending: 0, approved: 0, rejected: 0 };
  for (const row of counts) {
    summary.total += row.count;
    if (row._id === "PENDING") summary.pending = row.count;
    if (row._id === "APPROVED") summary.approved = row.count;
    if (row._id === "REJECTED") summary.rejected = row.count;
  }
  return summary;
}

export async function listDeposits(
  filter: DepositFilter,
  page: number,
  limit: number,
  includeCustomer: boolean,
  summaryFilter: DepositFilter = filter,
) {
  const [deposits, total, summary] = await Promise.all([
    Deposit.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Deposit.countDocuments(filter),
    summarize(summaryFilter),
  ]);
  return {
    deposits: await serializeDeposits(deposits, includeCustomer),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    summary,
  };
}

export async function getDepositDetails(filter: DepositFilter, includeCustomer: boolean) {
  const deposit = await Deposit.findOne(filter);
  if (!deposit) return null;
  const [record] = await serializeDeposits([deposit], includeCustomer);
  return record;
}
