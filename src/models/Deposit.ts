import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { generateDepositId } from "@/lib/deposit-reference";
import { isPositiveBdtDecimal } from "@/lib/bdt-money";

export const DEPOSIT_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

const depositSchema = new Schema(
  {
    depositId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      default: generateDepositId,
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
        message: "Deposit amount must be positive and within the BDT Decimal128 limit.",
      },
    },
    currency: { type: String, enum: ["BDT"], default: "BDT", required: true, immutable: true },
    status: { type: String, enum: DEPOSIT_STATUSES, default: "PENDING", required: true },
    description: { type: String, trim: true, maxlength: 120 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: undefined },
    reviewedAt: { type: Date, default: undefined },
    rejectionReason: { type: String, trim: true, maxlength: 300, default: undefined },
    transactionId: { type: Schema.Types.ObjectId, ref: "Transaction", default: undefined },
  },
  { timestamps: true },
);

depositSchema.index({ customerId: 1, createdAt: -1, _id: -1 });
depositSchema.index({ accountId: 1, createdAt: -1 });
depositSchema.index({ status: 1, createdAt: -1 });

export type DepositDocument = InferSchemaType<typeof depositSchema>;

export const Deposit =
  (mongoose.models.Deposit as mongoose.Model<DepositDocument> | undefined) ??
  mongoose.model<DepositDocument>("Deposit", depositSchema);
