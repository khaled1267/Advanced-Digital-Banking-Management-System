import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { loadEnvConfig } from "@next/env";
import { NextRequest } from "next/server";
import { POST as registerCustomer } from "../src/app/api/v1/staff/customers/route";
import { AUTH_COOKIE_NAME, createSessionToken } from "../src/lib/session";
import { connectToDatabase } from "../src/lib/mongodb";
import { hashPassword } from "../src/lib/password";
import { userRegistrationSchema } from "../src/lib/validation/user";
import { User } from "../src/models/User";

loadEnvConfig(process.cwd());
const testDatabase = process.env.MONGODB_TEST_DATABASE?.trim();
const hasDedicatedTestDatabase = Boolean(
  process.env.MONGODB_URI?.startsWith("mongodb+srv://") && testDatabase && /(?:^|[_-])test(?:$|[_-])/i.test(testDatabase),
);
const runDatabaseIntegrationTests = process.env.RUN_DB_INTEGRATION_TESTS === "true" && hasDedicatedTestDatabase;
if (runDatabaseIntegrationTests) process.env.MONGODB_DATABASE = testDatabase;

function registrationRequest(body: unknown, token?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("cookie", `${AUTH_COOKIE_NAME}=${token}`);
  return new NextRequest("http://localhost/api/v1/staff/customers", { method: "POST", headers, body: JSON.stringify(body) });
}

test("staff customer registration rejects unauthenticated requests", async () => {
  const response = await registerCustomer(registrationRequest({ name: "New Customer", email: "customer@example.test", password: "safe-password-123" }));
  assert.equal(response.status, 401);
});

test("customer registration input cannot choose its role or status", () => {
  assert.equal(userRegistrationSchema.safeParse({ name: "A Customer", email: "customer@example.test", password: "safe-password-123" }).success, true);
  assert.equal(userRegistrationSchema.safeParse({ name: "A Customer", email: "customer@example.test", password: "safe-password-123", role: "ADMIN" }).success, false);
  assert.equal(userRegistrationSchema.safeParse({ name: "A Customer", email: "customer@example.test", password: "safe-password-123", status: "INACTIVE" }).success, false);
});

test("Staff creates only a Customer and duplicate email is rejected", { skip: !runDatabaseIntegrationTests }, async () => {
  await connectToDatabase();
  const suffix = randomUUID();
  const email = `staff-created-${suffix}@example.test`;
  let staffId = "";
  let customerId = "";
  try {
    const staff = await User.create({ name: "Test Staff", email: `staff-${suffix}@example.test`, passwordHash: await hashPassword("staff-test-password-123"), role: "STAFF", status: "ACTIVE" });
    staffId = staff._id.toString();
    const token = await createSessionToken(staffId);
    const input = { name: "Registered Customer", email, password: "customer-test-password-123" };
    const response = await registerCustomer(registrationRequest(input, token));
    assert.equal(response.status, 201);
    const created = (await response.json()).data.customer;
    customerId = created.id;
    assert.equal(created.role, "CUSTOMER");
    assert.equal((await User.findById(customerId).select("role verificationStatus").lean())?.role, "CUSTOMER");
    assert.equal((await User.findById(customerId).select("verificationStatus").lean())?.verificationStatus, "PENDING");
    const duplicate = await registerCustomer(registrationRequest(input, token));
    assert.equal(duplicate.status, 409);
  } finally {
    await User.deleteMany({ _id: { $in: [staffId, customerId].filter(Boolean) } });
  }
});
