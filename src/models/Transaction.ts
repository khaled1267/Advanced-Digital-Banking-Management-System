import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { generateTransactionId } from "@/lib/transaction-id";
import { isPositiveBdtDecimal } from "@/lib/bdt-money";

export const TRANSACTION_TYPES = [
  "DEPOSIT",
  "WITHDRAWAL",
  "TRANSFER",
  "LOAN_DISBURSEMENT",
  "LOAN_REPAYMENT",
] as const;
export const TRANSACTION_STATUSES = [
  "PENDING",
  "COMPLETED",
  "FAILED",
  "REVERSED",
] as const;

const transactionSchema = new Schema(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      default: generateTransactionId,
    },
    transactionType: {
      type: String,
      enum: TRANSACTION_TYPES,
      required: true,
    },
    fromAccount: {
      type: Schema.Types.ObjectId,
      ref: "BankAccount",
      default: undefined,
    },
    toAccount: {
      type: Schema.Types.ObjectId,
      ref: "BankAccount",
      default: undefined,
    },
    loanId: {
      type: Schema.Types.ObjectId,
      ref: "Loan",
      immutable: true,
      default: undefined,
    },
    amount: {
      type: Schema.Types.Decimal128,
      required: true,
      validate: {
        validator(value: mongoose.Types.Decimal128) {
          return isPositiveBdtDecimal(value.toString());
        },
        message: "Transaction amount must be greater than zero.",
      },
    },
    currency: {
      type: String,
      enum: ["BDT"],
      default: "BDT",
      required: true,
    },
    status: {
      type: String,
      enum: TRANSACTION_STATUSES,
      default: "PENDING",
      required: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: undefined,
    },
    // Only customer transfer requests set this; other transaction records omit it.
    idempotencyKey: {
      type: String,
      match: /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i,
      immutable: true,
      default: undefined,
    },
  },
  { timestamps: true },
);

transactionSchema.index({ fromAccount: 1, createdAt: -1 });
transactionSchema.index({ toAccount: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });
transactionSchema.index({ transactionType: 1, createdAt: -1 });
transactionSchema.index(
  { loanId: 1 },
  {
    unique: true,
    partialFilterExpression: { loanId: { $type: "objectId" } },
    name: "unique_loan_disbursement",
  },
);
transactionSchema.index(
  { createdBy: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
    name: "unique_transfer_idempotency_per_customer",
  },
);

export type TransactionDocument = InferSchemaType<typeof transactionSchema>;

export const Transaction =
  (mongoose.models.Transaction as mongoose.Model<TransactionDocument> | undefined) ??
  mongoose.model<TransactionDocument>("Transaction", transactionSchema);
