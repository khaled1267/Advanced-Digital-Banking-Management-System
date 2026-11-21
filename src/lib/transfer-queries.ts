import type { Types } from "mongoose";
import {
  accountOwnershipCondition,
  buildTransactionFilter,
  getSafeTransaction,
  listTransactions,
  type SafeTransaction,
} from "@/lib/transaction-queries";
import type { TransferHistoryQuery } from "@/lib/validation/transfer";
import { BankAccount } from "@/models/BankAccount";
import { Transaction } from "@/models/Transaction";

export type SafeTransfer = SafeTransaction & { direction: "SENT" | "RECEIVED" };

function getDirection(
  transaction: SafeTransaction,
  ownedAccountIds: Set<string>,
): "SENT" | "RECEIVED" {
  return transaction.fromAccount && ownedAccountIds.has(transaction.fromAccount.id)
    ? "SENT"
    : "RECEIVED";
}

export async function listMyTransfers(userId: Types.ObjectId, query: TransferHistoryQuery) {
  const accounts = await BankAccount.find({ userId }).select("_id").lean();
  const ownedIds = new Set(accounts.map((account) => account._id.toString()));
  const transactionQuery = { ...query, transactionType: "TRANSFER" as const };
  const result = await listTransactions(
    {
      $and: [
        buildTransactionFilter(transactionQuery),
        accountOwnershipCondition(accounts.map((account) => account._id)),
      ],
    },
    transactionQuery,
  );

  const { transactions, ...pagination } = result;
  return {
    ...pagination,
    transfers: transactions.map((transaction): SafeTransfer => ({
      ...transaction,
      direction: getDirection(transaction, ownedIds),
    })),
  };
}

export async function getMyTransfer(userId: Types.ObjectId, transferId: Types.ObjectId) {
  const accounts = await BankAccount.find({ userId }).select("_id").lean();
  const ownedIds = new Set(accounts.map((account) => account._id.toString()));
  const transaction = await Transaction.findOne({
    _id: transferId,
    transactionType: "TRANSFER",
    $or: [
      { fromAccount: { $in: accounts.map((account) => account._id) } },
      { toAccount: { $in: accounts.map((account) => account._id) } },
    ],
  })
    .select("transactionId transactionType fromAccount toAccount amount currency status description createdAt updatedAt")
    .lean();

  const safe = await getSafeTransaction(transaction);
  return safe ? { ...safe, direction: getDirection(safe, ownedIds) } : null;
}
