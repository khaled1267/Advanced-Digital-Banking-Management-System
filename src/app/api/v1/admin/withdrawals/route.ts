import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { buildAdminWithdrawalFilter, listWithdrawals } from "@/lib/withdrawal-queries";
import { adminWithdrawalsQuerySchema } from "@/lib/validation/withdrawal";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["ADMIN", "STAFF"]);
  if (!authorization.ok) return authorization.response;
  const parsed = adminWithdrawalsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) return NextResponse.json({ status: "error", message: "Invalid withdrawal query." }, { status: 400 });

  try {
    await connectToDatabase();
    const filter = buildAdminWithdrawalFilter(parsed.data);
    const summaryFilter = buildAdminWithdrawalFilter({ ...parsed.data, status: undefined });
    const data = await listWithdrawals(filter, parsed.data.page, parsed.data.limit, true, summaryFilter);
    return NextResponse.json({ status: "success", data });
  } catch {
    return NextResponse.json({ status: "error", message: "Could not retrieve withdrawal requests." }, { status: 500 });
  }
}
