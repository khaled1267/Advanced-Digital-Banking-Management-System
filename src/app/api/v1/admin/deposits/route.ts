import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { buildAdminDepositFilter, listDeposits } from "@/lib/deposit-queries";
import { adminDepositsQuerySchema } from "@/lib/validation/deposit";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["ADMIN", "STAFF"]);
  if (!authorization.ok) return authorization.response;
  const parsed = adminDepositsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) return NextResponse.json({ status: "error", message: "Invalid deposit query." }, { status: 400 });

  try {
    await connectToDatabase();
    const filter = buildAdminDepositFilter(parsed.data);
    const summaryFilter = buildAdminDepositFilter({ ...parsed.data, status: undefined });
    const data = await listDeposits(filter, parsed.data.page, parsed.data.limit, true, summaryFilter);
    return NextResponse.json({ status: "success", data });
  } catch {
    return NextResponse.json({ status: "error", message: "Could not retrieve deposit requests." }, { status: 500 });
  }
}
