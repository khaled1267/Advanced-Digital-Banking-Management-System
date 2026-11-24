import { formatBdtPaisa, parseBdtPaisa } from "@/lib/bdt-money";

export type GeneratedLoanInstallment = {
  installmentNumber: number;
  dueDate: Date;
  principalAmountDue: string;
  interestAmountDue: "0.00";
  totalAmountDue: string;
  amountPaid: "0.00";
  remainingAmount: string;
  status: "PENDING";
};

function addMonthlyDueDate(anchor: Date, monthsAfter: number) {
  const targetMonth = anchor.getUTCMonth() + monthsAfter;
  const targetYear = anchor.getUTCFullYear() + Math.floor(targetMonth / 12);
  const month = targetMonth % 12;
  const lastDay = new Date(Date.UTC(targetYear, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    targetYear,
    month,
    Math.min(anchor.getUTCDate(), lastDay),
    anchor.getUTCHours(),
    anchor.getUTCMinutes(),
    anchor.getUTCSeconds(),
    anchor.getUTCMilliseconds(),
  ));
}

/** Principal-only schedule: Northstar currently has no persisted interest policy. */
export function generateLoanInstallments(amount: string, durationMonths: number, disbursedAt: Date): GeneratedLoanInstallment[] {
  const totalPaisa = parseBdtPaisa(amount);
  if (!totalPaisa || totalPaisa <= BigInt("0")) throw new Error("Loan schedule requires a positive BDT amount.");
  if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 600) {
    throw new Error("Loan schedule requires a valid month duration.");
  }
  if (Number.isNaN(disbursedAt.getTime())) throw new Error("Loan schedule requires a valid disbursement date.");

  const monthlyPaisa = totalPaisa / BigInt(durationMonths);
  let allocatedPaisa = BigInt("0");
  return Array.from({ length: durationMonths }, (_, index) => {
    const principalPaisa = index === durationMonths - 1 ? totalPaisa - allocatedPaisa : monthlyPaisa;
    allocatedPaisa += principalPaisa;
    const amountText = formatBdtPaisa(principalPaisa);
    return {
      installmentNumber: index + 1,
      dueDate: addMonthlyDueDate(disbursedAt, index + 1),
      principalAmountDue: amountText,
      interestAmountDue: "0.00" as const,
      totalAmountDue: amountText,
      amountPaid: "0.00" as const,
      remainingAmount: amountText,
      status: "PENDING" as const,
    };
  });
}
