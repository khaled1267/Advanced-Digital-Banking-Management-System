import mongoose, { type HydratedDocument } from "mongoose";
import { BankAccount } from "@/models/BankAccount";
import { Loan, type LoanDocument } from "@/models/Loan";
import { LoanRepayment, type LoanRepaymentDocument } from "@/models/LoanRepayment";
import { LoanInstallment } from "@/models/LoanInstallment";
import { Transaction } from "@/models/Transaction";
import { User } from "@/models/User";
import { formatBdtPaisa, parseBdtPaisa } from "@/lib/bdt-money";
import type { CustomerLoansQuery, StaffAdminLoansQuery } from "@/lib/validation/loan";

type LoanFilter = Record<string, unknown>;

export function buildCustomerLoanFilter(customerId: mongoose.Types.ObjectId, query: CustomerLoansQuery): LoanFilter {
  return { customerId, ...(query.status ? { status: query.status } : {}) };
}

export function buildStaffAdminLoanFilter(query: StaffAdminLoansQuery): LoanFilter {
  const filter: LoanFilter = {};
  if (query.status) filter.status = query.status;
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.loanId = new RegExp(escaped, "i");
  }
  return filter;
}

export type SafeLoan = {
  id: string;
  loanId: string;
  amount: string;
  approvedAmount: string | null;
  disbursedAmount: string | null;
  outstandingBalance: string | null;
  currency: "BDT";
  purpose: string;
  loanType: string | null;
  monthlyIncome: string | null;
  employmentStatus: string | null;
  durationMonths: number;
  status: string;
  rejectionReason?: string;
  reviewNotes?: string;
  reviewedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  disbursedAt: string | null;
  disbursement: { transactionId: string; amount: string; currency: "BDT"; createdAt: string } | null;
  schedule: SafeLoanInstallment[] | null;
  account: { id: string; maskedAccountNumber: string; accountType: string; status: string } | null;
  customer?: { id: string; name: string; email: string } | null;
  reviewer?: { id: string; name: string; email: string } | null;
};

export type SafeLoanInstallment = {
  id: string;
  installmentNumber: number;
  dueDate: string;
  principalAmountDue: string;
  interestAmountDue: string;
  totalAmountDue: string;
  amountPaid: string;
  remainingAmount: string;
  status: "PENDING" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";
  paidAt: string | null;
  lastPaymentAt: string | null;
};

