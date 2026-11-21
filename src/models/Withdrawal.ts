import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { generateWithdrawalId } from "@/lib/withdrawal-reference";
import { isPositiveBdtDecimal } from "@/lib/bdt-money";

export const WITHDRAWAL_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

const withdrawalSchema = new Schema(
  {
    withdrawalId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      default: generateWithdrawalId,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
      index: true,
    },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "BankAccount",
      required: true,
      immutable: true,
    },
    amount: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
      validate: {
        validator(value: mongoose.Types.Decimal128) {
          return isPositiveBdtDecimal(value.toString());
        },
        message: "Withdrawal amount must be positive and within the BDT Decimal128 limit.",
      },
    },
    currency: { type: String, enum: ["BDT"], default: "BDT", required: true, immutable: true },
    status: { type: String, enum: WITHDRAWAL_STATUSES, default: "PENDING", required: true },
    description: { type: String, trim: true, maxlength: 120 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: undefined },
    reviewedAt: { type: Date, default: undefined },
    rejectionReason: { type: String, trim: true, maxlength: 300, default: undefined },
    transactionId: { type: Schema.Types.ObjectId, ref: "Transaction", default: undefined },
  },
  { timestamps: true },
);

withdrawalSchema.index({ customerId: 1, createdAt: -1, _id: -1 });
withdrawalSchema.index({ accountId: 1, createdAt: -1 });
withdrawalSchema.index({ status: 1, createdAt: -1 });

export type WithdrawalDocument = InferSchemaType<typeof withdrawalSchema>;

export const Withdrawal =
  (mongoose.models.Withdrawal as mongoose.Model<WithdrawalDocument> | undefined) ??
  mongoose.model<WithdrawalDocument>("Withdrawal", withdrawalSchema);
