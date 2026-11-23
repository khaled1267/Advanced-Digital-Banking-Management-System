import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { loadEnvConfig } from "@next/env";
import { NextRequest } from "next/server";
import { GET as pinStatus, POST as setPin } from "../src/app/api/v1/profile/transaction-pin/route";
import { GET as getProfile } from "../src/app/api/v1/profile/route";
import { POST as transfer } from "../src/app/api/v1/transfers/route";
import { PATCH as updateLimits } from "../src/app/api/v1/admin/accounts/[id]/limits/route";
import { AUTH_COOKIE_NAME, createSessionToken } from "../src/lib/session";
import { connectToDatabase } from "../src/lib/mongodb";
import { hashPassword } from "../src/lib/password";
import { verifyCustomerTransactionPin, TRANSACTION_PIN_MAX_FAILED_ATTEMPTS } from "../src/lib/transaction-pin";
import { createTransferSchema } from "../src/lib/validation/transfer";
import { transactionPinUpdateSchema } from "../src/lib/validation/profile";
import { updateAccountTransactionLimitsSchema } from "../src/lib/validation/bank-account";
import { BankAccount } from "../src/models/BankAccount";
import { Transaction } from "../src/models/Transaction";
import { User } from "../src/models/User";
import { Withdrawal } from "../src/models/Withdrawal";
import { Notification } from "../src/models/Notification";
import { reviewWithdrawalRequest, WithdrawalOperationError } from "../src/lib/withdrawal-operations";

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
  return new NextRequest(`http://localhost/api/v1${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

test("PIN and account-limit schemas preserve PIN strings and reject unsafe money values", () => {
  assert.equal(transactionPinUpdateSchema.safeParse({ newPin: "001234", confirmPin: "001234", currentPassword: "password" }).success, true);
  assert.equal(transactionPinUpdateSchema.safeParse({ newPin: "12345", confirmPin: "12345", currentPassword: "password" }).success, false);
  assert.equal(transactionPinUpdateSchema.safeParse({ newPin: "123456", confirmPin: "123457", currentPassword: "password" }).success, false);
  assert.equal(transactionPinUpdateSchema.safeParse({ newPin: 123456, confirmPin: 123456, currentPassword: "password" }).success, false);
  assert.equal(createTransferSchema.safeParse({ fromAccountId: "507f1f77bcf86cd799439011", recipientAccountNumber: "NBABCDEF0123456789", amount: "1.00", transactionPin: "001234", idempotencyKey: randomUUID() }).success, true);
  assert.equal(createTransferSchema.safeParse({ fromAccountId: "507f1f77bcf86cd799439011", recipientAccountNumber: "NBABCDEF0123456789", amount: "1.00", idempotencyKey: randomUUID() }).success, false);
  assert.equal(updateAccountTransactionLimitsSchema.safeParse({ dailyTransferLimit: "0", maximumSingleTransferAmount: "1.00", minimumBalance: "0.00" }).success, false);
  assert.equal(updateAccountTransactionLimitsSchema.safeParse({ dailyTransferLimit: "-1.00" }).success, false);
  assert.equal(updateAccountTransactionLimitsSchema.safeParse({ maximumSingleTransferAmount: "-1.00" }).success, false);
  assert.equal(updateAccountTransactionLimitsSchema.safeParse({ minimumBalance: "-0.01" }).success, false);
  assert.equal(updateAccountTransactionLimitsSchema.safeParse({ dailyTransferLimit: "100.00", maximumSingleTransferAmount: "80.00", minimumBalance: "0.00" }).success, true);
  assert.equal(updateAccountTransactionLimitsSchema.safeParse({ dailyTransferLimit: "1.001", maximumSingleTransferAmount: null, minimumBalance: "0" }).success, false);
  assert.equal(updateAccountTransactionLimitsSchema.safeParse({ dailyTransferLimit: "1.00", balance: "999.00" }).success, false);
});

test("PIN hashes and failure counters are excluded by default and legacy account limits are optional", async () => {
  assert.equal(User.schema.path("transactionPinHash")?.options.select, false);
  assert.equal(User.schema.path("transactionPinFailedAttempts")?.options.select, false);
  assert.equal(BankAccount.schema.path("transactionLimits.dailyTransferLimit") !== undefined, true);
  const oldAccount = new BankAccount({ accountNumber: "NBABCDEF0123456789", userId: "507f1f77bcf86cd799439011", accountType: "SAVINGS", balance: "1.00" });
  assert.equal(oldAccount.transactionLimits?.dailyTransferLimit, undefined);
  await oldAccount.validate();
  assert.equal(TRANSACTION_PIN_MAX_FAILED_ATTEMPTS, 5);
});

test("PIN, transfer, and account-limit APIs reject unauthenticated requests", async () => {
  assert.equal((await pinStatus(request("/profile/transaction-pin"))).status, 401);
  assert.equal((await getProfile(request("/profile"))).status, 401);
  assert.equal((await setPin(request("/profile/transaction-pin", "POST", undefined, {}))).status, 401);
  assert.equal((await transfer(request("/transfers", "POST", undefined, {}))).status, 401);
  assert.equal((await updateLimits(request("/admin/accounts/507f1f77bcf86cd799439011/limits", "PATCH", undefined, { minimumBalance: "0" }), { params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }) })).status, 401);
});

test("PIN verification, transfer limits, minimum balance and withdrawal approval are enforced in the dedicated database", { skip: !runDatabaseIntegrationTests }, async () => {
  await connectToDatabase();
  await Promise.all([User.init(), BankAccount.init(), Transaction.init(), Withdrawal.init()]);
  const suffix = randomUUID();
  const createdUsers: string[] = [];
  const createdAccounts: string[] = [];
  const createdTransactions: string[] = [];
  const createdWithdrawals: string[] = [];
  try {
    const password = "Dedicated-test-only-Password-9!";
    const passwordHash = await hashPassword(password);
    const [customer, recipient, admin, staff] = await User.create([
      { name: "PIN Limits Customer", email: `pin-customer-${suffix}@example.test`, passwordHash, role: "CUSTOMER", status: "ACTIVE" },
      { name: "PIN Limits Recipient", email: `pin-recipient-${suffix}@example.test`, passwordHash, role: "CUSTOMER", status: "ACTIVE" },
      { name: "PIN Limits Admin", email: `pin-admin-${suffix}@example.test`, passwordHash, role: "ADMIN", status: "ACTIVE" },
      { name: "PIN Limits Staff", email: `pin-staff-${suffix}@example.test`, passwordHash, role: "STAFF", status: "ACTIVE" },
    ]);
    createdUsers.push(customer.id, recipient.id, admin.id, staff.id);
    const accountNumber = `NB${randomBytes(8).toString("hex").toUpperCase()}`;
    const recipientAccountNumber = `NB${randomBytes(8).toString("hex").toUpperCase()}`;
    const [source, destination] = await BankAccount.create([
      { accountNumber, userId: customer._id, accountType: "SAVINGS", balance: "1000.00", status: "ACTIVE", transactionLimits: { dailyTransferLimit: "100.00", maximumSingleTransferAmount: "80.00", minimumBalance: "50.00" } },
      { accountNumber: recipientAccountNumber, userId: recipient._id, accountType: "SAVINGS", balance: "0.00", status: "ACTIVE" },
    ]);
    createdAccounts.push(source.id, destination.id);
    const [concurrentSource] = await BankAccount.create([{
      accountNumber: `NB${randomBytes(8).toString("hex").toUpperCase()}`,
      userId: customer._id,
      accountType: "SAVINGS",
      balance: "500.00",
      status: "ACTIVE",
      transactionLimits: { dailyTransferLimit: "100.00", maximumSingleTransferAmount: "100.00", minimumBalance: "0.00" },
    }]);
    createdAccounts.push(concurrentSource.id);
    const customerToken = await createSessionToken(customer.id);
    const adminToken = await createSessionToken(admin.id);
    const staffToken = await createSessionToken(staff.id);

    const unconfiguredTransfer = await transfer(request("/transfers", "POST", customerToken, {
      fromAccountId: source.id, recipientAccountNumber, amount: "1.00", transactionPin: "001234", idempotencyKey: randomUUID(),
    }));
    assert.equal(unconfiguredTransfer.status, 409);
    assert.equal((await BankAccount.findById(source.id).lean())?.balance.toString(), "1000.00");
    assert.equal(await Transaction.countDocuments({ fromAccount: source._id, status: "COMPLETED" }), 0);

    const invalidPassword = await setPin(request("/profile/transaction-pin", "POST", customerToken, { newPin: "001234", confirmPin: "001234", currentPassword: "incorrect" }));
    assert.equal(invalidPassword.status, 400);
    const configured = await setPin(request("/profile/transaction-pin", "POST", customerToken, { newPin: "001234", confirmPin: "001234", currentPassword: password }));
    assert.equal(configured.status, 200);
    assert.deepEqual((await configured.json()).data, { configured: true });
    const savedUser = await User.findById(customer.id).select("+transactionPinHash +passwordHash +transactionPinFailedAttempts");
    assert.ok(savedUser?.transactionPinHash);
    assert.notEqual(savedUser?.transactionPinHash, "001234");
    assert.equal(savedUser?.passwordHash, passwordHash);
    const profileStatus = await pinStatus(request("/profile/transaction-pin", "GET", customerToken));
    const profileStatusPayload = await profileStatus.json();
    assert.deepEqual(profileStatusPayload.data, { configured: true });
    assert.equal(JSON.stringify(profileStatusPayload).includes(savedUser?.transactionPinHash ?? "!"), false);
    const profileResponse = await getProfile(request("/profile", "GET", customerToken));
    assert.equal(profileResponse.status, 200);
    assert.equal(JSON.stringify(await profileResponse.json()).includes(savedUser?.transactionPinHash ?? "!"), false);

    const reversed = await Transaction.create({
      transactionType: "TRANSFER", fromAccount: source._id, toAccount: destination._id,
      amount: "500.00", currency: "BDT", status: "REVERSED", createdBy: customer._id,
    });
    createdTransactions.push(reversed.id);

    const adminUpdate = await updateLimits(request(`/admin/accounts/${source.id}/limits`, "PATCH", adminToken, {
      dailyTransferLimit: "100.00", maximumSingleTransferAmount: "80.00", minimumBalance: "50.00",
    }), { params: Promise.resolve({ id: source.id }) });
    assert.equal(adminUpdate.status, 200);
    assert.equal((await updateLimits(request(`/admin/accounts/${source.id}/limits`, "PATCH", staffToken, { minimumBalance: "1.00" }), { params: Promise.resolve({ id: source.id }) })).status, 403);
    assert.equal((await updateLimits(request(`/admin/accounts/${source.id}/limits`, "PATCH", customerToken, { minimumBalance: "1.00" }), { params: Promise.resolve({ id: source.id }) })).status, 403);
    assert.equal((await updateLimits(request(`/admin/accounts/${source.id}/limits`, "PATCH", adminToken, { balance: "0.00" }), { params: Promise.resolve({ id: source.id }) })).status, 400);

    const attemptTransfer = (amount: string, pin: string, key = randomUUID()) => transfer(request("/transfers", "POST", customerToken, {
      fromAccountId: source.id,
      recipientAccountNumber,
      amount,
      transactionPin: pin,
      idempotencyKey: key,
    }));
    const beforeFailure = await BankAccount.findById(source.id).lean();
    const wrongPinResponse = await attemptTransfer("75.00", "999999");
    assert.equal(wrongPinResponse.status, 400);
    assert.equal((await BankAccount.findById(source.id).lean())?.balance.toString(), beforeFailure?.balance.toString());
    assert.equal(await Transaction.countDocuments({ fromAccount: source._id }), 0);

    const success = await attemptTransfer("75.00", "001234");
    assert.equal(success.status, 201);
    const transferData = await success.json();
    createdTransactions.push(transferData.data.transfer.id);
    assert.equal((await BankAccount.findById(source.id).lean())?.balance.toString(), "925.00");
    assert.equal((await BankAccount.findById(destination.id).lean())?.balance.toString(), "75.00");
    assert.equal((await attemptTransfer("81.00", "001234")).status, 409);
    assert.equal((await attemptTransfer("30.00", "001234")).status, 409);
    assert.equal((await attemptTransfer("25.00", "001234")).status, 201);
    assert.equal(await Transaction.countDocuments({ fromAccount: source._id, transactionType: "TRANSFER", status: "COMPLETED" }), 2);

    const concurrentTransfer = () => transfer(request("/transfers", "POST", customerToken, {
      fromAccountId: concurrentSource.id,
      recipientAccountNumber,
      amount: "75.00",
      transactionPin: "001234",
      idempotencyKey: randomUUID(),
    }));
    const concurrentResults = await Promise.all([concurrentTransfer(), concurrentTransfer()]);
    assert.deepEqual(concurrentResults.map((response) => response.status).sort(), [201, 409]);
    assert.equal((await BankAccount.findById(concurrentSource.id).lean())?.balance.toString(), "425.00");
    assert.equal(await Transaction.countDocuments({ fromAccount: concurrentSource._id, transactionType: "TRANSFER", status: "COMPLETED" }), 1);

    const minimumUpdate = await updateLimits(request(`/admin/accounts/${source.id}/limits`, "PATCH", adminToken, { dailyTransferLimit: "500.00", maximumSingleTransferAmount: "80.00", minimumBalance: "890.00" }), { params: Promise.resolve({ id: source.id }) });
    assert.equal(minimumUpdate.status, 200);
    assert.equal((await attemptTransfer("20.00", "001234")).status, 409);
    assert.equal((await BankAccount.findById(source.id).lean())?.balance.toString(), "900.00");

    const withdrawal = await Withdrawal.create({ customerId: customer._id, accountId: source._id, amount: "20.00", status: "PENDING" });
    createdWithdrawals.push(withdrawal.id);
    await assert.rejects(
      reviewWithdrawalRequest(withdrawal.id, staff._id, "APPROVE"),
      (error: unknown) => error instanceof WithdrawalOperationError && error.code === "MINIMUM_BALANCE",
    );
    assert.equal((await BankAccount.findById(source.id).lean())?.balance.toString(), "900.00");
    assert.equal((await Withdrawal.findById(withdrawal.id).lean())?.status, "PENDING");

    // One failed attempt above plus the remaining attempts reaches the account limit.
    for (let index = 0; index < TRANSACTION_PIN_MAX_FAILED_ATTEMPTS - 1; index += 1) {
      assert.equal(await verifyCustomerTransactionPin(customer._id, "999999"), "INVALID");
    }
    assert.equal(await verifyCustomerTransactionPin(customer._id, "001234"), "RATE_LIMITED");
    const changed = await setPin(request("/profile/transaction-pin", "POST", customerToken, { newPin: "000987", confirmPin: "000987", currentPassword: password }));
    assert.equal(changed.status, 200);
    assert.equal(await verifyCustomerTransactionPin(customer._id, "000987"), "OK");
  } finally {
    await Promise.all([
      Transaction.deleteMany({ _id: { $in: createdTransactions } }),
      Transaction.deleteMany({ transactionType: "TRANSFER", fromAccount: { $in: createdAccounts } }),
      Notification.deleteMany({ userId: { $in: createdUsers }, relatedEntityType: "transaction" }),
      Withdrawal.deleteMany({ _id: { $in: createdWithdrawals } }),
      BankAccount.deleteMany({ _id: { $in: createdAccounts } }),
      User.deleteMany({ _id: { $in: createdUsers } }),
    ]);
  }
});
