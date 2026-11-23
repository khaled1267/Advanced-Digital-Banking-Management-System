import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { Notification } from "@/models/Notification";
import { notificationIdSchema } from "@/lib/validation/notification";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authorization = await requireApiRoles(request, ["CUSTOMER"]);
  if (!authorization.ok) return authorization.response;
  const { id } = await context.params;
  if (!notificationIdSchema.safeParse(id).success) return NextResponse.json({ status: "error", message: "Invalid notification reference." }, { status: 400 });
  try {
    await connectToDatabase();
    let notification = await Notification.findOneAndUpdate(
      { _id: id, userId: authorization.user._id, isRead: false },
      { $set: { isRead: true, readAt: new Date() } },
      { returnDocument: "after" },
    ).select("_id isRead readAt");
    if (!notification) {
      notification = await Notification.findOne({ _id: id, userId: authorization.user._id }).select("_id isRead readAt");
    }
    if (!notification) return NextResponse.json({ status: "error", message: "Notification not found." }, { status: 404 });
    const readAt = notification.readAt ?? new Date();
    return NextResponse.json({ status: "success", data: { id: notification._id.toString(), isRead: true, readAt: readAt.toISOString() } });
  } catch {
    return NextResponse.json({ status: "error", message: "Could not update notification." }, { status: 500 });
  }
}
