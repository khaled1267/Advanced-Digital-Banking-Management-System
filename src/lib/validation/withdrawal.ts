import { z } from "zod";
import { isPositiveBdtDecimal } from "@/lib/bdt-money";
import {
  adminDepositsQuerySchema,
  customerDepositsQuerySchema,
  reviewDepositSchema,
} from "@/lib/validation/deposit";

const objectIdSchema = z.string().regex(/^[\da-f]{24}$/i, "A valid account is required.");

export const createWithdrawalSchema = z.strictObject({
  accountId: objectIdSchema,
  amount: z.string().trim().refine(isPositiveBdtDecimal, "Enter a positive BDT amount with at most two decimal places."),
  currency: z.literal("BDT").optional(),
  description: z.string().trim().max(120).optional(),
});

export const customerWithdrawalsQuerySchema = customerDepositsQuerySchema;
export const adminWithdrawalsQuerySchema = adminDepositsQuerySchema;
export const reviewWithdrawalSchema = reviewDepositSchema;

export type CreateWithdrawalInput = z.infer<typeof createWithdrawalSchema>;
export type CustomerWithdrawalsQuery = z.infer<typeof customerWithdrawalsQuerySchema>;
export type AdminWithdrawalsQuery = z.infer<typeof adminWithdrawalsQuerySchema>;
export type ReviewWithdrawalInput = z.infer<typeof reviewWithdrawalSchema>;
