import { NextRequest, NextResponse } from "next/server";
import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { forwardLoanApplication, LoanOperationError } from "@/lib/loan-operations";
import { getLoanDetails } from "@/lib/loan-queries";
import { forwardLoanToAdminSchema } from "@/lib/validation/loan";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authorization = await requireApiRoles(request, ["STAFF"]);
  if (!authorization.ok) return authorization.response;
  const { id } = await context.params;
  if (!/^[\da-f]{24}$/i.test(id)) {
    return NextResponse.json({ status: "error", message: "Invalid loan reference." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", message: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = forwardLoanToAdminSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: "error", message: "Invalid loan review action." }, { status: 400 });
  }

  try {
    await connectToDatabase();
    const loan = await forwardLoanApplication(id, authorization.user._id, parsed.data.reviewNotes);
    const record = await getLoanDetails({ _id: loan._id }, true);
    return NextResponse.json({ status: "success", data: { loan: record } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    if (error instanceof LoanOperationError) {
      const status = error.code === "NOT_FOUND" ? 404 : 409;
      const message = error.code === "NOT_FOUND" ? "Loan application not found." : "This loan application is no longer pending.";
      return NextResponse.json({ status: "error", message }, { status });
    }
    return NextResponse.json({ status: "error", message: "Could not forward the loan application." }, { status: 500 });
  }
}
