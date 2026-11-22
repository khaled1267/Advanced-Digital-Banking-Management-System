import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { disburseApprovedLoan, LoanOperationError } from "@/lib/loan-operations";
import { getLoanDetails } from "@/lib/loan-queries";

export const runtime = "nodejs";

function errorResponse(status: number, message: string) {
  return NextResponse.json({ status: "error", message }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdminApi(request);
  if (!authorization.ok) return authorization.response;

  const { id } = await context.params;
  if (!/^[\da-f]{24}$/i.test(id)) return errorResponse(400, "Invalid loan reference.");

  try {
    await connectToDatabase();
    const { loan, transaction } = await disburseApprovedLoan(id, authorization.user._id);
    const record = await getLoanDetails({ _id: loan._id }, true);
    return NextResponse.json({ status: "success", data: { loan: record, transaction: {
      id: transaction._id.toString(),
      transactionId: transaction.transactionId,
      transactionType: transaction.transactionType,
      amount: transaction.amount.toString(),
      currency: transaction.currency,
      status: transaction.status,
      createdAt: transaction.createdAt.toISOString(),
    } } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    if (error instanceof LoanOperationError) {
      const responses = {
        NOT_FOUND: [404, "Loan application not found."],
        CONFLICT: [409, "Only an approved loan that has not already been disbursed can be disbursed."],
        APPROVED_AMOUNT_UNAVAILABLE: [409, "This approved loan does not have an approved amount recorded."],
        APPROVED_AMOUNT_LIMIT: [409, "The approved amount cannot exceed the requested loan amount."],
        ACCOUNT_UNAVAILABLE: [409, "The loan's linked customer account is not active or available in BDT."],
        BALANCE_LIMIT: [409, "The account balance would exceed the supported limit."],
      } as const;
      const [status, message] = responses[error.code];
      return errorResponse(status, message);
    }
    return errorResponse(500, "Could not disburse the loan.");
  }
}
