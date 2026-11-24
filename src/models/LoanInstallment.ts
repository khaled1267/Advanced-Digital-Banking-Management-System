import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { parseBdtPaisa } from "@/lib/bdt-money";

export const INSTALLMENT_STATUSES = ["PENDING", "PARTIALLY_PAID", "PAID"] as const;

function isNonNegativeBdtAmount(value: mongoose.Types.Decimal128) {
  const paisa = parseBdtPaisa(value.toString());
  return paisa !== null && paisa >= BigInt("0");
}

const loanInstallmentSchema = new Schema({
  loanId: { type: Schema.Types.ObjectId, ref: "Loan", required: true, immutable: true, index: true },
  customerId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true, index: true },
  installmentNumber: { type: Number, required: true, min: 1, immutable: true },
  dueDate: { type: Date, required: true, immutable: true },
  principalAmountDue: { type: Schema.Types.Decimal128, required: true, immutable: true, validate: isNonNegativeBdtAmount },
  interestAmountDue: { type: Schema.Types.Decimal128, required: true, immutable: true, validate: isNonNegativeBdtAmount },
  totalAmountDue: { type: Schema.Types.Decimal128, required: true, immutable: true, validate: isNonNegativeBdtAmount },
  amountPaid: { type: Schema.Types.Decimal128, required: true, default: "0.00", validate: isNonNegativeBdtAmount },
  remainingAmount: { type: Schema.Types.Decimal128, required: true, validate: isNonNegativeBdtAmount },
  status: { type: String, enum: INSTALLMENT_STATUSES, required: true, default: "PENDING" },
  paidAt: { type: Date, default: undefined },
  lastPaymentAt: { type: Date, default: undefined },
}, { timestamps: true });

loanInstallmentSchema.index({ loanId: 1, installmentNumber: 1 }, { unique: true, name: "unique_loan_installment_number" });
loanInstallmentSchema.index({ loanId: 1, dueDate: 1, installmentNumber: 1 });
loanInstallmentSchema.index({ customerId: 1, dueDate: 1, status: 1 });

export type LoanInstallmentDocument = InferSchemaType<typeof loanInstallmentSchema>;

export const LoanInstallment =
  (mongoose.models.LoanInstallment as mongoose.Model<LoanInstallmentDocument> | undefined) ??
  mongoose.model<LoanInstallmentDocument>("LoanInstallment", loanInstallmentSchema);
