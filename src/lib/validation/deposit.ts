import { z } from "zod";
import { DEPOSIT_STATUSES } from "@/models/Deposit";
import { isPositiveBdtDecimal } from "@/lib/bdt-money";

const objectIdSchema = z.string().regex(/^[\da-f]{24}$/i, "A valid account is required.");
const dateSchema = z.iso.date();

export const createDepositSchema = z.strictObject({
  accountId: objectIdSchema,
  amount: z.string().trim().refine(isPositiveBdtDecimal, "Enter a positive BDT amount up to the Decimal128 limit, with at most two decimal places."),
  currency: z.literal("BDT").optional(),
  description: z.string().trim().max(120).optional(),
});

export const customerDepositsQuerySchema = z.strictObject({
  status: z.enum(DEPOSIT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const adminDepositsQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  status: z.enum(DEPOSIT_STATUSES).optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
}).refine(
  (query) => !query.startDate || !query.endDate || query.startDate <= query.endDate,
  { message: "Start date must be on or before end date.", path: ["endDate"] },
);

export const reviewDepositSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("APPROVE") }),
  z.strictObject({
    action: z.literal("REJECT"),
    rejectionReason: z.string().trim().min(5).max(300),
  }),
]);

export type CreateDepositInput = z.infer<typeof createDepositSchema>;
export type CustomerDepositsQuery = z.infer<typeof customerDepositsQuerySchema>;
export type AdminDepositsQuery = z.infer<typeof adminDepositsQuerySchema>;
export type ReviewDepositInput = z.infer<typeof reviewDepositSchema>;
