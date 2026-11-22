import { requireApiRoles } from "@/lib/admin-api";
import { createAccountStatementCsv, createStatementCsvFilename } from "@/lib/account-statement-csv";
import { getCompleteAccountStatement } from "@/lib/account-statement-queries";
import { connectToDatabase } from "@/lib/mongodb";
import { accountStatementQuerySchema } from "@/lib/validation/account-statement";
import { BankAccount } from "@/models/BankAccount";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(status: number, message: string) {
  return NextResponse.json({ status: "error", message }, { status });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const authorization = await requireApiRoles(request, ["CUSTOMER", "ADMIN", "STAFF"]);
  if (!authorization.ok) return authorization.response;

  const { id } = await context.params;
  if (request.nextUrl.searchParams.has("accountId")) {
    return errorResponse(400, "Account id must be provided in the URL path.");
  }
  const parsed = accountStatementQuerySchema.safeParse({
    accountId: id,
    ...Object.fromEntries(request.nextUrl.searchParams.entries()),
  });
  if (!parsed.success) return errorResponse(400, "Invalid account statement query.");

  try {
    await connectToDatabase();
    const accountFilter: Record<string, unknown> = { _id: parsed.data.accountId };
    if (authorization.user.role === "CUSTOMER") accountFilter.userId = authorization.user._id;
    const account = await BankAccount.findOne(accountFilter)
      .select("accountNumber")
      .lean();
    if (!account) return errorResponse(404, "Bank account not found.");

    const statement = await getCompleteAccountStatement(account._id, {
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
    });
    const csv = createAccountStatementCsv({
      accountNumber: account.accountNumber,
      startDate: parsed.data.startDate ?? null,
      endDate: parsed.data.endDate ?? null,
      openingBalance: statement.openingBalance,
      closingBalance: statement.closingBalance,
      transactions: statement.transactions,
    });
    const filename = createStatementCsvFilename(
      account.accountNumber,
      parsed.data.startDate ?? null,
      parsed.data.endDate ?? null,
    );

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return errorResponse(500, "Could not generate the account statement CSV.");
  }
}
