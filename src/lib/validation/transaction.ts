import { z } from "zod";
import { TRANSACTION_STATUSES, TRANSACTION_TYPES } from "@/models/Transaction";
import { TRANSACTION_REVIEW_STATUSES } from "@/models/TransactionReview";

export const transactionQuerySchema = z
  .strictObject({
    search: z.string().trim().max(100).optional(),
    transactionType: z.enum(TRANSACTION_TYPES).optional(),
    status: z.enum(TRANSACTION_STATUSES).optional(),
    reviewStatus: z.enum(TRANSACTION_REVIEW_STATUSES).optional(),
    suspiciousStatus: z.enum(["FLAGGED", "CLEAR"]).optional(),
    startDate: z.iso.date().optional(),
    endDate: z.iso.date().optional(),
    page: z.coerce.number().int().min(1).max(1_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  })
  .refine(
    ({ startDate, endDate }) =>
      !startDate || !endDate || startDate <= endDate,
    { path: ["endDate"], message: "End date must be on or after the start date." },
  );

export type TransactionQuery = z.infer<typeof transactionQuerySchema>;
