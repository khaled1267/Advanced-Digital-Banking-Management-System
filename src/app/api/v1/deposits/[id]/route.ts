import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { getDepositDetails } from "@/lib/deposit-queries";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authorization = await requireApiRoles(request, ["CUSTOMER"]);
  if (!authorization.ok) return authorization.response;
  const { id } = await context.params;
  if (!/^[\da-f]{24}$/i.test(id)) return NextResponse.json({ status: "error", message: "Invalid deposit reference." }, { status: 400 });

  try {
    await connectToDatabase();
    const deposit = await getDepositDetails({ _id: id, customerId: authorization.user._id }, false);
    if (!deposit) return NextResponse.json({ status: "error", message: "Deposit request not found." }, { status: 404 });
    return NextResponse.json({ status: "success", data: { deposit } });
  } catch {
    return NextResponse.json({ status: "error", message: "Could not retrieve the deposit request." }, { status: 500 });
  }
}
