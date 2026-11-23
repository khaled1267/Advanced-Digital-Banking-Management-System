import mongoose, { Schema, type InferSchemaType } from "mongoose";

export const NOTIFICATION_TYPES = [
  "MONEY_RECEIVED",
  "TRANSFER_COMPLETED",
  "DEPOSIT_APPROVED",
  "WITHDRAWAL_REJECTED",
  "LOAN_APPROVED",
  "LOAN_REJECTED",
] as const;
export const NOTIFICATION_ENTITY_TYPES = ["transaction", "deposit", "withdrawal", "loan"] as const;

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true, immutable: true },
    title: { type: String, required: true, trim: true, maxlength: 80, immutable: true },
    message: { type: String, required: true, trim: true, maxlength: 300, immutable: true },
    isRead: { type: Boolean, default: false, required: true },
    readAt: { type: Date, default: undefined },
    relatedEntityType: { type: String, enum: NOTIFICATION_ENTITY_TYPES, immutable: true },
    relatedEntityId: { type: Schema.Types.ObjectId, immutable: true },
    dedupeKey: { type: String, required: true, unique: true, immutable: true, maxlength: 180 },
  },
  { timestamps: true },
);

notificationSchema.index({ userId:  1, createdAt: -1, _id: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });

export type NotificationDocument = InferSchemaType<typeof notificationSchema>;
export const Notification =
  (mongoose.models.Notification as mongoose.Model<NotificationDocument> | undefined) ??
  mongoose.model<NotificationDocument>("Notification", notificationSchema);
