import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { User } from "@/models/User";
import { isObjectIdOrHexString } from "mongoose";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(status: number, message: string) {
  return NextResponse.json({ status: "error", message }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const authorization = await requireApiRoles(request, ["STAFF", "ADMIN"]);
  if (!authorization.ok) return authorization.response;

  const { id } = await context.params;
  if (!isObjectIdOrHexString(id)) return errorResponse(400, "Invalid customer id.");

  try {
    await connectToDatabase();
    const customer = await User.findOne({ _id: id, role: "CUSTOMER" })
      .select("name email status profileImageUrl createdAt updatedAt verificationStatus verifiedBy verifiedAt verificationNote")
      .populate({ path: "verifiedBy", select: "name email role" })
      .lean();
    if (!customer) return errorResponse(404, "Customer not found.");

    const reviewer = customer.verifiedBy && typeof customer.verifiedBy === "object" && "name" in customer.verifiedBy
      ? customer.verifiedBy as unknown as { _id: unknown; name: string; email: string; role: string }
      : null;

    return NextResponse.json({
      status: "success",
      data: {
        customer: {
          id: customer._id.toString(),
          name: customer.name,
          email: customer.email,
          status: customer.status,
          profileImageUrl: customer.profileImageUrl ?? null,
          createdAt: customer.createdAt,
          updatedAt: customer.updatedAt,
          verificationStatus: customer.verificationStatus ?? "PENDING",
          verifiedAt: customer.verifiedAt ?? null,
          verificationNote: customer.verificationNote ?? null,
          verifiedBy: reviewer ? { id: String(reviewer._id), name: reviewer.name, email: reviewer.email, role: reviewer.role } : null,
        },
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return errorResponse(500, "Could not retrieve customer details.");
  }
}
