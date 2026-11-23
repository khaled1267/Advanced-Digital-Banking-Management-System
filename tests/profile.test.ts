import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { loadEnvConfig } from "@next/env";
import { NextRequest } from "next/server";
import { GET as getProfile, PATCH as patchProfile } from "../src/app/api/v1/profile/route";
import { POST as finalizeAvatarUpload, DELETE as removeAvatar } from "../src/app/api/v1/profile/avatar/route";
import { POST as createAvatarSignature } from "../src/app/api/v1/profile/avatar/signature/route";
import { GET as getCurrentUser } from "../src/app/api/v1/auth/me/route";
import { AUTH_COOKIE_NAME, createSessionToken } from "../src/lib/session";
import { connectToDatabase } from "../src/lib/mongodb";
import { profileUpdateSchema, PROFILE_IMAGE_MAX_BYTES, validateProfileImage } from "../src/lib/validation/profile";
import { User } from "../src/models/User";
import { createAvatarUploadSignature as makeAvatarSignature, detectProfileImageFormat, isAllowedAvatarAsset, isAvatarPublicIdOwnedBy, signCloudinaryParams } from "../src/lib/cloudinary";

loadEnvConfig(process.cwd());
const testDatabase = process.env.MONGODB_TEST_DATABASE?.trim();
const hasDedicatedTestDatabase = Boolean(
  process.env.MONGODB_URI?.startsWith("mongodb+srv://") &&
  testDatabase &&
  /(?:^|[_-])test(?:$|[_-])/i.test(testDatabase),
);
if (hasDedicatedTestDatabase) process.env.MONGODB_DATABASE = testDatabase;

