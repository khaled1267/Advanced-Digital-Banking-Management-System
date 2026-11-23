import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { REVIEW_TARGET_TYPES } from "@/models/TransactionReview";

export const SUSPICIOUS_FLAG_REASONS = ["UNUSUAL_AMOUNT", "UNUSUAL_ACTIVITY", "DUPLICATE_PATTERN", "ACCOUNT_CONCERN", "OTHER"] as const;
export const SUSPICIOUS_FLAG_STATUSES = ["OPEN", "UNDER_REVIEW", "RESOLVED", "DISMISSED"] as const;
export const SUSPICIOUS_FLAG_ACTIONS = ["FLAG_CREATED", "REVIEW_STARTED", "RESOLVED", "DISMISSED"] as const;

const flagHistorySchema = new Schema({
  actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  action: { type: String, enum: SUSPICIOUS_FLAG_ACTIONS, required: true },
  previousStatus: { type: String, enum: SUSPICIOUS_FLAG_STATUSES },
  newStatus: { type: String, enum: SUSPICIOUS_FLAG_STATUSES, required: true },
  note: { type: String, trim: true, maxlength: 500 },
  createdAt: { type: Date, default: Date.now, required: true },
}, { _id: false });

const suspiciousTransactionFlagSchema = new Schema({
  targetType: { type: String, enum: REVIEW_TARGET_TYPES, required: true },
  targetId: { type: Schema.Types.ObjectId, required: true },
  reason: { type: String, enum: SUSPICIOUS_FLAG_REASONS, required: true },
  explanation: { type: String, trim: true, maxlength: 500 },
  status: { type: String, enum: SUSPICIOUS_FLAG_STATUSES, default: "OPEN", required: true },
  active: { type: Boolean, default: true, required: true },
  flaggedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  flaggedAt: { type: Date, default: Date.now, required: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
  reviewedAt: { type: Date },
  adminReviewNote: { type: String, trim: true, maxlength: 500 },
  history: { type: [flagHistorySchema], default: [] },
}, { timestamps: true });

suspiciousTransactionFlagSchema.index(
  { targetType: 1, targetId: 1 },
  { unique: true, partialFilterExpression: { active: true }, name: "one_active_flag_per_review_target" },
);
suspiciousTransactionFlagSchema.index({ active: 1, status: 1, flaggedAt: -1 });
suspiciousTransactionFlagSchema.index({ reason: 1, flaggedAt: -1 });

export type SuspiciousTransactionFlagDocument = InferSchemaType<typeof suspiciousTransactionFlagSchema>;

export const SuspiciousTransactionFlag =
  (mongoose.models.SuspiciousTransactionFlag as mongoose.Model<SuspiciousTransactionFlagDocument> | undefined) ??
  mongoose.model<SuspiciousTransactionFlagDocument>("SuspiciousTransactionFlag", suspiciousTransactionFlagSchema);
