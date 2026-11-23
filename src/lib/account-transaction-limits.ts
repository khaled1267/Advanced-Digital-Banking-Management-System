import mongoose, { type ClientSession } from "mongoose";
import { formatBdtPaisa, MAX_BDT_PAISA, parseBdtPaisa } from "@/lib/bdt-money";
import { BankAccount } from "@/models/BankAccount";
import { Transaction } from "@/models/Transaction";

export type AccountTransactionLimitValues = {
  dailyTransferLimit?: mongoose.Types.Decimal128 | null;
  maximumSingleTransferAmount?: mongoose.Types.Decimal128 | null;
  minimumBalance?: mongoose.Types.Decimal128 | null;
};

export function serializeAccountTransactionLimits(limits?: AccountTransactionLimitValues | null) {
  return {
    dailyTransferLimit: limits?.dailyTransferLimit?.toString() ?? null,
    maximumSingleTransferAmount: limits?.maximumSingleTransferAmount?.toString() ?? null,
    minimumBalance: limits?.minimumBalance?.toString() ?? null,
  };
}

export function getMinimumBalancePaisa(limits?: AccountTransactionLimitValues | null) {
  if (!limits?.minimumBalance) return BigInt("0");
  return parseBdtPaisa(limits.minimumBalance.toString()) ?? BigInt("0");
}

export type TransferLimitErrorCode = "MAXIMUM_SINGLE_AMOUNT" | "DAILY_TRANSFER_LIMIT" | "MINIMUM_BALANCE";

export class AccountTransferLimitError extends Error {
  constructor(readonly code: TransferLimitErrorCode) {
    super(code);
    this.name = "AccountTransferLimitError";
  }
}

/** Must run inside the same Mongo transaction that debits the source account. */
export async function validateAccountTransactionLimits(input: {
  accountId: mongoose.Types.ObjectId;
  amountPaisa: bigint;
  limits?: AccountTransactionLimitValues | null;
  session: ClientSession;
  now?: Date;
}) {
  const { accountId, amountPaisa, limits, session } = input;
  const maximumSingle = limits?.maximumSingleTransferAmount
    ? parseBdtPaisa(limits.maximumSingleTransferAmount.toString())
    : null;
  if (maximumSingle !== null && amountPaisa > maximumSingle) {
    throw new AccountTransferLimitError("MAXIMUM_SINGLE_AMOUNT");
  }

  const dailyLimit = limits?.dailyTransferLimit
    ? parseBdtPaisa(limits.dailyTransferLimit.toString())
    : null;
  if (dailyLimit !== null) {
    const now = input.now ?? new Date();
    const startOfUtcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const [dailyTotal] = await Transaction.aggregate<{ total: mongoose.Types.Decimal128 }>([
      {
        $match: {
          fromAccount: accountId,
          transactionType: "TRANSFER",
          status: "COMPLETED",
          createdAt: { $gte: startOfUtcDay, $lte: now },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]).session(session);
    const existingPaisa = dailyTotal?.total
      ? parseBdtPaisa(dailyTotal.total.toString())
      : BigInt("0");
    if (existingPaisa === null || existingPaisa + amountPaisa > dailyLimit) {
      throw new AccountTransferLimitError("DAILY_TRANSFER_LIMIT");
    }
  }

  const minimumBalancePaisa = getMinimumBalancePaisa(limits);
  if (minimumBalancePaisa + amountPaisa > MAX_BDT_PAISA) {
    throw new AccountTransferLimitError("MINIMUM_BALANCE");
  }
  return {
    minimumBalancePaisa,
    minimumPriorBalance: mongoose.Types.Decimal128.fromString(
      formatBdtPaisa(minimumBalancePaisa + amountPaisa),
    ),
  };
}

export async function updateAccountTransactionLimits(input: {
  accountId: string;
  actorId: mongoose.Types.ObjectId;
  values: {
    dailyTransferLimit?: string | null;
    maximumSingleTransferAmount?: string | null;
    minimumBalance?: string | null;
  };
}) {
  const $set: Record<string, unknown> = {
    limitsUpdatedBy: input.actorId,
    limitsUpdatedAt: new Date(),
  };
  const $unset: Record<string, ""> = {};
  for (const key of ["dailyTransferLimit", "maximumSingleTransferAmount", "minimumBalance"] as const) {
    const value = input.values[key];
    if (value === undefined) continue;
    const path = `transactionLimits.${key}`;
    if (value === null) $unset[path] = "";
    else $set[path] = mongoose.Types.Decimal128.fromString(value);
  }

  return BankAccount.findByIdAndUpdate(
    input.accountId,
    { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) },
    { returnDocument: "after", runValidators: true },
  );
}