async function serializeLoans(
  loans: Array<HydratedDocument<LoanDocument>>,
  includeTeamDetails: boolean,
  includeSchedule = false,
): Promise<SafeLoan[]> {
  const accountIds = loans.map((loan) => loan.accountId);
  const customerIds = loans.map((loan) => loan.customerId);
  const reviewerIds = includeTeamDetails
    ? loans.flatMap((loan) => loan.reviewedBy ? [loan.reviewedBy] : [])
    : [];
  const disbursementIds = loans.flatMap((loan) => loan.disbursementTransactionId ? [loan.disbursementTransactionId] : []);
  const [accounts, customers, reviewers, disbursementTransactions, installments] = await Promise.all([
    BankAccount.find({ _id: { $in: accountIds } }).select("accountNumber accountType status").lean(),
    User.find({ _id: { $in: customerIds } }).select("name email").lean(),
    includeTeamDetails
      ? User.find({ _id: { $in: reviewerIds } }).select("name email").lean()
      : Promise.resolve([]),
    Transaction.find({ _id: { $in: disbursementIds }, transactionType: "LOAN_DISBURSEMENT", status: "COMPLETED" })
      .select("transactionId amount currency createdAt")
      .lean(),
    includeSchedule
      ? LoanInstallment.find({ loanId: { $in: loans.map((loan) => loan._id) } }).sort({ installmentNumber: 1 }).lean()
      : Promise.resolve([]),
  ]);
  const accountById = new Map(accounts.map((account) => [account._id.toString(), account]));
  const customerById = new Map(customers.map((customer) => [customer._id.toString(), customer]));
  const reviewerById = new Map(reviewers.map((reviewer) => [reviewer._id.toString(), reviewer]));
  const transactionById = new Map(disbursementTransactions.map((transaction) => [transaction._id.toString(), transaction]));
  const installmentsByLoan = new Map<string, typeof installments>();
  for (const installment of installments) {
    const id = installment.loanId.toString();
    installmentsByLoan.set(id, [...(installmentsByLoan.get(id) ?? []), installment]);
  }

  return loans.map((loan) => {
    const account = accountById.get(loan.accountId.toString());
    const customer = customerById.get(loan.customerId.toString());
    const reviewer = loan.reviewedBy ? reviewerById.get(loan.reviewedBy.toString()) : undefined;
    const disbursementTransaction = loan.disbursementTransactionId
      ? transactionById.get(loan.disbursementTransactionId.toString())
      : undefined;
    const persistedInstallments = installmentsByLoan.get(loan._id.toString()) ?? [];
    const schedule: SafeLoanInstallment[] | null = includeSchedule && persistedInstallments.length > 0
      ? persistedInstallments.map((installment) => {
          const remainingPaisa = parseBdtPaisa(installment.remainingAmount.toString());
          const overdue = remainingPaisa !== null && remainingPaisa > BigInt("0") && installment.dueDate.getTime() < Date.now();
          return {
            id: installment._id.toString(),
            installmentNumber: installment.installmentNumber,
            dueDate: installment.dueDate.toISOString(),
            principalAmountDue: installment.principalAmountDue.toString(),
            interestAmountDue: installment.interestAmountDue.toString(),
            totalAmountDue: installment.totalAmountDue.toString(),
            amountPaid: installment.amountPaid.toString(),
            remainingAmount: installment.remainingAmount.toString(),
            status: installment.status === "PAID" ? "PAID" : overdue ? "OVERDUE" : installment.status,
            paidAt: installment.paidAt?.toISOString() ?? null,
            lastPaymentAt: installment.lastPaymentAt?.toISOString() ?? null,
          };
        })
      : null;
    return {
      id: loan._id.toString(),
      loanId: loan.loanId,
      amount: loan.amount.toString(),
      approvedAmount: loan.approvedAmount?.toString() ?? null,
      disbursedAmount: loan.disbursedAmount?.toString() ?? disbursementTransaction?.amount.toString() ?? null,
      outstandingBalance: loan.outstandingBalance?.toString() ??
        (loan.status === "DISBURSED" ? loan.approvedAmount?.toString() ?? null :
          loan.status === "PAID" ? "0.00" : null),
      currency: "BDT" as const,
      purpose: loan.purpose,
      loanType: loan.loanType ?? null,
      monthlyIncome: loan.monthlyIncome?.toString() ?? null,
      employmentStatus: loan.employmentStatus ?? null,
      durationMonths: loan.durationMonths,
      status: loan.status,
      ...(loan.rejectionReason ? { rejectionReason: loan.rejectionReason } : {}),
      ...(includeTeamDetails && loan.reviewNotes ? { reviewNotes: loan.reviewNotes } : {}),
      reviewedAt: loan.reviewedAt?.toISOString() ?? null,
      approvedAt: loan.approvedAt?.toISOString() ?? null,
      createdAt: loan.createdAt.toISOString(),
      updatedAt: loan.updatedAt.toISOString(),
      disbursedAt: loan.disbursedAt?.toISOString() ?? null,
      disbursement: disbursementTransaction
        ? {
            transactionId: disbursementTransaction.transactionId,
            amount: disbursementTransaction.amount.toString(),
            currency: "BDT" as const,
            createdAt: disbursementTransaction.createdAt.toISOString(),
          }
        : null,
      schedule,
      account: account
        ? {
            id: account._id.toString(),
            maskedAccountNumber: `•••• ${account.accountNumber.slice(-4)}`,
            accountType: account.accountType,
            status: account.status,
          }
        : null,
      ...(includeTeamDetails
        ? {
            customer: customer
              ? { id: customer._id.toString(), name: customer.name, email: customer.email }
              : null,
            reviewer: reviewer
              ? { id: reviewer._id.toString(), name: reviewer.name, email: reviewer.email }
              : null,
          }
        : {}),
    };
  });
}

