import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { loadEnvConfig } from "@next/env";
import { NextRequest } from "next/server";
import { GET as listCustomers } from "../src/app/api/v1/staff/customers/route";
import { GET as getCustomer } from "../src/app/api/v1/staff/customers/[id]/route";
import { PATCH as decideVerification } from "../src/app/api/v1/staff/customers/[id]/verification/route";
import { GET as getProfile } from "../src/app/api/v1/profile/route";
import { AUTH_COOKIE_NAME, createSessionToken } from "../src/lib/session";
import { connectToDatabase } from "../src/lib/mongodb";
import { customerVerificationActionSchema, customerVerificationQuerySchema } from "../src/lib/validation/customer-verification";
import { User } from "../src/models/User";

loadEnvConfig(process.cwd());
const testDatabase = process.env.MONGODB_TEST_DATABASE?.trim();
const hasDedicatedTestDatabase = Boolean(
  process.env.MONGODB_URI?.startsWith("mongodb+srv://") && testDatabase && /(?:^|[_-])test(?:$|[_-])/i.test(testDatabase),
);
const runDatabaseIntegrationTests = process.env.RUN_DB_INTEGRATION_TESTS === "true" && hasDedicatedTestDatabase;
if (runDatabaseIntegrationTests) process.env.MONGODB_DATABASE = testDatabase;

function apiRequest(path: string, method = "GET", token?: string, body?: unknown) {
  const headers = new Headers();
  if (token) headers.set("cookie", `${AUTH_COOKIE_NAME}=${token}`);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new NextRequest(`http://localhost/api/v1${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

test("verification schemas accept only supported decisions and filters", () => {
  assert.equal(customerVerificationQuerySchema.safeParse({ verificationStatus: "PENDING", search: "Ada", page: "1", limit: "10" }).success, true);
  assert.equal(customerVerificationQuerySchema.safeParse({ verificationStatus: "APPROVED" }).success, false);
  assert.equal(customerVerificationActionSchema.safeParse({ verificationStatus: "VERIFIED" }).success, true);
  assert.equal(customerVerificationActionSchema.safeParse({ verificationStatus: "REJECTED", verificationNote: "Missing information" }).success, true);
  assert.equal(customerVerificationActionSchema.safeParse({ verificationStatus: "REJECTED" }).success, false);
  assert.equal(customerVerificationActionSchema.safeParse({ verificationStatus: "APPROVED" }).success, false);
  assert.equal(customerVerificationActionSchema.safeParse({ verificationStatus: "VERIFIED", role: "ADMIN" }).success, false);
});

test("customer verification list rejects unauthenticated requests", async () => {
  const response = await listCustomers(apiRequest("/staff/customers"));
  assert.equal(response.status, 401);
});

test("Staff and Admin review, decide, and expose verification safely", { skip: !runDatabaseIntegrationTests }, async () => {
  await connectToDatabase();
  const suffix = randomUUID();
  const users: string[] = [];
  try {
    const [staff, admin, customer, rejectedCustomer] = await User.create([
      { name: "Verification Staff", email: `verification-staff-${suffix}@example.test`, passwordHash: "test-only", role: "STAFF", status: "ACTIVE" },
      { name: "Verification Admin", email: `verification-admin-${suffix}@example.test`, passwordHash: "test-only", role: "ADMIN", status: "ACTIVE" },
      { name: "Pending Customer", email: `verification-customer-${suffix}@example.test`, passwordHash: "test-only", role: "CUSTOMER", status: "ACTIVE", verificationStatus: "PENDING" },
      { name: "Legacy Customer", email: `verification-legacy-${suffix}@example.test`, passwordHash: "test-only", role: "CUSTOMER", status: "ACTIVE" },
    ]);
    users.push(staff._id.toString(), admin._id.toString(), customer._id.toString(), rejectedCustomer._id.toString());
    const staffToken = await createSessionToken(staff._id.toString());
    const adminToken = await createSessionToken(admin._id.toString());
    const customerToken = await createSessionToken(customer._id.toString());

    const pendingResponse = await listCustomers(apiRequest(`/staff/customers?search=${encodeURIComponent(`verification-legacy-${suffix}`)}&verificationStatus=PENDING`, "GET", staffToken));
    assert.equal(pendingResponse.status, 200);
    const pendingList = (await pendingResponse.json()).data.customers;
    assert.equal(pendingList.length, 1);
    assert.equal(pendingList[0].verificationStatus, "PENDING");
    assert.equal(pendingList[0].id, rejectedCustomer._id.toString());

    const adminList = await listCustomers(apiRequest(`/staff/customers?search=${encodeURIComponent(`verification-customer-${suffix}`)}&verificationStatus=PENDING`, "GET", adminToken));
    assert.equal(adminList.status, 200);
    assert.equal((await adminList.json()).data.customers[0].verificationStatus, "PENDING");

    const verifyResponse = await decideVerification(
      apiRequest(`/staff/customers/${customer._id}/verification`, "PATCH", staffToken, { verificationStatus: "VERIFIED" }),
      { params: Promise.resolve({ id: customer._id.toString() }) },
    );
    assert.equal(verifyResponse.status, 200);
    const verified = (await verifyResponse.json()).data.customer;
    assert.equal(verified.verificationStatus, "VERIFIED");
    assert.equal(verified.verifiedBy.id, staff._id.toString());
    assert.ok(verified.verifiedAt);

    const customerProfile = await getProfile(apiRequest("/profile", "GET", customerToken));
    assert.equal(customerProfile.status, 200);
    assert.equal((await customerProfile.json()).data.profile.verificationStatus, "VERIFIED");

    const customerDecision = await decideVerification(
      apiRequest(`/staff/customers/${customer._id}/verification`, "PATCH", customerToken, { verificationStatus: "REJECTED", verificationNote: "Attempt" }),
      { params: Promise.resolve({ id: customer._id.toString() }) },
    );
    assert.equal(customerDecision.status, 403);

    const rejectResponse = await decideVerification(
      apiRequest(`/staff/customers/${rejectedCustomer._id}/verification`, "PATCH", adminToken, { verificationStatus: "REJECTED", verificationNote: "Please update the registered name." }),
      { params: Promise.resolve({ id: rejectedCustomer._id.toString() }) },
    );
    assert.equal(rejectResponse.status, 200);
    const rejected = (await rejectResponse.json()).data.customer;
    assert.equal(rejected.verificationStatus, "REJECTED");
    assert.equal(rejected.verificationNote, "Please update the registered name.");
    assert.equal(rejected.verifiedBy.id, admin._id.toString());
    assert.ok(rejected.verifiedAt);

    const detailResponse = await getCustomer(apiRequest(`/staff/customers/${rejectedCustomer._id}`, "GET", staffToken), { params: Promise.resolve({ id: rejectedCustomer._id.toString() }) });
    assert.equal((await detailResponse.json()).data.customer.verificationStatus, "REJECTED");

    const repeatedDecision = await decideVerification(
      apiRequest(`/staff/customers/${customer._id}/verification`, "PATCH", staffToken, { verificationStatus: "REJECTED", verificationNote: "Another reason" }),
      { params: Promise.resolve({ id: customer._id.toString() }) },
    );
    assert.equal(repeatedDecision.status, 409);
  } finally {
    if (users.length) await User.deleteMany({ _id: { $in: users } });
  }
});
