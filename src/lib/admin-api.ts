import {
  AuthenticationRequiredError,
  requireAnyRole,
  type UserRole,
  RoleAuthorizationError,
} from "@/lib/authorization";
import { AUTH_COOKIE_NAME } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

export async function requireApiRoles(
  request: NextRequest,
  roles: readonly UserRole[],
) {
  try {
    const user = await requireAnyRole(
      roles,
      request.cookies.get(AUTH_COOKIE_NAME)?.value ?? "",
    );
    return { ok: true, user } as const;
  } catch (error: unknown) {
    if (error instanceof AuthenticationRequiredError) {
      return {
        ok: false,
        response: NextResponse.json(
          { status: "error", message: error.message },
          { status: 401 },
        ),
      } as const;
    }

    if (error instanceof RoleAuthorizationError) {
      return {
        ok: false,
        response: NextResponse.json(
          { status: "error", message: error.message },
          { status: 403 },
        ),
      } as const;
    }

    return {
      ok: false,
      response: NextResponse.json(
        { status: "error", message: "Could not verify access." },
        { status: 500 },
      ),
    } as const;
  }
}

export function requireAdminApi(request: NextRequest) {
  return requireApiRoles(request, ["ADMIN"]);
}

export function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}
