import type { Types } from "mongoose";
import { formatBdtPaisa, parseBdtPaisa } from "@/lib/bdt-money";
import type { AccountStatementQuery } from "@/lib/validation/account-statement";
import { Transaction } from "@/models/Transaction";

type StatementTransaction = {
  _id: Types.ObjectId;
  transactionId: string;
  transactionType: "DEPOSIT" | "WITHDRAWAL" | "TRANSFER" | "LOAN_DISBURSEMENT" | "LOAN_REPAYMENT";
  fromAccount?: Types.ObjectId | null;
  toAccount?: Types.ObjectId | null;
  amount: { toString(): string };
  description?: string | null;
  createdAt: Date;
};

export type StatementBalanceInput = {
  transactionType: StatementTransaction["transactionType"];
  fromAccount?: string | { toString(): string } | null;
  toAccount?: string | { toString(): string } | null;
  amount: string | { toString(): string };
};

function transactionImpactInPaisa(transaction: StatementBalanceInput, accountId: string) {
  const amount = parseBdtPaisa(transaction.amount.toString());
  if (amount === null) throw new Error("Stored transaction amount is not a valid BDT amount.");

  const fromAccount = transaction.fromAccount?.toString().toLowerCase();
  const toAccount = transaction.toAccount?.toString().toLowerCase();
  if (fromAccount === accountId.toLowerCase()) return -amount;
  if (toAccount === accountId.toLowerCase()) return amount;
  return BigInt("0");
}

/**
 * Calculates account balances from the full, ordered transaction history.
 * New accounts start at zero and balance changes are committed with their
 * completed transaction records, so the completed ledger is the source of truth.
 */
type OrderedStatementTransaction = StatementBalanceInput & {
  _id: { toString(): string };
  transactionId: string;
  description?: string | null;
  createdAt: Date;
};

type StatementDateRange = Pick<AccountStatementQuery, "startDate" | "endDate">;

function calculateStatementRange<T extends OrderedStatementTransaction>(
  transactions: T[],
  accountId: string,
  query: StatementDateRange,
) {
  const start = query.startDate ? new Date(`${query.startDate}T00:00:00.000Z`) : null;
  const endExclusive = query.endDate ? new Date(`${query.endDate}T00:00:00.000Z`) : null;
  if (endExclusive) endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  let openingPaisa = BigInt("0");
  let periodChangePaisa = BigInt("0");
  const periodTransactions: T[] = [];

  for (const transaction of transactions) {
    const transactionTime = transaction.createdAt.getTime();
    const impact = transactionImpactInPaisa(transaction, accountId);
    if (start && transactionTime < start.getTime()) {
      openingPaisa += impact;
      continue;
    }
    if (endExclusive && transactionTime >= endExclusive.getTime()) continue;
    periodChangePaisa += impact;
    periodTransactions.push(transaction);
  }

  const runningBalanceById = new Map<string, string>();
  let runningPaisa = openingPaisa;
  for (const transaction of periodTransactions) {
    runningPaisa += transactionImpactInPaisa(transaction, accountId);
    runningBalanceById.set(transaction._id.toString(), formatBdtPaisa(runningPaisa));
  }

  return {
    openingBalance: formatBdtPaisa(openingPaisa),
    closingBalance: formatBdtPaisa(openingPaisa + periodChangePaisa),
    total: periodTransactions.length,
    transactions: periodTransactions.map((transaction) => {
      const amountPaisa = parseBdtPaisa(transaction.amount.toString());
      if (amountPaisa === null) throw new Error("Stored transaction amount is not a valid BDT amount.");
      const debit = transaction.fromAccount?.toString().toLowerCase() === accountId.toLowerCase();
      const amount = formatBdtPaisa(amountPaisa);
      return {
        id: transaction._id.toString(),
        transactionId: transaction.transactionId,
        transactionType: transaction.transactionType,
        direction: debit ? "DEBIT" as const : "CREDIT" as const,
        description: transaction.description ?? "",
        amount,
        debit: debit ? amount : "0.00",
        credit: debit ? "0.00" : amount,
        balance: runningBalanceById.get(transaction._id.toString()) ?? "0.00",
        createdAt: transaction.createdAt,
      };
    }),
  };
}

export function calculateStatementBalances<T extends OrderedStatementTransaction>(
  transactions: T[],
  accountId: string,
  query: Pick<AccountStatementQuery, "startDate" | "endDate" | "page" | "limit">,
) {
  const statement = calculateStatementRange(transactions, accountId, query);
  const offset = (query.page - 1) * query.limit;
  return {
    ...statement,
    page: query.page,
    limit: query.limit,
    totalPages: Math.ceil(statement.total / query.limit),
    transactions: statement.transactions.slice(offset, offset + query.limit),
  };
}

export function calculateCompleteStatementBalances<T extends OrderedStatementTransaction>(
  transactions: T[],
  accountId: string,
  query: StatementDateRange,
) {
  return calculateStatementRange(transactions, accountId, query);
}

async function findAccountStatementTransactions(accountId: Types.ObjectId, endDate?: string) {
  const filter: Record<string, unknown> = {
    status: "COMPLETED",
    transactionType: { $in: ["DEPOSIT", "WITHDRAWAL", "TRANSFER", "LOAN_DISBURSEMENT", "LOAN_REPAYMENT"] },
    $or: [{ fromAccount: accountId }, { toAccount: accountId }],
  };
  if (endDate) {
    const endExclusive = new Date(`${endDate}T00:00:00.000Z`);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    filter.createdAt = { $lt: endExclusive };
  }

  return Transaction.find(filter)
    .select("transactionId transactionType fromAccount toAccount amount description createdAt")
    .sort({ createdAt: 1, _id: 1 })
    .lean();
}

export async function getAccountStatement(accountId: Types.ObjectId, query: AccountStatementQuery) {
  const transactions = await findAccountStatementTransactions(accountId, query.endDate);

  return calculateStatementBalances(
    transactions as unknown as StatementTransaction[],
    accountId.toString(),
    query,
  );
}

export async function getCompleteAccountStatement(
  accountId: Types.ObjectId,
  query: StatementDateRange,
) {
  const transactions = await findAccountStatementTransactions(accountId, query.endDate);
  return calculateCompleteStatementBalances(
    transactions as unknown as StatementTransaction[],
    accountId.toString(),
    query,
  );
}
