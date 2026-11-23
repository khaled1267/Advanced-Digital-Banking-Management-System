import { NextRequest, NextResponse } from "next/server";
import { requireApiRoles } from "@/lib/admin-api";
import { parseAnalyticsRange } from "@/lib/analytics-range";
import { getAdminAnalytics, getCustomerAnalytics, getStaffAnalytics } from "@/lib/analytics";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["ADMIN", "STAFF", "CUSTOMER"]);
  if (!authorization.ok) return authorization.response;
  const range = parseAnalyticsRange(request.nextUrl.searchParams);
  if (!range) return NextResponse.json({ status: "error", message: "Choose a valid date range of up to 365 days." }, { status: 400 });
  try {
    const data = authorization.user.role === "ADMIN"
      ? await getAdminAnalytics(range)
      : authorization.user.role === "STAFF"
        ? await getStaffAnalytics()
        : await getCustomerAnalytics(authorization.user._id, range);
    return NextResponse.json({ status: "success", data });
  } catch {
    return NextResponse.json({ status: "error", message: "Could not load dashboard analytics." }, { status: 500 });
  }
}
