import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { getWithdrawalDetails } from "@/lib/withdrawal-queries";
import { WithdrawalOperationError, reviewWithdrawalRequest } from "@/lib/withdrawal-operations";
import { reviewWithdrawalSchema } from "@/lib/validation/withdrawal";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function errorResponse(status: number, message: string) {
  return NextResponse.json({ status: "error", message }, { status });
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authorization = await requireApiRoles(request, ["ADMIN", "STAFF"]);
  if (!authorization.ok) return authorization.response;
  const { id } = await context.params;
  if (!/^[\da-f]{24}$/i.test(id)) return errorResponse(400, "Invalid withdrawal reference.");
  try {
    await connectToDatabase();
    const withdrawal = await getWithdrawalDetails({ _id: id }, true);
    if (!withdrawal) return errorResponse(404, "Withdrawal request not found.");
    return NextResponse.json({ status: "success", data: { withdrawal } });
  } catch {
    return errorResponse(500, "Could not retrieve the withdrawal request.");
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authorization = await requireApiRoles(request, ["ADMIN", "STAFF"]);
  if (!authorization.ok) return authorization.response;
  const { id } = await context.params;
  if (!/^[\da-f]{24}$/i.test(id)) return errorResponse(400, "Invalid withdrawal reference.");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Request body must be valid JSON.");
  }
  const parsed = reviewWithdrawalSchema.safeParse(body);
  if (!parsed.success) return errorResponse(400, "Invalid withdrawal review action.");

  try {
    await connectToDatabase();
    const withdrawal = await reviewWithdrawalRequest(
      id,
      authorization.user._id,
      parsed.data.action,
      parsed.data.action === "REJECT" ? parsed.data.rejectionReason : undefined,
    );
    return NextResponse.json({
      status: "success",
      data: { withdrawal: await getWithdrawalDetails({ _id: withdrawal._id }, true) },
    });
  } catch (error: unknown) {
    if (error instanceof WithdrawalOperationError) {
      if (error.code === "NOT_FOUND") return errorResponse(404, "Withdrawal request not found.");
      if (error.code === "CONFLICT") return errorResponse(409, "This withdrawal request has already been processed.");
      if (error.code === "ACCOUNT_UNAVAILABLE") return errorResponse(409, "The associated account is no longer active.");
      if (error.code === "MINIMUM_BALANCE") return errorResponse(409, "This withdrawal would go below the account's minimum balance. The request remains pending.");
      return errorResponse(409, "Insufficient available balance. The withdrawal request remains pending.");
    }
    return errorResponse(500, "Could not review the withdrawal request. No non-atomic fallback was attempted.");
  }
}
