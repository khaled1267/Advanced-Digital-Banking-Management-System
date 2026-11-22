import { randomBytes } from "node:crypto";
import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { parseBdtPaisa } from "@/lib/bdt-money";

export const LOAN_REPAYMENT_STATUSES = ["COMPLETED"] as const;

function generateRepaymentId() {
  return `LRP-${randomBytes(12).toString("hex").toUpperCase()}`;
}

const loanRepaymentSchema = new Schema(
  {
    repaymentId: {
      type: String,
      required: true,
      immutable: true,
      default: generateRepaymentId,
    },
    loanId: {
      type: Schema.Types.ObjectId,
      ref: "Loan",
      required: true,
      immutable: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    sourceAccountId: {
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
          const amountPaisa = parseBdtPaisa(value.toString());
          return amountPaisa !== null && amountPaisa > BigInt("0");
        },
        message: "Repayment amount must be a positive BDT amount with at most two decimal places.",
      },
    },
    outstandingBalanceAfter: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
      validate: {
        validator(value: mongoose.Types.Decimal128) {
          const amountPaisa = parseBdtPaisa(value.toString());
          return amountPaisa !== null && amountPaisa >= BigInt("0");
        },
        message: "Outstanding balance must be a non-negative BDT amount.",
      },
    },
    currency: { type: String, enum: ["BDT"], default: "BDT", required: true, immutable: true },
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
      immutable: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      match: /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i,
      immutable: true,
    },
    status: { type: String, enum: LOAN_REPAYMENT_STATUSES, default: "COMPLETED", required: true, immutable: true },
  },
  { timestamps: true },
);

loanRepaymentSchema.index({ repaymentId: 1 }, { unique: true, name: "unique_loan_repayment_reference" });
loanRepaymentSchema.index(
  { customerId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
    name: "unique_loan_repayment_idempotency_per_customer",
  },
);
loanRepaymentSchema.index(
  { transactionId: 1 },
  {
    unique: true,
    partialFilterExpression: { transactionId: { $type: "objectId" } },
    name: "unique_loan_repayment_transaction",
  },
);
loanRepaymentSchema.index({ loanId: 1, customerId: 1, createdAt: -1, _id: -1 });

export type LoanRepaymentDocument = InferSchemaType<typeof loanRepaymentSchema>;

export const LoanRepayment =
  (mongoose.models.LoanRepayment as mongoose.Model<LoanRepaymentDocument> | undefined) ??
  mongoose.model<LoanRepaymentDocument>("LoanRepayment", loanRepaymentSchema);
