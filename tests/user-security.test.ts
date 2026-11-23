import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { SignJWT } from "jose";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import { loadEnvConfig } from "@next/env";
import { User, USER_ROLES, USER_STATUSES } from "../src/models/User";
import { BankAccount } from "../src/models/BankAccount";
import { Transaction } from "../src/models/Transaction";
import { Deposit } from "../src/models/Deposit";
import { Withdrawal } from "../src/models/Withdrawal";
import { Loan } from "../src/models/Loan";
import { LoanRepayment } from "../src/models/LoanRepayment";
import { Notification } from "../src/models/Notification";
import { connectToDatabase } from "../src/lib/mongodb";
import { hashPassword, verifyPassword } from "../src/lib/password";
import { POST as login } from "../src/app/api/v1/auth/login/route";
import { GET as getCurrentUser } from "../src/app/api/v1/auth/me/route";
import { POST as logout } from "../src/app/api/v1/auth/logout/route";
import { GET as getAdminOverview } from "../src/app/api/v1/admin/overview/route";
import {
  GET as getAdminUsers,
  POST as createAdminUser,
} from "../src/app/api/v1/admin/users/route";
import {
  GET as getAdminUser,
  PATCH as updateAdminUser,
} from "../src/app/api/v1/admin/users/[id]/route";
import { POST } from "../src/app/api/v1/auth/register/route";
import {
  GET as getAdminAccounts,
  POST as createAdminAccount,
} from "../src/app/api/v1/admin/accounts/route";
import {
  GET as getAdminAccount,
  PATCH as updateAdminAccount,
} from "../src/app/api/v1/admin/accounts/[id]/route";
import { GET as getMyAccounts } from "../src/app/api/v1/accounts/route";
import { GET as getMyAccount } from "../src/app/api/v1/accounts/[id]/route";
import * as adminTransactionsRoute from "../src/app/api/v1/admin/transactions/route";
import { GET as getAdminTransactions } from "../src/app/api/v1/admin/transactions/route";
import { GET as getAdminTransaction } from "../src/app/api/v1/admin/transactions/[id]/route";
import * as customerTransactionsRoute from "../src/app/api/v1/transactions/route";
import { GET as getMyTransactions } from "../src/app/api/v1/transactions/route";
import { GET as getMyTransaction } from "../src/app/api/v1/transactions/[id]/route";
import { generateAccountNumber } from "../src/lib/account-number";
import { createBankAccountWithRetry } from "../src/lib/bank-account-creation";
import { generateTransactionId } from "../src/lib/transaction-id";
import {
  getDashboardPath,
  requireDashboardRole,
  requireRole,
} from "../src/lib/authorization";
import {
  AUTH_COOKIE_NAME,
  createSessionToken,
  verifySessionToken,
} from "../src/lib/session";
import {
  registrationFormSchema,
  userLoginSchema,
  userRegistrationSchema,
  adminUserCreateSchema,
  adminUserQuerySchema,
  adminUserUpdateSchema,
} from "../src/lib/validation/user";
import {
  adminAccountsQuerySchema,
  createBankAccountSchema,
  updateAccountStatusSchema,
} from "../src/lib/validation/bank-account";
import { transactionQuerySchema } from "../src/lib/validation/transaction";
import { createDepositSchema, customerDepositsQuerySchema, adminDepositsQuerySchema, reviewDepositSchema } from "../src/lib/validation/deposit";
import { createWithdrawalSchema, customerWithdrawalsQuerySchema, adminWithdrawalsQuerySchema, reviewWithdrawalSchema } from "../src/lib/validation/withdrawal";
import { MAX_BDT_AMOUNT, parseBdtPaisa, formatBdtPaisa } from "../src/lib/bdt-money";
import { POST as createDeposit, GET as getMyDeposits } from "../src/app/api/v1/deposits/route";
import { GET as getMyDeposit } from "../src/app/api/v1/deposits/[id]/route";
import { GET as getAdminDeposits } from "../src/app/api/v1/admin/deposits/route";
import { GET as getAdminDeposit, PATCH as reviewDeposit } from "../src/app/api/v1/admin/deposits/[id]/route";
import { POST as createWithdrawal, GET as getMyWithdrawals } from "../src/app/api/v1/withdrawals/route";
import { GET as getMyWithdrawal } from "../src/app/api/v1/withdrawals/[id]/route";
import { GET as getAdminWithdrawals } from "../src/app/api/v1/admin/withdrawals/route";
import { GET as getAdminWithdrawal, PATCH as reviewWithdrawal } from "../src/app/api/v1/admin/withdrawals/[id]/route";
import { POST as createTransfer, GET as getMyTransfers } from "../src/app/api/v1/transfers/route";
import { GET as getMyTransfer } from "../src/app/api/v1/transfers/[id]/route";
import { createTransferSchema, transferHistoryQuerySchema } from "../src/lib/validation/transfer";
import { accountStatementQuerySchema } from "../src/lib/validation/account-statement";
import { calculateCompleteStatementBalances, calculateStatementBalances } from "../src/lib/account-statement-queries";
import { GET as getAccountStatement } from "../src/app/api/v1/accounts/[id]/statement/route";
import { GET as downloadAccountStatementPdf } from "../src/app/api/v1/accounts/[id]/statement/pdf/route";
import { createAccountStatementPdf, createStatementFilename } from "../src/lib/account-statement-pdf";
import { GET as downloadAccountStatementCsv } from "../src/app/api/v1/accounts/[id]/statement/csv/route";
import { createAccountStatementCsv, createStatementCsvFilename } from "../src/lib/account-statement-csv";
import { accountStatementSelectionKey, calculateStatementPageTotals, createStatementDownloadUrl } from "../src/lib/account-statement-client";
import { approveLoanSchema, createLoanSchema, createLoanRepaymentSchema, customerLoansQuerySchema, forwardLoanToAdminSchema, loanRepaymentsQuerySchema, rejectLoanSchema, staffAdminLoansQuerySchema } from "../src/lib/validation/loan";
import { MIN_LOAN_AMOUNT, MAX_LOAN_AMOUNT, MIN_LOAN_DURATION_MONTHS, MAX_LOAN_DURATION_MONTHS } from "../src/lib/loan-limits";
import { POST as createLoan, GET as getMyLoans } from "../src/app/api/v1/loans/route";
import { GET as getMyLoan } from "../src/app/api/v1/loans/[id]/route";
import { GET as getStaffLoans } from "../src/app/api/v1/staff/loans/route";
import { GET as getStaffLoan } from "../src/app/api/v1/staff/loans/[id]/route";
import { PATCH as forwardStaffLoan } from "../src/app/api/v1/staff/loans/[id]/review/route";
import * as adminLoansRoute from "../src/app/api/v1/admin/loans/route";
import { GET as getAdminLoans } from "../src/app/api/v1/admin/loans/route";
import { GET as getAdminLoan } from "../src/app/api/v1/admin/loans/[id]/route";
import { GET as getLoanRepayments, POST as createLoanRepayment } from "../src/app/api/v1/loans/[id]/repayments/route";
import { GET as getAdminLoanRepayments } from "../src/app/api/v1/admin/loans/[id]/repayments/route";
import { GET as getMyLoanSummary } from "../src/app/api/v1/loans/summary/route";
import { PATCH as approveAdminLoan } from "../src/app/api/v1/admin/loans/[id]/approve/route";
import { PATCH as rejectAdminLoan } from "../src/app/api/v1/admin/loans/[id]/reject/route";
import { POST as disburseAdminLoan } from "../src/app/api/v1/admin/loans/[id]/disburse/route";
import { loansApi } from "../src/store/loansApi";
import { makeStore } from "../src/store/store";

function loadIntegrationTestEnvironment() {
  loadEnvConfig(process.cwd());
  const testDatabase = process.env.MONGODB_TEST_DATABASE?.trim();
  const mongoUri = process.env.MONGODB_URI;
  if (
    !mongoUri?.startsWith("mongodb+srv://") ||
    !testDatabase ||
    !/(?:^|[_-])test(?:$|[_-])/i.test(testDatabase)
  ) {
    throw new Error(
      "Database integration tests require an Atlas SRV URI and an explicit MONGODB_TEST_DATABASE name containing 'test'.",
    );
  }
  process.env.MONGODB_DATABASE = testDatabase;
}

function registrationRequest(body: unknown) {
  return new Request("http://localhost/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function loginRequest(body: unknown) {
  return new Request("http://localhost/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function currentUserRequest(token?: string) {
  const headers = token
    ? { cookie: `${AUTH_COOKIE_NAME}=${token}` }
    : undefined;

  return new NextRequest("http://localhost/api/v1/auth/me", { headers });
}

function adminOverviewRequest(token?: string) {
  const headers = token
    ? { cookie: `${AUTH_COOKIE_NAME}=${token}` }
    : undefined;

  return new NextRequest("http://localhost/api/v1/admin/overview", { headers });
}

function adminUsersRequest(token?: string, query = "") {
  const headers = token
    ? { cookie: `${AUTH_COOKIE_NAME}=${token}` }
    : undefined;
  return new NextRequest(`http://localhost/api/v1/admin/users${query}`, { headers });
}

function adminUserMutationRequest(token: string | undefined, method: string, body: unknown) {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("cookie", `${AUTH_COOKIE_NAME}=${token}`);
  return new NextRequest("http://localhost/api/v1/admin/users", {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

function adminUserDetailRequest(token: string | undefined, id: string, method = "GET", body?: unknown) {
  const headers = new Headers();
  if (token) headers.set("cookie", `${AUTH_COOKIE_NAME}=${token}`);
  const options: { method: string; headers: Headers; body?: string } = { method, headers };
  if (body !== undefined) {
    headers.set("content-type", "application/json");
    options.body = JSON.stringify(body);
  }
  return new NextRequest(`http://localhost/api/v1/admin/users/${id}`, options);
}

function accountRequest(path: string, token?: string, method = "GET", body?: unknown) {
  const headers = new Headers();
  if (token) headers.set("cookie", `${AUTH_COOKIE_NAME}=${token}`);
  const options: { method: string; headers: Headers; body?: string } = { method, headers };
  if (body !== undefined) {
    headers.set("content-type", "application/json");
    options.body = JSON.stringify(body);
  }
  return new NextRequest(`http://localhost/api/v1${path}`, options);
}

function redirectDestination(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string"
  ) {
    return error.digest.split(";")[2];
  }

  return undefined;
}

async function createExpiredToken(userId: string) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer("bank-management-system")
    .setAudience("bank-management-system-app")
    .setIssuedAt(now - 20)
    .setExpirationTime(now - 10)
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));
}

after(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});

test("registration validates fields and normalizes name and email", () => {
  const result = userRegistrationSchema.safeParse({
    name: "  Ada Lovelace  ",
    email: "  ADA@example.com  ",
    password: "correct horse battery",
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.name, "Ada Lovelace");
    assert.equal(result.data.email, "ada@example.com");
  }
});

test("registration rejects invalid fields and client-supplied roles", () => {
  assert.equal(
    userRegistrationSchema.safeParse({
      name: "A",
      email: "not-an-email",
      password: "short",
    }).success,
    false,
  );
  assert.equal(
    userRegistrationSchema.safeParse({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "correct horse battery",
      role: "ADMIN",
    }).success,
    false,
  );
});

test("registration form validation follows backend rules and checks matching passwords", () => {
  const matching = registrationFormSchema.safeParse({
    name: "Ada Lovelace",
    email: "ADA@example.com",
    password: "correct horse battery",
    confirmPassword: "correct horse battery",
  });
  const mismatched = registrationFormSchema.safeParse({
    name: "Ada Lovelace",
    email: "ada@example.com",
    password: "correct horse battery",
    confirmPassword: "another password",
  });
  const shortPassword = registrationFormSchema.safeParse({
    name: "Ada Lovelace",
    email: "ada@example.com",
    password: "short",
    confirmPassword: "short",
  });

  assert.equal(matching.success, true);
  assert.equal(mismatched.success, false);
  assert.equal(shortPassword.success, false);
  if (matching.success) {
    assert.equal(matching.data.email, "ada@example.com");
  }
});

test("login validates email and requires a non-empty password", () => {
  assert.equal(
    userLoginSchema.safeParse({
      email: "ada@example.com",
      password: "x",
    }).success,
    true,
  );
  assert.equal(
    userLoginSchema.safeParse({ email: "bad-email", password: "x" }).success,
    false,
  );
  assert.equal(
    userLoginSchema.safeParse({ email: "ada@example.com", password: "" })
      .success,
    false,
  );
});

test("session tokens verify their signature and subject", async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = randomBytes(32).toString("base64url");

  try {
    const token = await createSessionToken("test-user-id");
    const segments = token.split(".");
    const claims = JSON.parse(
      Buffer.from(segments[1], "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    segments[2] = `${segments[2][0] === "A" ? "B" : "A"}${segments[2].slice(1)}`;

    assert.deepEqual(await verifySessionToken(token), { userId: "test-user-id" });
    assert.deepEqual(Object.keys(claims).sort(), ["aud", "exp", "iat", "iss", "sub"]);
    assert.equal(Number(claims.exp) - Number(claims.iat), 7 * 24 * 60 * 60);
    assert.equal(await verifySessionToken(segments.join(".")), null);
  } finally {
    if (previousSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousSecret;
    }
  }
});

test("password hashing verifies the correct password and rejects another", async () => {
  const hash = await hashPassword("correct horse battery");

  assert.match(hash, /^\$argon2id\$/);
  assert.notEqual(hash, "correct horse battery");
  assert.equal(await verifyPassword("correct horse battery", hash), true);
  assert.equal(await verifyPassword("different password", hash), false);
});

test("User schema defaults to customer and keeps password hashes private", async () => {
  const user = new User({
    name: "Ada Lovelace",
    email: "ADA@example.com",
    passwordHash: "test-hash",
  });

  assert.equal(user.role, "CUSTOMER");
  assert.equal(user.status, "ACTIVE");
  assert.equal(User.schema.path("passwordHash").options.select, false);
  assert.deepEqual(User.schema.path("role").options.enum, USER_ROLES);
  assert.deepEqual(User.schema.path("status").options.enum, USER_STATUSES);
  assert.equal(
    User.schema.indexes().some(([fields, options]) =>
      "email" in fields && options.unique === true,
    ),
    true,
  );
  await assert.doesNotReject(user.validate());
});

test("registration API rejects invalid requests before using the database", async (t) => {
  const invalidRequests: Array<{ name: string; body: unknown }> = [
    {
      name: "invalid email",
      body: {
        name: "Ada Lovelace",
        email: "not-an-email",
        password: "correct horse battery",
      },
    },
    {
      name: "invalid password",
      body: {
        name: "Ada Lovelace",
        email: "ada@example.com",
        password: "short",
      },
    },
    { name: "missing required fields", body: { email: "ada@example.com" } },
    {
      name: "client-supplied role",
      body: {
        name: "Ada Lovelace",
        email: "ada@example.com",
        password: "correct horse battery",
        role: "ADMIN",
      },
    },
    {
      name: "client-supplied status and hash",
      body: {
        name: "Ada Lovelace",
        email: "ada@example.com",
        password: "correct horse battery",
        status: "INACTIVE",
        passwordHash: "client-value",
      },
    },
  ];

  for (const request of invalidRequests) {
    await t.test(request.name, async () => {
      const response = await POST(registrationRequest(request.body));
      const responseText = await response.text();

      assert.equal(response.status, 400);
      assert.equal(responseText.includes("correct horse battery"), false);
      assert.equal(responseText.includes("client-value"), false);
    });
  }
});

test("login API rejects invalid requests before using the database", async (t) => {
  const invalidRequests: Array<{ name: string; body: unknown }> = [
    { name: "invalid email", body: { email: "bad-email", password: "secret" } },
    { name: "missing password", body: { email: "user@example.com" } },
    {
      name: "empty password",
      body: { email: "user@example.com", password: "" },
    },
    {
      name: "client-supplied role",
      body: { email: "user@example.com", password: "secret", role: "ADMIN" },
    },
  ];

  for (const request of invalidRequests) {
    await t.test(request.name, async () => {
      const response = await login(loginRequest(request.body));

      assert.equal(response.status, 400);
      assert.equal(response.headers.has("set-cookie"), false);
    });
  }
});

test("current user API rejects missing, invalid, and expired tokens", async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = randomBytes(32).toString("base64url");

  try {
    const missingResponse = await getCurrentUser(currentUserRequest());
    const invalidResponse = await getCurrentUser(
      currentUserRequest("not-a-valid-jwt"),
    );
    const expiredToken = await createExpiredToken("507f1f77bcf86cd799439011");
    const expiredResponse = await getCurrentUser(currentUserRequest(expiredToken));

    assert.equal(missingResponse.status, 401);
    assert.equal(invalidResponse.status, 401);
    assert.equal(expiredResponse.status, 401);
  } finally {
    if (previousSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousSecret;
    }
  }
});

test("logout clears the session cookie, even when no cookie was sent", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  Reflect.set(process.env, "NODE_ENV", "production");

  try {
    const response = await logout();
    const responseBody = await response.json();
    const setCookie = response.headers.get("set-cookie");

    assert.equal(response.status, 200);
    assert.deepEqual(responseBody, {
      success: true,
      message: "Logged out successfully.",
    });
    assert.ok(setCookie);
    assert.match(setCookie, new RegExp(`^${AUTH_COOKIE_NAME}=`));
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Secure/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, /Path=\//i);
    assert.match(setCookie, /Max-Age=0/i);
    assert.match(setCookie, /Expires=Thu, 01 Jan 1970/i);
  } finally {
    if (previousNodeEnv === undefined) {
      Reflect.deleteProperty(process.env, "NODE_ENV");
    } else {
      Reflect.set(process.env, "NODE_ENV", previousNodeEnv);
    }
  }
});

test("admin overview rejects guests with 401", async () => {
  const response = await getAdminOverview(adminOverviewRequest());

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    status: "error",
    message: "Authentication is required.",
  });
});

test("dashboard path mapping matches database roles", () => {
  assert.equal(getDashboardPath("ADMIN"), "/admin/dashboard");
  assert.equal(getDashboardPath("STAFF"), "/staff/dashboard");
  assert.equal(getDashboardPath("CUSTOMER"), "/dashboard");
});

test(
  "current user API returns active database users and rejects inactive or deleted users",
  { skip: process.env.RUN_DB_INTEGRATION_TESTS !== "true" },
  async () => {
    loadIntegrationTestEnvironment();

    const suffix = randomUUID();
    const activeEmail = `task05-active-${suffix}@example.com`;
    const inactiveEmail = `task05-inactive-${suffix}@example.com`;
    const deletedEmail = `task05-deleted-${suffix}@example.com`;
    const emails = [activeEmail, inactiveEmail, deletedEmail];
    const passwordHash = await hashPassword("Task05 Integration Password 2026!");

    try {
      await connectToDatabase();
      const [activeUser, inactiveUser, deletedUser] = await User.create([
        {
          name: "Task Five Active Staff",
          email: activeEmail,
          passwordHash,
          role: "STAFF",
          status: "ACTIVE",
        },
        {
          name: "Task Five Inactive Customer",
          email: inactiveEmail,
          passwordHash,
          role: "CUSTOMER",
          status: "INACTIVE",
        },
        {
          name: "Task Five Deleted Admin",
          email: deletedEmail,
          passwordHash,
          role: "ADMIN",
          status: "ACTIVE",
        },
      ]);
      const activeToken = await createSessionToken(activeUser._id.toString());
      const inactiveToken = await createSessionToken(inactiveUser._id.toString());
      const deletedToken = await createSessionToken(deletedUser._id.toString());
      await User.deleteOne({ _id: deletedUser._id });

      const activeResponse = await getCurrentUser(currentUserRequest(activeToken));
      const activeText = await activeResponse.text();
      const activeBody = JSON.parse(activeText) as {
        data?: { user?: Record<string, unknown> };
      };
      const inactiveResponse = await getCurrentUser(
        currentUserRequest(inactiveToken),
      );
      const deletedResponse = await getCurrentUser(currentUserRequest(deletedToken));

      assert.equal(activeResponse.status, 200);
      assert.equal(activeBody.data?.user?.id, activeUser._id.toString());
      assert.equal(activeBody.data?.user?.name, activeUser.name);
      assert.equal(activeBody.data?.user?.email, activeEmail);
      assert.equal(activeBody.data?.user?.role, "STAFF");
      assert.equal(activeBody.data?.user?.status, "ACTIVE");
      assert.equal(typeof activeBody.data?.user?.createdAt, "string");
      assert.equal(activeText.includes("passwordHash"), false);
      assert.equal(activeText.includes("Task05 Integration Password"), false);
      assert.equal(inactiveResponse.status, 401);
      assert.equal(deletedResponse.status, 401);
    } finally {
      if (mongoose.connection.readyState === 1) {
        await User.deleteMany({ email: { $in: emails } });
        assert.equal(await User.exists({ email: { $in: emails } }), null);
      }
    }
  },
);