function profileRequest(method: "GET" | "PATCH", token?: string, body?: unknown) {
  const headers = new Headers();
  if (token) headers.set("cookie", `${AUTH_COOKIE_NAME}=${token}`);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new NextRequest("http://localhost/api/v1/profile", {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function avatarRequest(method: "POST" | "DELETE", token?: string, body?: unknown) {
  const headers = new Headers();
  if (token) headers.set("cookie", `${AUTH_COOKIE_NAME}=${token}`);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new NextRequest("http://localhost/api/v1/profile/avatar", {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function signatureRequest(token?: string) {
  const headers = new Headers();
  if (token) headers.set("cookie", `${AUTH_COOKIE_NAME}=${token}`);
  return new NextRequest("http://localhost/api/v1/profile/avatar/signature", { method: "POST", headers });
}

test("profile name validation allows a name only and rejects privileged fields", () => {
  assert.deepEqual(profileUpdateSchema.parse({ name: "  Ada Lovelace  " }), { name: "Ada Lovelace" });
  assert.equal(profileUpdateSchema.safeParse({ name: "A" }).success, false);
  assert.equal(profileUpdateSchema.safeParse({ name: "Ada Lovelace", role: "ADMIN" }).success, false);
  assert.equal(profileUpdateSchema.safeParse({ name: "Ada Lovelace", balance: "999999" }).success, false);
  assert.equal(profileUpdateSchema.safeParse({ name: "Ada Lovelace", userId: "someone-else" }).success, false);
});

test("profile picture validation accepts supported images up to 5 MB", () => {
  assert.equal(validateProfileImage({ type: "image/jpeg", size: PROFILE_IMAGE_MAX_BYTES }), null);
  assert.equal(validateProfileImage({ type: "image/png", size: 1024 }), null);
  assert.equal(validateProfileImage({ type: "image/webp", size: 1024 }), null);
  assert.match(validateProfileImage({ type: "image/png", size: 0 }) ?? "", /not be empty/);
  assert.match(validateProfileImage({ type: "image/gif", size: 1024 }) ?? "", /JPG, PNG, or WebP/);
  assert.match(validateProfileImage({ type: "image/jpeg", size: PROFILE_IMAGE_MAX_BYTES + 1 }) ?? "", /5 MB/);
});

test("Cloudinary signature and image-content helpers enforce the profile avatar constraints", () => {
  const config = { cloudName: "northstar-test", apiKey: "public-test-key", apiSecret: "unit-test-secret" };
  const signature = makeAvatarSignature("0123456789abcdef01234567", config);
  assert.equal(signature.signature, signCloudinaryParams({ allowed_formats: "jpg,jpeg,png,webp", overwrite: "false", public_id: signature.public_id, timestamp: signature.timestamp }, config.apiSecret));
  assert.equal(isAvatarPublicIdOwnedBy(signature.public_id, "0123456789abcdef01234567"), true);
  assert.equal(isAvatarPublicIdOwnedBy(signature.public_id, "fedcba9876543210fedcba98"), false);
  assert.equal(detectProfileImageFormat(new Uint8Array([0xff, 0xd8, 0xff, 0x00])), "jpg");
  assert.equal(detectProfileImageFormat(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])), "png");
  assert.equal(detectProfileImageFormat(new TextEncoder().encode("RIFFxxxxWEBP")), "webp");
  assert.equal(detectProfileImageFormat(new TextEncoder().encode("not an image")), null);
  assert.equal(isAllowedAvatarAsset({ public_id: signature.public_id, resource_type: "image", format: "jpg", bytes: 1000, secure_url: `https://res.cloudinary.com/${config.cloudName}/image/upload/v1/avatar.jpg` }, signature.public_id, config.cloudName), true);
  assert.equal(isAllowedAvatarAsset({ public_id: signature.public_id, resource_type: "image", format: "jpg", bytes: PROFILE_IMAGE_MAX_BYTES + 1, secure_url: `https://res.cloudinary.com/${config.cloudName}/image/upload/v1/avatar.jpg` }, signature.public_id, config.cloudName), false);
});

test("profile API rejects unauthenticated requests", async () => {
  const getResponse = await getProfile(profileRequest("GET"));
  assert.equal(getResponse.status, 401);
  const patchResponse = await patchProfile(profileRequest("PATCH", undefined, { name: "Changed Name" }));
  assert.equal(patchResponse.status, 401);
  assert.equal((await createAvatarSignature(signatureRequest())).status, 401);
  assert.equal((await finalizeAvatarUpload(avatarRequest("POST", undefined, { publicId: "any" }))).status, 401);
  assert.equal((await removeAvatar(avatarRequest("DELETE"))).status, 401);
});

test("authenticated customer can read and update only their own profile", { skip: !hasDedicatedTestDatabase }, async () => {
  await connectToDatabase();
  const suffix = randomUUID();
  const ownEmail = `profile-owner-${suffix}@example.test`;
  const otherEmail = `profile-other-${suffix}@example.test`;
  let ownerId = "";
  let otherId = "";

  try {
    const [owner, other] = await User.create([
      { name: "Profile Owner", email: ownEmail, passwordHash: "test-only", role: "CUSTOMER", status: "ACTIVE" },
      { name: "Other Customer", email: otherEmail, passwordHash: "test-only", role: "CUSTOMER", status: "ACTIVE" },
    ]);
    ownerId = owner._id.toString();
    otherId = other._id.toString();
    const ownerToken = await createSessionToken(ownerId);
    const otherToken = await createSessionToken(otherId);

    const ownerResponse = await getProfile(profileRequest("GET", ownerToken));
    assert.equal(ownerResponse.status, 200);
    const ownerPayload = await ownerResponse.json();
    assert.equal(ownerPayload.data.profile.id, ownerId);
    assert.equal(ownerPayload.data.profile.name, "Profile Owner");
    assert.deepEqual(ownerPayload.data.accounts, []);
    assert.equal("passwordHash" in ownerPayload.data.profile, false);

    const otherResponse = await getProfile(profileRequest("GET", otherToken));
    assert.equal(otherResponse.status, 200);
    const otherPayload = await otherResponse.json();
    assert.equal(otherPayload.data.profile.id, otherId);
    assert.notEqual(otherPayload.data.profile.id, ownerId);

    const changedResponse = await patchProfile(profileRequest("PATCH", ownerToken, { name: "Updated Owner" }));
    assert.equal(changedResponse.status, 200);
    assert.equal((await User.findById(ownerId).select("name role").lean())?.name, "Updated Owner");

    const forbiddenFieldsResponse = await patchProfile(profileRequest("PATCH", ownerToken, {
      name: "Attempted Role Change",
      userId: otherId,
      role: "ADMIN",
      balance: "1000000",
    }));
    assert.equal(forbiddenFieldsResponse.status, 400);
    const ownerAfterAttack = await User.findById(ownerId).select("name role").lean();
    assert.equal(ownerAfterAttack?.name, "Updated Owner");
    assert.equal(ownerAfterAttack?.role, "CUSTOMER");
  } finally {
    if (ownerId || otherId) await User.deleteMany({ _id: { $in: [ownerId, otherId].filter(Boolean) } });
  }
});

test("avatar replacement persists on the authenticated account and removal clears its reference", { skip: !hasDedicatedTestDatabase }, async () => {
  await connectToDatabase();
  const suffix = randomUUID();
  const email = `avatar-owner-${suffix}@example.test`;
  const otherEmail = `avatar-other-${suffix}@example.test`;
  const previousCloudinaryEnv = {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  };
  const previousFetch = globalThis.fetch;
  const assets = new Map<string, Record<string, unknown>>();
  const deletedPublicIds: string[] = [];
  let failDelete = false;
  let ownerId = "";
  let otherId = "";

  process.env.CLOUDINARY_CLOUD_NAME = "northstar-test";
  process.env.CLOUDINARY_API_KEY = "test-api-key";
  process.env.CLOUDINARY_API_SECRET = "test-api-secret-only";

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/resources/image/upload/")) {
      const encoded = url.split("/resources/image/upload/")[1];
      const publicId = encoded.split("/").map(decodeURIComponent).join("/");
      const asset = assets.get(publicId);
      return asset ? Response.json(asset) : Response.json({ error: "Not found" }, { status: 404 });
    }
    if (url.endsWith("/image/destroy") && init?.body instanceof FormData) {
      const publicId = String(init.body.get("public_id"));
      deletedPublicIds.push(publicId);
      if (failDelete) return Response.json({ result: "error" }, { status: 500 });
      assets.delete(publicId);
      return Response.json({ result: "ok" });
    }
    throw new Error("Unexpected Cloudinary test request.");
  }) as typeof fetch;

  try {
    const [owner, other] = await User.create([
      { name: "Avatar Owner", email, passwordHash: "test-only", role: "CUSTOMER", status: "ACTIVE" },
      { name: "Avatar Other", email: otherEmail, passwordHash: "test-only", role: "CUSTOMER", status: "ACTIVE" },
    ]);
    ownerId = owner._id.toString();
    otherId = other._id.toString();
    const ownerToken = await createSessionToken(ownerId);
    const otherToken = await createSessionToken(otherId);

    const firstIntentResponse = await createAvatarSignature(signatureRequest(ownerToken));
    assert.equal(firstIntentResponse.status, 200);
    const firstIntent = (await firstIntentResponse.json()).data;
    assets.set(firstIntent.public_id, {
      public_id: firstIntent.public_id,
      resource_type: "image",
      format: "png",
      bytes: 1024,
      secure_url: `https://res.cloudinary.com/northstar-test/image/upload/v1/${firstIntent.public_id}.png`,
    });

    const firstSaveResponse = await finalizeAvatarUpload(avatarRequest("POST", ownerToken, { publicId: firstIntent.public_id }));
    assert.equal(firstSaveResponse.status, 200);
    const firstSavedProfile = (await User.findById(ownerId).select("profileImageUrl profileImagePublicId").lean());
    assert.equal(firstSavedProfile?.profileImagePublicId, firstIntent.public_id);
    assert.match(firstSavedProfile?.profileImageUrl ?? "", /^https:\/\/res\.cloudinary\.com\//);

    const meResponse = await getCurrentUser(profileRequest("GET", ownerToken));
    assert.equal((await meResponse.json()).data.user.profileImageUrl, firstSavedProfile?.profileImageUrl);

    const secondIntentResponse = await createAvatarSignature(signatureRequest(ownerToken));
    const secondIntent = (await secondIntentResponse.json()).data;
    assets.set(secondIntent.public_id, {
      public_id: secondIntent.public_id,
      resource_type: "image",
      format: "webp",
      bytes: 2048,
      secure_url: `https://res.cloudinary.com/northstar-test/image/upload/v2/${secondIntent.public_id}.webp`,
    });
    const replaceResponse = await finalizeAvatarUpload(avatarRequest("POST", ownerToken, { publicId: secondIntent.public_id }));
    assert.equal(replaceResponse.status, 200);
    assert.equal((await User.findById(ownerId).select("profileImagePublicId").lean())?.profileImagePublicId, secondIntent.public_id);
    assert.equal(deletedPublicIds.includes(firstIntent.public_id), true);

    await removeAvatar(avatarRequest("DELETE", otherToken));
    assert.equal((await User.findById(ownerId).select("profileImagePublicId").lean())?.profileImagePublicId, secondIntent.public_id);

    failDelete = true;
    const removeResponse = await removeAvatar(avatarRequest("DELETE", ownerToken));
    assert.equal(removeResponse.status, 200);
    assert.equal((await removeResponse.json()).data.cleanupPending, true);
    const removedProfile = await User.findById(ownerId).select("profileImageUrl profileImagePublicId").lean();
    assert.equal(removedProfile?.profileImageUrl, undefined);
    assert.equal(removedProfile?.profileImagePublicId, undefined);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousCloudinaryEnv)) {
      const envKey = key === "cloudName" ? "CLOUDINARY_CLOUD_NAME" : key === "apiKey" ? "CLOUDINARY_API_KEY" : "CLOUDINARY_API_SECRET";
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    }
    if (ownerId || otherId) await User.deleteMany({ _id: { $in: [ownerId, otherId].filter(Boolean) } });
  }
});
