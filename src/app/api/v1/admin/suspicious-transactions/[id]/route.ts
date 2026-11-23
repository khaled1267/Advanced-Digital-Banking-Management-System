import { requireAdminApi } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { TransactionReviewError, reviewSuspiciousFlag } from "@/lib/transaction-review-operations";
import { suspiciousFlagAdminActionSchema } from "@/lib/validation/transaction-review";
import { isObjectIdOrHexString } from "mongoose";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const authorization = await requireAdminApi(request);
  if (!authorization.ok) return authorization.response;
  const { id } = await context.params;
  if (!isObjectIdOrHexString(id)) return NextResponse.json({ status: "error", message: "Invalid flag reference." }, { status: 400 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", message: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = suspiciousFlagAdminActionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ status: "error", message: "Choose a valid Admin review action and provide a note when resolving or dismissing." }, { status: 400 });

  try {
    await connectToDatabase();
    const flag = await reviewSuspiciousFlag(id, authorization.user._id, parsed.data.status, parsed.data.note);
    return NextResponse.json({ status: "success", data: { flag: { id: flag._id.toString(), status: flag.status, active: flag.active, reviewedAt: flag.reviewedAt ?? null, adminReviewNote: flag.adminReviewNote ?? null } } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    if (error instanceof TransactionReviewError) {
      return NextResponse.json({ status: "error", message: error.code === "NOT_FOUND" ? "Flag not found." : "This Admin review action is not allowed in the current state." }, { status: error.code === "NOT_FOUND" ? 404 : 409 });
    }
    return NextResponse.json({ status: "error", message: "Could not save the Admin review." }, { status: 500 });
  }
}
