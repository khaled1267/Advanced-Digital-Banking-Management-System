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
    loadEnvConfig(process.cwd(), true);

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
  "RBAC enforces dashboard roles, admin API access, active status, and database role changes",
  { skip: process.env.RUN_DB_INTEGRATION_TESTS !== "true" },
  async () => {
    loadEnvConfig(process.cwd(), true);

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
    loadEnvConfig(process.cwd(), true);

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
    loadEnvConfig(process.cwd(), true);

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
    loadEnvConfig(process.cwd(), true);
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
    loadEnvConfig(process.cwd(), true);
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

  for (const amount of ["0", "-0.01"]) {
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
    loadEnvConfig(process.cwd(), true);
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
    loadEnvConfig(process.cwd(), true);
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
      assert.equal((await reviewRequest(main.body.data.deposit.id, tokens.staff, { action: "APPROVE" })).status, 409);
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
    } finally {
      Transaction.create = originalTransactionCreate;
      if (mongoose.connection.readyState === 1) {
        const customer = await User.findOne({ email: emails.customer }).select("_id");
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
    loadEnvConfig(process.cwd(), true);
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
      assert.equal((await BankAccount.findById(activeAccount._id))?.balance.toString(), "39.75");
      assert.equal(await Transaction.countDocuments({ createdBy: customer._id, fromAccount: activeAccount._id }), 1);
      assert.equal((await reviewRequest(rejectionId, tokens.admin, { action: "APPROVE" })).status, 409);

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
    loadEnvConfig(process.cwd(), true);
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
      Transaction.create = originalTransactionCreate;
    } finally {
      Transaction.create = originalTransactionCreate;
      if (mongoose.connection.readyState === 1) {
        await Transaction.deleteMany({ $or: [{ fromAccount: { $in: accountIds } }, { toAccount: { $in: accountIds } }] });
        await BankAccount.deleteMany({ _id: { $in: accountIds } });
        await User.deleteMany({ email: { $in: Object.values(emails) } });
        assert.equal(await Transaction.countDocuments({ _id: { $in: transactionIds } }), 0);
        assert.equal(await User.exists({ email: { $in: Object.values(emails) } }), null);
      }
    }
  },
);
