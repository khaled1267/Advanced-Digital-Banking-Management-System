import mongoose, { Schema, type InferSchemaType } from "mongoose";

export const USER_ROLES = ["ADMIN", "STAFF", "CUSTOMER"] as const;
export const USER_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export const CUSTOMER_VERIFICATION_STATUSES = ["PENDING", "VERIFIED", "REJECTED"] as const;

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    profileImageUrl: {
      type: String,
      trim: true,
      maxlength: 2048,
    },
    profileImagePublicId: {
      type: String,
      trim: true,
      maxlength: 255,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    transactionPinHash: {
      type: String,
      select: false,
    },
    transactionPinFailedAttempts: {
      type: Number,
      default: 0,
      min: 0,
      select: false,
    },
    transactionPinFailureWindowStartedAt: {
      type: Date,
      select: false,
    },
    transactionPinLockedUntil: {
      type: Date,
      select: false,
    },
    role: {
      type: String,
      enum: USER_ROLES,
      default: "CUSTOMER",
      required: true,
    },
    status: {
      type: String,
      enum: USER_STATUSES,
      default: "ACTIVE",
      required: true,
    },
    verificationStatus: {
      type: String,
      enum: CUSTOMER_VERIFICATION_STATUSES,
    },
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    verifiedAt: {
      type: Date,
    },
    verificationNote: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  { timestamps: true },
);

export type UserDocument = InferSchemaType<typeof userSchema>;

export const User =
  (mongoose.models.User as mongoose.Model<UserDocument> | undefined) ??
  mongoose.model<UserDocument>("User", userSchema);
