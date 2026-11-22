import { parseBdtPaisa } from "@/lib/bdt-money";
import type { AccountStatementTransaction } from "@/store/accountStatementsApi";

export type StatementTotals = { debitPaisa: bigint; creditPaisa: bigint };

export function accountStatementSelectionKey(accountId: string, startDate: string, endDate: string) {
  return accountId ? JSON.stringify([accountId, startDate, endDate]) : "";
}

export function calculateStatementPageTotals(transactions: AccountStatementTransaction[]): StatementTotals {
  let debitPaisa = BigInt("0");
  let creditPaisa = BigInt("0");
  for (const transaction of transactions) {
    const debit = parseBdtPaisa(transaction.debit);
    const credit = parseBdtPaisa(transaction.credit);
    if (debit === null || credit === null) throw new Error("Statement contains an invalid BDT amount.");
    debitPaisa += debit;
    creditPaisa += credit;
  }
  return { debitPaisa, creditPaisa };
}

export function createStatementDownloadUrl(
  accountId: string,
  format: "pdf" | "csv",
  startDate: string,
  endDate: string,
) {
  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  const query = params.size ? `?${params.toString()}` : "";
  return `/api/v1/accounts/${encodeURIComponent(accountId)}/statement/${format}${query}`;
}
