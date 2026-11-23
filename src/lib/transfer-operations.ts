import mongoose, { type ClientSession } from "mongoose";
import { formatBdtPaisa, MAX_BDT_PAISA, parseBdtPaisa } from "@/lib/bdt-money";
import { BankAccount } from "@/models/BankAccount";
import { Transaction } from "@/models/Transaction";
import { User } from "@/models/User";
import { createNotification, formatNotificationAmount } from "@/lib/notification-operations";
import { AccountTransferLimitError, validateAccountTransactionLimits } from "@/lib/account-transaction-limits";
import type { CreateTransferInput } from "@/lib/validation/transfer";

export class TransferOperationError extends Error {
  constructor(
    readonly code:
      | "SOURCE_ACCOUNT_UNAVAILABLE"
      | "RECIPIENT_UNAVAILABLE"
      | "SELF_TRANSFER"
      | "INSUFFICIENT_BALANCE"
      | "RECIPIENT_BALANCE_LIMIT"
      | "MINIMUM_BALANCE"
      | "MAXIMUM_SINGLE_AMOUNT"
      | "DAILY_TRANSFER_LIMIT"
      | "IDEMPOTENCY_CONFLICT",
  ) {
    super(code);
    this.name = "TransferOperationError";
  }
}

function isDuplicateKeyError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

async function findMatchingReplay(
  customerId: mongoose.Types.ObjectId,
  input: Omit<CreateTransferInput, "transactionPin">,
  session?: ClientSession,
) {
  let existingQuery = Transaction.findOne({
    createdBy: customerId,
    idempotencyKey: input.idempotencyKey,
  });
  if (session) existingQuery = existingQuery.session(session);
  const existing = await existingQuery;
  if (!existing) return null;

  let recipientQuery = BankAccount.findOne({ accountNumber: input.recipientAccountNumber }).select("_id");
  if (session) recipientQuery = recipientQuery.session(session);
  const recipient = await recipientQuery;
  const requestedPaisa = parseBdtPaisa(input.amount);
  const storedPaisa = parseBdtPaisa(existing.amount.toString());
  const sameRequest =
    existing.transactionType === "TRANSFER" &&
    existing.status === "COMPLETED" &&
    existing.fromAccount?.toString() === input.fromAccountId.toLowerCase() &&
    recipient?._id.toString() === existing.toAccount?.toString() &&
    requestedPaisa !== null &&
    requestedPaisa === storedPaisa &&
    (existing.description ?? "") === (input.description ?? "");

  if (!sameRequest) throw new TransferOperationError("IDEMPOTENCY_CONFLICT");
  return existing;
}

