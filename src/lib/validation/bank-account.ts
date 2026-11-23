import { z } from "zod";
import { ACCOUNT_STATUSES, ACCOUNT_TYPES } from "@/models/BankAccount";
import { parseBdtPaisa } from "@/lib/bdt-money";

const objectIdSchema = z.string().regex(/^[\da-f]{24}$/i, "A valid MongoDB ObjectId is required.");

export const createBankAccountSchema = z.strictObject({
  userId: objectIdSchema,
  accountType: z.enum(ACCOUNT_TYPES),
});

export const updateAccountStatusSchema = z.strictObject({
  status: z.enum(ACCOUNT_STATUSES),
});

const optionalLimit = (minimum: "ZERO" | "POSITIVE") => z.string().trim().refine((value) => {
  const paisa = parseBdtPaisa(value);
  return paisa !== null && (minimum === "ZERO" ? paisa >= BigInt("0") : paisa > BigInt("0"));
}, "Enter a valid BDT amount with at most two decimal places.").nullable().optional();

export const updateAccountTransactionLimitsSchema = z.strictObject({
  dailyTransferLimit: optionalLimit("POSITIVE"),
  maximumSingleTransferAmount: optionalLimit("POSITIVE"),
  minimumBalance: optionalLimit("ZERO"),
}).refine((value) => Object.values(value).some((entry) => entry !== undefined), {
  message: "At least one account limit must be provided.",
});

export type UpdateAccountTransactionLimitsInput = z.infer<typeof updateAccountTransactionLimitsSchema>;

export const adminAccountsQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  accountType: z.enum(ACCOUNT_TYPES).optional(),
  status: z.enum(ACCOUNT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(1_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const accountHolderQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});

export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>;
export type UpdateAccountStatusInput = z.infer<typeof updateAccountStatusSchema>;
export type AdminAccountsQuery = z.infer<typeof adminAccountsQuerySchema>;