test(
  "Admin can approve or reject only forwarded loans once, releases the active account key, and cannot be replaced by customer or staff requests",
  { skip: process.env.RUN_DB_INTEGRATION_TESTS !== "true" },
  async () => {
    loadIntegrationTestEnvironment();
    const suffix = randomUUID().replaceAll("-", "").toUpperCase();
    const emails = {
      admin: `loan-decision-admin-${suffix}@example.com`,
      staff: `loan-decision-staff-${suffix}@example.com`,
      customer: `loan-decision-customer-${suffix}@example.com`,
    };
    const passwordHash = await hashPassword("Loan Decision Integration Password 2026!");
    const accountIds: mongoose.Types.ObjectId[] = [];
    const customerIds: mongoose.Types.ObjectId[] = [];
    const loanIds: mongoose.Types.ObjectId[] = [];

    try {
      await connectToDatabase();
      await Promise.all([Loan.init(), Notification.init()]);
      const [admin, staff, customer] = await User.create([
        { name: "Loan Decision Admin", email: emails.admin, passwordHash, role: "ADMIN" },
        { name: "Loan Decision Staff", email: emails.staff, passwordHash, role: "STAFF" },
        { name: "Loan Decision Customer", email: emails.customer, passwordHash, role: "CUSTOMER" },
      ]);
      customerIds.push(customer._id);
      const tokens = {
        admin: await createSessionToken(admin._id.toString()),
        staff: await createSessionToken(staff._id.toString()),
        customer: await createSessionToken(customer._id.toString()),
      };
      const accounts = await BankAccount.create([
        { accountNumber: `LD0${suffix.slice(0, 13)}`, userId: customer._id, accountType: "SAVINGS", balance: "700.25" },
        { accountNumber: `LD1${suffix.slice(0, 13)}`, userId: customer._id, accountType: "SAVINGS", balance: "700.25" },
        { accountNumber: `LD2${suffix.slice(0, 13)}`, userId: customer._id, accountType: "SAVINGS", balance: "700.25" },
        { accountNumber: `LD3${suffix.slice(0, 13)}`, userId: customer._id, accountType: "SAVINGS", balance: "700.25" },
      ]);
      accountIds.push(...accounts.map((account) => account._id));
      const application = (index: number, status: "PENDING" | "FORWARDED_TO_ADMIN") => ({
        customerId: customer._id,
        accountId: accounts[index]._id,
        activeAccountId: accounts[index]._id,
        amount: "25000.50",
        currency: "BDT" as const,
        purpose: "Loan decision integration scenario",
        durationMonths: 24,
        status,
        ...(status === "FORWARDED_TO_ADMIN" ? { reviewNotes: "Staff reviewed this application." } : {}),
      });
      const [approvalLoan, rejectionLoan, pendingLoan, concurrentLoan] = await Loan.create([
        application(0, "FORWARDED_TO_ADMIN"),
        application(1, "FORWARDED_TO_ADMIN"),
        application(2, "PENDING"),
        application(3, "FORWARDED_TO_ADMIN"),
      ]);
      loanIds.push(approvalLoan._id, rejectionLoan._id, pendingLoan._id, concurrentLoan._id);

      const approveRequest = (id: mongoose.Types.ObjectId, token?: string, body?: unknown) =>
        approveAdminLoan(accountRequest(`/admin/loans/${id}/approve`, token, "PATCH", body), { params: Promise.resolve({ id: id.toString() }) });
      const rejectRequest = (id: mongoose.Types.ObjectId, token?: string, body?: unknown) =>
        rejectAdminLoan(accountRequest(`/admin/loans/${id}/reject`, token, "PATCH", body), { params: Promise.resolve({ id: id.toString() }) });
      const beforeTransactionCount = await Transaction.countDocuments({ $or: [{ fromAccount: { $in: accountIds } }, { toAccount: { $in: accountIds } }] });

      assert.equal((await approveRequest(approvalLoan._id)).status, 401);
      assert.equal((await rejectRequest(rejectionLoan._id)).status, 401);
      for (const token of [tokens.customer, tokens.staff]) {
        assert.equal((await approveRequest(approvalLoan._id, token)).status, 403);
        assert.equal((await rejectRequest(rejectionLoan._id, token, { rejectionReason: "Valid rejection reason for authorization test." })).status, 403);
      }

      assert.equal((await approveRequest(pendingLoan._id, tokens.admin)).status, 409);
      assert.equal((await rejectRequest(pendingLoan._id, tokens.admin, { rejectionReason: "Valid reason for a pending loan." })).status, 409);
      assert.equal((await rejectRequest(rejectionLoan._id, tokens.admin)).status, 400);
      assert.equal((await rejectRequest(rejectionLoan._id, tokens.admin, {})).status, 400);
      assert.equal((await rejectRequest(rejectionLoan._id, tokens.admin, { rejectionReason: "No" })).status, 400);

      assert.equal((await approveRequest(approvalLoan._id, tokens.admin, { approvedAmount: "25000.51" })).status, 400);
      const overLimitLoan = await Loan.findById(approvalLoan._id);
      assert.equal(overLimitLoan?.status, "FORWARDED_TO_ADMIN");
      assert.equal(overLimitLoan?.approvedAmount, undefined);

      const approvalResponse = await approveRequest(approvalLoan._id, tokens.admin, { approvedAmount: "15000.25" });
      assert.equal(approvalResponse.status, 200);
      const approvalBody = await approvalResponse.json() as { data: { loan: { status: string } } };
      assert.equal(approvalBody.data.loan.status, "APPROVED");
      const approvedStored = await Loan.findById(approvalLoan._id).select("+activeAccountId");
      assert.equal(approvedStored?.approvedBy?.toString(), admin._id.toString());
      assert.equal(approvedStored?.approvedAmount?.toString(), "15000.25");
      assert.ok(approvedStored?.approvedAt instanceof Date);
      assert.equal(approvedStored?.activeAccountId, undefined);
      const approvedNotifications = await Notification.find({ userId: customer._id, dedupeKey: `loan:${approvalLoan._id}:approved` });
      assert.equal(approvedNotifications.length, 1);
      assert.equal(approvedNotifications[0].type, "LOAN_APPROVED");
      assert.match(approvedNotifications[0].message, /৳15,000\.25/);
      assert.equal((await approveRequest(approvalLoan._id, tokens.admin)).status, 409);
      assert.equal(await Notification.countDocuments({ userId: customer._id, dedupeKey: `loan:${approvalLoan._id}:approved` }), 1);
      assert.equal((await rejectRequest(approvalLoan._id, tokens.admin, { rejectionReason: "Cannot change an approved decision." })).status, 409);

      const rejectionReason = "The application does not meet the current lending criteria.";
      const rejectionResponse = await rejectRequest(rejectionLoan._id, tokens.admin, { rejectionReason });
      assert.equal(rejectionResponse.status, 200);
      const rejectionBody = await rejectionResponse.json() as { data: { loan: { status: string; rejectionReason?: string } } };
      assert.equal(rejectionBody.data.loan.status, "REJECTED");
      assert.equal(rejectionBody.data.loan.rejectionReason, rejectionReason);
      const rejectedStored = await Loan.findById(rejectionLoan._id).select("+activeAccountId");
      assert.equal(rejectedStored?.rejectedBy?.toString(), admin._id.toString());
      assert.ok(rejectedStored?.rejectedAt instanceof Date);
      assert.equal(rejectedStored?.rejectionReason, rejectionReason);
      assert.equal(rejectedStored?.activeAccountId, undefined);
      const rejectedNotifications = await Notification.find({ userId: customer._id, dedupeKey: `loan:${rejectionLoan._id}:rejected` });
      assert.equal(rejectedNotifications.length, 1);
      assert.equal(rejectedNotifications[0].type, "LOAN_REJECTED");
      assert.equal(rejectedNotifications[0].message.includes(rejectionReason), false);
      assert.equal((await rejectRequest(rejectionLoan._id, tokens.admin, { rejectionReason })).status, 409);
      assert.equal((await approveRequest(rejectionLoan._id, tokens.admin)).status, 409);

      const [concurrentApproval, concurrentRejection] = await Promise.all([
        approveRequest(concurrentLoan._id, tokens.admin),
        rejectRequest(concurrentLoan._id, tokens.admin, { rejectionReason }),
      ]);
      assert.deepEqual([concurrentApproval.status, concurrentRejection.status].sort(), [200, 409]);
      const concurrentStored = await Loan.findById(concurrentLoan._id).select("+activeAccountId");
      assert.ok(concurrentStored?.status === "APPROVED" || concurrentStored?.status === "REJECTED");
      assert.equal(concurrentStored?.activeAccountId, undefined);

      const newApplication = await createLoan(accountRequest("/loans", tokens.customer, "POST", {
        accountId: accounts[1]._id.toString(),
        amount: "15000.00",
        purpose: "New application after previous rejection",
        durationMonths: 12,
      }));
      assert.equal(newApplication.status, 201);
      const newApplicationBody = await newApplication.json() as { data: { loan: { id: string } } };
      loanIds.push(new mongoose.Types.ObjectId(newApplicationBody.data.loan.id));

      assert.deepEqual(await Promise.all(accounts.map(async (account) => (await BankAccount.findById(account._id))?.balance.toString())), Array(4).fill("700.25"));
      assert.equal(await Transaction.countDocuments({ $or: [{ fromAccount: { $in: accountIds } }, { toAccount: { $in: accountIds } }] }), beforeTransactionCount);
    } finally {
      if (mongoose.connection.readyState === 1) {
        await Notification.deleteMany({ userId: { $in: customerIds } });
        await Loan.deleteMany({ _id: { $in: loanIds } });
        await BankAccount.deleteMany({ _id: { $in: accountIds } });
        await User.deleteMany({ email: { $in: Object.values(emails) } });
        assert.equal(await Loan.countDocuments({ _id: { $in: loanIds } }), 0);
      }
    }
  },
);

test(
  "Admin loan disbursement is atomic, authorized, idempotent under concurrency, and uses the approved amount",
  { skip: process.env.RUN_DB_INTEGRATION_TESTS !== "true" },
  async () => {
    loadIntegrationTestEnvironment();
    const suffix = randomUUID().replaceAll("-", "").toUpperCase();
    const emails = {
      admin: `loan-disburse-admin-${suffix}@example.com`,
      staff: `loan-disburse-staff-${suffix}@example.com`,
      customer: `loan-disburse-customer-${suffix}@example.com`,
      otherCustomer: `loan-disburse-other-${suffix}@example.com`,
    };
    const passwordHash = await hashPassword("Loan Disbursement Integration Password 2026!");
    const accountIds: mongoose.Types.ObjectId[] = [];
    const customerIds: mongoose.Types.ObjectId[] = [];
    const loanIds: mongoose.Types.ObjectId[] = [];

    try {
      await connectToDatabase();
      await Promise.all([Loan.init(), Transaction.init()]);
      const [admin, staff, customer, otherCustomer] = await User.create([
        { name: "Loan Disbursement Admin", email: emails.admin, passwordHash, role: "ADMIN" },
        { name: "Loan Disbursement Staff", email: emails.staff, passwordHash, role: "STAFF" },
        { name: "Loan Disbursement Customer", email: emails.customer, passwordHash, role: "CUSTOMER" },
        { name: "Loan Disbursement Other Customer", email: emails.otherCustomer, passwordHash, role: "CUSTOMER" },
      ]);
      customerIds.push(customer._id, otherCustomer._id);
      const tokens = {
        admin: await createSessionToken(admin._id.toString()),
        staff: await createSessionToken(staff._id.toString()),
        customer: await createSessionToken(customer._id.toString()),
      };
      const accounts = await BankAccount.create([
        { accountNumber: `LDI0${suffix.slice(0, 12)}`, userId: customer._id, accountType: "SAVINGS", balance: "100.00" },
        { accountNumber: `LDI1${suffix.slice(0, 12)}`, userId: customer._id, accountType: "SAVINGS", balance: "100.00", status: "INACTIVE" },
        { accountNumber: `LDI2${suffix.slice(0, 12)}`, userId: customer._id, accountType: "SAVINGS", balance: "100.00" },
        { accountNumber: `LDI3${suffix.slice(0, 12)}`, userId: customer._id, accountType: "SAVINGS", balance: "100.00" },
        { accountNumber: `LDI4${suffix.slice(0, 12)}`, userId: otherCustomer._id, accountType: "SAVINGS", balance: "100.00" },
      ]);
      accountIds.push(...accounts.map((account) => account._id));
      // Bypass the Mongoose enum only to verify the disbursement guard against legacy/corrupt records.
      await BankAccount.collection.updateOne({ _id: accounts[2]._id }, { $set: { currency: "USD" } });

      const approvedLoan = (accountIndex: number, overrides: {
        status?: "APPROVED" | "PENDING";
        approvedAmount?: string | undefined;
      } = {}) => ({
        customerId: customer._id,
        accountId: accounts[accountIndex]._id,
        amount: "25000.50",
        approvedAmount: "12000.75",
        currency: "BDT" as const,
        purpose: "Loan disbursement integration scenario",
        durationMonths: 24,
        status: "APPROVED" as const,
        ...overrides,
      });
      const loans = await Loan.create([
        approvedLoan(0),
        approvedLoan(1),
        approvedLoan(2),
        approvedLoan(3),
        approvedLoan(4),
        approvedLoan(3, { approvedAmount: "13000.00" }),
        approvedLoan(0, { status: "PENDING" }),
        approvedLoan(3, { approvedAmount: "14000.00" }),
      ]);
      loanIds.push(...loans.map((loan) => loan._id));
      const noApprovedAmountLoan = await Loan.create(approvedLoan(0, { approvedAmount: undefined }));
      loanIds.push(noApprovedAmountLoan._id);
      const [mainLoan, inactiveLoan, nonBdtLoan, wrongOwnerLoan, rollbackLoan, concurrentLoan, pendingLoan, unusedLoan] = loans;
      const disburse = (id: mongoose.Types.ObjectId, token?: string) =>
        disburseAdminLoan(accountRequest(`/admin/loans/${id}/disburse`, token, "POST"), {
          params: Promise.resolve({ id: id.toString() }),
        });

      assert.equal((await disburse(mainLoan._id)).status, 401);
      assert.equal((await disburse(mainLoan._id, tokens.staff)).status, 403);
      assert.equal((await disburse(mainLoan._id, tokens.customer)).status, 403);
      assert.equal((await disburse(pendingLoan._id, tokens.admin)).status, 409);
      assert.equal((await disburse(inactiveLoan._id, tokens.admin)).status, 409);
      assert.equal((await disburse(nonBdtLoan._id, tokens.admin)).status, 409);
      assert.equal((await disburse(wrongOwnerLoan._id, tokens.admin)).status, 409);
      assert.equal((await disburse(noApprovedAmountLoan._id, tokens.admin)).status, 409);

      // An existing loanId key simulates a database write failure after the account update.
      await Transaction.create({
        transactionType: "DEPOSIT",
        toAccount: accounts[3]._id,
        loanId: rollbackLoan._id,
        amount: "1.00",
        currency: "BDT",
        status: "COMPLETED",
      });
      assert.equal((await disburse(rollbackLoan._id, tokens.admin)).status, 409);
      assert.equal((await BankAccount.findById(accounts[3]._id))?.balance.toString(), "100.00");
      assert.equal((await Loan.findById(rollbackLoan._id))?.status, "APPROVED");

      const success = await disburse(mainLoan._id, tokens.admin);
      assert.equal(success.status, 200);
      const successBody = await success.json() as {
        data: { loan: { status: string; approvedAmount: string; disbursedAt: string; disbursement: { transactionId: string; amount: string } };
          transaction: { transactionType: string; status: string; amount: string } };
      };
      assert.equal(successBody.data.loan.status, "DISBURSED");
      assert.equal(successBody.data.loan.approvedAmount, "12000.75");
      assert.equal(successBody.data.loan.disbursement.amount, "12000.75");
      assert.equal(successBody.data.transaction.transactionType, "LOAN_DISBURSEMENT");
      assert.equal(successBody.data.transaction.status, "COMPLETED");
      assert.equal(successBody.data.transaction.amount, "12000.75");
      assert.ok(successBody.data.loan.disbursedAt);
      assert.equal((await BankAccount.findById(accounts[0]._id))?.balance.toString(), "12100.75");
      assert.equal(await Transaction.countDocuments({ loanId: mainLoan._id, transactionType: "LOAN_DISBURSEMENT" }), 1);
      assert.equal((await disburse(mainLoan._id, tokens.admin)).status, 409);
      const customerDetails = await getMyLoan(accountRequest(`/loans/${mainLoan._id}`, tokens.customer), {
        params: Promise.resolve({ id: mainLoan._id.toString() }),
      });
      const customerDetailsBody = await customerDetails.json() as { data: { loan: { disbursement: { transactionId: string } | null } } };
      assert.equal(customerDetails.status, 200);
      assert.equal(customerDetailsBody.data.loan.disbursement?.transactionId, successBody.data.loan.disbursement.transactionId);

      const concurrentResponses = await Promise.all([
        disburse(concurrentLoan._id, tokens.admin),
        disburse(concurrentLoan._id, tokens.admin),
      ]);
      assert.deepEqual(concurrentResponses.map((response) => response.status).sort(), [200, 409]);
      assert.equal((await BankAccount.findById(accounts[3]._id))?.balance.toString(), "13100.00");
      assert.equal((await Loan.findById(concurrentLoan._id))?.status, "DISBURSED");
      assert.equal(await Transaction.countDocuments({ loanId: concurrentLoan._id, transactionType: "LOAN_DISBURSEMENT" }), 1);
      assert.equal(await Transaction.countDocuments({ loanId: { $in: [mainLoan._id, concurrentLoan._id] }, transactionType: "LOAN_DISBURSEMENT" }), 2);
      assert.equal((await BankAccount.findById(accounts[1]._id))?.balance.toString(), "100.00");
      assert.equal((await BankAccount.findById(accounts[2]._id))?.balance.toString(), "100.00");
      assert.equal((await BankAccount.findById(accounts[4]._id))?.balance.toString(), "100.00");
      assert.equal((await Loan.findById(unusedLoan._id))?.status, "APPROVED");
    } finally {
      if (mongoose.connection.readyState === 1) {
        await Transaction.deleteMany({ loanId: { $in: loanIds } });
        await Loan.deleteMany({ _id: { $in: loanIds } });
        await BankAccount.deleteMany({ _id: { $in: accountIds } });
        await User.deleteMany({ email: { $in: Object.values(emails) } });
        assert.equal(await Loan.countDocuments({ _id: { $in: loanIds } }), 0);
      }
    }
  },
);

test("loan repayment schema and model enforce positive money, UUID v4 keys, pagination, and sparse-safe indexes", () => {
  const base = {
    amount: "1.25",
    sourceAccountId: "507f1f77bcf86cd799439011",
    idempotencyKey: randomUUID(),
  };
  assert.equal(createLoanRepaymentSchema.safeParse(base).success, true);
  assert.equal(createLoanRepaymentSchema.safeParse({ ...base, amount: "0.00" }).success, false);
  assert.equal(createLoanRepaymentSchema.safeParse({ ...base, amount: "-1.00" }).success, false);
  assert.equal(createLoanRepaymentSchema.safeParse({ ...base, amount: "1.001" }).success, false);
  assert.equal(createLoanRepaymentSchema.safeParse({ ...base, customerId: "507f1f77bcf86cd799439011" }).success, false);
  assert.equal(createLoanRepaymentSchema.safeParse({ ...base, idempotencyKey: "retry" }).success, false);
  assert.equal(loanRepaymentsQuerySchema.safeParse({ page: "1", limit: "10" }).success, true);
  assert.equal(loanRepaymentsQuerySchema.safeParse({ page: "0" }).success, false);
  assert.equal(loanRepaymentsQuerySchema.safeParse({ limit: "101" }).success, false);
  assert.equal(LoanRepayment.schema.path("idempotencyKey")?.options.immutable, true);
  assert.ok(LoanRepayment.schema.indexes().some(([keys, options]) =>
    keys.customerId === 1 && keys.idempotencyKey === 1 && options.unique === true &&
    options.partialFilterExpression?.idempotencyKey?.$type === "string",
  ));
  assert.ok(LoanRepayment.schema.indexes().some(([keys, options]) =>
    keys.transactionId === 1 && options.unique === true &&
    options.partialFilterExpression?.transactionId?.$type === "objectId",
  ));
});

