import { requireApiRoles } from "@/lib/admin-api";
import { getAccountStatement } from "@/lib/account-statement-queries";
import { createAccountStatementPdf, createStatementFilename } from "@/lib/account-statement-pdf";
import { connectToDatabase } from "@/lib/mongodb";
import { accountStatementQuerySchema } from "@/lib/validation/account-statement";
import { BankAccount } from "@/models/BankAccount";
import { User } from "@/models/User";
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
      .select("accountNumber accountType currency userId")
      .lean();
    if (!account) return errorResponse(404, "Bank account not found.");

    const customer = await User.findById(account.userId).select("name email").lean();
    if (!customer) return errorResponse(404, "Account holder not found.");

    // PDF export always includes the full filtered range, independent of the API page.
    const statement = await getAccountStatement(account._id, {
      ...parsed.data,
      page: 1,
      limit: Number.MAX_SAFE_INTEGER,
    });
    const pdf = await createAccountStatementPdf({
      bankName: "Northstar Bank",
      customerName: customer.name,
      customerEmail: customer.email,
      accountNumber: account.accountNumber,
      accountType: account.accountType,
      currency: account.currency,
      startDate: parsed.data.startDate ?? null,
      endDate: parsed.data.endDate ?? null,
      generatedAt: new Date(),
      openingBalance: statement.openingBalance,
      closingBalance: statement.closingBalance,
      transactions: statement.transactions,
    });
    const filename = createStatementFilename(
      account.accountNumber,
      parsed.data.startDate ?? null,
      parsed.data.endDate ?? null,
    );

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return errorResponse(500, "Could not generate the account statement PDF.");
  }
}
