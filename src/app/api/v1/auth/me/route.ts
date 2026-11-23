import { getCurrentUser } from "@/lib/authorization";
import { AUTH_COOKIE_NAME } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function unauthorizedResponse() {
  return NextResponse.json(
    { status: "error", message: "Authentication is required." },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(
      request.cookies.get(AUTH_COOKIE_NAME)?.value ?? "",
    );

    if (!user) {
      return unauthorizedResponse();
    }

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
          profileImageUrl: user.profileImageUrl ?? null,
        },
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json(
      { status: "error", message: "Could not retrieve the current user." },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