test(
  "customer loan repayments are atomic, idempotent, balance-safe, and privately paginated",
  { skip: process.env.RUN_DB_INTEGRATION_TESTS !== "true" },
  async () => {
    loadIntegrationTestEnvironment();
    const suffix = randomUUID().replaceAll("-", "").toUpperCase();
    const emails = {
      admin: `loan-repay-admin-${suffix}@example.com`,
      staff: `loan-repay-staff-${suffix}@example.com`,
      customer: `loan-repay-customer-${suffix}@example.com`,
      otherCustomer: `loan-repay-other-${suffix}@example.com`,
    };
    const passwordHash = await hashPassword("Loan Repayment Integration Password 2026!");
    const accountIds: mongoose.Types.ObjectId[] = [];
    const customerIds: mongoose.Types.ObjectId[] = [];
    const loanIds: mongoose.Types.ObjectId[] = [];
    const originalTransactionCreate = Transaction.create;

    try {
      await connectToDatabase();
      await Promise.all([Loan.init(), LoanRepayment.init(), Transaction.init()]);
      const [admin, staff, customer, otherCustomer] = await User.create([
        { name: "Loan Repayment Admin", email: emails.admin, passwordHash, role: "ADMIN" },
        { name: "Loan Repayment Staff", email: emails.staff, passwordHash, role: "STAFF" },
        { name: "Loan Repayment Customer", email: emails.customer, passwordHash, role: "CUSTOMER" },
        { name: "Loan Repayment Other Customer", email: emails.otherCustomer, passwordHash, role: "CUSTOMER" },
      ]);
      customerIds.push(customer._id, otherCustomer._id);
      const tokens = {
        admin: await createSessionToken(admin._id.toString()),
        staff: await createSessionToken(staff._id.toString()),
        customer: await createSessionToken(customer._id.toString()),
        otherCustomer: await createSessionToken(otherCustomer._id.toString()),
      };
      const accounts = await BankAccount.create([
        { accountNumber: `LRI0${suffix.slice(0, 12)}`, userId: customer._id, accountType: "SAVINGS", balance: "1000.00" },
        { accountNumber: `LRI1${suffix.slice(0, 12)}`, userId: customer._id, accountType: "SAVINGS", balance: "10.00" },
        { accountNumber: `LRI2${suffix.slice(0, 12)}`, userId: customer._id, accountType: "SAVINGS", balance: "1000.00", status: "INACTIVE" },
        { accountNumber: `LRI3${suffix.slice(0, 12)}`, userId: customer._id, accountType: "SAVINGS", balance: "1000.00" },
        { accountNumber: `LRI4${suffix.slice(0, 12)}`, userId: otherCustomer._id, accountType: "SAVINGS", balance: "1000.00" },
      ]);
      accountIds.push(...accounts.map((account) => account._id));
      await BankAccount.collection.updateOne({ _id: accounts[3]._id }, { $set: { currency: "USD" } });

      const makeLoan = (
        status: "DISBURSED" | "APPROVED" | "PAID",
        approvedAmount: string,
        accountId: mongoose.Types.ObjectId,
        customerId = customer._id,
      ) => ({
        customerId,
        accountId,
        amount: "250.00",
        approvedAmount,
        currency: "BDT" as const,
        purpose: "Loan repayment integration scenario",
        durationMonths: 24,
        status,
      });
      const loans = await Loan.create([
        makeLoan("DISBURSED", "100.00", accounts[0]._id),
        makeLoan("DISBURSED", "500.00", accounts[1]._id),
        makeLoan("APPROVED", "100.00", accounts[0]._id),
        makeLoan("PAID", "100.00", accounts[0]._id),
        makeLoan("DISBURSED", "10.00", accounts[0]._id),
        makeLoan("DISBURSED", "25.00", accounts[0]._id),
        makeLoan("DISBURSED", "100.00", accounts[4]._id, otherCustomer._id),
      ]);
      loanIds.push(...loans.map((loan) => loan._id));
      const [mainLoan, insufficientLoan, approvedLoan, paidLoan, idempotentLoan, rollbackLoan, otherCustomerLoan] = loans;
      const repay = (loanId: mongoose.Types.ObjectId, token: string | undefined, body: unknown) =>
        createLoanRepayment(accountRequest(`/loans/${loanId}/repayments`, token, "POST", body), {
          params: Promise.resolve({ id: loanId.toString() }),
        });
      const repaymentBody = (amount: string, sourceAccountId = accounts[0]._id.toString(), idempotencyKey = randomUUID()) => ({
        amount,
        sourceAccountId,
        idempotencyKey,
      });

      assert.equal((await repay(mainLoan._id, undefined, repaymentBody("1.00"))).status, 401);
      assert.equal((await repay(mainLoan._id, tokens.staff, repaymentBody("1.00"))).status, 403);
      assert.equal((await repay(mainLoan._id, tokens.admin, repaymentBody("1.00"))).status, 403);
      assert.equal((await repay(mainLoan._id, tokens.customer, { ...repaymentBody("1.00"), customerId: customer._id.toString() })).status, 400);
      assert.equal((await repay(otherCustomerLoan._id, tokens.customer, repaymentBody("1.00"))).status, 404);
      assert.equal((await repay(approvedLoan._id, tokens.customer, repaymentBody("1.00"))).status, 409);
      assert.equal((await repay(paidLoan._id, tokens.customer, repaymentBody("1.00"))).status, 409);
      assert.equal((await repay(mainLoan._id, tokens.customer, repaymentBody("0.00"))).status, 400);
      assert.equal((await repay(mainLoan._id, tokens.customer, repaymentBody("-1.00"))).status, 400);
      assert.equal((await repay(mainLoan._id, tokens.customer, repaymentBody("100.01"))).status, 409);
      assert.equal((await repay(insufficientLoan._id, tokens.customer, repaymentBody("20.00", accounts[1]._id.toString()))).status, 409);
      assert.equal((await repay(mainLoan._id, tokens.customer, repaymentBody("1.00", accounts[2]._id.toString()))).status, 404);
      assert.equal((await repay(mainLoan._id, tokens.customer, repaymentBody("1.00", accounts[3]._id.toString()))).status, 404);
      assert.equal((await repay(mainLoan._id, tokens.customer, repaymentBody("1.00", accounts[4]._id.toString()))).status, 404);

      const partialKey = randomUUID();
      const partialBody = repaymentBody("30.00", accounts[0]._id.toString(), partialKey);
      const partialResponse = await repay(mainLoan._id, tokens.customer, partialBody);
      assert.equal(partialResponse.status, 201);
      const partialBodyResponse = await partialResponse.json() as { data: { outstandingBalance: string; repayment: { status: string; repaymentId: string; transaction: { transactionId: string } } } };
      assert.equal(partialBodyResponse.data.outstandingBalance, "70.00");
      assert.equal(partialBodyResponse.data.repayment.status, "COMPLETED");
      assert.ok(partialBodyResponse.data.repayment.transaction.transactionId);
      assert.equal((await Loan.findById(mainLoan._id))?.outstandingBalance?.toString(), "70.00");
      assert.equal((await BankAccount.findById(accounts[0]._id))?.balance.toString(), "970.00");

      const replayResponse = await repay(mainLoan._id, tokens.customer, partialBody);
      assert.equal(replayResponse.status, 200);
      const replayBody = await replayResponse.json() as { data: { replayed: boolean; repayment: { repaymentId: string } } };
      assert.equal(replayBody.data.replayed, true);
      assert.equal(replayBody.data.repayment.repaymentId, partialBodyResponse.data.repayment.repaymentId);
      assert.equal((await BankAccount.findById(accounts[0]._id))?.balance.toString(), "970.00");
      assert.equal(await LoanRepayment.countDocuments({ loanId: mainLoan._id }), 1);
      assert.equal((await repay(mainLoan._id, tokens.customer, repaymentBody("20.00", accounts[0]._id.toString(), partialKey))).status, 409);

      const concurrentKey1 = randomUUID();
      const concurrentKey2 = randomUUID();
      const concurrentResponses = await Promise.all([
        repay(mainLoan._id, tokens.customer, repaymentBody("50.00", accounts[0]._id.toString(), concurrentKey1)),
        repay(mainLoan._id, tokens.customer, repaymentBody("50.00", accounts[0]._id.toString(), concurrentKey2)),
      ]);
      assert.deepEqual(concurrentResponses.map((response) => response.status).sort(), [201, 409]);
      assert.equal((await Loan.findById(mainLoan._id))?.outstandingBalance?.toString(), "20.00");
      assert.equal((await BankAccount.findById(accounts[0]._id))?.balance.toString(), "920.00");

      const fullResponse = await repay(mainLoan._id, tokens.customer, repaymentBody("20.00"));
      assert.equal(fullResponse.status, 201);
      const paidStored = await Loan.findById(mainLoan._id);
      assert.equal(paidStored?.outstandingBalance?.toString(), "0.00");
      assert.equal(paidStored?.status, "PAID");
      assert.equal((await BankAccount.findById(accounts[0]._id))?.balance.toString(), "900.00");
      assert.equal(await Transaction.countDocuments({ fromAccount: accounts[0]._id, transactionType: "LOAN_REPAYMENT" }), 3);
      const paidDetailsResponse = await getMyLoan(accountRequest(`/loans/${mainLoan._id}`, tokens.customer), {
        params: Promise.resolve({ id: mainLoan._id.toString() }),
      });
      const paidDetails = await paidDetailsResponse.json() as { data: { loan: { status: string; outstandingBalance: string } } };
      assert.equal(paidDetails.data.loan.status, "PAID");
      assert.equal(paidDetails.data.loan.outstandingBalance, "0.00");

      const sameKey = randomUUID();
      const sameBody = repaymentBody("4.00", accounts[0]._id.toString(), sameKey);
      const sameKeyResponses = await Promise.all([
        repay(idempotentLoan._id, tokens.customer, sameBody),
        repay(idempotentLoan._id, tokens.customer, sameBody),
      ]);
      assert.deepEqual(sameKeyResponses.map((response) => response.status).sort(), [200, 201]);
      assert.equal(await LoanRepayment.countDocuments({ loanId: idempotentLoan._id }), 1);
      assert.equal((await BankAccount.findById(accounts[0]._id))?.balance.toString(), "896.00");

      const historyResponse = await getLoanRepayments(accountRequest(`/loans/${mainLoan._id}/repayments?page=1&limit=2`, tokens.customer), {
        params: Promise.resolve({ id: mainLoan._id.toString() }),
      });
      const history = await historyResponse.json() as { data: { repayments: Array<{ repaymentId: string; sourceAccount: { id: string } | null; transaction: { transactionId: string } | null }>; total: number; page: number; limit: number; totalPages: number } };
      assert.equal(historyResponse.status, 200);
      assert.equal(history.data.total, 3);
      assert.equal(history.data.page, 1);
      assert.equal(history.data.limit, 2);
      assert.equal(history.data.totalPages, 2);
      assert.equal(history.data.repayments.length, 2);
      assert.equal(history.data.repayments[0].sourceAccount?.id, accounts[0]._id.toString());
      assert.ok(history.data.repayments[0].transaction?.transactionId);
      assert.equal((await getLoanRepayments(accountRequest(`/loans/${mainLoan._id}/repayments`, tokens.otherCustomer), {
        params: Promise.resolve({ id: mainLoan._id.toString() }),
      })).status, 404);
      assert.equal((await getLoanRepayments(accountRequest(`/loans/${mainLoan._id}/repayments`, tokens.admin), {
        params: Promise.resolve({ id: mainLoan._id.toString() }),
      })).status, 403);
      assert.equal((await getLoanRepayments(accountRequest(`/loans/${mainLoan._id}/repayments`), {
        params: Promise.resolve({ id: mainLoan._id.toString() }),
      })).status, 401);
      assert.equal((await getLoanRepayments(accountRequest(`/loans/${mainLoan._id}/repayments`, tokens.staff), {
        params: Promise.resolve({ id: mainLoan._id.toString() }),
      })).status, 403);

      const adminHistoryRequest = (token: string | undefined, query = "?page=1&limit=2") =>
        getAdminLoanRepayments(accountRequest(`/admin/loans/${mainLoan._id}/repayments${query}`, token), {
          params: Promise.resolve({ id: mainLoan._id.toString() }),
        });
      const adminHistoryResponse = await adminHistoryRequest(tokens.admin);
      const adminHistory = await adminHistoryResponse.json() as { data: { repayments: Array<{ customer: { id: string; email: string } | null }>; total: number; page: number; limit: number } };
      assert.equal(adminHistoryResponse.status, 200);
      assert.equal(adminHistory.data.total, 3);
      assert.equal(adminHistory.data.page, 1);
      assert.equal(adminHistory.data.limit, 2);
      assert.equal(adminHistory.data.repayments.length, 2);
      assert.equal(adminHistory.data.repayments[0].customer?.id, customer._id.toString());
      assert.equal(adminHistory.data.repayments[0].customer?.email, customer.email);
      assert.equal((await adminHistoryRequest(tokens.staff)).status, 403);
      assert.equal((await adminHistoryRequest(tokens.customer)).status, 403);
      assert.equal((await adminHistoryRequest(undefined)).status, 401);
      assert.equal((await adminHistoryRequest(tokens.admin, "?page=0")).status, 400);

      const summaryResponse = await getMyLoanSummary(accountRequest("/loans/summary", tokens.customer));
      const summary = await summaryResponse.json() as { data: { totalLoans: number; paidLoans: number; outstandingBalance: string } };
      assert.equal(summaryResponse.status, 200);
      assert.ok(summary.data.totalLoans >= 7);
      assert.equal(summary.data.paidLoans, 2);
      assert.equal(summary.data.outstandingBalance, "535.00");
      assert.equal((await getMyLoanSummary(accountRequest("/loans/summary", tokens.admin))).status, 403);

      Transaction.create = (async () => { throw new Error("Test repayment transaction insert failure."); }) as typeof Transaction.create;
      assert.equal((await repay(rollbackLoan._id, tokens.customer, repaymentBody("5.00"))).status, 500);
      Transaction.create = originalTransactionCreate;
      assert.equal((await BankAccount.findById(accounts[0]._id))?.balance.toString(), "896.00");
      assert.equal((await Loan.findById(rollbackLoan._id))?.status, "DISBURSED");
      assert.equal((await Loan.findById(rollbackLoan._id))?.outstandingBalance, undefined);
      assert.equal(await LoanRepayment.countDocuments({ loanId: rollbackLoan._id }), 0);
    } finally {
      Transaction.create = originalTransactionCreate;
      if (mongoose.connection.readyState === 1) {
        await LoanRepayment.deleteMany({ loanId: { $in: loanIds } });
        await Transaction.deleteMany({ fromAccount: { $in: accountIds }, transactionType: "LOAN_REPAYMENT" });
        await Loan.deleteMany({ _id: { $in: loanIds } });
        await BankAccount.deleteMany({ _id: { $in: accountIds } });
        await User.deleteMany({ email: { $in: Object.values(emails) } });
        assert.equal(await LoanRepayment.countDocuments({ loanId: { $in: loanIds } }), 0);
      }
    }
  },
);

test("loan validation enforces approved amount, duration, review, and pagination limits", async () => {
  const accountId = "507f1f77bcf86cd799439011";
  assert.equal(createLoanSchema.safeParse({
    accountId,
    amount: MIN_LOAN_AMOUNT,
    purpose: "Education expenses",
    durationMonths: MIN_LOAN_DURATION_MONTHS,
  }).success, true);
  assert.equal(createLoanSchema.safeParse({
    accountId,
    amount: MAX_LOAN_AMOUNT,
    purpose: "Home improvement project",
    durationMonths: MAX_LOAN_DURATION_MONTHS,
  }).success, true);
  for (const amount of ["9999.99", "5000000.01", "1e4", "10000.001"]) {
    assert.equal(createLoanSchema.safeParse({ accountId, amount, purpose: "A valid loan purpose", durationMonths: 12 }).success, false);
  }
  assert.equal(approveLoanSchema.safeParse({ approvedAmount: MAX_LOAN_AMOUNT }).success, true);
  assert.equal(approveLoanSchema.safeParse({ approvedAmount: "5000000.01" }).success, false);
  const loanAboveProductLimit = new Loan({
    customerId: new mongoose.Types.ObjectId(),
    accountId: new mongoose.Types.ObjectId(),
    amount: MAX_LOAN_AMOUNT,
    approvedAmount: "5000000.01",
    purpose: "Loan amount validation scenario",
    durationMonths: 12,
  });
  await assert.rejects(
    loanAboveProductLimit.validate(),
    (error: unknown) => error instanceof mongoose.Error.ValidationError && Boolean(error.errors.approvedAmount),
  );
  for (const durationMonths of [5, 61, 12.5]) {
    assert.equal(createLoanSchema.safeParse({ accountId, amount: MIN_LOAN_AMOUNT, purpose: "A valid loan purpose", durationMonths }).success, false);
  }
  assert.equal(createLoanSchema.safeParse({
    accountId,
    customerId: accountId,
    amount: MIN_LOAN_AMOUNT,
    purpose: "A valid loan purpose",
    durationMonths: 12,
  }).success, false);
  assert.equal(customerLoansQuerySchema.safeParse({ page: "2", limit: "100", status: "PENDING" }).success, true);
  assert.equal(customerLoansQuerySchema.safeParse({ page: "1000", limit: "100" }).success, true);
  assert.equal(customerLoansQuerySchema.safeParse({ page: "1001" }).success, false);
  assert.equal(customerLoansQuerySchema.safeParse({ page: "0" }).success, false);
  assert.equal(staffAdminLoansQuerySchema.safeParse({ search: "LON-123", status: "FORWARDED_TO_ADMIN" }).success, true);
  assert.equal(forwardLoanToAdminSchema.safeParse({ action: "FORWARD_TO_ADMIN", reviewNotes: "Reviewed and ready for admin consideration." }).success, true);
  assert.equal(forwardLoanToAdminSchema.safeParse({ action: "APPROVE", reviewNotes: "Approved" }).success, false);
  assert.equal(forwardLoanToAdminSchema.safeParse({ action: "REJECT", reviewNotes: "Rejected" }).success, false);
  assert.equal("PATCH" in adminLoansRoute, false);
  const activeApplicationIndex = Loan.schema.indexes().find(([, options]) => options.name === "one_unresolved_loan_per_account");
  assert.equal(activeApplicationIndex?.[1].unique, true);
  assert.deepEqual(activeApplicationIndex?.[1].partialFilterExpression, {
    activeAccountId: { $type: "objectId" },
  });
});

test("Admin loan decision schema and model audit fields are defined", () => {
  assert.equal(rejectLoanSchema.safeParse({ rejectionReason: "The application does not meet current criteria." }).success, true);
  assert.equal(rejectLoanSchema.safeParse({}).success, false);
  assert.equal(rejectLoanSchema.safeParse({ rejectionReason: "No" }).success, false);
  assert.equal(rejectLoanSchema.safeParse({ rejectionReason: "A valid reason, but extra status is forbidden.", status: "REJECTED" }).success, false);
  for (const field of ["approvedBy", "approvedAt", "rejectedBy", "rejectedAt", "rejectionReason"]) {
    assert.ok(Loan.schema.path(field), `Missing loan decision audit field: ${field}`);
  }
});

test("loan RTK Query uses role-specific endpoints and refreshes active lists after a new application", async () => {
  const originalFetch = globalThis.fetch;
  const originalRequest = globalThis.Request;
  const requestUrls: string[] = [];
  let myListRequests = 0;
  let staffListRequests = 0;
  let adminListRequests = 0;

  class RelativeRequest {
    readonly url: string;
    readonly method: string;
    readonly headers: Headers;
    readonly signal: AbortSignal | null;

    constructor(input: RequestInfo | URL, init?: RequestInit) {
      this.url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
      this.method = init?.method ?? "GET";
      this.headers = new Headers(init?.headers);
      this.signal = init?.signal ?? null;
    }

    clone() {
      return this;
    }
  }

  Object.defineProperty(globalThis, "Request", { configurable: true, value: RelativeRequest });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const method = typeof input === "object" && input !== null && "method" in input
      ? String((input as Request).method)
      : "GET";
    requestUrls.push(url);
    if (method === "GET" && (url.startsWith("/api/v1/loans?") || url === "/api/v1/loans")) myListRequests += 1;
    if (method === "GET" && url.startsWith("/api/v1/staff/loans")) staffListRequests += 1;
    if (method === "GET" && url.startsWith("/api/v1/admin/loans?")) adminListRequests += 1;
    if (url === "/api/v1/loans/summary") {
      return Response.json({ status: "success", data: { totalLoans: 0, pendingLoans: 0, approvedLoans: 0, disbursedLoans: 0, paidLoans: 0, outstandingBalance: "0.00" } });
    }
    if (url.includes("/repayments?")) {
      return Response.json({ status: "success", data: { repayments: [], total: 0, page: 1, limit: 10, totalPages: 0 } });
    }
    return Response.json({ status: "success", data: { loans: [], total: 0, page: 1, limit: 10, totalPages: 0 } });
  }) as typeof fetch;

  const store = makeStore();
  const subscriptions = [
    store.dispatch(loansApi.endpoints.getMyLoans.initiate({ page: 1, limit: 8 })),
    store.dispatch(loansApi.endpoints.getMyLoanSummary.initiate()),
    store.dispatch(loansApi.endpoints.getStaffLoans.initiate({ page: 1, limit: 10 })),
    store.dispatch(loansApi.endpoints.getAdminLoans.initiate({ page: 1, limit: 10 })),
    store.dispatch(loansApi.endpoints.getAdminLoanRepayments.initiate({ id: "507f1f77bcf86cd799439011", page: 1, limit: 10 })),
  ];

  try {
    await Promise.all(subscriptions.map((subscription) => subscription.unwrap()));
    await store.dispatch(loansApi.endpoints.createLoanApplication.initiate({
      accountId: "507f1f77bcf86cd799439011",
      amount: "10000.00",
      purpose: "Automated UI API test request",
      durationMonths: 12,
    })).unwrap();
    for (let attempt = 0; attempt < 20 && (myListRequests < 2 || staffListRequests < 2 || adminListRequests < 2); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.ok(requestUrls.some((url) => url.startsWith("/api/v1/loans?")));
    assert.ok(requestUrls.includes("/api/v1/loans/summary"));
    assert.ok(requestUrls.some((url) => url.startsWith("/api/v1/staff/loans?")));
    assert.ok(requestUrls.some((url) => url.startsWith("/api/v1/admin/loans?")));
    assert.ok(requestUrls.some((url) => url.startsWith("/api/v1/admin/loans/507f1f77bcf86cd799439011/repayments?")));
    assert.equal(myListRequests, 2);
    assert.equal(staffListRequests, 2);
    assert.equal(adminListRequests, 2);
  } finally {
    subscriptions.forEach((subscription) => subscription.unsubscribe());
    store.dispatch(loansApi.util.resetApiState());
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "Request", { configurable: true, writable: true, value: originalRequest });
  }
});

