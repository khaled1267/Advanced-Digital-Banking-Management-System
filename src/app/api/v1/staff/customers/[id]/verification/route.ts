import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { customerVerificationActionSchema } from "@/lib/validation/customer-verification";
import { User } from "@/models/User";
import { isObjectIdOrHexString } from "mongoose";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(status: number, message: string) {
  return NextResponse.json({ status: "error", message }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const authorization = await requireApiRoles(request, ["STAFF", "ADMIN"]);
  if (!authorization.ok) return authorization.response;

  const { id } = await context.params;
  if (!isObjectIdOrHexString(id)) return errorResponse(400, "Invalid customer id.");
  if (authorization.user._id.toString() === id) return errorResponse(403, "You cannot verify your own account.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Request body must be valid JSON.");
  }
  const parsed = customerVerificationActionSchema.safeParse(body);
  if (!parsed.success) return errorResponse(400, "Choose a valid verification decision and provide a rejection reason when rejecting.");

  try {
    await connectToDatabase();
    const now = new Date();
    const update = parsed.data.verificationStatus === "REJECTED"
      ? { $set: { verificationStatus: "REJECTED", verifiedBy: authorization.user._id, verifiedAt: now, verificationNote: parsed.data.verificationNote } }
      : { $set: { verificationStatus: "VERIFIED", verifiedBy: authorization.user._id, verifiedAt: now }, $unset: { verificationNote: 1 } };

    const customer = await User.findOneAndUpdate(
      {
        _id: id,
        role: "CUSTOMER",
        $or: [{ verificationStatus: "PENDING" }, { verificationStatus: { $exists: false } }],
      },
      update,
      { new: true, runValidators: true },
    ).select("name email status profileImageUrl createdAt updatedAt verificationStatus verifiedBy verifiedAt verificationNote")
      .populate({ path: "verifiedBy", select: "name email role" })
      .lean();

    if (!customer) {
      const exists = await User.exists({ _id: id, role: "CUSTOMER" });
      return exists
        ? errorResponse(409, "This customer has already received a verification decision.")
        : errorResponse(404, "Customer not found.");
    }

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
    return errorResponse(500, "Could not save the verification decision.");
  }
}
