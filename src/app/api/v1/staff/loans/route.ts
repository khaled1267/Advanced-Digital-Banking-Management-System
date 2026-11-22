import { NextRequest, NextResponse } from "next/server";
import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { buildStaffAdminLoanFilter, listLoans } from "@/lib/loan-queries";
import { staffAdminLoansQuerySchema } from "@/lib/validation/loan";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["STAFF"]);
  if (!authorization.ok) return authorization.response;
  const parsed = staffAdminLoansQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json({ status: "error", message: "Invalid loan query." }, { status: 400 });
  }

  try {
    await connectToDatabase();
    const data = await listLoans(
      buildStaffAdminLoanFilter(parsed.data),
      parsed.data.page,
      parsed.data.limit,
      true,
    );
    return NextResponse.json({ status: "success", data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ status: "error", message: "Could not retrieve loan applications." }, { status: 500 });
  }
}