export async function listLoans(
  filter: LoanFilter,
  page: number,
  limit: number,
  includeTeamDetails: boolean,
) {
  const [loans, total] = await Promise.all([
    Loan.find(filter as never)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Loan.countDocuments(filter as never),
  ]);
  return {
    loans: await serializeLoans(loans, includeTeamDetails),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getLoanDetails(filter: LoanFilter, includeTeamDetails: boolean) {
  const loan = await Loan.findOne(filter);
  if (!loan) return null;
  const [record] = await serializeLoans([loan], includeTeamDetails, true);
  return record;
}

export type SafeLoanRepayment = {
  id: string;
  repaymentId: string;
  loanId: string;
  amount: string;
  outstandingBalanceAfter: string;
  currency: "BDT";
  status: "COMPLETED";
  createdAt: string;
  sourceAccount: { id: string; maskedAccountNumber: string } | null;
  transaction: {
    id: string;
    transactionId: string;
    amount: string;
    currency: "BDT";
    status: "COMPLETED";
    createdAt: string;
  } | null;
};

async function serializeLoanRepayments(
  repayments: Array<HydratedDocument<LoanRepaymentDocument>>,
): Promise<SafeLoanRepayment[]> {
  if (repayments.length === 0) return [];

  const [accounts, transactions] = await Promise.all([
    BankAccount.find({
      $or: repayments.map((repayment) => ({
        _id: repayment.sourceAccountId,
        userId: repayment.customerId,
      })),
    }).select("accountNumber").lean(),
    Transaction.find({
      _id: { $in: repayments.map((repayment) => repayment.transactionId) },
      transactionType: "LOAN_REPAYMENT",
      status: "COMPLETED",
    }).select("transactionId amount currency status createdAt").lean(),
  ]);
  const accountById = new Map(accounts.map((account) => [account._id.toString(), account]));
  const transactionById = new Map(transactions.map((transaction) => [transaction._id.toString(), transaction]));

  return repayments.map((repayment) => {
    const account = accountById.get(repayment.sourceAccountId.toString());
    const transaction = transactionById.get(repayment.transactionId.toString());
    return {
      id: repayment._id.toString(),
      repaymentId: repayment.repaymentId,
      loanId: repayment.loanId.toString(),
      amount: repayment.amount.toString(),
      outstandingBalanceAfter: repayment.outstandingBalanceAfter.toString(),
      currency: "BDT" as const,
      status: repayment.status,
      createdAt: repayment.createdAt.toISOString(),
      sourceAccount: account
        ? { id: account._id.toString(), maskedAccountNumber: `•••• ${account.accountNumber.slice(-4)}` }
        : null,
      transaction: transaction
        ? {
            id: transaction._id.toString(),
            transactionId: transaction.transactionId,
            amount: transaction.amount.toString(),
            currency: "BDT" as const,
            status: "COMPLETED" as const,
            createdAt: transaction.createdAt.toISOString(),
          }
        : null,
    };
  });
}

export async function listCustomerLoanRepayments(
  loanId: mongoose.Types.ObjectId,
  customerId: mongoose.Types.ObjectId,
  page: number,
  limit: number,
) {
  const ownsLoan = await Loan.exists({ _id: loanId, customerId });
  if (!ownsLoan) return null;

  const filter = { loanId, customerId };
  const [repayments, total] = await Promise.all([
    LoanRepayment.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    LoanRepayment.countDocuments(filter),
  ]);
  return {
    repayments: await serializeLoanRepayments(repayments),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getCustomerLoanRepayment(
  repaymentId: mongoose.Types.ObjectId,
  customerId: mongoose.Types.ObjectId,
) {
  const repayment = await LoanRepayment.findOne({ _id: repaymentId, customerId });
  if (!repayment) return null;
  const [record] = await serializeLoanRepayments([repayment]);
  return record;
}

export async function getCustomerLoanSummary(customerId: mongoose.Types.ObjectId) {
  const [totalLoans, pendingLoans, approvedLoans, disbursedLoans, paidLoans, balanceResult] = await Promise.all([
    Loan.countDocuments({ customerId }),
    Loan.countDocuments({ customerId, status: "PENDING" }),
    Loan.countDocuments({ customerId, status: "APPROVED" }),
    Loan.countDocuments({ customerId, status: "DISBURSED" }),
    Loan.countDocuments({ customerId, status: "PAID" }),
    Loan.aggregate([
      { $match: { customerId, status: "DISBURSED" } },
      { $group: { _id: null, outstanding: { $sum: { $ifNull: ["$outstandingBalance", "$approvedAmount"] } } } },
    ]),
  ]);
  const outstanding = balanceResult[0]?.outstanding;
  const outstandingPaisa = outstanding ? parseBdtPaisa(outstanding.toString()) : BigInt("0");
  if (outstandingPaisa === null || outstandingPaisa < BigInt("0")) {
    throw new Error("Could not calculate the outstanding loan balance.");
  }
  return {
    totalLoans,
    pendingLoans,
    approvedLoans,
    disbursedLoans,
    paidLoans,
    outstandingBalance: formatBdtPaisa(outstandingPaisa),
  };
}

export type SafeAdminLoanRepayment = SafeLoanRepayment & {
  customer: { id: string; name: string; email: string } | null;
};

export async function listAdminLoanRepayments(
  loanId: mongoose.Types.ObjectId,
  page: number,
  limit: number,
) {
  const exists = await Loan.exists({ _id: loanId });
  if (!exists) return null;

  const filter = { loanId };
  const [repayments, total] = await Promise.all([
    LoanRepayment.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    LoanRepayment.countDocuments(filter),
  ]);
  const serialized = await serializeLoanRepayments(repayments);
  const customers = await User.find({ _id: { $in: repayments.map((repayment) => repayment.customerId) } })
    .select("name email")
    .lean();
  const customerById = new Map(customers.map((customer) => [customer._id.toString(), customer]));
  const safeRepayments: SafeAdminLoanRepayment[] = repayments.map((repayment, index) => {
    const customer = customerById.get(repayment.customerId.toString());
    return {
      ...serialized[index],
      customer: customer
        ? { id: customer._id.toString(), name: customer.name, email: customer.email }
        : null,
    };
  });

  return {
    repayments: safeRepayments,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
