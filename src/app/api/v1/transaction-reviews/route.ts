import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { getReviewTarget, getTransactionReview, applyTransactionReview, TransactionReviewError } from "@/lib/transaction-review-operations";
import { transactionReviewRequestSchema, transactionReviewTargetSchema } from "@/lib/validation/transaction-review";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function errorResponse(status: number, message: string) {
  return NextResponse.json({ status: "error", message }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["STAFF", "ADMIN"]);
  if (!authorization.ok) return authorization.response;
  const parsed = transactionReviewTargetSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) return errorResponse(400, "A valid review target is required.");

  try {
    await connectToDatabase();
    const target = await getReviewTarget(parsed.data.targetType, parsed.data.targetId);
    if (!target) return errorResponse(404, "Review target not found.");
    const data = await getTransactionReview(parsed.data, authorization.user.role);
    return NextResponse.json({ status: "success", data: { target, ...data } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return errorResponse(500, "Could not retrieve the transaction review.");
  }
}

export async function POST(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["STAFF"]);
  if (!authorization.ok) return authorization.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Request body must be valid JSON.");
  }
  const parsed = transactionReviewRequestSchema.safeParse(body);
  if (!parsed.success) return errorResponse(400, "Invalid transaction review action.");

  try {
    await connectToDatabase();
    const { targetType, targetId, ...action } = parsed.data;
    await applyTransactionReview({ targetType, targetId }, authorization.user._id, action);
    const [target, data] = await Promise.all([
      getReviewTarget(targetType, targetId),
      getTransactionReview({ targetType, targetId }, "STAFF"),
    ]);
    return NextResponse.json({ status: "success", data: { target, ...data } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    if (error instanceof TransactionReviewError) {
      if (error.code === "NOT_FOUND") return errorResponse(404, "Review target not found.");
      if (error.code === "INVALID_TARGET") return errorResponse(400, "This record cannot be reviewed.");
      return errorResponse(409, error.code === "ACTIVE_FLAG_EXISTS" ? "An active flag already exists." : "This review action is not allowed in the current review state.");
    }
    return errorResponse(500, "Could not save the transaction review.");
  }
}
