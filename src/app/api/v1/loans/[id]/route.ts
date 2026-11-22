import { NextRequest, NextResponse } from "next/server";
import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { getLoanDetails } from "@/lib/loan-queries";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authorization = await requireApiRoles(request, ["CUSTOMER"]);
  if (!authorization.ok) return authorization.response;
  const { id } = await context.params;
  if (!/^[\da-f]{24}$/i.test(id)) {
    return NextResponse.json({ status: "error", message: "Invalid loan reference." }, { status: 400 });
  }

  try {
    await connectToDatabase();
    const loan = await getLoanDetails({ _id: id, customerId: authorization.user._id }, false);
    if (!loan) return NextResponse.json({ status: "error", message: "Loan application not found." }, { status: 404 });
    return NextResponse.json({ status: "success", data: { loan } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ status: "error", message: "Could not retrieve the loan application." }, { status: 500 });
  }
}
