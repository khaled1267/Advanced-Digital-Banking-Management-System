import { connectToDatabase } from "@/lib/mongodb";
import { verifyPassword } from "@/lib/password";
import {
  AUTH_COOKIE_NAME,
  createSessionToken,
  getSessionCookieOptions,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/session";
import { userLoginSchema } from "@/lib/validation/user";
import { User } from "@/models/User";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function errorResponse(status: number, message: string) {
  return NextResponse.json({ status: "error", message }, { status });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Request body must be valid JSON.");
  }

  const result = userLoginSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      {
        status: "error",
        message: "Invalid login data.",
        errors: result.error.issues.map(({ path, message }) => ({
          field: path.join("."),
          message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    await connectToDatabase();

    const user = await User.findOne({ email: result.data.email }).select(
      "+passwordHash",
    );

    if (!user || !(await verifyPassword(result.data.password, user.passwordHash))) {
      return errorResponse(401, "Email or password is incorrect.");
    }

    if (user.status !== "ACTIVE") {
      return errorResponse(403, "This account is inactive.");
    }

    const token = await createSessionToken(user._id.toString());
    const response = NextResponse.json({
      status: "success",
      message: "Login successful.",
      data: {
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
        },
      },
    });

    response.cookies.set(AUTH_COOKIE_NAME, token, {
      ...getSessionCookieOptions(),
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return response;
  } catch {
    return errorResponse(500, "Login could not be completed.");
  }
}
