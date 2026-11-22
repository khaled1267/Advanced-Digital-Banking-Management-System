import { z } from "zod";
import { isPositiveBdtDecimal, parseBdtPaisa } from "@/lib/bdt-money";
import {
  MAX_LOAN_PAISA,
  MAX_LOAN_DURATION_MONTHS,
  MIN_LOAN_PAISA,
  MIN_LOAN_DURATION_MONTHS,
} from "@/lib/loan-limits";
import { LOAN_STATUSES } from "@/models/Loan";

const objectIdSchema = z.string().regex(/^[\da-f]{24}$/i, "A valid account is required.");

export const createLoanSchema = z.strictObject({
  accountId: objectIdSchema,
  amount: z.string().trim().refine((value) => {
    const amountPaisa = parseBdtPaisa(value);
    return amountPaisa !== null && amountPaisa >= MIN_LOAN_PAISA && amountPaisa <= MAX_LOAN_PAISA;
  }, "Loan amount must be between BDT 10,000.00 and BDT 5,000,000.00."),
  purpose: z.string().trim().min(10).max(500),
  durationMonths: z.number().int().min(MIN_LOAN_DURATION_MONTHS).max(MAX_LOAN_DURATION_MONTHS),
});

export const customerLoansQuerySchema = z.strictObject({
  status: z.enum(LOAN_STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(1_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const staffAdminLoansQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  status: z.enum(LOAN_STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(1_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const forwardLoanToAdminSchema = z.strictObject({
  action: z.literal("FORWARD_TO_ADMIN"),
  reviewNotes: z.string().trim().min(5).max(1000),
});

export const rejectLoanSchema = z.strictObject({
  rejectionReason: z.string().trim().min(5).max(300),
});

export const approveLoanSchema = z.strictObject({
  approvedAmount: z.string().trim().optional().refine((value) => {
    if (value === undefined) return true;
    const amountPaisa = parseBdtPaisa(value);
    return amountPaisa !== null && amountPaisa > BigInt("0") && amountPaisa <= MAX_LOAN_PAISA;
  }, "Approved amount must be a positive BDT amount with at most two decimal places."),
});

const idempotencyKeySchema = z.string().regex(
  /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i,
  "Repayment request key must be a UUID v4.",
);

export const createLoanRepaymentSchema = z.strictObject({
  amount: z.string().trim().refine(
    isPositiveBdtDecimal,
    "Enter a positive BDT amount with at most two decimal places.",
  ),
  sourceAccountId: objectIdSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const loanRepaymentsQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type CreateLoanInput = z.infer<typeof createLoanSchema>;
export type CustomerLoansQuery = z.infer<typeof customerLoansQuerySchema>;
export type StaffAdminLoansQuery = z.infer<typeof staffAdminLoansQuerySchema>;
export type ForwardLoanToAdminInput = z.infer<typeof forwardLoanToAdminSchema>;
export type RejectLoanInput = z.infer<typeof rejectLoanSchema>;
export type ApproveLoanInput = z.infer<typeof approveLoanSchema>;
export type CreateLoanRepaymentInput = z.infer<typeof createLoanRepaymentSchema>;
export type LoanRepaymentsQuery = z.infer<typeof loanRepaymentsQuerySchema>;
