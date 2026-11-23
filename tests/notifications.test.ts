import assert from "node:assert/strict";
import { after, test } from "node:test";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { NextRequest } from "next/server";
import { connectToDatabase } from "../src/lib/mongodb";
import { AUTH_COOKIE_NAME, createSessionToken } from "../src/lib/session";
import { GET as getNotifications } from "../src/app/api/v1/notifications/route";
import { PATCH as markNotificationRead } from "../src/app/api/v1/notifications/[id]/read/route";
import { PATCH as markAllNotificationsRead } from "../src/app/api/v1/notifications/read-all/route";
import { formatNotificationAmount } from "../src/lib/notification-operations";
import { notificationIdSchema, notificationListQuerySchema } from "../src/lib/validation/notification";
import { NOTIFICATION_TYPES, Notification } from "../src/models/Notification";
import { User } from "../src/models/User";

after(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

test("notification amounts use exact paise and BDT grouping", () => {
  assert.equal(formatNotificationAmount("5000"), "৳5,000.00");
  assert.equal(formatNotificationAmount("12345678901234567890123456789012.99"), "৳12,345,678,901,234,567,890,123,456,789,012.99");
  assert.equal(formatNotificationAmount("invalid"), null);
});

test("notification list query validates status and bounded pagination", () => {
  assert.deepEqual(notificationListQuerySchema.parse({}), { page: 1, limit: 10, status: "all" });
  assert.deepEqual(notificationListQuerySchema.parse({ page: "3", limit: "20", status: "unread" }), { page: 3, limit: 20, status: "unread" });
  assert.equal(notificationListQuerySchema.safeParse({ page: "0" }).success, false);
  assert.equal(notificationListQuerySchema.safeParse({ limit: "51" }).success, false);
  assert.equal(notificationListQuerySchema.safeParse({ status: "archived" }).success, false);
  assert.equal(notificationListQuerySchema.safeParse({ userId: new mongoose.Types.ObjectId().toString() }).success, false);
});

test("notification ID validation rejects malformed references", () => {
  assert.equal(notificationIdSchema.safeParse("0123456789abcdef01234567").success, true);
  assert.equal(notificationIdSchema.safeParse("not-an-id").success, false);
});

test("notification API requires an authenticated customer before reading or updating", async () => {
  const getResponse = await getNotifications(new NextRequest("http://localhost/api/v1/notifications"));
  const markOneResponse = await markNotificationRead(new NextRequest("http://localhost/api/v1/notifications/not-an-id", { method: "PATCH" }), { params: Promise.resolve({ id: "not-an-id" }) });
  const markAllResponse = await markAllNotificationsRead(new NextRequest("http://localhost/api/v1/notifications/read-all", { method: "PATCH" }));
  assert.equal(getResponse.status, 401);
  assert.equal(markOneResponse.status, 401);
  assert.equal(markAllResponse.status, 401);
});

test("notification model constrains event types and creates recipient, read, and unique dedupe indexes", () => {
  assert.deepEqual(NOTIFICATION_TYPES, ["MONEY_RECEIVED", "TRANSFER_COMPLETED", "DEPOSIT_APPROVED", "WITHDRAWAL_REJECTED", "LOAN_APPROVED", "LOAN_REJECTED"]);
  const indexes = Notification.schema.indexes();
  assert.ok(indexes.some(([keys]) => keys.userId === 1 && keys.createdAt === -1));
  assert.ok(indexes.some(([keys]) => keys.userId === 1 && keys.isRead === 1));
  assert.ok(indexes.some(([keys, options]) => keys.dedupeKey === 1 && options?.unique === true));
  assert.equal(Notification.schema.path("type")?.options.enum?.toString(), NOTIFICATION_TYPES.toString());
});

test(
  "notification API isolates recipients and read updates, and mark-all affects only the current customer",
  { skip: process.env.RUN_DB_INTEGRATION_TESTS !== "true" },
  async () => {
    loadEnvConfig(process.cwd());
    const testDatabase = process.env.MONGODB_TEST_DATABASE?.trim();
    if (!testDatabase || !/(?:^|[_-])test(?:$|[_-])/i.test(testDatabase) || !process.env.MONGODB_URI?.startsWith("mongodb+srv://")) {
      throw new Error("Notification API integration tests require an Atlas SRV URI and a dedicated test database name.");
    }
    process.env.MONGODB_DATABASE = testDatabase;
    const suffix = randomUUID();
    const emails = [`notification-api-a-${suffix}@example.com`, `notification-api-b-${suffix}@example.com`];
    let userIds: mongoose.Types.ObjectId[] = [];
    const notificationIds: mongoose.Types.ObjectId[] = [];
    try {
      await connectToDatabase();
      await Promise.all([User.init(), Notification.init()]);
      const [customerA, customerB] = await User.create([
        { name: "Notification API Customer A", email: emails[0], passwordHash: "test-hash", role: "CUSTOMER" },
        { name: "Notification API Customer B", email: emails[1], passwordHash: "test-hash", role: "CUSTOMER" },
      ]);
      userIds = [customerA._id, customerB._id];
      const [ownUnread, ownRead, otherUnread] = await Notification.create([
        { userId: customerA._id, type: "MONEY_RECEIVED", title: "Received", message: "You received funds.", dedupeKey: `test:${suffix}:a-unread`, relatedEntityType: "transaction", relatedEntityId: new mongoose.Types.ObjectId() },
        { userId: customerA._id, type: "LOAN_APPROVED", title: "Approved", message: "Your loan was approved.", dedupeKey: `test:${suffix}:a-read`, isRead: true, readAt: new Date(), relatedEntityType: "loan", relatedEntityId: new mongoose.Types.ObjectId() },
        { userId: customerB._id, type: "DEPOSIT_APPROVED", title: "Deposit", message: "Your deposit was approved.", dedupeKey: `test:${suffix}:b-unread` },
      ]);
      notificationIds.push(ownUnread._id, ownRead._id, otherUnread._id);
      const tokenA = await createSessionToken(customerA._id.toString());
      const tokenB = await createSessionToken(customerB._id.toString());
      const request = (path: string, token: string, method = "GET") => new NextRequest(`http://localhost/api/v1${path}`, { method, headers: { cookie: `${AUTH_COOKIE_NAME}=${token}` } });

      const ownList = await getNotifications(request("/notifications?status=all", tokenA));
      const ownBody = await ownList.json() as { data: { notifications: Array<{ id: string }>; total: number; unreadCount: number } };
      assert.equal(ownList.status, 200);
      assert.equal(ownBody.data.total, 2);
      assert.equal(ownBody.data.unreadCount, 1);
      assert.deepEqual(new Set(ownBody.data.notifications.map((item) => item.id)), new Set([ownUnread._id.toString(), ownRead._id.toString()]));
      assert.equal((await getNotifications(request(`/notifications?userId=${customerB._id}`, tokenA))).status, 400);

      const markOwn = await markNotificationRead(request(`/notifications/${ownUnread._id}/read`, tokenA, "PATCH"), { params: Promise.resolve({ id: ownUnread._id.toString() }) });
      assert.equal(markOwn.status, 200);
      const markOther = await markNotificationRead(request(`/notifications/${otherUnread._id}/read`, tokenA, "PATCH"), { params: Promise.resolve({ id: otherUnread._id.toString() }) });
      assert.equal(markOther.status, 404);
      assert.equal((await markNotificationRead(request("/notifications/not-an-id/read", tokenA, "PATCH"), { params: Promise.resolve({ id: "not-an-id" }) })).status, 400);

      const markAll = await markAllNotificationsRead(request("/notifications/read-all", tokenA, "PATCH"));
      assert.equal(markAll.status, 200);
      assert.equal((await Notification.countDocuments({ userId: customerA._id, isRead: false })), 0);
      assert.equal((await Notification.countDocuments({ userId: customerB._id, isRead: false })), 1);
      const otherList = await getNotifications(request("/notifications?status=unread", tokenB));
      const otherBody = await otherList.json() as { data: { total: number; unreadCount: number } };
      assert.equal(otherBody.data.total, 1);
      assert.equal(otherBody.data.unreadCount, 1);
    } finally {
      if (mongoose.connection.readyState === 1) {
        await Notification.deleteMany({ _id: { $in: notificationIds } });
        if (userIds.length) await User.deleteMany({ _id: { $in: userIds } });
        await User.deleteMany({ email: { $in: emails } });
      }
    }
  },
);
