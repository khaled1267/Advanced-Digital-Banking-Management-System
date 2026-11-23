import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { Notification } from "@/models/Notification";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["CUSTOMER"]);
  if (!authorization.ok) return authorization.response;
  try {
    await connectToDatabase();
    const result = await Notification.updateMany(
      { userId: authorization.user._id, isRead: false },
      { $set: { isRead: true, readAt: new Date() } },
    );
    return NextResponse.json({ status: "success", data: { updatedCount: result.modifiedCount, unreadCount: 0 } });
  } catch {
    return NextResponse.json({ status: "error", message: "Could not update notifications." }, { status: 500 });
  }
}
