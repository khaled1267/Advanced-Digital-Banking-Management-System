import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { getDepositDetails } from "@/lib/deposit-queries";
import { DepositOperationError, reviewDepositRequest } from "@/lib/deposit-operations";
import { reviewDepositSchema } from "@/lib/validation/deposit";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function errorResponse(status: number, message: string) {
  return NextResponse.json({ status: "error", message }, { status });
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authorization = await requireApiRoles(request, ["ADMIN", "STAFF"]);
  if (!authorization.ok) return authorization.response;
  const { id } = await context.params;
  if (!/^[\da-f]{24}$/i.test(id)) return errorResponse(400, "Invalid deposit reference.");
  try {
    await connectToDatabase();
    const deposit = await getDepositDetails({ _id: id }, true);
    if (!deposit) return errorResponse(404, "Deposit request not found.");
    return NextResponse.json({ status: "success", data: { deposit } });
  } catch {
    return errorResponse(500, "Could not retrieve the deposit request.");
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authorization = await requireApiRoles(request, ["ADMIN", "STAFF"]);
  if (!authorization.ok) return authorization.response;
  const { id } = await context.params;
  if (!/^[\da-f]{24}$/i.test(id)) return errorResponse(400, "Invalid deposit reference.");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Request body must be valid JSON.");
  }
  const parsed = reviewDepositSchema.safeParse(body);
  if (!parsed.success) return errorResponse(400, "Invalid deposit review action.");

  try {
    await connectToDatabase();
    const deposit = await reviewDepositRequest(
      id,
      authorization.user._id,
      parsed.data.action,
      parsed.data.action === "REJECT" ? parsed.data.rejectionReason : undefined,
    );
    return NextResponse.json({
      status: "success",
      data: { deposit: await getDepositDetails({ _id: deposit._id }, true) },
    });
  } catch (error: unknown) {
    if (error instanceof DepositOperationError) {
      if (error.code === "NOT_FOUND") return errorResponse(404, "Deposit request not found.");
      if (error.code === "CONFLICT") return errorResponse(409, "This deposit request has already been processed.");
      if (error.code === "ACCOUNT_UNAVAILABLE") return errorResponse(409, "The associated account is no longer active.");
      return errorResponse(409, "The account balance cannot accept this amount within the supported BDT precision.");
    }
    return errorResponse(500, "Could not review the deposit request. No non-atomic fallback was attempted.");
  }
}