test(
  "loan APIs enforce ownership and role permissions, and the database index blocks concurrent unresolved applications",
  { skip: process.env.RUN_DB_INTEGRATION_TESTS !== "true" },
  async () => {
    loadIntegrationTestEnvironment();
    const suffix = randomUUID().replaceAll("-", "").toUpperCase();
    const emails = {
      admin: `loan-admin-${suffix}@example.com`,
      staff: `loan-staff-${suffix}@example.com`,
      customer: `loan-customer-${suffix}@example.com`,
      other: `loan-other-${suffix}@example.com`,
    };
    const passwordHash = await hashPassword("Loan Integration Password 2026!");
    const accountIds: mongoose.Types.ObjectId[] = [];
    const customerIds: mongoose.Types.ObjectId[] = [];
    let loanId = "";

    try {
      await connectToDatabase();
      await Loan.init();
      const [admin, staff, customer, other] = await User.create([
        { name: "Loan Admin", email: emails.admin, passwordHash, role: "ADMIN" },
        { name: "Loan Staff", email: emails.staff, passwordHash, role: "STAFF" },
        { name: "Loan Customer", email: emails.customer, passwordHash, role: "CUSTOMER" },
        { name: "Loan Other", email: emails.other, passwordHash, role: "CUSTOMER" },
      ]);
      customerIds.push(customer._id, other._id);
      const tokens = {
        admin: await createSessionToken(admin._id.toString()),
        staff: await createSessionToken(staff._id.toString()),
        customer: await createSessionToken(customer._id.toString()),
        other: await createSessionToken(other._id.toString()),
      };
      const [account, otherAccount] = await BankAccount.create([
        { accountNumber: `LN${suffix.slice(0, 14)}`, userId: customer._id, accountType: "SAVINGS", balance: "125.50" },
        { accountNumber: `LO${suffix.slice(0, 14)}`, userId: other._id, accountType: "CURRENT", balance: "75.25" },
      ]);
      accountIds.push(account._id, otherAccount._id);
      const requestBody = {
        accountId: account._id.toString(),
        amount: "25000.50",
        purpose: "Education and tuition costs",
        durationMonths: 24,
      };

      assert.equal((await createLoan(accountRequest("/loans", undefined, "POST", requestBody))).status, 401);
      assert.equal((await createLoan(accountRequest("/loans", tokens.staff, "POST", requestBody))).status, 403);
      assert.equal((await createLoan(accountRequest("/loans", tokens.admin, "POST", requestBody))).status, 403);
      assert.equal((await createLoan(accountRequest("/loans", tokens.other, "POST", requestBody))).status, 404);
      assert.equal((await createLoan(accountRequest("/loans", tokens.customer, "POST", {
        ...requestBody,
        amount: "5000000.01",
      }))).status, 400);

      const beforeTransactions = await Transaction.countDocuments({ $or: [{ fromAccount: account._id }, { toAccount: account._id }] });
      const concurrentResponses = await Promise.all([
        createLoan(accountRequest("/loans", tokens.customer, "POST", requestBody)),
        createLoan(accountRequest("/loans", tokens.customer, "POST", requestBody)),
      ]);
      assert.deepEqual(concurrentResponses.map((response) => response.status).sort(), [201, 409]);
      const createdResponse = concurrentResponses.find((response) => response.status === 201)!;
      const createdBody = await createdResponse.json() as { data: { loan: { id: string; loanId: string; status: string; reviewNotes?: string; customer?: unknown; account: { maskedAccountNumber: string } } } };
      loanId = createdBody.data.loan.id;
      assert.equal(createdBody.data.loan.status, "PENDING");
      assert.equal(createdBody.data.loan.reviewNotes, undefined);
      assert.equal(createdBody.data.loan.customer, undefined);
      assert.match(createdBody.data.loan.account.maskedAccountNumber, /^•••• /);

      assert.equal((await createLoan(accountRequest("/loans", tokens.customer, "POST", {
        ...requestBody,
        accountId: otherAccount._id.toString(),
      }))).status, 404);

      const customerListResponse = await getMyLoans(accountRequest("/loans?page=1&limit=10", tokens.customer));
      const customerList = await customerListResponse.json() as { data: { total: number; loans: Array<{ id: string }> } };
      assert.equal(customerListResponse.status, 200);
      assert.equal(customerList.data.total, 1);
      assert.equal(customerList.data.loans[0].id, loanId);
      assert.equal((await getMyLoan(accountRequest(`/loans/${loanId}`, tokens.other), { params: Promise.resolve({ id: loanId }) })).status, 404);
      assert.equal((await getMyLoan(accountRequest(`/loans/${loanId}`, tokens.customer), { params: Promise.resolve({ id: loanId }) })).status, 200);

      assert.equal((await getStaffLoans(accountRequest("/staff/loans?status=PENDING&limit=5", tokens.staff))).status, 200);
      assert.equal((await getStaffLoans(accountRequest("/staff/loans", tokens.admin))).status, 403);
      assert.equal((await getStaffLoan(accountRequest(`/staff/loans/${loanId}`, tokens.staff), { params: Promise.resolve({ id: loanId }) })).status, 200);
      assert.equal((await forwardStaffLoan(accountRequest(`/staff/loans/${loanId}/review`, tokens.admin, "PATCH", {
        action: "FORWARD_TO_ADMIN",
        reviewNotes: "Reviewed and ready for admin consideration.",
      }), { params: Promise.resolve({ id: loanId }) })).status, 403);
      assert.equal((await forwardStaffLoan(accountRequest(`/staff/loans/${loanId}/review`, tokens.staff, "PATCH", {
        action: "APPROVE",
        reviewNotes: "Approved",
      }), { params: Promise.resolve({ id: loanId }) })).status, 400);
      const forwardedResponse = await forwardStaffLoan(accountRequest(`/staff/loans/${loanId}/review`, tokens.staff, "PATCH", {
        action: "FORWARD_TO_ADMIN",
        reviewNotes: "Reviewed and ready for admin consideration.",
      }), { params: Promise.resolve({ id: loanId }) });
      assert.equal(forwardedResponse.status, 200);
      const forwardedBody = await forwardedResponse.json() as { data: { loan: { status: string; reviewNotes: string; reviewer: { email: string } | null } } };
      assert.equal(forwardedBody.data.loan.status, "FORWARDED_TO_ADMIN");
      assert.equal(forwardedBody.data.loan.reviewNotes, "Reviewed and ready for admin consideration.");
      assert.equal(forwardedBody.data.loan.reviewer?.email, emails.staff);
      assert.equal((await createLoan(accountRequest("/loans", tokens.customer, "POST", requestBody))).status, 409);
      assert.equal((await forwardStaffLoan(accountRequest(`/staff/loans/${loanId}/review`, tokens.staff, "PATCH", {
        action: "FORWARD_TO_ADMIN",
        reviewNotes: "Forward it a second time.",
      }), { params: Promise.resolve({ id: loanId }) })).status, 409);

      const adminListResponse = await getAdminLoans(accountRequest("/admin/loans?search=" + encodeURIComponent(createdBody.data.loan.loanId), tokens.admin));
      const adminList = await adminListResponse.json() as { data: { total: number; loans: Array<{ reviewNotes?: string; customer: { email: string } | null }> } };
      assert.equal(adminListResponse.status, 200);
      assert.equal(adminList.data.total, 1);
      assert.equal(adminList.data.loans[0].reviewNotes, "Reviewed and ready for admin consideration.");
      assert.equal(adminList.data.loans[0].customer?.email, emails.customer);
      assert.equal((await getAdminLoans(accountRequest("/admin/loans", tokens.staff))).status, 403);
      assert.equal((await getAdminLoan(accountRequest(`/admin/loans/${loanId}`, tokens.admin), { params: Promise.resolve({ id: loanId }) })).status, 200);

      const storedLoan = await Loan.findById(loanId).select("+activeAccountId");
      assert.equal(storedLoan?.status, "FORWARDED_TO_ADMIN");
      assert.equal(storedLoan?.activeAccountId?.toString(), account._id.toString());
      assert.equal((await BankAccount.findById(account._id))?.balance.toString(), "125.50");
      assert.equal(await Transaction.countDocuments({ $or: [{ fromAccount: account._id }, { toAccount: account._id }] }), beforeTransactions);
    } finally {
      if (mongoose.connection.readyState === 1) {
        await Loan.deleteMany({ customerId: { $in: customerIds } });
        await BankAccount.deleteMany({ _id: { $in: accountIds } });
        await User.deleteMany({ email: { $in: Object.values(emails) } });
        assert.equal(await Loan.countDocuments({ customerId: { $in: customerIds } }), 0);
      }
    }
  },
);

test("account statement validation rejects invalid ids, dates, and pagination", () => {
  const accountId = new mongoose.Types.ObjectId().toString();
  assert.equal(accountStatementQuerySchema.safeParse({ accountId }).success, true);
  assert.equal(accountStatementQuerySchema.safeParse({ accountId: "bad-id" }).success, false);
  assert.equal(accountStatementQuerySchema.safeParse({ accountId, startDate: "2026-02-30" }).success, false);
  assert.equal(accountStatementQuerySchema.safeParse({ accountId, startDate: "2026-12-02", endDate: "2026-12-01" }).success, false);
  assert.equal(accountStatementQuerySchema.safeParse({ accountId, page: "0" }).success, false);
  assert.equal(accountStatementQuerySchema.safeParse({ accountId, page: "1001" }).success, false);
  assert.equal(accountStatementQuerySchema.safeParse({ accountId, limit: "101" }).success, false);
  assert.equal(accountStatementQuerySchema.safeParse({ accountId, userId: new mongoose.Types.ObjectId().toString() }).success, false);
});

test("statement pagination keeps range balances based on the full completed ledger", () => {
  const accountId = new mongoose.Types.ObjectId().toString();
  const otherAccountId = new mongoose.Types.ObjectId().toString();
  const rows = [
    { _id: new mongoose.Types.ObjectId(), transactionId: "TEST-1", transactionType: "DEPOSIT" as const, toAccount: accountId, amount: "100.00", createdAt: new Date("2026-01-01T12:00:00.000Z") },
    { _id: new mongoose.Types.ObjectId(), transactionId: "TEST-2", transactionType: "TRANSFER" as const, fromAccount: accountId, toAccount: otherAccountId, amount: "25.25", createdAt: new Date("2026-01-03T08:00:00.000Z") },
    { _id: new mongoose.Types.ObjectId(), transactionId: "TEST-3", transactionType: "TRANSFER" as const, fromAccount: otherAccountId, toAccount: accountId, amount: "7.10", createdAt: new Date("2026-01-04T18:00:00.000Z") },
    { _id: new mongoose.Types.ObjectId(), transactionId: "TEST-4", transactionType: "WITHDRAWAL" as const, fromAccount: accountId, amount: "2.01", createdAt: new Date("2026-01-05T09:00:00.000Z") },
  ];
  const query = { startDate: "2026-01-03", endDate: "2026-01-04", page: 1, limit: 1 };
  const firstPage = calculateStatementBalances(rows, accountId, query);
  assert.equal(firstPage.openingBalance, "100.00");
  assert.equal(firstPage.closingBalance, "81.85");
  assert.equal(firstPage.total, 2);
  assert.equal(firstPage.totalPages, 2);
  assert.equal(firstPage.transactions[0].debit, "25.25");
  assert.equal(firstPage.transactions[0].balance, "74.75");

  const secondPage = calculateStatementBalances(rows, accountId, { ...query, page: 2 });
  assert.equal(secondPage.transactions[0].credit, "7.10");
  assert.equal(secondPage.transactions[0].balance, "81.85");
});

test("account statement balances include loan disbursements and repayments", () => {
  const accountId = new mongoose.Types.ObjectId().toString();
  const rows = [
    {
      _id: new mongoose.Types.ObjectId(),
      transactionId: "LOAN-DISBURSEMENT",
      transactionType: "LOAN_DISBURSEMENT" as const,
      toAccount: accountId,
      amount: "5000.00",
      createdAt: new Date("2026-01-02T12:00:00.000Z"),
    },
    {
      _id: new mongoose.Types.ObjectId(),
      transactionId: "LOAN-REPAYMENT",
      transactionType: "LOAN_REPAYMENT" as const,
      fromAccount: accountId,
      amount: "125.50",
      createdAt: new Date("2026-01-03T12:00:00.000Z"),
    },
  ];
  const statement = calculateCompleteStatementBalances(rows, accountId, {});
  assert.equal(statement.openingBalance, "0.00");
  assert.equal(statement.closingBalance, "4874.50");
  assert.deepEqual(statement.transactions.map(({ transactionType, debit, credit, balance }) => ({ transactionType, debit, credit, balance })), [
    { transactionType: "LOAN_DISBURSEMENT", debit: "0.00", credit: "5000.00", balance: "5000.00" },
    { transactionType: "LOAN_REPAYMENT", debit: "125.50", credit: "0.00", balance: "4874.50" },
  ]);
});

