import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { getMyTransfer } from "@/lib/transfer-queries";
import { Types } from "mongoose";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/v1/transfers/[id]">,
) {
  const authorization = await requireApiRoles(request, ["CUSTOMER"]);
  if (!authorization.ok) return authorization.response;
  const { id } = await context.params;
  if (!/^[\da-f]{24}$/i.test(id)) {
    return NextResponse.json({ status: "error", message: "Transfer not found." }, { status: 404 });
  }

  try {
    await connectToDatabase();
    const data = await getMyTransfer(authorization.user._id, new Types.ObjectId(id));
    if (!data) return NextResponse.json({ status: "error", message: "Transfer not found." }, { status: 404 });
    return NextResponse.json({ status: "success", data: { transfer: data } });
  } catch {
    return NextResponse.json({ status: "error", message: "Could not retrieve the transfer." }, { status: 500 });
  }
}
