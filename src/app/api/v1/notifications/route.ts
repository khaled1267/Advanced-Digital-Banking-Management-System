import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { listNotifications } from "@/lib/notification-operations";
import { notificationListQuerySchema } from "@/lib/validation/notification";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["CUSTOMER"]);
  if (!authorization.ok) return authorization.response;
  const parsed = notificationListQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ status: "error", message: "Invalid notification query." }, { status: 400 });
  try {
    await connectToDatabase();
    const data = await listNotifications(authorization.user._id, parsed.data);
    return NextResponse.json({ status: "success", data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ status: "error", message: "Could not retrieve notifications." }, { status: 500 });
  }
}
