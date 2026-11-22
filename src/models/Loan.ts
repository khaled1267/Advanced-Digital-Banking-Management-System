import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { generateLoanId } from "@/lib/loan-reference";
import {
  MAX_LOAN_DURATION_MONTHS,
  MAX_LOAN_PAISA,
  MIN_LOAN_DURATION_MONTHS,
  MIN_LOAN_PAISA,
} from "@/lib/loan-limits";
import { MAX_BDT_PAISA, parseBdtPaisa } from "@/lib/bdt-money";

export const LOAN_STATUSES = [
  "PENDING",
  "FORWARDED_TO_ADMIN",
  "APPROVED",
  "REJECTED",
  "DISBURSED",
  "PAID",
] as const;

function isWithinLoanLimits(value: mongoose.Types.Decimal128) {
  const amountPaisa = parseBdtPaisa(value.toString());
  return amountPaisa !== null && amountPaisa >= MIN_LOAN_PAISA && amountPaisa <= MAX_LOAN_PAISA;
}

function isValidApprovedAmount(value: mongoose.Types.Decimal128) {
  const amountPaisa = parseBdtPaisa(value.toString());
  return amountPaisa !== null && amountPaisa > BigInt("0") && amountPaisa <= MAX_LOAN_PAISA;
}

function isNonNegativeBdtAmount(value: mongoose.Types.Decimal128) {
  const amountPaisa = parseBdtPaisa(value.toString());
  return amountPaisa !== null && amountPaisa >= BigInt("0") && amountPaisa <= MAX_BDT_PAISA;
}

const loanSchema = new Schema(
  {
    loanId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      default: generateLoanId,
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
    // Kept only while the application is unresolved. The unique partial index
    // is the database-level guard against concurrent duplicate applications.
    activeAccountId: {
      type: Schema.Types.ObjectId,
      ref: "BankAccount",
      select: false,
      default: undefined,
    },
    amount: {
      type: Schema.Types.Decimal128,
      required: true,
      immutable: true,
      validate: {
        validator: isWithinLoanLimits,
        message: "Loan amount is outside the supported limits.",
      },
    },
    // The amount approved by an Admin can differ from the requested amount.
    approvedAmount: {
      type: Schema.Types.Decimal128,
      validate: {
        validator: isValidApprovedAmount,
        message: "Approved loan amount must be a positive BDT amount.",
      },
    },
    outstandingBalance: {
      type: Schema.Types.Decimal128,
      validate: {
        validator: isNonNegativeBdtAmount,
        message: "Outstanding balance must be a non-negative BDT amount.",
      },
    },
    currency: { type: String, enum: ["BDT"], default: "BDT", required: true, immutable: true },
    purpose: { type: String, required: true, trim: true, minlength: 10, maxlength: 500, immutable: true },
    durationMonths: { type: Number, required: true, min: MIN_LOAN_DURATION_MONTHS, max: MAX_LOAN_DURATION_MONTHS, immutable: true },
    status: { type: String, enum: LOAN_STATUSES, default: "PENDING", required: true },
    reviewNotes: { type: String, trim: true, maxlength: 1000, default: undefined },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: undefined },
    reviewedAt: { type: Date, default: undefined },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: undefined },
    approvedAt: { type: Date, default: undefined },
    rejectionReason: { type: String, trim: true, maxlength: 300, default: undefined },
    rejectedBy: { type: Schema.Types.ObjectId, ref: "User", default: undefined },
    rejectedAt: { type: Date, default: undefined },
    disbursedBy: { type: Schema.Types.ObjectId, ref: "User", default: undefined },
    disbursedAt: { type: Date, default: undefined },
    disbursementTransactionId: { type: Schema.Types.ObjectId, ref: "Transaction", default: undefined },
  },
  { timestamps: true },
);

loanSchema.index({ customerId: 1, createdAt: -1, _id: -1 });
loanSchema.index({ status: 1, createdAt: -1, _id: -1 });
loanSchema.index(
  { activeAccountId: 1 },
  {
    unique: true,
    partialFilterExpression: { activeAccountId: { $type: "objectId" } },
    name: "one_unresolved_loan_per_account",
  },
);

export type LoanDocument = InferSchemaType<typeof loanSchema>;

export const Loan =
  (mongoose.models.Loan as mongoose.Model<LoanDocument> | undefined) ??
  mongoose.model<LoanDocument>("Loan", loanSchema);
