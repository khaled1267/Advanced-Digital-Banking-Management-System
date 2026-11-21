import { requireAdminApi } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { adminUserUpdateSchema } from "@/lib/validation/user";
import { User } from "@/models/User";
import { isObjectIdOrHexString } from "mongoose";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(status: number, message: string) {
  return NextResponse.json({ status: "error", message }, { status });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const authorization = await requireAdminApi(request);
  if (!authorization.ok) return authorization.response;

  const { id } = await context.params;
  if (!isObjectIdOrHexString(id)) return errorResponse(400, "Invalid user id.");

  try {
    await connectToDatabase();
    const user = await User.findById(id)
      .select("name email role status createdAt updatedAt")
      .lean();
    if (!user) return errorResponse(404, "User not found.");

    return NextResponse.json({
      status: "success",
      data: {
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch {
    return errorResponse(500, "Could not retrieve the user.");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const authorization = await requireAdminApi(request);
  if (!authorization.ok) return authorization.response;

  const { id } = await context.params;
  if (!isObjectIdOrHexString(id)) return errorResponse(400, "Invalid user id.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Request body must be valid JSON.");
  }
  const parsed = adminUserUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { status: "error", message: "Invalid user update." },
      { status: 400 },
    );
  }

  try {
    await connectToDatabase();
    const target = await User.findById(id).select("role status");
    if (!target) return errorResponse(404, "User not found.");

    const isSelf = target._id.toString() === authorization.user._id.toString();
    if (isSelf && (parsed.data.role !== undefined || parsed.data.status === "INACTIVE")) {
      return errorResponse(400, "You cannot change your own role or deactivate your account.");
    }
    if (target.role === "ADMIN" && parsed.data.role !== undefined) {
      return errorResponse(400, "Admin roles cannot be changed through user management.");
    }

    const user = await User.findByIdAndUpdate(
      id,
      { $set: parsed.data },
      {
        returnDocument: "after",
        runValidators: true,
        projection: "name email role status createdAt updatedAt",
      },
    ).lean();
    if (!user) return errorResponse(404, "User not found.");

    return NextResponse.json({
      status: "success",
      data: {
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch {
    return errorResponse(500, "Could not update the user.");
  }
}
