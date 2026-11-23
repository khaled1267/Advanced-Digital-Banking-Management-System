import mongoose, { Schema, type InferSchemaType } from "mongoose";

export const REVIEW_TARGET_TYPES = ["TRANSACTION", "DEPOSIT_REQUEST", "WITHDRAWAL_REQUEST"] as const;
export const TRANSACTION_REVIEW_STATUSES = ["NOT_REVIEWED", "UNDER_REVIEW", "REVIEWED"] as const;
export const TRANSACTION_REVIEW_ACTIONS = ["START_REVIEW", "NOTE_ADDED", "COMPLETE_REVIEW", "FLAG_CREATED"] as const;

const historySchema = new Schema({
  actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  action: { type: String, enum: TRANSACTION_REVIEW_ACTIONS, required: true },
  previousStatus: { type: String, enum: TRANSACTION_REVIEW_STATUSES },
  newStatus: { type: String, enum: TRANSACTION_REVIEW_STATUSES },
  note: { type: String, trim: true, maxlength: 500 },
  createdAt: { type: Date, default: Date.now, required: true },
}, { _id: false });

const transactionReviewSchema = new Schema({
  targetType: { type: String, enum: REVIEW_TARGET_TYPES, required: true },
  targetId: { type: Schema.Types.ObjectId, required: true },
  reviewStatus: { type: String, enum: TRANSACTION_REVIEW_STATUSES, default: "NOT_REVIEWED", required: true },
  reviewNote: { type: String, trim: true, maxlength: 500 },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  reviewedAt: { type: Date, required: true },
  history: { type: [historySchema], default: [] },
}, { timestamps: true });

transactionReviewSchema.index({ targetType: 1, targetId: 1 }, { unique: true, name: "unique_review_per_target" });
transactionReviewSchema.index({ reviewStatus: 1, updatedAt: -1 });

export type TransactionReviewDocument = InferSchemaType<typeof transactionReviewSchema>;

export const TransactionReview =
  (mongoose.models.TransactionReview as mongoose.Model<TransactionReviewDocument> | undefined) ??
  mongoose.model<TransactionReviewDocument>("TransactionReview", transactionReviewSchema);