test("account statement PDF renders an empty statement and creates additional pages for long histories", async () => {
  const base = {
    bankName: "Northstar Bank",
    customerName: "Example Customer",
    customerEmail: "customer@example.com",
    accountNumber: "1234567890",
    accountType: "SAVINGS",
    currency: "BDT",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    generatedAt: new Date("2026-02-01T00:00:00.000Z"),
    openingBalance: "1250000.00",
    closingBalance: "1250250.00",
  };
  const emptyPdf = await createAccountStatementPdf({ ...base, transactions: [] });
  assert.equal(emptyPdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.equal((emptyPdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length, 1);

  const transactions = Array.from({ length: 80 }, (_, index) => ({
    transactionId: `TXN-${String(index + 1).padStart(5, "0")}`,
    description: `Statement entry ${index + 1} with a short description`,
    debit: index % 2 === 0 ? "0.00" : "10.25",
    credit: index % 2 === 0 ? "10.25" : "0.00",
    balance: `1250${String(index).padStart(2, "0")}.25`,
    createdAt: new Date(Date.UTC(2026, 0, 1 + (index % 31), 12)),
  }));
  const multiPagePdf = await createAccountStatementPdf({ ...base, transactions });
  const pageCount = (multiPagePdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
  assert.ok(pageCount > 1, `Expected multiple PDF pages, received ${pageCount}.`);
  assert.match(createStatementFilename("ACCT/123\\456", "2026-01-01", "2026-01-31"), /^account-statement-ACCT123456-/);
});

test("account statement CSV includes balances, safely escapes cells, and protects formula prefixes", () => {
  const base = {
    accountNumber: "1234567890",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    openingBalance: "1000.00",
    closingBalance: "2234.50",
  };
  const csv = createAccountStatementCsv({
    ...base,
    transactions: [
      {
        transactionId: "TXN-01",
        transactionType: "DEPOSIT",
        description: "Monthly, \"salary\"\r\ncredit",
        debit: "0.00",
        credit: "1234.50",
        balance: "2234.50",
        createdAt: new Date("2026-01-12T10:00:00.000Z"),
      },
      {
        transactionId: "=HYPERLINK(\"https://example.invalid\")",
        transactionType: "TRANSFER",
        description: "- ordinary note",
        debit: "1.00",
        credit: "0.00",
        balance: "2233.50",
        createdAt: new Date("2026-01-13T10:00:00.000Z"),
      },
      {
        transactionId: "TXN-03",
        transactionType: "WITHDRAWAL",
        description: "-1+1",
        debit: "1.00",
        credit: "0.00",
        balance: "2232.50",
        createdAt: new Date("2026-01-14T10:00:00.000Z"),
      },
    ],
  });
  const content = csv.slice(1);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.ok(content.startsWith('"Date","Transaction ID","Type","Description","Debit (BDT)","Credit (BDT)","Balance (BDT)"\r\n'));
  assert.ok(content.includes('"OPENING_BALANCE","Opening balance (2026-01-01 to 2026-01-31)"'));
  assert.ok(content.includes('"Monthly, ""salary""\r\ncredit"'));
  assert.ok(content.includes('"\'=HYPERLINK(""https://example.invalid"")"'));
  assert.ok(content.includes('"- ordinary note"'));
  assert.ok(content.includes('"\'-1+1"'));
  assert.ok(content.includes('"1234.50"'));
  assert.ok(content.includes('"CLOSING_BALANCE","Closing balance (2026-01-01 to 2026-01-31)"'));
  assert.match(createStatementCsvFilename("ACC/123\\456", "2026-01-01", "2026-01-31"), /^account-statement-ACC123456-/);

  const emptyCsv = createAccountStatementCsv({ ...base, openingBalance: "0.00", closingBalance: "0.00", transactions: [] });
  assert.equal(emptyCsv.charCodeAt(0), 0xFEFF);
  assert.equal(emptyCsv.slice(1).split("\r\n").filter(Boolean).length, 3);
  assert.ok(emptyCsv.includes('"CLOSING_BALANCE","Closing balance'));
});

test("unpaginated account statement calculation returns every filtered transaction", () => {
  const accountId = new mongoose.Types.ObjectId().toString();
  const before = {
    _id: new mongoose.Types.ObjectId(), transactionId: "BEFORE", transactionType: "DEPOSIT" as const,
    toAccount: accountId, amount: "10.00", createdAt: new Date("2026-01-01T12:00:00.000Z"),
  };
  const inRange = Array.from({ length: 130 }, (_, index) => ({
    _id: new mongoose.Types.ObjectId(), transactionId: `TXN-${index + 1}`, transactionType: "DEPOSIT" as const,
    toAccount: accountId, amount: "0.01", createdAt: new Date("2026-01-15T12:00:00.000Z"),
  }));
  const after = {
    _id: new mongoose.Types.ObjectId(), transactionId: "AFTER", transactionType: "DEPOSIT" as const,
    toAccount: accountId, amount: "20.00", createdAt: new Date("2026-02-01T12:00:00.000Z"),
  };
  const statement = calculateCompleteStatementBalances(
    [before, ...inRange, after],
    accountId,
    { startDate: "2026-01-10", endDate: "2026-01-31" },
  );
  assert.equal(statement.openingBalance, "10.00");
  assert.equal(statement.closingBalance, "11.30");
  assert.equal(statement.total, 130);
  assert.equal(statement.transactions.length, 130);
  assert.equal(statement.transactions[0].transactionId, "TXN-1");
  assert.equal(statement.transactions.at(-1)?.transactionId, "TXN-130");
});

test("statement frontend helpers sum exact paise, isolate selection keys, and build backend download URLs", () => {
  const transaction = (debit: string, credit: string) => ({
    id: "id",
    transactionId: "TXN-1",
    transactionType: "TRANSFER" as const,
    direction: "DEBIT" as const,
    description: "",
    amount: debit === "0.00" ? credit : debit,
    debit,
    credit,
    balance: "10.00",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const firstPage = calculateStatementPageTotals([transaction("0.10", "0.00"), transaction("0.00", "0.10")]);
  const secondPage = calculateStatementPageTotals([transaction("0.20", "0.00"), transaction("0.00", "0.20")]);
  assert.equal(formatBdtPaisa(firstPage.debitPaisa + secondPage.debitPaisa), "0.30");
  assert.equal(formatBdtPaisa(firstPage.creditPaisa + secondPage.creditPaisa), "0.30");

  const originalKey = accountStatementSelectionKey("account-one", "2026-01-01", "2026-01-31");
  assert.notEqual(originalKey, accountStatementSelectionKey("account-two", "2026-01-01", "2026-01-31"));
  assert.notEqual(originalKey, accountStatementSelectionKey("account-one", "2026-02-01", "2026-02-28"));
  assert.equal(accountStatementSelectionKey("", "", ""), "");
  assert.equal(
    createStatementDownloadUrl("507f1f77bcf86cd799439011", "csv", "2026-01-01", "2026-01-31"),
    "/api/v1/accounts/507f1f77bcf86cd799439011/statement/csv?startDate=2026-01-01&endDate=2026-01-31",
  );
});

test(
  "account statement API enforces customer ownership and existing staff/admin read access",
  { skip: process.env.RUN_DB_INTEGRATION_TESTS !== "true" },
  async () => {
    loadIntegrationTestEnvironment();
    const suffix = randomUUID().replaceAll("-", "").toUpperCase();
    const emails = {
      admin: `statement-admin-${suffix}@example.com`,
      staff: `statement-staff-${suffix}@example.com`,
      customer: `statement-customer-${suffix}@example.com`,
      other: `statement-other-${suffix}@example.com`,
    };
    const transactionIds = [`STM-${suffix}-DEPOSIT`, `STM-${suffix}-PENDING`];
    const accountIds: string[] = [];
    const passwordHash = await hashPassword("Statement Integration Password 2026!");

    try {
      await connectToDatabase();
      const [admin, staff, customer, other] = await User.create([
        { name: "Statement Admin", email: emails.admin, passwordHash, role: "ADMIN" },
        { name: "Statement Staff", email: emails.staff, passwordHash, role: "STAFF" },
        { name: "Statement Customer", email: emails.customer, passwordHash, role: "CUSTOMER" },
        { name: "Statement Other", email: emails.other, passwordHash, role: "CUSTOMER" },
      ]);
      const tokens = {
        admin: await createSessionToken(admin._id.toString()),
        staff: await createSessionToken(staff._id.toString()),
        customer: await createSessionToken(customer._id.toString()),
        other: await createSessionToken(other._id.toString()),
      };
      const [ownAccount, otherAccount] = await BankAccount.create([
        { accountNumber: `ST${suffix.slice(0, 12)}01`, userId: customer._id, accountType: "SAVINGS" },
        { accountNumber: `ST${suffix.slice(0, 12)}02`, userId: other._id, accountType: "SAVINGS" },
      ]);
      accountIds.push(ownAccount._id.toString(), otherAccount._id.toString());
      await Transaction.create([
        {
          transactionId: transactionIds[0], transactionType: "DEPOSIT", toAccount: ownAccount._id,
          amount: "500.10", status: "COMPLETED", createdBy: admin._id, createdAt: new Date("2026-01-02T10:00:00.000Z"),
        },
        {
          transactionId: transactionIds[1], transactionType: "DEPOSIT", toAccount: ownAccount._id,
          amount: "99.00", status: "PENDING", createdBy: staff._id, createdAt: new Date("2026-01-03T10:00:00.000Z"),
        },
      ]);

      const ownRoute = (token: string, accountId = ownAccount._id.toString(), query = "") =>
        getAccountStatement(accountRequest(`/accounts/${accountId}/statement${query}`, token), {
          params: Promise.resolve({ id: accountId }),
        });
      assert.equal((await ownRoute(tokens.customer)).status, 200);
      assert.equal((await ownRoute(tokens.customer, otherAccount._id.toString())).status, 404);
      assert.equal((await ownRoute(tokens.other, ownAccount._id.toString())).status, 404);
      assert.equal((await ownRoute(tokens.staff)).status, 200);
      assert.equal((await ownRoute(tokens.admin)).status, 200);
      const pdfResponse = await downloadAccountStatementPdf(
        accountRequest(`/accounts/${ownAccount._id}/statement/pdf?startDate=2026-01-02&endDate=2026-01-02`, tokens.customer),
        { params: Promise.resolve({ id: ownAccount._id.toString() }) },
      );
      assert.equal(pdfResponse.status, 200);
      assert.equal(pdfResponse.headers.get("content-type"), "application/pdf");
      assert.match(pdfResponse.headers.get("content-disposition") ?? "", /^attachment; filename="account-statement-/);
      assert.equal(Buffer.from(await pdfResponse.arrayBuffer()).subarray(0, 5).toString("ascii"), "%PDF-");
      assert.equal((await downloadAccountStatementPdf(
        accountRequest(`/accounts/${otherAccount._id}/statement/pdf`, tokens.customer),
        { params: Promise.resolve({ id: otherAccount._id.toString() }) },
      )).status, 404);
      assert.equal((await downloadAccountStatementPdf(
        accountRequest(`/accounts/${ownAccount._id}/statement/pdf`, tokens.staff),
        { params: Promise.resolve({ id: ownAccount._id.toString() }) },
      )).status, 200);
      const csvResponse = await downloadAccountStatementCsv(
        accountRequest(`/accounts/${ownAccount._id}/statement/csv?startDate=2026-01-02&endDate=2026-01-02&page=2&limit=1`, tokens.customer),
        { params: Promise.resolve({ id: ownAccount._id.toString() }) },
      );
      assert.equal(csvResponse.status, 200);
      assert.equal(csvResponse.headers.get("content-type"), "text/csv; charset=utf-8");
      assert.match(csvResponse.headers.get("content-disposition") ?? "", /^attachment; filename="account-statement-/);
      assert.equal(csvResponse.headers.get("cache-control"), "private, no-store");
      const csvText = await csvResponse.text();
      assert.equal(csvText.charCodeAt(0), 0xFEFF);
      assert.ok(csvText.includes("500.10"));
      assert.ok(csvText.includes("OPENING_BALANCE"));
      assert.ok(csvText.includes("CLOSING_BALANCE"));
      assert.ok(csvText.includes(transactionIds[0]));
      assert.equal(csvText.includes(transactionIds[1]), false);
      assert.equal((await downloadAccountStatementCsv(
        accountRequest(`/accounts/${otherAccount._id}/statement/csv`, tokens.customer),
        { params: Promise.resolve({ id: otherAccount._id.toString() }) },
      )).status, 404);
      assert.equal((await downloadAccountStatementCsv(
        accountRequest(`/accounts/${ownAccount._id}/statement/csv`, tokens.staff),
        { params: Promise.resolve({ id: ownAccount._id.toString() }) },
      )).status, 200);
      assert.equal((await downloadAccountStatementCsv(
        accountRequest(`/accounts/${ownAccount._id}/statement/csv`, tokens.admin),
        { params: Promise.resolve({ id: ownAccount._id.toString() }) },
      )).status, 200);
      assert.equal((await downloadAccountStatementCsv(
        accountRequest(`/accounts/${ownAccount._id}/statement/csv`),
        { params: Promise.resolve({ id: ownAccount._id.toString() }) },
      )).status, 401);
      assert.equal((await getAccountStatement(accountRequest(`/accounts/${ownAccount._id}/statement`), {
        params: Promise.resolve({ id: ownAccount._id.toString() }),
      })).status, 401);

      const filteredResponse = await ownRoute(tokens.customer, ownAccount._id.toString(), "?startDate=2026-01-02&endDate=2026-01-02&page=1&limit=1");
      const filteredBody = await filteredResponse.json() as { data: { openingBalance: string; closingBalance: string; transactions: Array<{ transactionId: string }> } };
      assert.equal(filteredResponse.status, 200);
      assert.equal(filteredBody.data.openingBalance, "0.00");
      assert.equal(filteredBody.data.closingBalance, "500.10");
      assert.deepEqual(filteredBody.data.transactions.map((transaction) => transaction.transactionId), [transactionIds[0]]);
      assert.equal((await ownRoute(tokens.customer, ownAccount._id.toString(), "?startDate=2026-02-30")).status, 400);
      assert.equal((await ownRoute(tokens.customer, ownAccount._id.toString(), `?accountId=${otherAccount._id}`)).status, 400);
    } finally {
      if (mongoose.connection.readyState === 1) {
        await Transaction.deleteMany({ transactionId: { $in: transactionIds } });
        await BankAccount.deleteMany({ _id: { $in: accountIds } });
        await User.deleteMany({ email: { $in: Object.values(emails) } });
      }
    }
  },
);

test(
  "RBAC enforces dashboard roles, admin API access, active status, and database role changes",
  { skip: process.env.RUN_DB_INTEGRATION_TESTS !== "true" },
  async () => {
    loadIntegrationTestEnvironment();

    const suffix = randomUUID();
    const emails = {
      admin: `task07-admin-${suffix}@example.com`,
      staff: `task07-staff-${suffix}@example.com`,
      customer: `task07-customer-${suffix}@example.com`,
      inactive: `task07-inactive-${suffix}@example.com`,
    };
    const passwordHash = await hashPassword("Task07 Integration Password 2026!");
    const roles = ["ADMIN", "STAFF", "CUSTOMER"] as const;
    const dashboardPaths = {
      ADMIN: "/admin/dashboard",
      STAFF: "/staff/dashboard",
      CUSTOMER: "/dashboard",
    } as const;

    try {
      await connectToDatabase();
      const [admin, staff, customer, inactiveAdmin] = await User.create([
        { name: "Task Seven Admin", email: emails.admin, passwordHash, role: "ADMIN" },
        { name: "Task Seven Staff", email: emails.staff, passwordHash, role: "STAFF" },
        { name: "Task Seven Customer", email: emails.customer, passwordHash, role: "CUSTOMER" },
        { name: "Task Seven Inactive Admin", email: emails.inactive, passwordHash, role: "ADMIN", status: "INACTIVE" },
      ]);
      const tokens = {
        ADMIN: await createSessionToken(admin._id.toString()),
        STAFF: await createSessionToken(staff._id.toString()),
        CUSTOMER: await createSessionToken(customer._id.toString()),
      };
      const inactiveToken = await createSessionToken(inactiveAdmin._id.toString());

      for (const role of roles) {
        for (const dashboardRole of roles) {
          if (dashboardRole === role) {
            const authorizedUser = await requireDashboardRole(
              dashboardRole,
              tokens[role],
            );
            assert.equal(authorizedUser.role, role);
          } else {
            await assert.rejects(
              requireDashboardRole(dashboardRole, tokens[role]),
              (error: unknown) =>
                redirectDestination(error) === dashboardPaths[role],
            );
          }
        }
      }

      await assert.rejects(
        requireDashboardRole("ADMIN", ""),
        (error: unknown) => redirectDestination(error) === "/login",
      );

      const adminResponse = await getAdminOverview(
        adminOverviewRequest(tokens.ADMIN),
      );
      const staffResponse = await getAdminOverview(
        adminOverviewRequest(tokens.STAFF),
      );
      const customerResponse = await getAdminOverview(
        adminOverviewRequest(tokens.CUSTOMER),
      );
      const inactiveResponse = await getAdminOverview(
        adminOverviewRequest(inactiveToken),
      );
      const invalidResponse = await getAdminOverview(
        adminOverviewRequest("invalid-token"),
      );
      const expiredResponse = await getAdminOverview(
        adminOverviewRequest(await createExpiredToken(admin._id.toString())),
      );

      assert.equal(adminResponse.status, 200);
      assert.deepEqual(await adminResponse.json(), {
        status: "success",
        data: {
          access: "ADMIN",
          capabilities: ["USER_MANAGEMENT", "BANKING_SYSTEM_MANAGEMENT"],
        },
      });
      assert.equal(staffResponse.status, 403);
      assert.equal(customerResponse.status, 403);
      assert.equal(inactiveResponse.status, 401);
      assert.equal(invalidResponse.status, 401);
      assert.equal(expiredResponse.status, 401);

      await User.updateOne({ _id: customer._id }, { role: "ADMIN" });
      const updatedRoleUser = await requireRole("ADMIN", tokens.CUSTOMER);
      const updatedRoleResponse = await getAdminOverview(
        adminOverviewRequest(tokens.CUSTOMER),
      );

      assert.equal(updatedRoleUser.role, "ADMIN");
      assert.equal(updatedRoleResponse.status, 200);
    } finally {
      if (mongoose.connection.readyState === 1) {
        await User.deleteMany({ email: { $in: Object.values(emails) } });
        assert.equal(
          await User.exists({ email: { $in: Object.values(emails) } }),
          null,
        );
      }
    }
  },
);

test(
  "registration API stores a customer, rejects duplicate email, and omits secrets",
  { skip: process.env.RUN_DB_INTEGRATION_TESTS !== "true" },
  async () => {
    loadIntegrationTestEnvironment();

    const email = `task03-${randomUUID()}@example.com`;
    const password = "Task03 Integration Password 2026!";
    const body = { name: "Task Three Test Customer", email, password };
    let createdByApi = false;

    try {
      const response = await POST(registrationRequest(body));
      const responseText = await response.text();
      const responseBody = JSON.parse(responseText) as {
        data?: { user?: Record<string, unknown> };
      };

      assert.equal(response.status, 201);
      createdByApi = true;
      assert.equal(responseText.includes(password), false);
      assert.equal(responseText.includes("passwordHash"), false);
      assert.equal(responseBody.data?.user?.email, email);
      assert.equal(responseBody.data?.user?.role, "CUSTOMER");

      const storedUser = await User.findOne({ email }).select("+passwordHash");
      assert.ok(storedUser);
      assert.notEqual(storedUser.passwordHash, password);
      assert.equal(await verifyPassword(password, storedUser.passwordHash), true);

      const duplicateResponse = await POST(registrationRequest(body));
      assert.equal(duplicateResponse.status, 409);
    } finally {
      if (mongoose.connection.readyState === 1) {
        const deletion = await User.deleteOne({ email });
        if (createdByApi) {
          assert.equal(deletion.deletedCount, 1);
        }
        assert.equal(await User.exists({ email }), null);
      }
    }
  },
);

test(
  "login API validates credentials and status, sets an HTTP-only cookie, and omits secrets",
  { skip: process.env.RUN_DB_INTEGRATION_TESTS !== "true" },
  async () => {
    loadIntegrationTestEnvironment();

    const suffix = randomUUID();
    const activeEmail = `task04-active-${suffix}@example.com`;
    const inactiveEmail = `task04-inactive-${suffix}@example.com`;
    const unknownEmail = `task04-unknown-${suffix}@example.com`;
    const password = "Task04 Integration Password 2026!";
    const passwordHash = await hashPassword(password);
    const emails = [activeEmail, inactiveEmail];

    try {
      await connectToDatabase();
      await User.create([
        {
          name: "Task Four Active Customer",
          email: activeEmail,
          passwordHash,
          role: "CUSTOMER",
          status: "ACTIVE",
        },
        {
          name: "Task Four Inactive Customer",
          email: inactiveEmail,
          passwordHash,
          role: "CUSTOMER",
          status: "INACTIVE",
        },
      ]);

      const unknownResponse = await login(
        loginRequest({ email: unknownEmail, password }),
      );
      const wrongPasswordResponse = await login(
        loginRequest({ email: activeEmail, password: "wrong password" }),
      );
      const unknownBody = await unknownResponse.json();
      const wrongPasswordBody = await wrongPasswordResponse.json();

      assert.equal(unknownResponse.status, 401);
      assert.equal(wrongPasswordResponse.status, 401);
      assert.equal(unknownBody.message, wrongPasswordBody.message);
      assert.equal(unknownResponse.headers.has("set-cookie"), false);

      const originalNodeEnv = process.env.NODE_ENV;
      let loginResponse: Response;
      try {
        Reflect.set(process.env, "NODE_ENV", "production");
        loginResponse = await login(
          loginRequest({ email: ` ${activeEmail.toUpperCase()} `, password }),
        );
      } finally {
        if (originalNodeEnv === undefined) {
          Reflect.deleteProperty(process.env, "NODE_ENV");
        } else {
          Reflect.set(process.env, "NODE_ENV", originalNodeEnv);
        }
      }
      const responseText = await loginResponse.text();
      const responseBody = JSON.parse(responseText) as {
        data?: { user?: Record<string, unknown> };
      };
      const setCookie = loginResponse.headers.get("set-cookie");
      const storedUser = await User.findOne({ email: activeEmail });

      assert.equal(loginResponse.status, 200);
      assert.equal(responseBody.data?.user?.id, storedUser?._id.toString());
      assert.equal(responseBody.data?.user?.email, activeEmail);
      assert.equal(responseBody.data?.user?.role, "CUSTOMER");
      assert.equal(responseBody.data?.user?.status, "ACTIVE");
      assert.equal(responseText.includes("passwordHash"), false);
      assert.equal(responseText.includes(password), false);
      assert.ok(setCookie);
      assert.match(setCookie, new RegExp(`^${AUTH_COOKIE_NAME}=`));
      assert.match(setCookie, /HttpOnly/i);
      assert.match(setCookie, /SameSite=Lax/i);
      assert.match(setCookie, /Path=\//i);
      assert.match(setCookie, /Max-Age=604800/i);
      assert.match(setCookie, /; Secure/i);

      const token = setCookie.slice(setCookie.indexOf("=") + 1).split(";")[0];
      const session = await verifySessionToken(token);
      assert.equal(session?.userId, responseBody.data?.user?.id);

      const inactiveResponse = await login(
        loginRequest({ email: inactiveEmail, password }),
      );
      assert.equal(inactiveResponse.status, 403);
      assert.equal(inactiveResponse.headers.has("set-cookie"), false);
    } finally {
      if (mongoose.connection.readyState === 1) {
        await User.deleteMany({ email: { $in: emails } });
        assert.equal(await User.exists({ email: { $in: emails } }), null);
      }
    }
  },
);

test("admin user schemas validate roles, protected fields, and bounded pagination", () => {
  assert.equal(
    adminUserQuerySchema.safeParse({ page: "2", limit: "100", role: "STAFF" }).success,
    true,
  );
  assert.equal(adminUserQuerySchema.safeParse({ limit: "1000" }).success, false);
  assert.equal(adminUserQuerySchema.safeParse({ role: "OWNER" }).success, false);
  assert.equal(
    adminUserCreateSchema.safeParse({ name: "Staff User", email: "s@example.com", password: "long enough password", role: "ADMIN" }).success,
    false,
  );
  assert.equal(adminUserUpdateSchema.safeParse({}).success, false);
  assert.equal(adminUserUpdateSchema.safeParse({ email: "changed@example.com" }).success, false);
  assert.equal(adminUserUpdateSchema.safeParse({ passwordHash: "changed" }).success, false);
});

test("admin user APIs require an admin session", async () => {
  const listResponse = await getAdminUsers(adminUsersRequest());
  const createResponse = await createAdminUser(
    adminUserMutationRequest(undefined, "POST", {
      name: "Blocked Staff",
      email: "blocked@example.com",
      password: "long enough password",
      role: "STAFF",
    }),
  );
  const detailResponse = await getAdminUser(
    adminUserDetailRequest(undefined, "507f1f77bcf86cd799439011"),
    { params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }) },
  );

  assert.equal(listResponse.status, 401);
  assert.equal(createResponse.status, 401);
  assert.equal(detailResponse.status, 401);
});

test(
  "admin user APIs search, filter, paginate, protect credentials, and enforce update rules",
  { skip: process.env.RUN_DB_INTEGRATION_TESTS !== "true" },
  async () => {
    loadIntegrationTestEnvironment();
    const suffix = randomUUID();
    const emails = {
      admin: `task08-admin-${suffix}@example.com`,
      staff: `task08-staff-${suffix}@example.com`,
      customer: `task08-customer-${suffix}@example.com`,
    };
    const createdEmails: string[] = [];
    const password = "Task08 Integration Password 2026!";
    const passwordHash = await hashPassword(password);

    try {
      await connectToDatabase();
      const [admin, staff, customer] = await User.create([
        { name: `Task Eight Admin ${suffix}`, email: emails.admin, passwordHash, role: "ADMIN" },
        { name: `Task Eight Staff ${suffix}`, email: emails.staff, passwordHash, role: "STAFF" },
        { name: `Task Eight Customer ${suffix}`, email: emails.customer, passwordHash, role: "CUSTOMER" },
      ]);
      const token = await createSessionToken(admin._id.toString());
      const adminId = admin._id.toString();
      const staffId = staff._id.toString();
      const staffToken = await createSessionToken(staffId);
      const customerToken = await createSessionToken(customer._id.toString());

      assert.equal((await getAdminUsers(adminUsersRequest(undefined))).status, 401);
      assert.equal((await getAdminUsers(adminUsersRequest(staffToken))).status, 403);
      assert.equal((await getAdminUsers(adminUsersRequest(customerToken))).status, 403);

      const invalidQuery = await getAdminUsers(adminUsersRequest(token, "?page=0&limit=10000"));
      assert.equal(invalidQuery.status, 400);
      const searchResponse = await getAdminUsers(
        adminUsersRequest(token, `?search=${encodeURIComponent(suffix)}&page=1&limit=2`),
      );
      const searchText = await searchResponse.text();
      const searchBody = JSON.parse(searchText) as {
        data: { users: Array<Record<string, unknown>>; total: number; page: number; totalPages: number };
      };
      assert.equal(searchResponse.status, 200);
      assert.equal(searchBody.data.total, 3);
      assert.equal(searchBody.data.users.length, 2);
      assert.equal(searchBody.data.page, 1);
      assert.equal(searchBody.data.totalPages, 2);
      assert.equal(searchText.includes("passwordHash"), false);
      assert.equal(searchText.includes(password), false);

      const staffResponse = await getAdminUsers(
        adminUsersRequest(token, `?search=${encodeURIComponent(suffix)}&role=STAFF&status=ACTIVE`),
      );
      const staffBody = await staffResponse.json() as { data: { users: Array<{ id: string }> } };
      assert.equal(staffResponse.status, 200);
      assert.deepEqual(staffBody.data.users.map((user) => user.id), [staffId]);

      const detailsResponse = await getAdminUser(
        adminUserDetailRequest(token, staffId),
        { params: Promise.resolve({ id: staffId }) },
      );
      const detailsText = await detailsResponse.text();
      assert.equal(detailsResponse.status, 200);
      assert.equal(detailsText.includes("passwordHash"), false);
      assert.equal(detailsText.includes(password), false);
      assert.equal((await getAdminUser(
        adminUserDetailRequest(token, "not-an-object-id"),
        { params: Promise.resolve({ id: "not-an-object-id" }) },
      )).status, 400);
      const missingId = new mongoose.Types.ObjectId().toString();
      assert.equal((await getAdminUser(
        adminUserDetailRequest(token, missingId),
        { params: Promise.resolve({ id: missingId }) },
      )).status, 404);

      for (const role of ["STAFF", "CUSTOMER"] as const) {
        const newEmail = `task08-created-${role.toLowerCase()}-${suffix}@example.com`;
        createdEmails.push(newEmail);
        const response = await createAdminUser(adminUserMutationRequest(token, "POST", {
          name: `Created ${role}`,
          email: newEmail.toUpperCase(),
          password,
          role,
        }));
        const text = await response.text();
        const body = JSON.parse(text) as { data: { user: { email: string; role: string; status: string } } };
        assert.equal(response.status, 201);
        assert.equal(body.data.user.email, newEmail);
        assert.equal(body.data.user.role, role);
        assert.equal(body.data.user.status, "ACTIVE");
        assert.equal(text.includes(password), false);
        assert.equal(text.includes("passwordHash"), false);
        const stored = await User.findOne({ email: newEmail }).select("+passwordHash");
        assert.ok(stored);
        assert.equal(await verifyPassword(password, stored.passwordHash), true);
        await assert.rejects(async () => {
          await User.create({ name: "Duplicate", email: newEmail, passwordHash, role });
        });
        const duplicate = await createAdminUser(adminUserMutationRequest(token, "POST", {
          name: "Duplicate", email: newEmail, password, role,
        }));
        assert.equal(duplicate.status, 409);
      }

      const noAdminEmail = `task08-no-admin-${suffix}@example.com`;
      createdEmails.push(noAdminEmail);
      assert.equal((await createAdminUser(adminUserMutationRequest(token, "POST", {
        name: "No Admin Promotion", email: noAdminEmail, password, role: "ADMIN",
      }))).status, 400);

      const protectedUpdate = await updateAdminUser(
        adminUserDetailRequest(token, staffId, "PATCH", { email: "attacker@example.com" }),
        { params: Promise.resolve({ id: staffId }) },
      );
      const emptyUpdate = await updateAdminUser(
        adminUserDetailRequest(token, staffId, "PATCH", {}),
        { params: Promise.resolve({ id: staffId }) },
      );
      const selfRoleUpdate = await updateAdminUser(
        adminUserDetailRequest(token, adminId, "PATCH", { role: "STAFF" }),
        { params: Promise.resolve({ id: adminId }) },
      );
      const selfDeactivate = await updateAdminUser(
        adminUserDetailRequest(token, adminId, "PATCH", { status: "INACTIVE" }),
        { params: Promise.resolve({ id: adminId }) },
      );
      assert.equal(protectedUpdate.status, 400);
      assert.equal(emptyUpdate.status, 400);
      assert.equal(selfRoleUpdate.status, 400);
      assert.equal(selfDeactivate.status, 400);

      const updateResponse = await updateAdminUser(
        adminUserDetailRequest(token, staffId, "PATCH", { name: "Updated Staff", role: "CUSTOMER", status: "INACTIVE" }),
        { params: Promise.resolve({ id: staffId }) },
      );
      const updateBody = await updateResponse.json() as { data: { user: { name: string; role: string; status: string } } };
      assert.equal(updateResponse.status, 200);
      assert.equal(updateBody.data.user.name, "Updated Staff");
      assert.equal(updateBody.data.user.role, "CUSTOMER");
      assert.equal(updateBody.data.user.status, "INACTIVE");
      assert.equal((await User.findById(customer._id))?.status, "ACTIVE");
    } finally {
      if (mongoose.connection.readyState === 1) {
        await User.deleteMany({ email: { $in: [...Object.values(emails), ...createdEmails] } });
        assert.equal(await User.exists({ email: { $in: [...Object.values(emails), ...createdEmails] } }), null);
      }
    }
  },
);

test("bank account schemas are strict and Decimal128 balances reject negative amounts", async () => {
  const userId = new mongoose.Types.ObjectId();
  const valid = createBankAccountSchema.safeParse({ userId: userId.toString(), accountType: "SAVINGS" });
  assert.equal(valid.success, true);
  assert.equal(createBankAccountSchema.safeParse({ userId: "bad-id", accountType: "SAVINGS" }).success, false);
  assert.equal(createBankAccountSchema.safeParse({ userId: userId.toString(), accountType: "LOAN" }).success, false);
  assert.equal(createBankAccountSchema.safeParse({ userId: userId.toString(), accountType: "CURRENT", balance: 200 }).success, false);
  assert.equal(adminAccountsQuerySchema.safeParse({ page: "1", limit: "100", status: "FROZEN" }).success, true);
  assert.equal(adminAccountsQuerySchema.safeParse({ limit: "1000" }).success, false);
  assert.equal(updateAccountStatusSchema.safeParse({ status: "CLOSED" }).success, true);
  assert.equal(updateAccountStatusSchema.safeParse({ status: "ACTIVE", balance: 0 }).success, false);

  const defaultAccount = new BankAccount({
    accountNumber: generateAccountNumber(),
    userId,
    accountType: "SAVINGS",
  });
  assert.equal(defaultAccount.balance.toString(), "0.00");
  assert.equal(defaultAccount.currency, "BDT");
  assert.equal(defaultAccount.status, "ACTIVE");
  const negativeAccount = new BankAccount({
    accountNumber: generateAccountNumber(),
    userId,
    accountType: "CURRENT",
    balance: "-0.01",
  });
  await assert.rejects(() => negativeAccount.validate());
  for (const balance of ["0.001", "100000000000000000000000000000000"]) {
    const invalidBalanceAccount = new BankAccount({
      accountNumber: generateAccountNumber(),
      userId,
      accountType: "SAVINGS",
      balance,
    });
    await assert.rejects(() => invalidBalanceAccount.validate());
  }
  const invalidTypeAccount = new BankAccount({
    accountNumber: generateAccountNumber(),
    userId,
    accountType: "LOAN",
  });
  await assert.rejects(() => invalidTypeAccount.validate());
  assert.equal(/^NB[\dA-F]{16}$/.test(generateAccountNumber()), true);
});

test("account number collisions retry with a fresh secure number and server-owned defaults", async () => {
  let attempts = 0;
  const accountNumberValues = ["NB0000000000000001", "NB0000000000000002"];
  let captured: Record<string, unknown> | undefined;
  const result = await createBankAccountWithRetry(
    { userId: new mongoose.Types.ObjectId().toString(), accountType: "CURRENT" },
    {
      generate: () => accountNumberValues[attempts] ?? "NB0000000000000003",
      create: async (value) => {
        attempts += 1;
        if (attempts === 1) throw { code: 11000, keyPattern: { accountNumber: 1 } };
        captured = value;
        return {} as never;
      },
    },
  );

  assert.deepEqual(result, {});
  assert.equal(attempts, 2);
  assert.equal(captured?.accountNumber, "NB0000000000000002");
  assert.equal(captured?.accountType, "CURRENT");
  assert.equal(captured?.balance, "0.00");
  assert.equal(captured?.currency, "BDT");
  assert.equal(captured?.status, "ACTIVE");
});

test(
  "account APIs authorize roles, isolate customer data, apply status transitions, and protect balances",
  { skip: process.env.RUN_DB_INTEGRATION_TESTS !== "true" },
  async () => {
    loadIntegrationTestEnvironment();
    const suffix = randomUUID();
    const emails = {
      admin: `task09-admin-${suffix}@example.com`,
      staff: `task09-staff-${suffix}@example.com`,
      customer: `task09-customer-${suffix}@example.com`,
      otherCustomer: `task09-other-${suffix}@example.com`,
      inactive: `task09-inactive-${suffix}@example.com`,
    };
    const createdAccountIds: string[] = [];
    const createdAccountNumbers: string[] = [];
    const passwordHash = await hashPassword("Task09 Integration Password 2026!");

    try {
      await connectToDatabase();
      await BankAccount.init();
      const [admin, staff, customer, otherCustomer, inactive] = await User.create([
        { name: `Task Nine Admin ${suffix}`, email: emails.admin, passwordHash, role: "ADMIN" },
        { name: `Task Nine Staff ${suffix}`, email: emails.staff, passwordHash, role: "STAFF" },
        { name: `Task Nine Customer ${suffix}`, email: emails.customer, passwordHash, role: "CUSTOMER" },
        { name: `Task Nine Other ${suffix}`, email: emails.otherCustomer, passwordHash, role: "CUSTOMER" },
        { name: `Task Nine Inactive ${suffix}`, email: emails.inactive, passwordHash, role: "CUSTOMER", status: "INACTIVE" },
      ]);
      const tokens = {
        admin: await createSessionToken(admin._id.toString()),
        staff: await createSessionToken(staff._id.toString()),
        customer: await createSessionToken(customer._id.toString()),
        otherCustomer: await createSessionToken(otherCustomer._id.toString()),
      };

      assert.equal((await getAdminAccounts(accountRequest("/admin/accounts"))).status, 401);
      assert.equal((await getAdminAccounts(accountRequest("/admin/accounts", tokens.customer))).status, 403);
      assert.equal((await createAdminAccount(accountRequest("/admin/accounts", undefined, "POST", {
        userId: customer._id.toString(), accountType: "SAVINGS",
      }))).status, 401);
      assert.equal((await createAdminAccount(accountRequest("/admin/accounts", tokens.customer, "POST", {
        userId: customer._id.toString(), accountType: "SAVINGS",
      }))).status, 403);
      assert.equal((await createAdminAccount(accountRequest("/admin/accounts", tokens.admin, "POST", {
        userId: customer._id.toString(), accountType: "SAVINGS", balance: 100,
      }))).status, 400);
      assert.equal((await createAdminAccount(accountRequest("/admin/accounts", tokens.admin, "POST", {
        userId: new mongoose.Types.ObjectId().toString(), accountType: "SAVINGS",
      }))).status, 404);
      assert.equal((await createAdminAccount(accountRequest("/admin/accounts", tokens.admin, "POST", {
        userId: inactive._id.toString(), accountType: "SAVINGS",
      }))).status, 409);

      const firstResponse = await createAdminAccount(accountRequest("/admin/accounts", tokens.admin, "POST", {
        userId: customer._id.toString(), accountType: "SAVINGS",
      }));
      const firstText = await firstResponse.text();
      const firstBody = JSON.parse(firstText) as { data: { account: Record<string, unknown> } };
      assert.equal(firstResponse.status, 201);
      assert.equal(firstBody.data.account.balance, "0.00");
      assert.equal(firstBody.data.account.currency, "BDT");
      assert.equal(firstBody.data.account.status, "ACTIVE");
      assert.equal(firstText.includes("passwordHash"), false);
      assert.equal(firstText.includes("Task09 Integration Password"), false);
      const firstId = String(firstBody.data.account.id);
      const firstNumber = String(firstBody.data.account.accountNumber);
      createdAccountIds.push(firstId);
      createdAccountNumbers.push(firstNumber);

      const secondResponse = await createAdminAccount(accountRequest("/admin/accounts", tokens.staff, "POST", {
        userId: customer._id.toString(), accountType: "CURRENT",
      }));
      const secondBody = await secondResponse.json() as { data: { account: { id: string; accountNumber: string } } };
      assert.equal(secondResponse.status, 201);
      createdAccountIds.push(secondBody.data.account.id);
      createdAccountNumbers.push(secondBody.data.account.accountNumber);

      const otherResponse = await createAdminAccount(accountRequest("/admin/accounts", tokens.admin, "POST", {
        userId: otherCustomer._id.toString(), accountType: "SAVINGS",
      }));
      const otherBody = await otherResponse.json() as { data: { account: { id: string; accountNumber: string } } };
      assert.equal(otherResponse.status, 201);
      createdAccountIds.push(otherBody.data.account.id);
      createdAccountNumbers.push(otherBody.data.account.accountNumber);

      const duplicateAccount = new BankAccount({
        accountNumber: firstNumber,
        userId: customer._id,
        accountType: "CURRENT",
      });
      await assert.rejects(() => duplicateAccount.save());

      for (const token of [tokens.admin, tokens.staff]) {
        const response = await getAdminAccounts(accountRequest(`/admin/accounts?search=${encodeURIComponent(suffix)}&page=1&limit=2`, token));
        assert.equal(response.status, 200);
        if (token === tokens.admin) {
          const body = await response.json() as { data: { accounts: unknown[]; total: number; page: number; totalPages: number } };
          assert.equal(body.data.accounts.length, 2);
          assert.equal(body.data.total, 3);
          assert.equal(body.data.page, 1);
          assert.equal(body.data.totalPages, 2);
        }
      }
      const filteredResponse = await getAdminAccounts(accountRequest(
        `/admin/accounts?search=${encodeURIComponent(suffix)}&accountType=CURRENT&status=ACTIVE`,
        tokens.staff,
      ));
      const filteredBody = await filteredResponse.json() as { data: { accounts: Array<{ id: string; accountHolder: { email: string } }>; total: number } };
      assert.equal(filteredBody.data.total, 1);
      assert.equal(filteredBody.data.accounts[0].accountHolder.email, emails.customer);
      const detailsResponse = await getAdminAccount(accountRequest(`/admin/accounts/${firstId}`, tokens.staff), {
        params: Promise.resolve({ id: firstId }),
      });
      assert.equal(detailsResponse.status, 200);
      assert.equal((await getAdminAccount(accountRequest("/admin/accounts/not-an-id", tokens.admin), {
        params: Promise.resolve({ id: "not-an-id" }),
      })).status, 400);
      const missingId = new mongoose.Types.ObjectId().toString();
      assert.equal((await getAdminAccount(accountRequest(`/admin/accounts/${missingId}`, tokens.admin), {
        params: Promise.resolve({ id: missingId }),
      })).status, 404);

      const ownAccountsResponse = await getMyAccounts(accountRequest("/accounts", tokens.customer));
      const ownAccountsBody = await ownAccountsResponse.json() as { data: { accounts: Array<{ id: string }> } };
      assert.equal(ownAccountsResponse.status, 200);
      assert.equal(ownAccountsBody.data.accounts.length, 2);
      assert.deepEqual(new Set(ownAccountsBody.data.accounts.map((account) => account.id)), new Set(createdAccountIds.slice(0, 2)));
      assert.equal((await getMyAccounts(accountRequest("/accounts", tokens.staff))).status, 403);
      assert.equal((await getMyAccount(accountRequest(`/accounts/${firstId}`, tokens.customer), {
        params: Promise.resolve({ id: firstId }),
      })).status, 200);
      assert.equal((await getMyAccount(accountRequest(`/accounts/${otherBody.data.account.id}`, tokens.customer), {
        params: Promise.resolve({ id: otherBody.data.account.id }),
      })).status, 404);
      assert.equal((await getMyAccount(accountRequest("/accounts/nope", tokens.customer), {
        params: Promise.resolve({ id: "nope" }),
      })).status, 400);

      assert.equal((await updateAdminAccount(accountRequest(`/admin/accounts/${firstId}`, tokens.staff, "PATCH", { status: "FROZEN" }), {
        params: Promise.resolve({ id: firstId }),
      })).status, 403);
      assert.equal((await updateAdminAccount(accountRequest(`/admin/accounts/${firstId}`, tokens.customer, "PATCH", { status: "FROZEN" }), {
        params: Promise.resolve({ id: firstId }),
      })).status, 403);
      assert.equal((await updateAdminAccount(accountRequest(`/admin/accounts/${firstId}`, tokens.admin, "PATCH", { balance: 500 }), {
        params: Promise.resolve({ id: firstId }),
      })).status, 400);

      const frozenResponse = await updateAdminAccount(accountRequest(`/admin/accounts/${firstId}`, tokens.admin, "PATCH", { status: "FROZEN" }), {
        params: Promise.resolve({ id: firstId }),
      });
      assert.equal(frozenResponse.status, 200);
      const closedResponse = await updateAdminAccount(accountRequest(`/admin/accounts/${firstId}`, tokens.admin, "PATCH", { status: "CLOSED" }), {
        params: Promise.resolve({ id: firstId }),
      });
      assert.equal(closedResponse.status, 200);
      const reopenResponse = await updateAdminAccount(accountRequest(`/admin/accounts/${firstId}`, tokens.admin, "PATCH", { status: "ACTIVE" }), {
        params: Promise.resolve({ id: firstId }),
      });
      assert.equal(reopenResponse.status, 409);
    } finally {
      if (mongoose.connection.readyState === 1) {
        await BankAccount.deleteMany({
          $or: [
            ...(createdAccountIds.length ? [{ _id: { $in: createdAccountIds } }] : []),
            ...(createdAccountNumbers.length ? [{ accountNumber: { $in: createdAccountNumbers } }] : []),
          ],
        });
        await User.deleteMany({ email: { $in: Object.values(emails) } });
        assert.equal(await User.exists({ email: { $in: Object.values(emails) } }), null);
      }
    }
  },
);

test("transaction model and query validation enforce exact positive amounts and bounded filters", async () => {
  const generatedId = generateTransactionId();
  assert.match(generatedId, /^TXN-[\dA-F]{24}$/);
  const valid = new Transaction({ transactionType: "DEPOSIT", amount: "0.01" });
  assert.match(valid.transactionId, /^TXN-[\dA-F]{24}$/);
  await valid.validate();
  assert.equal(valid.currency, "BDT");
  assert.equal(valid.status, "PENDING");
  assert.equal(Transaction.schema.path("transactionId").options.unique, true);

  for (const amount of ["0", "-0.01", "0.001", "100000000000000000000000000000000"]) {
    const invalid = new Transaction({
      transactionId: generateTransactionId(),
      transactionType: "WITHDRAWAL",
      amount,
    });
    await assert.rejects(() => invalid.validate());
  }
  const invalidType = new Transaction({
    transactionId: generateTransactionId(),
    transactionType: "UNKNOWN",
    amount: "1.00",
  });
  await assert.rejects(() => invalidType.validate());

  assert.equal(transactionQuerySchema.safeParse({ page: "2", limit: "100", transactionType: "TRANSFER", status: "COMPLETED" }).success, true);
  assert.equal(transactionQuerySchema.safeParse({ page: "0" }).success, false);
  assert.equal(transactionQuerySchema.safeParse({ limit: "101" }).success, false);
  assert.equal(transactionQuerySchema.safeParse({ status: "SETTLED" }).success, false);
  assert.equal(transactionQuerySchema.safeParse({ search: "x".repeat(101) }).success, false);
  assert.equal(transactionQuerySchema.safeParse({ startDate: "2026-02-30" }).success, false);
  assert.equal(transactionQuerySchema.safeParse({ startDate: "2026-12-02", endDate: "2026-12-01" }).success, false);
  assert.equal(transactionQuerySchema.safeParse({ userId: new mongoose.Types.ObjectId().toString() }).success, false);
});

test("transaction read APIs require authentication and expose no creation handlers", async () => {
  const adminList = await getAdminTransactions(accountRequest("/admin/transactions"));
  const customerList = await getMyTransactions(accountRequest("/transactions"));
  const adminDetails = await getAdminTransaction(accountRequest("/admin/transactions/507f1f77bcf86cd799439011"), {
    params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }),
  });
  const customerDetails = await getMyTransaction(accountRequest("/transactions/507f1f77bcf86cd799439011"), {
    params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }),
  });

  assert.equal(adminList.status, 401);
  assert.equal(customerList.status, 401);
  assert.equal(adminDetails.status, 401);
  assert.equal(customerDetails.status, 401);
  assert.equal("POST" in adminTransactionsRoute, false);
  assert.equal("POST" in customerTransactionsRoute, false);
});

test(
  "transaction APIs authorize staff/admin and restrict customers to their own account transactions",
  { skip: process.env.RUN_DB_INTEGRATION_TESTS !== "true" },
  async () => {
    loadIntegrationTestEnvironment();
    const suffix = randomUUID().replaceAll("-", "").toUpperCase();
    const emails = {
      admin: `task10-admin-${suffix}@example.com`,
      staff: `task10-staff-${suffix}@example.com`,
      customer: `task10-customer-${suffix}@example.com`,
      other: `task10-other-${suffix}@example.com`,
    };
    const transactionIds = [
      `TXN-${suffix}-DEPOSIT`,
      `TXN-${suffix}-TRANSFER`,
      `TXN-${suffix}-OTHER`,
    ];
    const accountIds: string[] = [];
    const passwordHash = await hashPassword("Task10 Integration Password 2026!");

    try {
      await connectToDatabase();
      await BankAccount.init();
      await Transaction.init();
      const [admin, staff, customer, other] = await User.create([
        { name: "Task Ten Admin", email: emails.admin, passwordHash, role: "ADMIN" },
        { name: "Task Ten Staff", email: emails.staff, passwordHash, role: "STAFF" },
        { name: "Task Ten Customer", email: emails.customer, passwordHash, role: "CUSTOMER" },
        { name: "Task Ten Other Customer", email: emails.other, passwordHash, role: "CUSTOMER" },
      ]);
      const tokens = {
        admin: await createSessionToken(admin._id.toString()),
        staff: await createSessionToken(staff._id.toString()),
        customer: await createSessionToken(customer._id.toString()),
      };
      const [customerSavings, customerCurrent, otherSavings] = await BankAccount.create([
        { accountNumber: `NB${suffix.slice(0, 12)}01`, userId: customer._id, accountType: "SAVINGS" },
        { accountNumber: `NB${suffix.slice(0, 12)}02`, userId: customer._id, accountType: "CURRENT" },
        { accountNumber: `NB${suffix.slice(0, 12)}03`, userId: other._id, accountType: "SAVINGS" },
      ]);
      accountIds.push(customerSavings._id.toString(), customerCurrent._id.toString(), otherSavings._id.toString());
      const [deposit, transfer, otherDeposit] = await Transaction.create([
        {
          transactionId: transactionIds[0], transactionType: "DEPOSIT", toAccount: customerSavings._id,
          amount: "1250.50", status: "COMPLETED", description: "Test deposit", createdBy: admin._id,
        },
        {
          transactionId: transactionIds[1], transactionType: "TRANSFER", fromAccount: customerSavings._id,
          toAccount: customerCurrent._id, amount: "200.25", status: "PENDING", createdBy: staff._id,
        },
        {
          transactionId: transactionIds[2], transactionType: "DEPOSIT", toAccount: otherSavings._id,
          amount: "99.00", status: "FAILED", createdBy: admin._id,
        },
      ]);

      assert.equal((await getAdminTransactions(accountRequest("/admin/transactions", tokens.admin))).status, 200);
      assert.equal((await getAdminTransactions(accountRequest("/admin/transactions", tokens.staff))).status, 200);
      assert.equal((await getAdminTransactions(accountRequest("/admin/transactions", tokens.customer))).status, 403);
      assert.equal((await getMyTransactions(accountRequest("/transactions", tokens.staff))).status, 403);

      const today = new Date().toISOString().slice(0, 10);
      const customerListResponse = await getMyTransactions(accountRequest(
        `/transactions?search=${suffix}&startDate=${today}&endDate=${today}&page=1&limit=1`,
        tokens.customer,
      ));
      const customerListText = await customerListResponse.text();
      const customerListBody = JSON.parse(customerListText) as {
        data: { transactions: Array<{ transactionId: string; fromAccount: { maskedAccountNumber: string } | null }>; total: number; totalPages: number; summary: { total: number; completed: number; pending: number; failed: number } };
      };
      assert.equal(customerListResponse.status, 200);
      assert.equal(customerListBody.data.total, 2);
      assert.equal(customerListBody.data.transactions.length, 1);
      assert.equal(customerListBody.data.totalPages, 2);
      assert.equal(customerListBody.data.summary.total, 2);
      assert.equal(customerListBody.data.summary.completed, 1);
      assert.equal(customerListBody.data.summary.pending, 1);
      assert.equal(customerListBody.data.summary.failed, 0);
      assert.equal(customerListBody.data.transactions[0].transactionId.includes("OTHER"), false);
      assert.equal(customerListText.includes("createdBy"), false);
      assert.equal(customerListText.includes("passwordHash"), false);
      assert.equal(customerListText.includes(customerSavings.accountNumber), false);

      const filteredAdminResponse = await getAdminTransactions(accountRequest(
        `/admin/transactions?search=${suffix}&transactionType=DEPOSIT&status=COMPLETED&startDate=${today}&endDate=${today}`,
        tokens.admin,
      ));
      const filteredAdminBody = await filteredAdminResponse.json() as { data: { transactions: Array<{ transactionId: string; toAccount: { maskedAccountNumber: string } }> } };
      assert.equal(filteredAdminResponse.status, 200);
      assert.equal(filteredAdminBody.data.transactions.length, 1);
      assert.equal(filteredAdminBody.data.transactions[0].transactionId, transactionIds[0]);
      assert.match(filteredAdminBody.data.transactions[0].toAccount.maskedAccountNumber, /^•••• .{4}$/);

      assert.equal((await getAdminTransactions(accountRequest("/admin/transactions?page=0", tokens.admin))).status, 400);
      assert.equal((await getAdminTransactions(accountRequest("/admin/transactions?status=UNKNOWN", tokens.admin))).status, 400);
      assert.equal((await getAdminTransactions(accountRequest("/admin/transactions?startDate=2026-02-30", tokens.admin))).status, 400);
      assert.equal((await getAdminTransactions(accountRequest("/admin/transactions?startDate=2026-12-02&endDate=2026-12-01", tokens.admin))).status, 400);
      assert.equal((await getMyTransactions(accountRequest(`/transactions?userId=${other._id}`, tokens.customer))).status, 400);

      const adminDetailResponse = await getAdminTransaction(accountRequest(`/admin/transactions/${deposit._id}`, tokens.staff), {
        params: Promise.resolve({ id: deposit._id.toString() }),
      });
      assert.equal(adminDetailResponse.status, 200);
      const customerDetail = await getMyTransaction(accountRequest(`/transactions/${deposit._id}`, tokens.customer), {
        params: Promise.resolve({ id: deposit._id.toString() }),
      });
      assert.equal(customerDetail.status, 200);
      assert.equal((await getMyTransaction(accountRequest(`/transactions/${transfer._id}`, tokens.customer), {
        params: Promise.resolve({ id: transfer._id.toString() }),
      })).status, 200);
      assert.equal((await getMyTransaction(accountRequest(`/transactions/${otherDeposit._id}`, tokens.customer), {
        params: Promise.resolve({ id: otherDeposit._id.toString() }),
      })).status, 404);
      assert.equal((await getMyTransaction(accountRequest("/transactions/not-an-id", tokens.customer), {
        params: Promise.resolve({ id: "not-an-id" }),
      })).status, 400);

      await assert.rejects(() => Transaction.create({
        transactionId: transactionIds[0], transactionType: "DEPOSIT", amount: "1.00", toAccount: customerSavings._id,
      }));
    } finally {
      if (mongoose.connection.readyState === 1) {
        await Transaction.deleteMany({ transactionId: { $in: transactionIds } });
        if (accountIds.length) await BankAccount.deleteMany({ _id: { $in: accountIds } });
        await User.deleteMany({ email: { $in: Object.values(emails) } });
        assert.equal(await Transaction.countDocuments({ transactionId: { $in: transactionIds } }), 0);
        assert.equal(await User.exists({ email: { $in: Object.values(emails) } }), null);
      }
    }
  },
);

test("deposit model and request schemas enforce exact positive BDT amounts and protected inputs", async () => {
  const id = new mongoose.Types.ObjectId().toString();
  assert.equal(parseBdtPaisa("1250.50"), BigInt("125050"));
  assert.equal(formatBdtPaisa(BigInt("125050")), "1250.50");
  assert.equal(MAX_BDT_AMOUNT, "99999999999999999999999999999999.99");
  assert.equal(createDepositSchema.safeParse({ accountId: id, amount: "0.01" }).success, true);
  assert.equal(createDepositSchema.safeParse({ accountId: id, amount: MAX_BDT_AMOUNT }).success, true);
  for (const amount of ["0", "0.00", "-1.00", "1.001", "1e3", "01.00", "1".repeat(33)]) {
    assert.equal(createDepositSchema.safeParse({ accountId: id, amount }).success, false);
  }
  assert.equal(createDepositSchema.safeParse({ accountId: id, amount: "1.00", customerId: id }).success, false);
  assert.equal(createDepositSchema.safeParse({ accountId: id, amount: "1.00", status: "APPROVED" }).success, false);
  assert.equal(createDepositSchema.safeParse({ accountId: id, amount: "1.00", currency: "USD" }).success, false);
  assert.equal(customerDepositsQuerySchema.safeParse({ page: "0" }).success, false);
  assert.equal(customerDepositsQuerySchema.safeParse({ userId: id }).success, false);
  assert.equal(adminDepositsQuerySchema.safeParse({ limit: "101" }).success, false);
  assert.equal(adminDepositsQuerySchema.safeParse({ status: "SETTLED" }).success, false);
  assert.equal(adminDepositsQuerySchema.safeParse({ startDate: "2026-02-30" }).success, false);
  assert.equal(adminDepositsQuerySchema.safeParse({ startDate: "2026-12-02", endDate: "2026-12-01" }).success, false);
  assert.equal(reviewDepositSchema.safeParse({ action: "APPROVE", amount: "10" }).success, false);
  assert.equal(reviewDepositSchema.safeParse({ action: "REJECT" }).success, false);
  assert.equal(reviewDepositSchema.safeParse({ action: "REJECT", rejectionReason: "  Duplicate receipt  " }).success, true);

  const valid = new Deposit({ customerId: new mongoose.Types.ObjectId(), accountId: new mongoose.Types.ObjectId(), amount: "1.00" });
  await valid.validate();
  assert.match(valid.depositId, /^DEP-[\dA-F]{24}$/);
  assert.equal(valid.status, "PENDING");
  assert.equal(Deposit.schema.path("depositId").options.unique, true);
  for (const amount of ["0", "-0.01", "1.001"]) {
    const invalid = new Deposit({ customerId: new mongoose.Types.ObjectId(), accountId: new mongoose.Types.ObjectId(), amount });
    await assert.rejects(() => invalid.validate());
  }
});

test("deposit APIs require authentication and reject invalid unauthenticated requests", async () => {
  assert.equal((await createDeposit(accountRequest("/deposits", undefined, "POST", { accountId: "507f1f77bcf86cd799439011", amount: "10.00" }))).status, 401);
  assert.equal((await getMyDeposits(accountRequest("/deposits"))).status, 401);
  assert.equal((await getMyDeposit(accountRequest("/deposits/507f1f77bcf86cd799439011"), {
    params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }),
  })).status, 401);
  assert.equal((await getAdminDeposits(accountRequest("/admin/deposits"))).status, 401);
  assert.equal((await getAdminDeposit(accountRequest("/admin/deposits/507f1f77bcf86cd799439011"), {
    params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }),
  })).status, 401);
  assert.equal((await reviewDeposit(accountRequest("/admin/deposits/507f1f77bcf86cd799439011", undefined, "PATCH", { action: "APPROVE" }), {
    params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }),
  })).status, 401);
});