async function executeInSession(
  customerId: mongoose.Types.ObjectId,
  input: Omit<CreateTransferInput, "transactionPin">,
  session: ClientSession,
) {
  const replay = await findMatchingReplay(customerId, input, session);
  if (replay) return { transaction: replay, replayed: true };

  const sender = await BankAccount.findOne({
    _id: input.fromAccountId,
    userId: customerId,
    status: "ACTIVE",
    currency: "BDT",
  }).select("_id balance transactionLimits").session(session);
  if (!sender) throw new TransferOperationError("SOURCE_ACCOUNT_UNAVAILABLE");

  const recipient = await BankAccount.findOne({ accountNumber: input.recipientAccountNumber })
    .select("_id userId status currency")
    .session(session);
  if (!recipient || recipient.status !== "ACTIVE" || recipient.currency !== "BDT") {
    throw new TransferOperationError("RECIPIENT_UNAVAILABLE");
  }
  if (recipient.userId.toString() === customerId.toString()) {
    throw new TransferOperationError("SELF_TRANSFER");
  }
  const recipientCustomer = await User.findOne({
    _id: recipient.userId,
    role: "CUSTOMER",
    status: "ACTIVE",
  }).select("_id").session(session);
  if (!recipientCustomer) throw new TransferOperationError("RECIPIENT_UNAVAILABLE");

  const amountPaisa = parseBdtPaisa(input.amount);
  if (amountPaisa === null || amountPaisa <= BigInt("0")) {
    throw new TransferOperationError("INSUFFICIENT_BALANCE");
  }
  let accountLimits: Awaited<ReturnType<typeof validateAccountTransactionLimits>>;
  try {
    accountLimits = await validateAccountTransactionLimits({
      accountId: sender._id,
      amountPaisa,
      limits: sender.transactionLimits,
      session,
    });
  } catch (error: unknown) {
    if (error instanceof AccountTransferLimitError) throw new TransferOperationError(error.code);
    throw error;
  }
  const senderBalancePaisa = parseBdtPaisa(sender.balance.toString());
  if (senderBalancePaisa === null || senderBalancePaisa < amountPaisa) {
    throw new TransferOperationError("INSUFFICIENT_BALANCE");
  }
  if (senderBalancePaisa - amountPaisa < accountLimits.minimumBalancePaisa) {
    throw new TransferOperationError("MINIMUM_BALANCE");
  }
  const amount = mongoose.Types.Decimal128.fromString(input.amount);
  const debit = mongoose.Types.Decimal128.fromString("-" + input.amount);
  const senderUpdate = await BankAccount.updateOne(
    {
      _id: sender._id,
      userId: customerId,
      status: "ACTIVE",
      currency: "BDT",
      balance: { $gte: accountLimits.minimumPriorBalance },
    },
    { $inc: { balance: debit } },
    { session },
  );
  if (senderUpdate.matchedCount !== 1) {
    const latestSender = await BankAccount.findOne({
      _id: sender._id,
      userId: customerId,
      status: "ACTIVE",
      currency: "BDT",
    }).select("balance transactionLimits").session(session);
    const availablePaisa = latestSender ? parseBdtPaisa(latestSender.balance.toString()) : null;
    if (availablePaisa === null || availablePaisa < amountPaisa) {
      throw new TransferOperationError("INSUFFICIENT_BALANCE");
    }
    const minimumPaisa = latestSender?.transactionLimits?.minimumBalance
      ? parseBdtPaisa(latestSender.transactionLimits.minimumBalance.toString()) ?? BigInt("0")
      : BigInt("0");
    if (availablePaisa - amountPaisa < minimumPaisa) throw new TransferOperationError("MINIMUM_BALANCE");
    throw new TransferOperationError("SOURCE_ACCOUNT_UNAVAILABLE");
  }

  const maximumPriorRecipientBalance = mongoose.Types.Decimal128.fromString(
    formatBdtPaisa(MAX_BDT_PAISA - amountPaisa),
  );
  const recipientUpdate = await BankAccount.updateOne(
    {
      _id: recipient._id,
      status: "ACTIVE",
      currency: "BDT",
      balance: { $lte: maximumPriorRecipientBalance },
    },
    { $inc: { balance: amount } },
    { session },
  );
  if (recipientUpdate.matchedCount !== 1) {
    const latestRecipient = await BankAccount.findById(recipient._id).select("status currency").session(session);
    if (!latestRecipient || latestRecipient.status !== "ACTIVE" || latestRecipient.currency !== "BDT") {
      throw new TransferOperationError("RECIPIENT_UNAVAILABLE");
    }
    throw new TransferOperationError("RECIPIENT_BALANCE_LIMIT");
  }

  const [transaction] = await Transaction.create([{
    transactionType: "TRANSFER",
    fromAccount: sender._id,
    toAccount: recipient._id,
    amount,
    currency: "BDT",
    status: "COMPLETED",
    description: input.description || undefined,
    createdBy: customerId,
    idempotencyKey: input.idempotencyKey,
  }], { session });
  const displayAmount = formatNotificationAmount(input.amount) ?? "your transfer";
  const reference = transaction.transactionId;
  await createNotification({
    userId: customerId,
    type: "TRANSFER_COMPLETED",
    title: "Transfer Completed",
    message: `Your transfer of ${displayAmount} was completed successfully. Ref: ${reference}.`,
    dedupeKey: `transfer:${transaction._id}:sender`,
    relatedEntityType: "transaction",
    relatedEntityId: transaction._id,
  }, session);
  await createNotification({
    userId: recipient.userId,
    type: "MONEY_RECEIVED",
    title: "Money Received",
    message: `You have received ${displayAmount} in your account. Ref: ${reference}.`,
    dedupeKey: `transfer:${transaction._id}:receiver`,
    relatedEntityType: "transaction",
    relatedEntityId: transaction._id,
  }, session);
  return { transaction, replayed: false };
}

export async function executeTransfer(
  customerId: mongoose.Types.ObjectId,
  input: Omit<CreateTransferInput, "transactionPin">,
) {
  const session = await mongoose.startSession();
  try {
    let result: Awaited<ReturnType<typeof executeInSession>> | undefined;
    try {
      await session.withTransaction(async () => {
        result = await executeInSession(customerId, input, session);
      });
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) throw error;
      const replay = await findMatchingReplay(customerId, input);
      if (replay) return { transaction: replay, replayed: true };
      throw new TransferOperationError("IDEMPOTENCY_CONFLICT");
    }
    if (!result) throw new Error("Transfer transaction returned no result.");
    return result;
  } finally {
    await session.endSession();
  }
}
