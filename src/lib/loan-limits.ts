import { parseBdtPaisa } from "@/lib/bdt-money";

export const MIN_LOAN_AMOUNT = "10000.00";
export const MAX_LOAN_AMOUNT = "5000000.00";
export const MIN_LOAN_PAISA = parseBdtPaisa(MIN_LOAN_AMOUNT)!;
export const MAX_LOAN_PAISA = parseBdtPaisa(MAX_LOAN_AMOUNT)!;
export const MIN_LOAN_DURATION_MONTHS = 6;
export const MAX_LOAN_DURATION_MONTHS = 60;