test(
  "deposit workflow isolates customers and atomically approves, rejects, and rolls back requests",
  { skip: process.env.RUN_DB_INTEGRATION_TESTS !== "true" },
  async () => {
    loadIntegrationTestEnvironment();
    const suffix = randomUUID().replaceAll("-", "").toUpperCase();
    const emails = {
      admin: "task11-admin-" + suffix + "@example.com",
      staff: "task11-staff-" + suffix + "@example.com",
      customer: "task11-customer-" + suffix + "@example.com",
      other: "task11-other-" + suffix + "@example.com",
    };
    const accountIds: mongoose.Types.ObjectId[] = [];
    const depositIds: string[] = [];
    const passwordHash = await hashPassword("Task11 Integration Password 2026!");
    const originalTransactionCreate = Transaction.create;

    try {
      await connectToDatabase();
      await User.init();
      await BankAccount.init();
      await Deposit.init();
      await Transaction.init();
      await Notification.init();

      // Explicitly verify replica-set/Atlas transaction support before fixture creation.
      const capabilitySession = await mongoose.startSession();
      try {
        await capabilitySession.withTransaction(async () => {
          await mongoose.connection.collection("users").findOne(
            { _id: new mongoose.Types.ObjectId("000000000000000000000000") },
            { session: capabilitySession },
          );
        });
      } finally {
        await capabilitySession.endSession();
      }

      const [admin, staff, customer, other] = await User.create([
        { name: "Task Eleven Admin", email: emails.admin, passwordHash, role: "ADMIN" },
        { name: "Task Eleven Staff", email: emails.staff, passwordHash, role: "STAFF" },
        { name: "Task Eleven Customer", email: emails.customer, passwordHash, role: "CUSTOMER" },
        { name: "Task Eleven Other Customer", email: emails.other, passwordHash, role: "CUSTOMER" },
      ]);
      const tokens = {
        admin: await createSessionToken(admin._id.toString()),
        staff: await createSessionToken(staff._id.toString()),
        customer: await createSessionToken(customer._id.toString()),
      };
      const [activeAccount, otherAccount, frozenAccount, inactiveAccount] = await BankAccount.create([
        { accountNumber: "N11" + suffix.slice(0, 11) + "01", userId: customer._id, accountType: "SAVINGS", balance: "100.00", status: "ACTIVE" },
        { accountNumber: "N11" + suffix.slice(0, 11) + "02", userId: other._id, accountType: "CURRENT", balance: "50.00", status: "ACTIVE" },
        { accountNumber: "N11" + suffix.slice(0, 11) + "03", userId: customer._id, accountType: "CURRENT", balance: "0.00", status: "FROZEN" },
        { accountNumber: "N11" + suffix.slice(0, 11) + "04", userId: customer._id, accountType: "SAVINGS", balance: "0.00", status: "INACTIVE" },
      ]);
      accountIds.push(activeAccount._id, otherAccount._id, frozenAccount._id, inactiveAccount._id);

      const submit = async (accountId: mongoose.Types.ObjectId, amount: string) => {
        const response = await createDeposit(accountRequest("/deposits", tokens.customer, "POST", { accountId: accountId.toString(), amount }));
        const body = await response.json() as { data: { deposit: { id: string; depositId: string } } };
        if (response.status === 201) depositIds.push(body.data.deposit.id);
        return { response, body };
      };
      const reviewRequest = (id: string, token: string, body: unknown) => reviewDeposit(
        accountRequest("/admin/deposits/" + id, token, "PATCH", body),
        { params: Promise.resolve({ id }) },
      );
      const main = await submit(activeAccount._id, "125.55");
      assert.equal(main.response.status, 201);
      assert.match(main.body.data.deposit.depositId, /^DEP-[\dA-F]{24}$/);
      assert.equal((await BankAccount.findById(activeAccount._id))?.balance.toString(), "100.00");
      assert.equal(await Transaction.countDocuments({ createdBy: customer._id, toAccount: activeAccount._id }), 0);

      for (const amount of ["0", "-0.01", "0.001", "1e3"]) {
        assert.equal((await createDeposit(accountRequest("/deposits", tokens.customer, "POST", { accountId: activeAccount._id.toString(), amount }))).status, 400);
      }
      assert.equal((await createDeposit(accountRequest("/deposits", tokens.customer, "POST", {
        accountId: activeAccount._id.toString(), amount: "1.00", customerId: other._id.toString(), status: "APPROVED",
        reviewedBy: admin._id.toString(), transactionId: "507f1f77bcf86cd799439011",
      }))).status, 400);
      assert.equal((await submit(otherAccount._id, "10.00")).response.status, 404);
      assert.equal((await submit(frozenAccount._id, "10.00")).response.status, 404);
      assert.equal((await submit(inactiveAccount._id, "10.00")).response.status, 404);

      assert.equal((await getAdminDeposits(accountRequest("/admin/deposits"))).status, 401);
      assert.equal((await getAdminDeposits(accountRequest("/admin/deposits", tokens.customer))).status, 403);
      assert.equal((await getAdminDeposit(accountRequest("/admin/deposits/" + main.body.data.deposit.id, tokens.customer), {
        params: Promise.resolve({ id: main.body.data.deposit.id }),
      })).status, 403);
      assert.equal((await reviewRequest(main.body.data.deposit.id, tokens.customer, { action: "APPROVE" })).status, 403);
      assert.equal((await getMyDeposits(accountRequest("/deposits", tokens.staff))).status, 403);

      const customerListResponse = await getMyDeposits(accountRequest("/deposits?page=1&limit=10", tokens.customer));
      const customerListText = await customerListResponse.text();
      const customerList = JSON.parse(customerListText) as { data: { deposits: Array<{ id: string; status: string; account: { maskedAccountNumber: string } | null }>; total: number; summary: { pending: number } } };
      assert.equal(customerListResponse.status, 200);
      assert.equal(customerList.data.total, 1);
      assert.equal(customerList.data.summary.pending, 1);
      assert.equal(customerList.data.deposits[0].status, "PENDING");
      assert.equal(customerListText.includes(activeAccount.accountNumber), false);
      assert.equal(customerListText.includes("customerId"), false);
      assert.equal((await getMyDeposits(accountRequest("/deposits?userId=" + other._id.toString(), tokens.customer))).status, 400);
      assert.equal((await getMyDeposit(accountRequest("/deposits/" + main.body.data.deposit.id, tokens.customer), {
        params: Promise.resolve({ id: main.body.data.deposit.id }),
      })).status, 200);
      assert.equal((await getMyDeposit(accountRequest("/deposits/" + main.body.data.deposit.id, await createSessionToken(other._id.toString())), {
        params: Promise.resolve({ id: main.body.data.deposit.id }),
      })).status, 404);
      assert.equal((await getMyDeposit(accountRequest("/deposits/not-an-id", tokens.customer), {
        params: Promise.resolve({ id: "not-an-id" }),
      })).status, 400);

      const adminList = await getAdminDeposits(accountRequest("/admin/deposits?search=" + main.body.data.deposit.depositId + "&status=PENDING", tokens.staff));
      const adminListText = await adminList.text();
      const adminListBody = JSON.parse(adminListText) as { data: { deposits: Array<{ id: string; customer: { email: string }; account: { maskedAccountNumber: string } | null }>; summary: { total: number; pending: number } } };
      assert.equal(adminList.status, 200);
      assert.equal(adminListBody.data.deposits.length, 1);
      assert.equal(adminListBody.data.deposits[0].customer.email, emails.customer.toLowerCase());
      assert.match(adminListBody.data.deposits[0].account?.maskedAccountNumber ?? "", /^•••• .{4}$/);
      assert.equal(adminListText.includes("passwordHash"), false);
      assert.equal((await getAdminDeposits(accountRequest("/admin/deposits?page=0", tokens.admin))).status, 400);
      assert.equal((await getAdminDeposits(accountRequest("/admin/deposits?status=UNKNOWN", tokens.admin))).status, 400);
      assert.equal((await getAdminDeposits(accountRequest("/admin/deposits?startDate=2026-12-02&endDate=2026-12-01", tokens.admin))).status, 400);
      assert.equal((await reviewRequest(main.body.data.deposit.id, tokens.staff, { action: "INVALID" })).status, 400);
      assert.equal((await reviewRequest(main.body.data.deposit.id, tokens.staff, { action: "APPROVE", amount: "999" })).status, 400);
      assert.equal((await getAdminDeposit(accountRequest("/admin/deposits/nope", tokens.admin), {
        params: Promise.resolve({ id: "nope" }),
      })).status, 400);

      const rejection = await submit(activeAccount._id, "24.45");
      const rejectionId = rejection.body.data.deposit.id;
      assert.equal((await reviewRequest(rejectionId, tokens.staff, {
        action: "REJECT", rejectionReason: "Receipt could not be verified",
      })).status, 200);
      assert.equal(await Notification.countDocuments({ userId: customer._id, relatedEntityId: rejectionId }), 0);
      assert.equal((await BankAccount.findById(activeAccount._id))?.balance.toString(), "100.00");
      assert.equal(await Transaction.countDocuments({ createdBy: customer._id, toAccount: activeAccount._id }), 0);
      assert.equal((await reviewRequest(rejectionId, tokens.admin, { action: "APPROVE" })).status, 409);

      assert.equal((await reviewRequest(main.body.data.deposit.id, tokens.admin, { action: "APPROVE" })).status, 200);
      const approved = await Deposit.findById(main.body.data.deposit.id);
      assert.equal(approved?.status, "APPROVED");
      assert.equal(approved?.reviewedBy?.toString(), admin._id.toString());
      assert.ok(approved?.transactionId);
      assert.equal((await BankAccount.findById(activeAccount._id))?.balance.toString(), "225.55");
      const completedDepositTransactions = await Transaction.find({ createdBy: customer._id, toAccount: activeAccount._id, transactionType: "DEPOSIT", status: "COMPLETED" });
      assert.equal(completedDepositTransactions.length, 1);
      assert.equal(completedDepositTransactions[0].amount.toString(), "125.55");
      assert.equal(completedDepositTransactions[0]._id.toString(), approved?.transactionId?.toString());
      assert.equal(await Notification.countDocuments({ userId: customer._id, dedupeKey: `deposit:${approved?._id}:approved`, type: "DEPOSIT_APPROVED" }), 1);
      assert.equal((await reviewRequest(main.body.data.deposit.id, tokens.staff, { action: "APPROVE" })).status, 409);
      assert.equal(await Notification.countDocuments({ userId: customer._id, dedupeKey: `deposit:${approved?._id}:approved` }), 1);
      assert.equal((await BankAccount.findById(activeAccount._id))?.balance.toString(), "225.55");
      assert.equal(await Transaction.countDocuments({ createdBy: customer._id, toAccount: activeAccount._id }), 1);

      const concurrent = await submit(activeAccount._id, "4.50");
      const concurrentId = concurrent.body.data.deposit.id;
      const concurrentResults = await Promise.all([
        reviewRequest(concurrentId, tokens.staff, { action: "APPROVE" }),
        reviewRequest(concurrentId, tokens.admin, { action: "APPROVE" }),
      ]);
      assert.deepEqual(concurrentResults.map((response) => response.status).sort(), [200, 409]);
      assert.equal((await BankAccount.findById(activeAccount._id))?.balance.toString(), "230.05");
      assert.equal(await Transaction.countDocuments({ createdBy: customer._id, toAccount: activeAccount._id }), 2);

      const rollback = await submit(activeAccount._id, "3.25");
      const rollbackId = rollback.body.data.deposit.id;
      Transaction.create = (async () => {
        throw new Error("forced transaction insert failure");
      }) as typeof Transaction.create;
      try {
        assert.equal((await reviewRequest(rollbackId, tokens.admin, { action: "APPROVE" })).status, 500);
      } finally {
        Transaction.create = originalTransactionCreate;
      }
      assert.equal((await Deposit.findById(rollbackId))?.status, "PENDING");
      assert.equal((await BankAccount.findById(activeAccount._id))?.balance.toString(), "230.05");
      assert.equal(await Transaction.countDocuments({ createdBy: customer._id, toAccount: activeAccount._id }), 2);
      assert.equal(await Notification.countDocuments({ userId: customer._id, relatedEntityId: rollbackId }), 0);
    } finally {
      Transaction.create = originalTransactionCreate;
      if (mongoose.connection.readyState === 1) {
        const customer = await User.findOne({ email: emails.customer }).select("_id");
        if (customer) await Notification.deleteMany({ userId: customer._id });
        await Deposit.deleteMany({ _id: { $in: depositIds } });
        if (customer) await Transaction.deleteMany({ createdBy: customer._id, toAccount: { $in: accountIds } });
        assert.equal(await Transaction.countDocuments({ toAccount: { $in: accountIds } }), 0);
        await BankAccount.deleteMany({ _id: { $in: accountIds } });
        await User.deleteMany({ email: { $in: Object.values(emails) } });
        assert.equal(await Deposit.countDocuments({ _id: { $in: depositIds } }), 0);
        assert.equal(await User.exists({ email: { $in: Object.values(emails) } }), null);
      }
    }
  },
);

