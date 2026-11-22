import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { listAdminLoanRepayments } from "@/lib/loan-queries";
import { loanRepaymentsQuerySchema } from "@/lib/validation/loan";

export const runtime = "nodejs";

function errorResponse(status: number, message: string) {
  return NextResponse.json({ status: "error", message }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdminApi(request);
  if (!authorization.ok) return authorization.response;

  const { id } = await context.params;
  if (!/^[\da-f]{24}$/i.test(id)) return errorResponse(400, "Invalid loan reference.");
  const parsed = loanRepaymentsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) return errorResponse(400, "Invalid repayment history query.");

  try {
    await connectToDatabase();
    const data = await listAdminLoanRepayments(
      new mongoose.Types.ObjectId(id),
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
