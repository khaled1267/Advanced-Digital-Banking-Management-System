import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { parseBdtPaisa } from "@/lib/bdt-money";

export const ACCOUNT_TYPES = ["SAVINGS", "CURRENT"] as const;
export const ACCOUNT_STATUSES = ["ACTIVE", "INACTIVE", "FROZEN", "CLOSED"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

function validOptionalLimit(value: mongoose.Types.Decimal128 | null | undefined, positive: boolean) {
  if (value == null) return true;
  const paisa = parseBdtPaisa(value.toString());
  return paisa !== null && (positive ? paisa > BigInt("0") : paisa >= BigInt("0"));
}

const bankAccountSchema = new Schema(
  {
    accountNumber: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      immutable: true,
    },
    accountType: {
      type: String,
      enum: ACCOUNT_TYPES,
      required: true,
      immutable: true,
    },
    // Decimal128 stores BDT exactly; JSON APIs serialize this as a decimal string.
    balance: {
      type: Schema.Types.Decimal128,
      required: true,
      default: () => mongoose.Types.Decimal128.fromString("0.00"),
      validate: {
        validator(value: mongoose.Types.Decimal128) {
          const balancePaisa = parseBdtPaisa(value.toString());
          return balancePaisa !== null && balancePaisa >= BigInt("0");
        },
        message: "Balance must be non-negative and use at most two decimal places.",
      },
    },
    // Optional so legacy accounts remain usable until an Admin configures limits.
    transactionLimits: {
      dailyTransferLimit: {
        type: Schema.Types.Decimal128,
        validate: {
          validator(value: mongoose.Types.Decimal128 | undefined) {
            return validOptionalLimit(value, true);
          },
          message: "Daily transfer limit must be a positive BDT amount.",
        },
      },
      maximumSingleTransferAmount: {
        type: Schema.Types.Decimal128,
        validate: {
          validator(value: mongoose.Types.Decimal128 | undefined) {
            return validOptionalLimit(value, true);
          },
          message: "Maximum single transfer must be a positive BDT amount.",
        },
      },
      minimumBalance: {
        type: Schema.Types.Decimal128,
        validate: {
          validator(value: mongoose.Types.Decimal128 | undefined) {
            return validOptionalLimit(value, false);
          },
          message: "Minimum balance must be a non-negative BDT amount.",
        },
      },
    },
    limitsUpdatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    limitsUpdatedAt: {
      type: Date,
    },
    currency: {
      type: String,
      enum: ["BDT"],
      default: "BDT",
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: ACCOUNT_STATUSES,
      default: "ACTIVE",
      required: true,
    },
  },
  { timestamps: true },
);

export type BankAccountDocument = InferSchemaType<typeof bankAccountSchema>;

export const BankAccount =
  (mongoose.models.BankAccount as mongoose.Model<BankAccountDocument> | undefined) ??
  mongoose.model<BankAccountDocument>("BankAccount", bankAccountSchema);
