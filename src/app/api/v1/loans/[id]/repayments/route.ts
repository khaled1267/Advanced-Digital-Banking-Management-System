import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { executeLoanRepayment, LoanRepaymentOperationError } from "@/lib/loan-operations";
import { getCustomerLoanRepayment, listCustomerLoanRepayments } from "@/lib/loan-queries";
import { createLoanRepaymentSchema, loanRepaymentsQuerySchema } from "@/lib/validation/loan";

export const runtime = "nodejs";

function errorResponse(status: number, message: string) {
  return NextResponse.json({ status: "error", message }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function operationErrorResponse(error: LoanRepaymentOperationError) {
  const responses = {
    NOT_FOUND: [404, "Loan application not found."],
    LOAN_NOT_REPAYABLE: [409, "Only your disbursed loan can be repaid."],
    OUTSTANDING_UNAVAILABLE: [409, "The loan does not have a valid outstanding balance."],
    SOURCE_ACCOUNT_UNAVAILABLE: [404, "Your active BDT source account was not found."],
    INSUFFICIENT_BALANCE: [409, "The source account does not have enough available balance."],
    MINIMUM_BALANCE: [409, "This repayment would go below the account's minimum balance."],
    OVERPAYMENT: [409, "Repayment cannot exceed the current outstanding balance."],
    IDEMPOTENCY_CONFLICT: [409, "This request key was already used for a different repayment."],
    OUTSTANDING_CHANGED: [409, "The loan balance changed during this request. Please retry."],
    SCHEDULE_CHANGED: [409, "The repayment schedule changed during this request. No funds were taken; please retry."],
  } as const;
  const [status, message] = responses[error.code];
  return errorResponse(status, message);
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authorization = await requireApiRoles(request, ["CUSTOMER"]);
  if (!authorization.ok) return authorization.response;

  const { id } = await context.params;
  if (!/^[\da-f]{24}$/i.test(id)) return errorResponse(400, "Invalid loan reference.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Request body must be valid JSON.");
  }
  const parsed = createLoanRepaymentSchema.safeParse(body);
  if (!parsed.success) return errorResponse(400, "Invalid loan repayment request.");

  try {
    await connectToDatabase();
    const result = await executeLoanRepayment(
      authorization.user._id,
      id,
      parsed.data,
    );
    const repayment = await getCustomerLoanRepayment(result.repayment._id, authorization.user._id);
    if (!repayment) return errorResponse(500, "Could not prepare the repayment response.");
    return NextResponse.json({
      status: "success",
      data: {
        repayment,
        outstandingBalance: result.outstandingBalance,
        replayed: result.replayed,
      },
    }, {
      status: result.replayed ? 200 : 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error: unknown) {
    if (error instanceof LoanRepaymentOperationError) return operationErrorResponse(error);
    return errorResponse(500, "Could not complete the loan repayment.");
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authorization = await requireApiRoles(request, ["CUSTOMER"]);
  if (!authorization.ok) return authorization.response;

  const { id } = await context.params;
  if (!/^[\da-f]{24}$/i.test(id)) return errorResponse(400, "Invalid loan reference.");
  const parsed = loanRepaymentsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) return errorResponse(400, "Invalid repayment history query.");

  try {
    await connectToDatabase();
    const data = await listCustomerLoanRepayments(
      new mongoose.Types.ObjectId(id),
      authorization.user._id,
      parsed.data.page,
      parsed.data.limit,
    );
    if (!data) return errorResponse(404, "Loan application not found.");
    return NextResponse.json({ status: "success", data }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return errorResponse(500, "Could not retrieve loan repayment history.");
  }
}
