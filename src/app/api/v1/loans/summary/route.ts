import { NextRequest, NextResponse } from "next/server";
import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { getCustomerLoanSummary } from "@/lib/loan-queries";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["CUSTOMER"]);
  if (!authorization.ok) return authorization.response;

  try {
    await connectToDatabase();
    const summary = await getCustomerLoanSummary(authorization.user._id);
    return NextResponse.json({ status: "success", data: summary }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ status: "error", message: "Could not retrieve your loan summary." }, {
      status: 500,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
