import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { loadEnvConfig } from "@next/env";
import { NextRequest } from "next/server";
import { GET as listTransactions } from "../src/app/api/v1/admin/transactions/route";
import { POST as updateReview } from "../src/app/api/v1/transaction-reviews/route";
import { POST as createFlag } from "../src/app/api/v1/suspicious-transaction-flags/route";
import { GET as listFlags } from "../src/app/api/v1/admin/suspicious-transactions/route";
import { PATCH as reviewFlag } from "../src/app/api/v1/admin/suspicious-transactions/[id]/route";
import { AUTH_COOKIE_NAME, createSessionToken } from "../src/lib/session";
import { connectToDatabase } from "../src/lib/mongodb";
import { suspiciousFlagAdminActionSchema, suspiciousFlagCreateSchema, suspiciousFlagQuerySchema, transactionReviewRequestSchema } from "../src/lib/validation/transaction-review";
import { transactionQuerySchema } from "../src/lib/validation/transaction";
import { BankAccount } from "../src/models/BankAccount";
import { Deposit } from "../src/models/Deposit";
import { SuspiciousTransactionFlag } from "../src/models/SuspiciousTransactionFlag";
import { Transaction } from "../src/models/Transaction";
import { TransactionReview } from "../src/models/TransactionReview";
import { User } from "../src/models/User";
import { Withdrawal } from "../src/models/Withdrawal";

loadEnvConfig(process.cwd());
const testDatabase = process.env.MONGODB_TEST_DATABASE?.trim();
const hasDedicatedTestDatabase = Boolean(
  process.env.MONGODB_URI?.startsWith("mongodb+srv://") && testDatabase && /(?:^|[_-])test(?:$|[_-])/i.test(testDatabase),
);
const runDatabaseIntegrationTests = process.env.RUN_DB_INTEGRATION_TESTS === "true" && hasDedicatedTestDatabase;
if (runDatabaseIntegrationTests) process.env.MONGODB_DATABASE = testDatabase;

