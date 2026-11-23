import mongoose, { type ClientSession } from "mongoose";
import { formatBdtPaisa, parseBdtPaisa } from "@/lib/bdt-money";
import { Notification, type NotificationDocument } from "@/models/Notification";

export type NotificationEvent = {
  userId: mongoose.Types.ObjectId;
  type: NotificationDocument["type"];
  title: string;
  message: string;
  dedupeKey: string;
  relatedEntityType: NonNullable<NotificationDocument["relatedEntityType"]>;
  relatedEntityId: mongoose.Types.ObjectId;
};

export function formatNotificationAmount(amount: string) {
  const paisa = parseBdtPaisa(amount);
  if (paisa === null) return null;
  const formatted = formatBdtPaisa(paisa);
  const [whole, fraction] = formatted.split(".");
  return `৳${BigInt(whole).toLocaleString("en-BD")}.${fraction}`;
}

export async function createNotification(event: NotificationEvent, session?: ClientSession) {
  await Notification.updateOne(
    { dedupeKey: event.dedupeKey },
    { $setOnInsert: { ...event, isRead: false } },
    { upsert: true, ...(session ? { session } : {}) },
  );
}

export async function listNotifications(
  userId: mongoose.Types.ObjectId,
  options: { page: number; limit: number; status: "all" | "read" | "unread" },
) {
  const filter = { userId, ...(options.status === "all" ? {} : { isRead: options.status === "read" }) };
  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1, _id: -1 }).skip((options.page - 1) * options.limit).limit(options.limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId, isRead: false }),
  ]);
  return {
    notifications: notifications.map((item) => ({
      id: item._id.toString(), type: item.type, title: item.title, message: item.message,
      isRead: item.isRead, readAt: item.readAt?.toISOString() ?? null,
      relatedEntityType: item.relatedEntityType ?? null,
      relatedEntityId: item.relatedEntityId?.toString() ?? null,
      createdAt: item.createdAt.toISOString(),
    })),
    page: options.page, limit: options.limit, total,
    totalPages: Math.ceil(total / options.limit), unreadCount,
  };
}
