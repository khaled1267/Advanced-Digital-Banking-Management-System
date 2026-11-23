import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { createSuspiciousFlag, getReviewTarget, getTransactionReview, TransactionReviewError } from "@/lib/transaction-review-operations";
import { suspiciousFlagCreateSchema } from "@/lib/validation/transaction-review";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["STAFF"]);
  if (!authorization.ok) return authorization.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", message: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = suspiciousFlagCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ status: "error", message: "Choose a valid flag reason and target." }, { status: 400 });

  try {
    await connectToDatabase();
    await createSuspiciousFlag(parsed.data, authorization.user._id);
    const [target, review] = await Promise.all([
      getReviewTarget(parsed.data.targetType, parsed.data.targetId),
      getTransactionReview(parsed.data, "STAFF"),
    ]);
    return NextResponse.json({ status: "success", data: { target, ...review } }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    if (error instanceof TransactionReviewError) {
      if (error.code === "NOT_FOUND") return NextResponse.json({ status: "error", message: "Review target not found." }, { status: 404 });
      if (error.code === "ACTIVE_FLAG_EXISTS") return NextResponse.json({ status: "error", message: "This item is already flagged for Admin review." }, { status: 409 });
    }
    return NextResponse.json({ status: "error", message: "Could not create the suspicious transaction flag." }, { status: 500 });
  }
}