test("withdrawal model and schemas validate secure references, exact money, filters, and protected fields", async () => {
  const id = new mongoose.Types.ObjectId().toString();
  assert.equal(createWithdrawalSchema.safeParse({ accountId: id, amount: "0.01" }).success, true);
  assert.equal(createWithdrawalSchema.safeParse({ accountId: id, amount: MAX_BDT_AMOUNT }).success, true);
  for (const amount of ["0", "-0.01", "1.001", "1e2", "01.00"]) {
    assert.equal(createWithdrawalSchema.safeParse({ accountId: id, amount }).success, false);
  }
  assert.equal(createWithdrawalSchema.safeParse({ accountId: id, amount: "1.00", customerId: id }).success, false);
  assert.equal(createWithdrawalSchema.safeParse({ accountId: id, amount: "1.00", status: "APPROVED" }).success, false);
  assert.equal(createWithdrawalSchema.safeParse({ accountId: id, amount: "1.00", transactionId: id }).success, false);
  assert.equal(customerWithdrawalsQuerySchema.safeParse({ page: "0" }).success, false);
  assert.equal(customerWithdrawalsQuerySchema.safeParse({ customerId: id }).success, false);
  assert.equal(adminWithdrawalsQuerySchema.safeParse({ status: "SETTLED" }).success, false);
  assert.equal(adminWithdrawalsQuerySchema.safeParse({ startDate: "2026-12-02", endDate: "2026-12-01" }).success, false);
  assert.equal(reviewWithdrawalSchema.safeParse({ action: "APPROVE", accountId: id }).success, false);
  assert.equal(reviewWithdrawalSchema.safeParse({ action: "REJECT" }).success, false);
  assert.equal(reviewWithdrawalSchema.safeParse({ action: "REJECT", rejectionReason: "Insufficient source proof" }).success, true);

  const valid = new Withdrawal({ customerId: new mongoose.Types.ObjectId(), accountId: new mongoose.Types.ObjectId(), amount: "12.35" });
  await valid.validate();
  assert.match(valid.withdrawalId, /^WDR-[\dA-F]{24}$/);
  assert.equal(valid.status, "PENDING");
  assert.equal(Withdrawal.schema.path("withdrawalId").options.unique, true);
  for (const amount of ["0", "-1.00", "12.345"]) {
    const invalid = new Withdrawal({ customerId: new mongoose.Types.ObjectId(), accountId: new mongoose.Types.ObjectId(), amount });
    await assert.rejects(() => invalid.validate());
  }
});

test("withdrawal APIs require authentication", async () => {
  assert.equal((await createWithdrawal(accountRequest("/withdrawals", undefined, "POST", { accountId: "507f1f77bcf86cd799439011", amount: "10.00" }))).status, 401);
  assert.equal((await getMyWithdrawals(accountRequest("/withdrawals"))).status, 401);
  assert.equal((await getMyWithdrawal(accountRequest("/withdrawals/507f1f77bcf86cd799439011"), {
    params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }),
  })).status, 401);
  assert.equal((await getAdminWithdrawals(accountRequest("/admin/withdrawals"))).status, 401);
  assert.equal((await getAdminWithdrawal(accountRequest("/admin/withdrawals/507f1f77bcf86cd799439011"), {
    params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }),
  })).status, 401);
  assert.equal((await reviewWithdrawal(accountRequest("/admin/withdrawals/507f1f77bcf86cd799439011", undefined, "PATCH", { action: "APPROVE" }), {
    params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }),
  })).status, 401);
});

