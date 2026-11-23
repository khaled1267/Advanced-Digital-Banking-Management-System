import mongoose from "mongoose";
import { verifyTransactionPinHash } from "@/lib/password";
import { User } from "@/models/User";

export const TRANSACTION_PIN_MAX_FAILED_ATTEMPTS = 5;
export const TRANSACTION_PIN_WINDOW_MS = 15 * 60 * 1000;
export const TRANSACTION_PIN_LOCKOUT_MS = 15 * 60 * 1000;

export type TransactionPinResult = "OK" | "NOT_CONFIGURED" | "INVALID" | "RATE_LIMITED";

function lockoutFilter(now: Date) {
  return {
    $or: [
      { transactionPinLockedUntil: { $exists: false } },
      { transactionPinLockedUntil: null },
      { transactionPinLockedUntil: { $lte: now } },
    ],
  };
}

async function recordFailedAttempt(userId: mongoose.Types.ObjectId, pinHash: string, now: Date) {
  const windowStart = new Date(now.getTime() - TRANSACTION_PIN_WINDOW_MS);
  const lockUntil = new Date(now.getTime() + TRANSACTION_PIN_LOCKOUT_MS);
  const expiredWindow = {
    $or: [
      { $eq: [{ $ifNull: ["$transactionPinFailureWindowStartedAt", null] }, null] },
      { $lte: ["$transactionPinFailureWindowStartedAt", windowStart] },
    ],
  };

  await User.collection.updateOne(
    { _id: userId, transactionPinHash: pinHash, ...lockoutFilter(now) },
    [
      {
        $set: {
          transactionPinFailureWindowStartedAt: {
            $cond: [expiredWindow, now, "$transactionPinFailureWindowStartedAt"],
          },
          transactionPinFailedAttempts: {
            $cond: [expiredWindow, 1, { $add: [{ $ifNull: ["$transactionPinFailedAttempts", 0] }, 1] }],
          },
        },
      },
      {
        $set: {
          transactionPinLockedUntil: {
            $cond: [
              { $gte: ["$transactionPinFailedAttempts", TRANSACTION_PIN_MAX_FAILED_ATTEMPTS] },
              lockUntil,
              "$transactionPinLockedUntil",
            ],
          },
        },
      },
    ],
  );
}

export async function verifyCustomerTransactionPin(
  userId: mongoose.Types.ObjectId,
  pin: string,
): Promise<TransactionPinResult> {
  const user = await User.findOne({ _id: userId, role: "CUSTOMER", status: "ACTIVE" })
    .select("+transactionPinHash +transactionPinFailedAttempts +transactionPinFailureWindowStartedAt +transactionPinLockedUntil");
  if (!user?.transactionPinHash) return "NOT_CONFIGURED";

  const now = new Date();
  if (user.transactionPinLockedUntil && user.transactionPinLockedUntil > now) return "RATE_LIMITED";

  const valid = await verifyTransactionPinHash(pin, user.transactionPinHash);
  if (!valid) {
    await recordFailedAttempt(userId, user.transactionPinHash, now);
    return "INVALID";
  }

  const reset = await User.updateOne(
    {
      _id: userId,
      role: "CUSTOMER",
      status: "ACTIVE",
      transactionPinHash: user.transactionPinHash,
      ...lockoutFilter(now),
    },
    {
      $set: { transactionPinFailedAttempts: 0 },
      $unset: { transactionPinFailureWindowStartedAt: 1, transactionPinLockedUntil: 1 },
    },
  );
  return reset.matchedCount === 1 ? "OK" : "RATE_LIMITED";
}
