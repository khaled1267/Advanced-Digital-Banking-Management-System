import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { accountHolderQuerySchema } from "@/lib/validation/bank-account";
import { User } from "@/models/User";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["ADMIN", "STAFF"]);
  if (!authorization.ok) return authorization.response;
  const parsed = accountHolderQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json({ status: "error", message: "Invalid query parameters." }, { status: 400 });
  }

  try {
    await connectToDatabase();
    const filter: Record<string, unknown> = { status: "ACTIVE", role: "CUSTOMER" };
    if (parsed.data.search) {
      const pattern = new RegExp(parsed.data.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: pattern }, { email: pattern }];
    }
    const users = await User.find(filter)
      .select("name email")
      .sort({ name: 1, _id: 1 })
      .limit(parsed.data.limit)
      .lean();
    return NextResponse.json({
      status: "success",
      data: { users: users.map((user) => ({ id: user._id.toString(), name: user.name, email: user.email })) },
    });
  } catch {
    return NextResponse.json({ status: "error", message: "Could not retrieve account holders." }, { status: 500 });
  }
}
