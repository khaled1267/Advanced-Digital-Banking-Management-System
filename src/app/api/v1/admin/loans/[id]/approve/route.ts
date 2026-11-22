import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { approveLoanApplication, LoanOperationError } from "@/lib/loan-operations";
import { getLoanDetails } from "@/lib/loan-queries";
import { approveLoanSchema } from "@/lib/validation/loan";

export const runtime = "nodejs";

function errorResponse(status: number, message: string) {
  return NextResponse.json({ status: "error", message }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdminApi(request);
  if (!authorization.ok) return authorization.response;
  const { id } = await context.params;
  if (!/^[\da-f]{24}$/i.test(id)) return errorResponse(400, "Invalid loan reference.");

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return errorResponse(400, "Request body must be valid JSON.");
  }
  const parsed = approveLoanSchema.safeParse(body);
  if (!parsed.success) return errorResponse(400, "Approved amount must be a positive BDT amount with at most two decimal places.");

  try {
    await connectToDatabase();
    const loan = await approveLoanApplication(id, authorization.user._id, parsed.data.approvedAmount);
    const record = await getLoanDetails({ _id: loan._id }, true);
    return NextResponse.json({ status: "success", data: { loan: record } }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error: unknown) {
    if (error instanceof LoanOperationError) {
      if (error.code === "APPROVED_AMOUNT_LIMIT") {
        return errorResponse(400, "Approved amount cannot exceed the requested loan amount.");
      }
      return errorResponse(error.code === "NOT_FOUND" ? 404 : 409,
        error.code === "NOT_FOUND" ? "Loan application not found." : "Only a forwarded loan application can be approved.");
    }
    return errorResponse(500, "Could not approve the loan application.");
  }
}
