import { z } from "zod";
import { isPositiveBdtDecimal } from "@/lib/bdt-money";

const objectIdSchema = z.string().regex(/^[\da-f]{24}$/i);
const requestKeySchema = z.string().regex(
  /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i,
  "Transfer request key must be a UUID v4.",
);
const dateSchema = z.iso.date();

export const createTransferSchema = z.strictObject({
  fromAccountId: objectIdSchema,
  recipientAccountNumber: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(/^NB[A-F\d]{16}$/)),
  amount: z.string().trim().refine(isPositiveBdtDecimal, "Enter a positive BDT amount with at most two decimal places."),
  description: z.string().trim().max(120).optional(),
  idempotencyKey: requestKeySchema,
});

export const transferHistoryQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
}).refine(
  (query) => !query.startDate || !query.endDate || query.startDate <= query.endDate,
  { message: "Start date must be on or before end date.", path: ["endDate"] },
);

export type CreateTransferInput = z.infer<typeof createTransferSchema>;
export type TransferHistoryQuery = z.infer<typeof transferHistoryQuerySchema>;
