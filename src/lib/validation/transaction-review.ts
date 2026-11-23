import { z } from "zod";
import { REVIEW_TARGET_TYPES } from "@/models/TransactionReview";
import { SUSPICIOUS_FLAG_REASONS, SUSPICIOUS_FLAG_STATUSES } from "@/models/SuspiciousTransactionFlag";

const objectIdSchema = z.string().regex(/^[\da-f]{24}$/i, "A valid record is required.");
const noteSchema = z.string().trim().min(3).max(500);

export const transactionReviewTargetSchema = z.strictObject({
  targetType: z.enum(REVIEW_TARGET_TYPES),
  targetId: objectIdSchema,
});

export const transactionReviewActionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("START_REVIEW"), note: z.string().trim().max(500).optional() }),
  z.strictObject({ action: z.literal("ADD_NOTE"), note: noteSchema }),
  z.strictObject({ action: z.literal("COMPLETE_REVIEW"), note: z.string().trim().max(500).optional() }),
]);

export const transactionReviewRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({ targetType: z.enum(REVIEW_TARGET_TYPES), targetId: objectIdSchema, action: z.literal("START_REVIEW"), note: z.string().trim().max(500).optional() }),
  z.strictObject({ targetType: z.enum(REVIEW_TARGET_TYPES), targetId: objectIdSchema, action: z.literal("ADD_NOTE"), note: noteSchema }),
  z.strictObject({ targetType: z.enum(REVIEW_TARGET_TYPES), targetId: objectIdSchema, action: z.literal("COMPLETE_REVIEW"), note: z.string().trim().max(500).optional() }),
]);

export const suspiciousFlagCreateSchema = z.strictObject({
  targetType: z.enum(REVIEW_TARGET_TYPES),
  targetId: objectIdSchema,
  reason: z.enum(SUSPICIOUS_FLAG_REASONS),
  explanation: z.string().trim().max(500).optional(),
});

export const suspiciousFlagQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  targetType: z.enum(REVIEW_TARGET_TYPES).optional(),
  status: z.enum(SUSPICIOUS_FLAG_STATUSES).optional(),
  reason: z.enum(SUSPICIOUS_FLAG_REASONS).optional(),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).max(1_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
}).refine(({ startDate, endDate }) => !startDate || !endDate || startDate <= endDate, {
  path: ["endDate"], message: "End date must be on or after the start date.",
});

export const suspiciousFlagAdminActionSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("UNDER_REVIEW"), note: z.string().trim().max(500).optional() }),
  z.strictObject({ status: z.literal("RESOLVED"), note: noteSchema }),
  z.strictObject({ status: z.literal("DISMISSED"), note: noteSchema }),
]);

export type TransactionReviewTarget = z.infer<typeof transactionReviewTargetSchema>;
export type TransactionReviewAction = z.infer<typeof transactionReviewActionSchema>;
export type SuspiciousFlagQuery = z.infer<typeof suspiciousFlagQuerySchema>;
