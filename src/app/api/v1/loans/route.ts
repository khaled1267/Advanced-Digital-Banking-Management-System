import { NextRequest, NextResponse } from "next/server";
import { requireApiRoles, isDuplicateKeyError } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { createLoanApplication } from "@/lib/loan-operations";
import { buildCustomerLoanFilter, getLoanDetails, listLoans } from "@/lib/loan-queries";
import { createLoanSchema, customerLoansQuerySchema } from "@/lib/validation/loan";
import { BankAccount } from "@/models/BankAccount";

export const runtime = "nodejs";

function errorResponse(status: number, message: string) {
  return NextResponse.json({ status: "error", message }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["CUSTOMER"]);
  if (!authorization.ok) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Request body must be valid JSON.");
  }
  const parsed = createLoanSchema.safeParse(body);
  if (!parsed.success) return errorResponse(400, "Invalid loan application.");

  try {
    await connectToDatabase();
    const account = await BankAccount.findOne({
      _id: parsed.data.accountId,
      userId: authorization.user._id,
      status: "ACTIVE",
    }).select("_id");
    if (!account) return errorResponse(404, "Active account not found.");

    const loan = await createLoanApplication(authorization.user._id, account._id, parsed.data);
    const record = await getLoanDetails({ _id: loan._id, customerId: authorization.user._id }, false);
    return NextResponse.json({ status: "success", data: { loan: record } }, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error: unknown) {
    if (isDuplicateKeyError(error)) {
      return errorResponse(409, "An unresolved loan application already exists for this account.");
    }
    return errorResponse(500, "Could not submit the loan application.");
  }
}

export async function GET(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["CUSTOMER"]);
  if (!authorization.ok) return authorization.response;
  const parsed = customerLoansQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) return errorResponse(400, "Invalid loan query.");

  try {
    await connectToDatabase();
    const data = await listLoans(
      buildCustomerLoanFilter(authorization.user._id, parsed.data),
      parsed.data.page,
      parsed.data.limit,
      false,
    );
    return NextResponse.json({ status: "success", data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return errorResponse(500, "Could not retrieve your loan applications.");
  }
}
