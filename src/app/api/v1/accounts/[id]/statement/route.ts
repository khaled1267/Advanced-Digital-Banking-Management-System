import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { getAccountStatement } from "@/lib/account-statement-queries";
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
      .select("accountNumber accountType currency userId")
      .lean();
    if (!account) return errorResponse(404, "Bank account not found.");

    const statement = await getAccountStatement(account._id, parsed.data);
    return NextResponse.json({
      status: "success",
      data: {
        account: {
          id: account._id.toString(),
          accountNumber: account.accountNumber,
          accountType: account.accountType,
          currency: account.currency,
        },
        period: { startDate: parsed.data.startDate ?? null, endDate: parsed.data.endDate ?? null },
        ...statement,
      },
    });
  } catch {
    return errorResponse(500, "Could not retrieve the account statement.");
  }
}
