import mongoose, { Schema, type InferSchemaType } from "mongoose";

export const ACCOUNT_TYPES = ["SAVINGS", "CURRENT"] as const;
export const ACCOUNT_STATUSES = ["ACTIVE", "INACTIVE", "FROZEN", "CLOSED"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

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
          return /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value.toString());
        },
        message: "Balance must be non-negative and use at most two decimal places.",
      },
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
