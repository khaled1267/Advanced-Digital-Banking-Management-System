import {
  AuthenticationRequiredError,
  requireRole,
  RoleAuthorizationError,
} from "@/lib/authorization";
import { AUTH_COOKIE_NAME } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireRole(
      "ADMIN",
      request.cookies.get(AUTH_COOKIE_NAME)?.value ?? "",
    );

    return NextResponse.json({
      status: "success",
      data: {
        access: "ADMIN",
        capabilities: ["USER_MANAGEMENT", "BANKING_SYSTEM_MANAGEMENT"],
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json(
        { status: "error", message: error.message },
        { status: 401 },
      );
    }

    if (error instanceof RoleAuthorizationError) {
      return NextResponse.json(
        { status: "error", message: error.message },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { status: "error", message: "Could not retrieve the admin overview." },
      { status: 500 },
    );
  }
}
