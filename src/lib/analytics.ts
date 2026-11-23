import mongoose from "mongoose";
import { BankAccount } from "@/models/BankAccount";
import { Deposit } from "@/models/Deposit";
import { Loan, LOAN_STATUSES } from "@/models/Loan";
import { LoanRepayment } from "@/models/LoanRepayment";
import { Transaction, TRANSACTION_STATUSES, TRANSACTION_TYPES } from "@/models/Transaction";
import { Withdrawal } from "@/models/Withdrawal";
import type { AnalyticsRange } from "@/lib/analytics-range";

const zero = () => Object.fromEntries(TRANSACTION_STATUSES.map((status) => [status, 0]));
const decimal = (value: unknown) => value == null ? "0.00" : String(value);

function dateKey() {
  return { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } };
}

export async function getAdminAnalytics(range: AnalyticsRange) {
  const date = { $gte: range.start, $lt: range.end };
  const [trends, types, statuses, loans, repayments, accounts, accountSummary, completedTotals, totalTransactions] = await Promise.all([
    Transaction.aggregate([
      { $match: { createdAt: date, status: "COMPLETED", transactionType: { $in: ["DEPOSIT", "WITHDRAWAL"] } } },
      { $group: { _id: { date: dateKey(), type: "$transactionType" }, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { "_id.date": 1 } },
    ]),
    Transaction.aggregate([
      { $match: { createdAt: date } },
      { $group: { _id: { type: "$transactionType", status: "$status" }, count: { $sum: 1 }, amount: { $sum: "$amount" } } },
      { $sort: { "_id.type": 1, "_id.status": 1 } },
    ]),
    Transaction.aggregate([
      { $match: { createdAt: date } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Loan.aggregate([
      { $match: { createdAt: date } },
      { $group: {
        _id: "$status", count: { $sum: 1 },
        approvedAmount: { $sum: { $cond: [{ $in: ["$status", ["APPROVED", "DISBURSED", "PAID"]] }, { $ifNull: ["$approvedAmount", 0] }, 0] } },
        disbursedAmount: { $sum: { $cond: [{ $in: ["$status", ["DISBURSED", "PAID"]] }, { $ifNull: ["$approvedAmount", 0] }, 0] } },
      } },
    ]),
    LoanRepayment.aggregate([
      { $match: { createdAt: date, status: "COMPLETED" } },
      { $group: { _id: dateKey(), amount: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    BankAccount.aggregate([
      { $group: { _id: { type: "$accountType", status: "$status" }, count: { $sum: 1 } } },
      { $sort: { "_id.type": 1, "_id.status": 1 } },
    ]),
    BankAccount.aggregate([
      { $group: { _id: null, count: { $sum: 1 }, balance: { $sum: "$balance" } } },
    ]),
    Transaction.aggregate([
      { $match: { status: "COMPLETED", transactionType: { $in: ["DEPOSIT", "WITHDRAWAL"] } } },
      { $group: { _id: "$transactionType", amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    Transaction.countDocuments(),
  ]);
  const totalFor = (type: "DEPOSIT" | "WITHDRAWAL") => completedTotals.find((row) => row._id === type);
  const transactionStatuses = zero();
  for (const row of statuses) if (row._id in transactionStatuses) transactionStatuses[row._id as keyof typeof transactionStatuses] = row.count;
  return {
    role: "ADMIN" as const, range: range.key,
    summary: {
      accountCount: accountSummary[0]?.count ?? 0,
      bankBalance: decimal(accountSummary[0]?.balance),
      transactionCount: totalTransactions,
      deposits: decimal(totalFor("DEPOSIT")?.amount),
      depositCount: totalFor("DEPOSIT")?.count ?? 0,
      withdrawals: decimal(totalFor("WITHDRAWAL")?.amount),
      withdrawalCount: totalFor("WITHDRAWAL")?.count ?? 0,
    },
    depositWithdrawal: trends.map((row) => ({ date: row._id.date, type: row._id.type, amount: decimal(row.amount), count: row.count })),
    transactionTypes: types.map((row) => ({ type: row._id.type, status: row._id.status, amount: decimal(row.amount), count: row.count })),
    transactionStatuses,
    loanStatuses: LOAN_STATUSES.map((status) => {
      const row = loans.find((item) => item._id === status);
      return { status, count: row?.count ?? 0, approvedAmount: decimal(row?.approvedAmount), disbursedAmount: decimal(row?.disbursedAmount) };
    }),
    repayments: repayments.map((row) => ({ date: row._id, amount: decimal(row.amount), count: row.count })),
    accounts: accounts.map((row) => ({ type: row._id.type, status: row._id.status, count: row.count })),
  };
}

export async function getCustomerAnalytics(customerId: mongoose.Types.ObjectId, range: AnalyticsRange) {
  const [ownedAccounts, loans, repayments] = await Promise.all([
    BankAccount.find({ userId: customerId }).select("_id accountType status balance").lean(),
    Loan.aggregate([
      { $match: { customerId } },
      { $group: { _id: "$status", count: { $sum: 1 }, outstanding: { $sum: { $ifNull: ["$outstandingBalance", 0] } }, approved: { $sum: { $cond: [{ $in: ["$status", ["APPROVED", "DISBURSED", "PAID"]] }, { $ifNull: ["$approvedAmount", 0] }, 0] } } } },
    ]),
    LoanRepayment.aggregate([
      { $match: { customerId, status: "COMPLETED", createdAt: { $gte: range.start, $lt: range.end } } },
      { $group: { _id: dateKey(), amount: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);
  const accountIds = ownedAccounts.map((account) => account._id);
  const [flow, statusRows, lifetimeTotals] = accountIds.length ? await Promise.all([
    Transaction.aggregate([
      { $match: { createdAt: { $gte: range.start, $lt: range.end }, status: "COMPLETED", $or: [{ fromAccount: { $in: accountIds } }, { toAccount: { $in: accountIds } }] } },
      { $group: {
        _id: dateKey(), count: { $sum: 1 }, amount: { $sum: "$amount" },
        incoming: { $sum: { $cond: [
          { $or: [
            { $and: [{ $eq: ["$transactionType", "DEPOSIT"] }, { $in: ["$toAccount", accountIds] }] },
            { $and: [{ $eq: ["$transactionType", "LOAN_DISBURSEMENT"] }, { $in: ["$toAccount", accountIds] }] },
            { $and: [{ $eq: ["$transactionType", "TRANSFER"] }, { $in: ["$toAccount", accountIds] }, { $not: [{ $in: ["$fromAccount", accountIds] }] }] },
          ] }, "$amount", 0,
        ] } },
        outgoing: { $sum: { $cond: [
          { $or: [
            { $and: [{ $eq: ["$transactionType", "WITHDRAWAL"] }, { $in: ["$fromAccount", accountIds] }] },
            { $and: [{ $eq: ["$transactionType", "LOAN_REPAYMENT"] }, { $in: ["$fromAccount", accountIds] }] },
            { $and: [{ $eq: ["$transactionType", "TRANSFER"] }, { $in: ["$fromAccount", accountIds] }, { $not: [{ $in: ["$toAccount", accountIds] }] }] },
          ] }, "$amount", 0,
        ] } },
      } },
      { $sort: { _id: 1 } },
    ]),
    Transaction.aggregate([
      { $match: { createdAt: { $gte: range.start, $lt: range.end }, $or: [{ fromAccount: { $in: accountIds } }, { toAccount: { $in: accountIds } }] } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Transaction.aggregate([
      { $match: { status: "COMPLETED", transactionType: { $in: ["DEPOSIT", "WITHDRAWAL"] }, $or: [{ fromAccount: { $in: accountIds } }, { toAccount: { $in: accountIds } }] } },
      { $group: { _id: "$transactionType", amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
  ]) : [[], [], []];
  const lifetimeTotal = (type: "DEPOSIT" | "WITHDRAWAL") => lifetimeTotals.find((row) => row._id === type);
  const transactionStatuses = zero();
  for (const row of statusRows) if (row._id in transactionStatuses) transactionStatuses[row._id as keyof typeof transactionStatuses] = row.count;
  return {
    role: "CUSTOMER" as const, range: range.key,
    summary: {
      deposits: decimal(lifetimeTotal("DEPOSIT")?.amount),
      depositCount: lifetimeTotal("DEPOSIT")?.count ?? 0,
      withdrawals: decimal(lifetimeTotal("WITHDRAWAL")?.amount),
      withdrawalCount: lifetimeTotal("WITHDRAWAL")?.count ?? 0,
    },
    cashFlow: flow.map((row) => ({ date: row._id, incoming: decimal(row.incoming), outgoing: decimal(row.outgoing), count: row.count, amount: decimal(row.amount) })),
    transactionStatuses,
    accounts: ownedAccounts.map((account) => ({ type: account.accountType, status: account.status, balance: decimal(account.balance) })),
    loanStatuses: LOAN_STATUSES.map((status) => {
      const row = loans.find((item) => item._id === status);
      return { status, count: row?.count ?? 0, approvedAmount: decimal(row?.approved), outstanding: decimal(row?.outstanding) };
    }),
    repayments: repayments.map((row) => ({ date: row._id, amount: decimal(row.amount), count: row.count })),
  };
}

export async function getStaffAnalytics() {
  const [deposits, withdrawals, loans] = await Promise.all([
    Deposit.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Withdrawal.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Loan.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);
  const count = (rows: { _id: string; count: number }[], status: string) => rows.find((row) => row._id === status)?.count ?? 0;
  return {
    role: "STAFF" as const, range: "all-time",
    requests: [
      { label: "Pending deposits", count: count(deposits, "PENDING") },
      { label: "Approved deposits", count: count(deposits, "APPROVED") },
      { label: "Pending withdrawals", count: count(withdrawals, "PENDING") },
      { label: "Rejected withdrawals", count: count(withdrawals, "REJECTED") },
    ],
    loanStatuses: LOAN_STATUSES.map((status) => ({ status, count: count(loans, status) })),
  };
}

export const analyticsTransactionTypes = TRANSACTION_TYPES;
