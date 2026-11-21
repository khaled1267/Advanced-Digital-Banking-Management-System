import { requireAdminApi, isDuplicateKeyError } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { hashPassword } from "@/lib/password";
import {
  adminUserCreateSchema,
  adminUserQuerySchema,
} from "@/lib/validation/user";
import { User } from "@/models/User";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function errorResponse(status: number, message: string) {
  return NextResponse.json({ status: "error", message }, { status });
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: NextRequest) {
  const authorization = await requireAdminApi(request);
  if (!authorization.ok) return authorization.response;

  const query = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = adminUserQuerySchema.safeParse(query);
  if (!parsed.success) {
    return NextResponse.json(
      { status: "error", message: "Invalid query parameters." },
      { status: 400 },
    );
  }

  try {
    await connectToDatabase();
    const { search, role, status, page, limit } = parsed.data;
    const filter: Record<string, unknown> = {};
    if (role) filter.role = role;
    if (status) filter.status = status;
    if (search) {
      const pattern = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ name: pattern }, { email: pattern }];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("name email role status createdAt updatedAt")
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    return NextResponse.json({
      status: "success",
      data: {
        users: users.map((user) => ({
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        })),
        total,
        page,
        totalPages: Math.ceil(total / limit),
        limit,
      },
    });
  } catch {
    return errorResponse(500, "Could not retrieve users.");
  }
}

export async function POST(request: NextRequest) {
  const authorization = await requireAdminApi(request);
  if (!authorization.ok) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Request body must be valid JSON.");
  }

  const parsed = adminUserCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { status: "error", message: "Invalid user data." },
      { status: 400 },
    );
  }

  try {
    await connectToDatabase();
    const passwordHash = await hashPassword(parsed.data.password);
    const user = await User.create({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: parsed.data.role,
      status: "ACTIVE",
    });

    return NextResponse.json(
      {
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
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    if (isDuplicateKeyError(error)) {
      return errorResponse(409, "An account with this email already exists.");
    }
    return errorResponse(500, "Could not create the user.");
  }
}