function request(path: string, method = "GET", token?: string, body?: unknown) {
  const headers = new Headers();
  if (token) headers.set("cookie", `${AUTH_COOKIE_NAME}=${token}`);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new NextRequest(`http://localhost/api/v1${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}

test("transaction review and suspicious flag schemas reject invalid roles, states, reasons, and dates", () => {
  const objectId = "507f1f77bcf86cd799439011";
  assert.equal(transactionReviewRequestSchema.safeParse({ targetType: "TRANSACTION", targetId: objectId, action: "START_REVIEW", note: "Checked" }).success, true);
  assert.equal(transactionReviewRequestSchema.safeParse({ targetType: "TRANSACTION", targetId: objectId, action: "COMPLETE_REVIEW", userId: objectId }).success, false);
  assert.equal(transactionReviewRequestSchema.safeParse({ targetType: "TRANSACTION", targetId: "bad", action: "START_REVIEW" }).success, false);
  assert.equal(suspiciousFlagCreateSchema.safeParse({ targetType: "TRANSACTION", targetId: objectId, reason: "UNUSUAL_ACTIVITY" }).success, true);
  assert.equal(suspiciousFlagCreateSchema.safeParse({ targetType: "TRANSACTION", targetId: objectId, reason: "CONFIRMED_FRAUD" }).success, false);
  assert.equal(suspiciousFlagAdminActionSchema.safeParse({ status: "RESOLVED", note: "Reviewed against account activity" }).success, true);
  assert.equal(suspiciousFlagAdminActionSchema.safeParse({ status: "RESOLVED" }).success, false);
  assert.equal(suspiciousFlagQuerySchema.safeParse({ startDate: "2026-10-20", endDate: "2026-10-19" }).success, false);
  assert.equal(transactionQuerySchema.safeParse({ reviewStatus: "UNDER_REVIEW", suspiciousStatus: "FLAGGED" }).success, true);
  assert.equal(transactionQuerySchema.safeParse({ suspiciousStatus: "FRAUD" }).success, false);
});

test("Staff review, flag, and Admin resolution APIs reject unauthenticated requests", async () => {
  assert.equal((await updateReview(request("/transaction-reviews", "POST", undefined, {}))).status, 401);
  assert.equal((await createFlag(request("/suspicious-transaction-flags", "POST", undefined, {}))).status, 401);
  assert.equal((await listFlags(request("/admin/suspicious-transactions"))).status, 401);
  assert.equal((await listTransactions(request("/admin/transactions"))).status, 401);
});

test("transaction review models retain event history and enforce one active flag per target", async () => {
  assert.ok(TransactionReview.schema.indexes().some(([keys, options]) => (keys as Record<string, number>).targetType === 1 && (keys as Record<string, number>).targetId === 1 && options?.unique === true));
  assert.ok(SuspiciousTransactionFlag.schema.indexes().some(([keys, options]) => (keys as Record<string, number>).targetType === 1 && (keys as Record<string, number>).targetId === 1 && options?.unique === true && Boolean(options.partialFilterExpression)));
  const invalidFlag = new SuspiciousTransactionFlag({ targetType: "TRANSACTION", targetId: "507f1f77bcf86cd799439011", reason: "FRAUD", flaggedBy: "507f1f77bcf86cd799439011" });
  let validationError: unknown;
  try { await invalidFlag.validate(); } catch (error: unknown) { validationError = error; }
  const errors = validationError && typeof validationError === "object" && "errors" in validationError ? validationError.errors : null;
  const reasonError = errors && typeof errors === "object" && "reason" in errors ? errors.reason : null;
  const reasonErrorName = reasonError && typeof reasonError === "object" && "name" in reasonError ? reasonError.name : undefined;
  assert.equal(reasonErrorName, "ValidatorError");
});

test("Staff review and flagging preserve financial values, prevent duplicate active flags, and Admin resolution is audited", { skip: !runDatabaseIntegrationTests }, async () => {
  await connectToDatabase();
  await Promise.all([TransactionReview.init(), SuspiciousTransactionFlag.init(), Transaction.init(), BankAccount.init()]);
  const suffix = randomUUID();
  const ids: { users: string[]; accounts: string[]; transactions: string[]; deposits: string[]; withdrawals: string[]; reviews: string[]; flags: string[] } = { users: [], accounts: [], transactions: [], deposits: [], withdrawals: [], reviews: [], flags: [] };
  try {
    const [staff, admin, customer] = await User.create([
      { name: "Review Staff", email: `review-staff-${suffix}@example.test`, passwordHash: "test-only", role: "STAFF", status: "ACTIVE" },
      { name: "Review Admin", email: `review-admin-${suffix}@example.test`, passwordHash: "test-only", role: "ADMIN", status: "ACTIVE" },
      { name: "Review Customer", email: `review-customer-${suffix}@example.test`, passwordHash: "test-only", role: "CUSTOMER", status: "ACTIVE" },
    ]);
    ids.users.push(staff.id, admin.id, customer.id);
    const [account] = await BankAccount.create([{ accountNumber: `REV${Date.now()}${Math.floor(Math.random() * 1000)}`, userId: customer._id, accountType: "SAVINGS", balance: "750.25", status: "ACTIVE" }]);
    ids.accounts.push(account.id);
    const [transaction] = await Transaction.create([{ transactionType: "TRANSFER", fromAccount: account._id, toAccount: account._id, amount: "45.50", status: "PENDING" }]);
    ids.transactions.push(transaction.id);
    const [deposit] = await Deposit.create([{ customerId: customer._id, accountId: account._id, amount: "12.25", status: "PENDING" }]);
    ids.deposits.push(deposit.id);
    const [withdrawal] = await Withdrawal.create([{ customerId: customer._id, accountId: account._id, amount: "8.00", status: "PENDING" }]);
    ids.withdrawals.push(withdrawal.id);
    const staffToken = await createSessionToken(staff.id);
    const adminToken = await createSessionToken(admin.id);
    const customerToken = await createSessionToken(customer.id);

    const initialBalance = (await BankAccount.findById(account.id).lean())?.balance.toString();
    const start = await updateReview(request("/transaction-reviews", "POST", staffToken, { targetType: "TRANSACTION", targetId: transaction.id, action: "START_REVIEW", note: "Check transfer activity" }));
    assert.equal(start.status, 200);
    let transactionAfterReview = await Transaction.findById(transaction.id).lean();
    assert.equal(transactionAfterReview?.status, "PENDING");
    assert.equal(transactionAfterReview?.amount.toString(), "45.50");
    assert.equal((await BankAccount.findById(account.id).lean())?.balance.toString(), initialBalance);
    const filteredTransactions = await listTransactions(request(`/admin/transactions?search=${encodeURIComponent(transaction.transactionId)}&reviewStatus=UNDER_REVIEW`, "GET", staffToken));
    assert.equal(filteredTransactions.status, 200);
    const filteredItem = (await filteredTransactions.json()).data.transactions[0];
    assert.equal(filteredItem.transactionId, transaction.transactionId);
    assert.equal(filteredItem.review.status, "UNDER_REVIEW");

    const addNote = await updateReview(request("/transaction-reviews", "POST", staffToken, { targetType: "TRANSACTION", targetId: transaction.id, action: "ADD_NOTE", note: "Checked linked account details" }));
    assert.equal(addNote.status, 200);
    const complete = await updateReview(request("/transaction-reviews", "POST", staffToken, { targetType: "TRANSACTION", targetId: transaction.id, action: "COMPLETE_REVIEW" }));
    assert.equal(complete.status, 200);
    const review = await TransactionReview.findOne({ targetType: "TRANSACTION", targetId: transaction._id }).lean();
    assert.equal(review?.reviewStatus, "REVIEWED");
    assert.equal(review?.history.length, 3);

    const pendingRequestReview = await updateReview(request("/transaction-reviews", "POST", staffToken, { targetType: "DEPOSIT_REQUEST", targetId: deposit.id, action: "START_REVIEW" }));
    assert.equal(pendingRequestReview.status, 200);
    assert.equal((await Deposit.findById(deposit.id).lean())?.status, "PENDING");
    assert.equal((await Deposit.findById(deposit.id).lean())?.amount.toString(), "12.25");

    const flagBody = { targetType: "TRANSACTION", targetId: transaction.id, reason: "UNUSUAL_ACTIVITY", explanation: "Pattern needs an Admin look" };
    const flagResponse = await createFlag(request("/suspicious-transaction-flags", "POST", staffToken, flagBody));
    assert.equal(flagResponse.status, 201);
    const flagId = (await SuspiciousTransactionFlag.findOne({ targetType: "TRANSACTION", targetId: transaction._id }).lean())?._id.toString();
    assert.ok(flagId);
    ids.flags.push(flagId);
    const duplicateFlag = await createFlag(request("/suspicious-transaction-flags", "POST", staffToken, flagBody));
    assert.equal(duplicateFlag.status, 409);

    const customerFlag = await createFlag(request("/suspicious-transaction-flags", "POST", customerToken, flagBody));
    assert.equal(customerFlag.status, 403);
    const customerReview = await updateReview(request("/transaction-reviews", "POST", customerToken, { targetType: "TRANSACTION", targetId: transaction.id, action: "START_REVIEW" }));
    assert.equal(customerReview.status, 403);
    const staffAdminAction = await reviewFlag(request(`/admin/suspicious-transactions/${flagId}`, "PATCH", staffToken, { status: "RESOLVED", note: "No issue" }), { params: Promise.resolve({ id: flagId }) });
    assert.equal(staffAdminAction.status, 403);

    const queue = await listFlags(request("/admin/suspicious-transactions?search=" + encodeURIComponent(transaction.transactionId), "GET", adminToken));
    assert.equal(queue.status, 200);
    const queueItem = (await queue.json()).data.flags[0];
    assert.equal(queueItem.target.reference, transaction.transactionId);
    assert.equal(queueItem.flaggedBy.id, staff.id);
    assert.equal(queueItem.history.length, 1);

    const adminStart = await reviewFlag(request(`/admin/suspicious-transactions/${flagId}`, "PATCH", adminToken, { status: "UNDER_REVIEW", note: "Reviewing supporting activity" }), { params: Promise.resolve({ id: flagId }) });
    assert.equal(adminStart.status, 200);
    const resolve = await reviewFlag(request(`/admin/suspicious-transactions/${flagId}`, "PATCH", adminToken, { status: "RESOLVED", note: "Reviewed; no further action" }), { params: Promise.resolve({ id: flagId }) });
    assert.equal(resolve.status, 200);
    const resolvedFlag = await SuspiciousTransactionFlag.findById(flagId).lean();
    assert.equal(resolvedFlag?.status, "RESOLVED");
    assert.equal(resolvedFlag?.active, false);
    assert.equal(resolvedFlag?.reviewedBy?.toString(), admin.id);
    assert.equal(resolvedFlag?.history.length, 3);

    await createFlag(request("/suspicious-transaction-flags", "POST", staffToken, flagBody));
    assert.equal(await SuspiciousTransactionFlag.countDocuments({ targetType: "TRANSACTION", targetId: transaction._id }), 2);
    assert.equal(await SuspiciousTransactionFlag.countDocuments({ targetType: "TRANSACTION", targetId: transaction._id, active: true }), 1);
    transactionAfterReview = await Transaction.findById(transaction.id).lean();
    assert.equal(transactionAfterReview?.status, "PENDING");
    assert.equal(transactionAfterReview?.amount.toString(), "45.50");
    assert.equal((await BankAccount.findById(account.id).lean())?.balance.toString(), initialBalance);
  } finally {
    await Promise.all([
      TransactionReview.deleteMany({ targetId: { $in: [...ids.transactions, ...ids.deposits, ...ids.withdrawals] } }),
      SuspiciousTransactionFlag.deleteMany({ targetId: { $in: [...ids.transactions, ...ids.deposits, ...ids.withdrawals] } }),
      Transaction.deleteMany({ _id: { $in: ids.transactions } }),
      Deposit.deleteMany({ _id: { $in: ids.deposits } }),
      Withdrawal.deleteMany({ _id: { $in: ids.withdrawals } }),
      BankAccount.deleteMany({ _id: { $in: ids.accounts } }),
      User.deleteMany({ _id: { $in: ids.users } }),
    ]);
  }
});