test(
  "withdrawal workflow protects ownership, prevents overdrafts, and atomically deducts once",
  { skip: process.env.RUN_DB_INTEGRATION_TESTS !== "true" },
  async () => {
    loadIntegrationTestEnvironment();
    const suffix = randomUUID().replaceAll("-", "").toUpperCase();
    const emails = {
      admin: "task12-admin-" + suffix + "@example.com",
      staff: "task12-staff-" + suffix + "@example.com",
      customer: "task12-customer-" + suffix + "@example.com",
      other: "task12-other-" + suffix + "@example.com",
    };
    const accountIds: mongoose.Types.ObjectId[] = [];
    const withdrawalIds: string[] = [];
    const passwordHash = await hashPassword("Task12 Integration Password 2026!");
    const originalTransactionCreate = Transaction.create;

    try {
      await connectToDatabase();
      await User.init();
      await BankAccount.init();
      await Withdrawal.init();
      await Transaction.init();
      await Notification.init();

      // Verify the configured Atlas deployment can run a transaction before creating fixtures.
      const capabilitySession = await mongoose.startSession();
      try {
        await capabilitySession.withTransaction(async () => {
          await mongoose.connection.collection("users").findOne(
            { _id: new mongoose.Types.ObjectId("000000000000000000000000") },
            { session: capabilitySession },
          );
        });
      } finally {
        await capabilitySession.endSession();
      }

      const [admin, staff, customer, other] = await User.create([
        { name: "Task Twelve Admin", email: emails.admin, passwordHash, role: "ADMIN" },
        { name: "Task Twelve Staff", email: emails.staff, passwordHash, role: "STAFF" },
        { name: "Task Twelve Customer", email: emails.customer, passwordHash, role: "CUSTOMER" },
        { name: "Task Twelve Other Customer", email: emails.other, passwordHash, role: "CUSTOMER" },
      ]);
      const tokens = {
        admin: await createSessionToken(admin._id.toString()),
        staff: await createSessionToken(staff._id.toString()),
        customer: await createSessionToken(customer._id.toString()),
        other: await createSessionToken(other._id.toString()),
      };
      const [activeAccount, otherAccount, frozenAccount, inactiveAccount, closedAccount] = await BankAccount.create([
        { accountNumber: "N12" + suffix.slice(0, 10) + "01", userId: customer._id, accountType: "SAVINGS", balance: "100.00", status: "ACTIVE" },
        { accountNumber: "N12" + suffix.slice(0, 10) + "02", userId: other._id, accountType: "CURRENT", balance: "500.00", status: "ACTIVE" },
        { accountNumber: "N12" + suffix.slice(0, 10) + "03", userId: customer._id, accountType: "CURRENT", balance: "40.00", status: "FROZEN" },
        { accountNumber: "N12" + suffix.slice(0, 10) + "04", userId: customer._id, accountType: "SAVINGS", balance: "40.00", status: "INACTIVE" },
        { accountNumber: "N12" + suffix.slice(0, 10) + "05", userId: customer._id, accountType: "SAVINGS", balance: "40.00", status: "CLOSED" },
      ]);
      accountIds.push(activeAccount._id, otherAccount._id, frozenAccount._id, inactiveAccount._id, closedAccount._id);

      const submit = async (accountId: mongoose.Types.ObjectId, amount: string) => {
        const response = await createWithdrawal(accountRequest("/withdrawals", tokens.customer, "POST", { accountId: accountId.toString(), amount }));
        const body = await response.json() as { data: { withdrawal: { id: string; withdrawalId: string } } };
        if (response.status === 201) withdrawalIds.push(body.data.withdrawal.id);
        return { response, body };
      };
      const reviewRequest = (id: string, token: string, body: unknown) => reviewWithdrawal(
        accountRequest("/admin/withdrawals/" + id, token, "PATCH", body),
        { params: Promise.resolve({ id }) },
      );

      const main = await submit(activeAccount._id, "60.25");
      assert.equal(main.response.status, 201);
      assert.match(main.body.data.withdrawal.withdrawalId, /^WDR-[\dA-F]{24}$/);
      assert.equal((await BankAccount.findById(activeAccount._id))?.balance.toString(), "100.00");
      assert.equal(await Transaction.countDocuments({ createdBy: customer._id, fromAccount: activeAccount._id }), 0);
      for (const amount of ["0", "-0.01", "1.001", "1e2"]) {
        assert.equal((await createWithdrawal(accountRequest("/withdrawals", tokens.customer, "POST", { accountId: activeAccount._id.toString(), amount }))).status, 400);
      }
      assert.equal((await createWithdrawal(accountRequest("/withdrawals", tokens.customer, "POST", {
        accountId: activeAccount._id.toString(), amount: "1.00", customerId: other._id.toString(),
        status: "APPROVED", reviewedBy: admin._id.toString(), transactionId: "507f1f77bcf86cd799439011",
      }))).status, 400);
      assert.equal((await submit(otherAccount._id, "1.00")).response.status, 404);
      assert.equal((await submit(frozenAccount._id, "1.00")).response.status, 404);
      assert.equal((await submit(inactiveAccount._id, "1.00")).response.status, 404);
      assert.equal((await submit(closedAccount._id, "1.00")).response.status, 404);

      assert.equal((await getAdminWithdrawals(accountRequest("/admin/withdrawals"))).status, 401);
      assert.equal((await getAdminWithdrawals(accountRequest("/admin/withdrawals", tokens.customer))).status, 403);
      assert.equal((await getMyWithdrawals(accountRequest("/withdrawals", tokens.staff))).status, 403);
      assert.equal((await reviewRequest(main.body.data.withdrawal.id, tokens.customer, { action: "APPROVE" })).status, 403);
      assert.equal((await getAdminWithdrawal(accountRequest("/admin/withdrawals/" + main.body.data.withdrawal.id, tokens.staff), {
        params: Promise.resolve({ id: main.body.data.withdrawal.id }),
      })).status, 200);
      assert.equal((await getMyWithdrawal(accountRequest("/withdrawals/" + main.body.data.withdrawal.id, tokens.other), {
        params: Promise.resolve({ id: main.body.data.withdrawal.id }),
      })).status, 404);
      assert.equal((await getMyWithdrawals(accountRequest("/withdrawals?customerId=" + other._id.toString(), tokens.customer))).status, 400);
      const customerListResponse = await getMyWithdrawals(accountRequest("/withdrawals?page=1&limit=10", tokens.customer));
      const customerListText = await customerListResponse.text();
      const customerListBody = JSON.parse(customerListText) as { data: { total: number; withdrawals: Array<{ status: string }>; summary: { pending: number } } };
      assert.equal(customerListResponse.status, 200);
      assert.equal(customerListBody.data.total, 1);
      assert.equal(customerListBody.data.withdrawals[0].status, "PENDING");
      assert.equal(customerListBody.data.summary.pending, 1);
      assert.equal(customerListText.includes("customerId"), false);
      assert.equal(customerListText.includes(activeAccount.accountNumber), false);

      const adminList = await getAdminWithdrawals(accountRequest("/admin/withdrawals?search=" + main.body.data.withdrawal.withdrawalId + "&status=PENDING", tokens.admin));
      const adminListBody = await adminList.json() as { data: { withdrawals: Array<{ customer: { email: string }; account: { maskedAccountNumber: string } | null }> } };
      assert.equal(adminList.status, 200);
      assert.equal(adminListBody.data.withdrawals.length, 1);
      assert.equal(adminListBody.data.withdrawals[0].customer.email, emails.customer.toLowerCase());
      assert.match(adminListBody.data.withdrawals[0].account?.maskedAccountNumber ?? "", /^•••• .{4}$/);
      assert.equal((await getAdminWithdrawals(accountRequest("/admin/withdrawals?page=0", tokens.admin))).status, 400);
      assert.equal((await getAdminWithdrawals(accountRequest("/admin/withdrawals?status=UNKNOWN", tokens.admin))).status, 400);
      assert.equal((await getAdminWithdrawals(accountRequest("/admin/withdrawals?startDate=2026-12-02&endDate=2026-12-01", tokens.admin))).status, 400);
      assert.equal((await reviewRequest(main.body.data.withdrawal.id, tokens.staff, { action: "INVALID" })).status, 400);
      assert.equal((await reviewRequest(main.body.data.withdrawal.id, tokens.staff, { action: "APPROVE", amount: "1.00" })).status, 400);
      assert.equal((await reviewRequest(main.body.data.withdrawal.id, tokens.staff, { action: "REJECT" })).status, 400);

      const approval = await reviewRequest(main.body.data.withdrawal.id, tokens.admin, { action: "APPROVE" });
      assert.equal(approval.status, 200);
      const approved = await Withdrawal.findById(main.body.data.withdrawal.id);
      assert.equal(approved?.status, "APPROVED");
      assert.equal(approved?.reviewedBy?.toString(), admin._id.toString());
      assert.ok(approved?.transactionId);
      assert.equal((await BankAccount.findById(activeAccount._id))?.balance.toString(), "39.75");
      const firstTransaction = await Transaction.findOne({ createdBy: customer._id, fromAccount: activeAccount._id, transactionType: "WITHDRAWAL" });
      assert.ok(firstTransaction);
      assert.equal(firstTransaction.status, "COMPLETED");
      assert.equal(firstTransaction.amount.toString(), "60.25");
      assert.equal(firstTransaction._id.toString(), approved.transactionId?.toString());
      assert.equal((await reviewRequest(main.body.data.withdrawal.id, tokens.staff, { action: "APPROVE" })).status, 409);
      assert.equal((await BankAccount.findById(activeAccount._id))?.balance.toString(), "39.75");
      assert.equal(await Transaction.countDocuments({ createdBy: customer._id, fromAccount: activeAccount._id }), 1);

      const insufficient = await submit(activeAccount._id, "40.00");
      const insufficientId = insufficient.body.data.withdrawal.id;
      assert.equal((await reviewRequest(insufficientId, tokens.staff, { action: "APPROVE" })).status, 409);
      assert.equal((await Withdrawal.findById(insufficientId))?.status, "PENDING");
      assert.equal((await BankAccount.findById(activeAccount._id))?.balance.toString(), "39.75");
      assert.equal(await Transaction.countDocuments({ createdBy: customer._id, fromAccount: activeAccount._id }), 1);

      const rejection = await submit(activeAccount._id, "0.75");
      const rejectionId = rejection.body.data.withdrawal.id;
      assert.equal((await reviewRequest(rejectionId, tokens.staff, { action: "REJECT", rejectionReason: "Customer request cancelled" })).status, 200);
      assert.equal((await Withdrawal.findById(rejectionId))?.status, "REJECTED");
      assert.equal(await Notification.countDocuments({ userId: customer._id, dedupeKey: `withdrawal:${rejectionId}:rejected`, type: "WITHDRAWAL_REJECTED" }), 1);
      assert.equal((await Notification.findOne({ dedupeKey: `withdrawal:${rejectionId}:rejected` }))?.message.includes("Customer request cancelled"), false);
      assert.equal((await BankAccount.findById(activeAccount._id))?.balance.toString(), "39.75");
      assert.equal(await Transaction.countDocuments({ createdBy: customer._id, fromAccount: activeAccount._id }), 1);
      assert.equal((await reviewRequest(rejectionId, tokens.admin, { action: "APPROVE" })).status, 409);
      assert.equal((await reviewRequest(rejectionId, tokens.admin, { action: "REJECT", rejectionReason: "Customer request cancelled" })).status, 409);
      assert.equal(await Notification.countDocuments({ userId: customer._id, dedupeKey: `withdrawal:${rejectionId}:rejected` }), 1);

      await BankAccount.updateOne({ _id: activeAccount._id }, { $inc: { balance: mongoose.Types.Decimal128.fromString("5.00") } });
      assert.equal((await BankAccount.findById(activeAccount._id))?.balance.toString(), "44.75");
      assert.equal((await reviewRequest(insufficientId, tokens.admin, { action: "APPROVE" })).status, 200);
      assert.equal((await BankAccount.findById(activeAccount._id))?.balance.toString(), "4.75");
      assert.equal(await Transaction.countDocuments({ createdBy: customer._id, fromAccount: activeAccount._id }), 2);

      const concurrent = await submit(activeAccount._id, "2.00");
      const concurrentId = concurrent.body.data.withdrawal.id;
      const concurrentResults = await Promise.all([
        reviewRequest(concurrentId, tokens.staff, { action: "APPROVE" }),
        reviewRequest(concurrentId, tokens.admin, { action: "APPROVE" }),
      ]);
      assert.deepEqual(concurrentResults.map((response) => response.status).sort(), [200, 409]);
      assert.equal((await BankAccount.findById(activeAccount._id))?.balance.toString(), "2.75");
      assert.equal(await Transaction.countDocuments({ createdBy: customer._id, fromAccount: activeAccount._id }), 3);

      const largerRequest = await submit(activeAccount._id, "2.00");
      const smallerRequest = await submit(activeAccount._id, "1.00");
      const overdrawResults = await Promise.all([
        reviewRequest(largerRequest.body.data.withdrawal.id, tokens.admin, { action: "APPROVE" }),
        reviewRequest(smallerRequest.body.data.withdrawal.id, tokens.staff, { action: "APPROVE" }),
      ]);
      assert.deepEqual(overdrawResults.map((response) => response.status).sort(), [200, 409]);
      const pendingOverdrawId = overdrawResults[0].status === 409
        ? largerRequest.body.data.withdrawal.id
        : smallerRequest.body.data.withdrawal.id;
      const overdrawBalance = pendingOverdrawId === largerRequest.body.data.withdrawal.id ? "1.75" : "0.75";
      assert.equal((await Withdrawal.findById(pendingOverdrawId))?.status, "PENDING");
      assert.equal((await BankAccount.findById(activeAccount._id))?.balance.toString(), overdrawBalance);
      assert.equal(await Transaction.countDocuments({ createdBy: customer._id, fromAccount: activeAccount._id }), 4);

      const rollback = await submit(activeAccount._id, "0.25");
      const rollbackId = rollback.body.data.withdrawal.id;
      Transaction.create = (async () => {
        throw new Error("forced transaction insert failure");
      }) as typeof Transaction.create;
      try {
        assert.equal((await reviewRequest(rollbackId, tokens.admin, { action: "APPROVE" })).status, 500);
      } finally {
        Transaction.create = originalTransactionCreate;
      }
      assert.equal((await Withdrawal.findById(rollbackId))?.status, "PENDING");
      assert.equal((await BankAccount.findById(activeAccount._id))?.balance.toString(), overdrawBalance);
      assert.equal(await Transaction.countDocuments({ createdBy: customer._id, fromAccount: activeAccount._id }), 4);
    } finally {
      Transaction.create = originalTransactionCreate;
      if (mongoose.connection.readyState === 1) {
        const customer = await User.findOne({ email: emails.customer }).select("_id");
        if (customer) await Notification.deleteMany({ userId: customer._id });
        await Withdrawal.deleteMany({ _id: { $in: withdrawalIds } });
        if (customer) await Transaction.deleteMany({ createdBy: customer._id, fromAccount: { $in: accountIds } });
        assert.equal(await Transaction.countDocuments({ fromAccount: { $in: accountIds } }), 0);
        await BankAccount.deleteMany({ _id: { $in: accountIds } });
        await User.deleteMany({ email: { $in: Object.values(emails) } });
        assert.equal(await Withdrawal.countDocuments({ _id: { $in: withdrawalIds } }), 0);
        assert.equal(await User.exists({ email: { $in: Object.values(emails) } }), null);
      }
    }
  },
);

test("transfer request validation is strict and requires a UUID idempotency key", () => {
  const valid = {
    fromAccountId: "507f1f77bcf86cd799439011",
    recipientAccountNumber: "nb0123456789abcdef",
    amount: "12.34",
    idempotencyKey: randomUUID(),
  };
  assert.equal(createTransferSchema.safeParse(valid).success, true);
  assert.equal(createTransferSchema.safeParse({ ...valid, idempotencyKey: "retry" }).success, false);
  assert.equal(createTransferSchema.safeParse({ ...valid, idempotencyKey: "018f1d25-7b60-7b88-9d3b-223dcaab8e33" }).success, false);
  assert.equal(createTransferSchema.safeParse({ ...valid, amount: "1.001" }).success, false);
  assert.equal(createTransferSchema.safeParse({ ...valid, recipientAccountNumber: "invalid" }).success, false);
  assert.equal(createTransferSchema.safeParse({ ...valid, accountId: valid.fromAccountId }).success, false);
  assert.equal(transferHistoryQuerySchema.safeParse({ page: "0" }).success, false);
  assert.equal(Transaction.schema.path("idempotencyKey")?.options.immutable, true);
  assert.ok(Transaction.schema.indexes().some(([keys, options]) =>
    keys.createdBy === 1 && keys.idempotencyKey === 1 && options.unique === true &&
    options.partialFilterExpression?.idempotencyKey?.$type === "string",
  ));
});

test("transfer APIs require a customer session", async () => {
  const body = {
    fromAccountId: "507f1f77bcf86cd799439011",
    recipientAccountNumber: "NB0123456789ABCDEF",
    amount: "1.00",
    idempotencyKey: randomUUID(),
  };
  assert.equal((await createTransfer(accountRequest("/transfers", undefined, "POST", body))).status, 401);
  assert.equal((await getMyTransfers(accountRequest("/transfers"))).status, 401);
  assert.equal((await getMyTransfer(accountRequest("/transfers/507f1f77bcf86cd799439011"), {
    params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }),
  })).status, 401);
});

test(
  "transfer workflow moves funds once, enforces ownership, and exposes each side's history",
  { skip: process.env.RUN_DB_INTEGRATION_TESTS !== "true" },
  async () => {
    loadIntegrationTestEnvironment();
    const suffix = randomUUID().replaceAll("-", "").toLowerCase();
    const emails = {
      sender: `task13-sender-${suffix}@example.com`,
      recipient: `task13-recipient-${suffix}@example.com`,
      unrelated: `task13-unrelated-${suffix}@example.com`,
      staff: `task13-staff-${suffix}@example.com`,
    };
    const accountIds: mongoose.Types.ObjectId[] = [];
    const transactionIds: mongoose.Types.ObjectId[] = [];
    const originalTransactionCreate = Transaction.create;

    try {
      await connectToDatabase();
      await User.init();
      await BankAccount.init();
      await Transaction.init();
      await Notification.init();
      const capabilitySession = await mongoose.startSession();
      try {
        await capabilitySession.withTransaction(async () => {
          await mongoose.connection.collection("users").findOne(
            { _id: new mongoose.Types.ObjectId("000000000000000000000000") },
            { session: capabilitySession },
          );
        });
      } finally {
        await capabilitySession.endSession();
      }

      const passwordHash = await hashPassword("Task13 Integration Password 2026!");
      const [sender, recipient, unrelated, staff] = await User.create([
        { name: "Task Thirteen Sender", email: emails.sender, passwordHash, role: "CUSTOMER" },
        { name: "Task Thirteen Recipient", email: emails.recipient, passwordHash, role: "CUSTOMER" },
        { name: "Task Thirteen Unrelated", email: emails.unrelated, passwordHash, role: "CUSTOMER" },
        { name: "Task Thirteen Staff", email: emails.staff, passwordHash, role: "STAFF" },
      ]);
      const tokens = {
        sender: await createSessionToken(sender._id.toString()),
        recipient: await createSessionToken(recipient._id.toString()),
        unrelated: await createSessionToken(unrelated._id.toString()),
        staff: await createSessionToken(staff._id.toString()),
      };
      const [source, destination, ownOtherAccount] = await BankAccount.create([
        { accountNumber: generateAccountNumber(), userId: sender._id, accountType: "SAVINGS", balance: "100.00" },
        { accountNumber: generateAccountNumber(), userId: recipient._id, accountType: "CURRENT", balance: "10.00" },
        { accountNumber: generateAccountNumber(), userId: sender._id, accountType: "CURRENT", balance: "2.00" },
      ]);
      accountIds.push(source._id, destination._id, ownOtherAccount._id);

      const transferBody = {
        fromAccountId: source._id.toString(),
        recipientAccountNumber: destination.accountNumber,
        amount: "30.25",
        description: "Rent",
        idempotencyKey: randomUUID(),
      };
      const createdResponse = await createTransfer(accountRequest("/transfers", tokens.sender, "POST", transferBody));
      const createdBody = await createdResponse.json() as { data: { transfer: { id: string; transactionId: string; direction: string }; replayed: boolean } };
      assert.equal(createdResponse.status, 201);
      assert.equal(createdBody.data.transfer.direction, "SENT");
      assert.equal(createdBody.data.replayed, false);
      transactionIds.push(new mongoose.Types.ObjectId(createdBody.data.transfer.id));
      assert.equal((await BankAccount.findById(source._id))?.balance.toString(), "69.75");
      assert.equal((await BankAccount.findById(destination._id))?.balance.toString(), "40.25");
      assert.equal(await Transaction.countDocuments({ idempotencyKey: transferBody.idempotencyKey }), 1);
      assert.equal(await Notification.countDocuments({ userId: sender._id, type: "TRANSFER_COMPLETED", relatedEntityId: createdBody.data.transfer.id }), 1);
      assert.equal(await Notification.countDocuments({ userId: recipient._id, type: "MONEY_RECEIVED", relatedEntityId: createdBody.data.transfer.id }), 1);
      assert.equal(await Notification.countDocuments({ userId: unrelated._id, relatedEntityId: createdBody.data.transfer.id }), 0);
      await assert.rejects(
        () => Transaction.create({
          transactionType: "TRANSFER",
          fromAccount: source._id,
          toAccount: destination._id,
          amount: "1.00",
          status: "COMPLETED",
          createdBy: sender._id,
          idempotencyKey: transferBody.idempotencyKey,
        }),
        (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === 11000,
      );

      const replayResponse = await createTransfer(accountRequest("/transfers", tokens.sender, "POST", transferBody));
      const replayBody = await replayResponse.json() as { data: { transfer: { id: string }; replayed: boolean } };
      assert.equal(replayResponse.status, 200);
      assert.equal(replayBody.data.replayed, true);
      assert.equal(replayBody.data.transfer.id, createdBody.data.transfer.id);
      assert.equal(await Notification.countDocuments({ relatedEntityId: createdBody.data.transfer.id }), 2);
      assert.equal((await BankAccount.findById(source._id))?.balance.toString(), "69.75");
      assert.equal((await BankAccount.findById(destination._id))?.balance.toString(), "40.25");

      assert.equal((await createTransfer(accountRequest("/transfers", tokens.sender, "POST", {
        ...transferBody,
        amount: "30.26",
      }))).status, 409);
      assert.equal((await createTransfer(accountRequest("/transfers", tokens.sender, "POST", {
        ...transferBody,
        fromAccountId: destination._id.toString(),
        idempotencyKey: randomUUID(),
      }))).status, 404);
      assert.equal((await createTransfer(accountRequest("/transfers", tokens.sender, "POST", {
        ...transferBody,
        recipientAccountNumber: ownOtherAccount.accountNumber,
        idempotencyKey: randomUUID(),
      }))).status, 400);
      assert.equal((await createTransfer(accountRequest("/transfers", tokens.sender, "POST", {
        ...transferBody,
        amount: "999.00",
        idempotencyKey: randomUUID(),
      }))).status, 409);
      assert.equal((await createTransfer(accountRequest("/transfers", tokens.staff, "POST", transferBody))).status, 403);
      assert.equal((await getMyTransfers(accountRequest("/transfers", tokens.staff))).status, 403);

      const senderHistoryResponse = await getMyTransfers(accountRequest("/transfers?page=1&limit=10", tokens.sender));
      const senderHistory = await senderHistoryResponse.json() as { data: { transfers: Array<{ id: string; direction: string }>; total: number } };
      assert.equal(senderHistoryResponse.status, 200);
      assert.equal(senderHistory.data.total, 1);
      assert.equal(senderHistory.data.transfers[0].direction, "SENT");
      assert.equal((await getMyTransfer(accountRequest(`/transfers/${createdBody.data.transfer.id}`, tokens.sender), {
        params: Promise.resolve({ id: createdBody.data.transfer.id }),
      })).status, 200);
      const recipientHistoryResponse = await getMyTransfers(accountRequest("/transfers", tokens.recipient));
      const recipientHistory = await recipientHistoryResponse.json() as { data: { transfers: Array<{ direction: string }> } };
      assert.equal(recipientHistory.data.transfers.length, 1);
      assert.equal(recipientHistory.data.transfers[0].direction, "RECEIVED");
      assert.equal((await getMyTransfer(accountRequest(`/transfers/${createdBody.data.transfer.id}`, tokens.unrelated), {
        params: Promise.resolve({ id: createdBody.data.transfer.id }),
      })).status, 404);
      assert.equal((await getMyTransfer(accountRequest("/transfers/not-an-id", tokens.sender), {
        params: Promise.resolve({ id: "not-an-id" }),
      })).status, 404);

      const concurrentBody = { ...transferBody, amount: "5.00", idempotencyKey: randomUUID() };
      const concurrentResponses = await Promise.all([
        createTransfer(accountRequest("/transfers", tokens.sender, "POST", concurrentBody)),
        createTransfer(accountRequest("/transfers", tokens.sender, "POST", concurrentBody)),
      ]);
      assert.deepEqual(concurrentResponses.map((response) => response.status).sort(), [200, 201]);
      assert.equal((await BankAccount.findById(source._id))?.balance.toString(), "64.75");
      assert.equal((await BankAccount.findById(destination._id))?.balance.toString(), "45.25");
      assert.equal(await Transaction.countDocuments({ idempotencyKey: concurrentBody.idempotencyKey }), 1);

      Transaction.create = (async () => { throw new Error("Test transaction insert failure."); }) as typeof Transaction.create;
      const failedBody = { ...transferBody, amount: "3.00", idempotencyKey: randomUUID() };
      assert.equal((await createTransfer(accountRequest("/transfers", tokens.sender, "POST", failedBody))).status, 500);
      assert.equal((await BankAccount.findById(source._id))?.balance.toString(), "64.75");
      assert.equal((await BankAccount.findById(destination._id))?.balance.toString(), "45.25");
      assert.equal(await Transaction.countDocuments({ idempotencyKey: failedBody.idempotencyKey }), 0);
      assert.equal(await Notification.countDocuments({ userId: sender._id, type: "TRANSFER_COMPLETED", message: /৳3\.00/ }), 0);
      assert.equal(await Notification.countDocuments({ userId: recipient._id, type: "MONEY_RECEIVED", message: /৳3\.00/ }), 0);
      Transaction.create = originalTransactionCreate;
    } finally {
      Transaction.create = originalTransactionCreate;
      if (mongoose.connection.readyState === 1) {
        const owners = await User.find({ email: { $in: Object.values(emails) } }).distinct("_id");
        await Notification.deleteMany({ userId: { $in: owners } });
        await Transaction.deleteMany({ $or: [{ fromAccount: { $in: accountIds } }, { toAccount: { $in: accountIds } }] });
        await BankAccount.deleteMany({ _id: { $in: accountIds } });
        await User.deleteMany({ email: { $in: Object.values(emails) } });
        assert.equal(await Transaction.countDocuments({ _id: { $in: transactionIds } }), 0);
        assert.equal(await User.exists({ email: { $in: Object.values(emails) } }), null);
      }
    }
  },
);
