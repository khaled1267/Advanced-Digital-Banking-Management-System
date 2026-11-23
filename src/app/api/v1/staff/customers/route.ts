import { requireApiRoles, isDuplicateKeyError } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { hashPassword } from "@/lib/password";
import { customerVerificationQuerySchema } from "@/lib/validation/customer-verification";
import { userRegistrationSchema } from "@/lib/validation/user";
import { User } from "@/models/User";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["STAFF", "ADMIN"]);
  if (!authorization.ok) return authorization.response;

  const parsed = customerVerificationQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json({ status: "error", message: "Invalid customer verification query." }, { status: 400 });
  }

  try {
    await connectToDatabase();
    const { search, verificationStatus, page, limit } = parsed.data;
    const filter: Record<string, unknown> = { role: "CUSTOMER" };
    if (verificationStatus === "PENDING") {
      filter.$or = [{ verificationStatus: "PENDING" }, { verificationStatus: { $exists: false } }];
    } else if (verificationStatus) {
      filter.verificationStatus = verificationStatus;
    }
    if (search) {
      const pattern = new RegExp(escapeRegex(search), "i");
      filter.$and = [...(Array.isArray(filter.$and) ? filter.$and : []), { $or: [{ name: pattern }, { email: pattern }] }];
    }

    const [customers, total] = await Promise.all([
      User.find(filter)
        .select("name email status profileImageUrl createdAt verificationStatus verifiedAt verificationNote")
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    return NextResponse.json({
      status: "success",
      data: {
        customers: customers.map((customer) => ({
          id: customer._id.toString(),
          name: customer.name,
          email: customer.email,
          status: customer.status,
          profileImageUrl: customer.profileImageUrl ?? null,
          createdAt: customer.createdAt,
          verificationStatus: customer.verificationStatus ?? "PENDING",
          verifiedAt: customer.verifiedAt ?? null,
          verificationNote: customer.verificationNote ?? null,
        })),
        total,
        page,
        totalPages: Math.ceil(total / limit),
        limit,
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ status: "error", message: "Could not retrieve customers for verification." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["STAFF"]);
  if (!authorization.ok) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", message: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = userRegistrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: "error", message: "Invalid customer registration data." }, { status: 400 });
  }

  try {
    await connectToDatabase();
    const passwordHash = await hashPassword(parsed.data.password);
    const customer = await User.create({ ...parsed.data, passwordHash, role: "CUSTOMER", status: "ACTIVE", verificationStatus: "PENDING" });
    return NextResponse.json({
      status: "success",
      data: { customer: { id: customer._id.toString(), name: customer.name, email: customer.email, role: customer.role, status: customer.status, createdAt: customer.createdAt } },
    }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error: unknown) {
    if (isDuplicateKeyError(error)) return NextResponse.json({ status: "error", message: "An account with this email already exists." }, { status: 409 });
    return NextResponse.json({ status: "error", message: "Customer registration could not be completed." }, { status: 500 });
  }
}
