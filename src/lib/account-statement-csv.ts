import { formatBdtPaisa, parseBdtPaisa } from "@/lib/bdt-money";

export type AccountStatementCsvData = {
  accountNumber: string;
  startDate: string | null;
  endDate: string | null;
  openingBalance: string;
  closingBalance: string;
  transactions: Array<{
    transactionId: string;
    transactionType: string;
    description: string;
    debit: string;
    credit: string;
    balance: string;
    createdAt: Date | string;
  }>;
};

const CSV_HEADERS = ["Date", "Transaction ID", "Type", "Description", "Debit (BDT)", "Credit (BDT)", "Balance (BDT)"];

function formatBdt(value: string) {
  const paisa = parseBdtPaisa(value);
  if (paisa === null) throw new Error("Statement contains an invalid BDT amount.");
  return formatBdtPaisa(paisa);
}

function hasFormulaPrefix(value: string) {
  const firstText = value.replace(/^[\u0000-\u0020]+/, "");
  return /^[=+@]/.test(firstText)
    || /^-(?:[\d.=+\-(@]|[A-Za-z_][A-Za-z\d_.]*\s*\()/.test(firstText);
}

export function escapeCsvCell(value: string) {
  const safeValue = hasFormulaPrefix(value) ? `'${value}` : value;
  return `"${safeValue.replace(/"/g, '""')}"`;
}

function csvDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Statement contains an invalid transaction date.");
  return date.toISOString();
}

function row(values: string[]) {
  return values.map(escapeCsvCell).join(",");
}

export function createAccountStatementCsv(data: AccountStatementCsvData) {
  const period = `${data.startDate ?? "account opening"} to ${data.endDate ?? "present"}`;
  const rows = [
    row(CSV_HEADERS),
    row([
      data.startDate ?? "",
      "",
      "OPENING_BALANCE",
      `Opening balance (${period})`,
      "",
      "",
      formatBdt(data.openingBalance),
    ]),
    ...data.transactions.map((transaction) => row([
      csvDate(transaction.createdAt),
      transaction.transactionId,
      transaction.transactionType,
      transaction.description,
      transaction.debit === "0.00" ? "" : formatBdt(transaction.debit),
      transaction.credit === "0.00" ? "" : formatBdt(transaction.credit),
      formatBdt(transaction.balance),
    ])),
    row([
      data.endDate ?? "",
      "",
      "CLOSING_BALANCE",
      `Closing balance (${period})`,
      "",
      "",
      formatBdt(data.closingBalance),
    ]),
  ];

  return `\uFEFF${rows.join("\r\n")}\r\n`;
}

export function createStatementCsvFilename(accountNumber: string, startDate: string | null, endDate: string | null) {
  const safeAccount = accountNumber.replace(/[^a-zA-Z0-9_-]/g, "").slice(-20) || "account";
  return `account-statement-${safeAccount}-${startDate ?? "all-time"}-to-${endDate ?? "present"}.csv`;
}
