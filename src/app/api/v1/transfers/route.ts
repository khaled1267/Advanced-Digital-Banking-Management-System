import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { executeTransfer, TransferOperationError } from "@/lib/transfer-operations";
import { getSafeTransaction } from "@/lib/transaction-queries";
import { listMyTransfers } from "@/lib/transfer-queries";
import { createTransferSchema, transferHistoryQuerySchema } from "@/lib/validation/transfer";
import { verifyCustomerTransactionPin } from "@/lib/transaction-pin";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function errorResponse(status: number, message: string) {
  return NextResponse.json({ status: "error", message }, { status });
}

function operationErrorResponse(error: TransferOperationError) {
  switch (error.code) {
    case "SOURCE_ACCOUNT_UNAVAILABLE":
      return errorResponse(404, "Your active source account was not found.");
    case "RECIPIENT_UNAVAILABLE":
      return errorResponse(404, "An active BDT customer account was not found.");
    case "SELF_TRANSFER":
      return errorResponse(400, "You cannot transfer money to your own account.");
    case "INSUFFICIENT_BALANCE":
      return errorResponse(409, "Your account does not have enough available balance.");
    case "MINIMUM_BALANCE":
      return errorResponse(409, "This transfer would go below your account's minimum balance.");
    case "MAXIMUM_SINGLE_AMOUNT":
      return errorResponse(409, "This transfer exceeds your account's maximum single transfer amount.");
    case "DAILY_TRANSFER_LIMIT":
      return errorResponse(409, "This transfer would exceed your account's daily transfer limit.");
    case "RECIPIENT_BALANCE_LIMIT":
      return errorResponse(409, "The recipient account cannot accept this amount.");
    case "IDEMPOTENCY_CONFLICT":
      return errorResponse(409, "This request key was already used for a different transfer.");
  }
}

export async function POST(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["CUSTOMER"]);
  if (!authorization.ok) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Request body must be valid JSON.");
  }
  const parsed = createTransferSchema.safeParse(body);
  if (!parsed.success) return errorResponse(400, "Invalid transfer request.");

  try {
    await connectToDatabase();
    const { transactionPin, ...transferInput } = parsed.data;
    const pinResult = await verifyCustomerTransactionPin(authorization.user._id, transactionPin);
    if (pinResult === "NOT_CONFIGURED") {
      return errorResponse(409, "Set up your Transaction PIN in your Customer Profile before transferring money.");
    }
    if (pinResult !== "OK") {
      return errorResponse(400, "Transaction PIN is incorrect or temporarily unavailable. Please try again later.");
    }
    const result = await executeTransfer(authorization.user._id, transferInput);
    const transfer = await getSafeTransaction(result.transaction);
    if (!transfer) return errorResponse(500, "Could not prepare the transfer response.");
    return NextResponse.json(
      {
        status: "success",
        data: { transfer: { ...transfer, direction: "SENT" }, replayed: result.replayed },
      },
      { status: result.replayed ? 200 : 201 },
    );
  } catch (error: unknown) {
    if (error instanceof TransferOperationError) return operationErrorResponse(error);
    return errorResponse(500, "Could not complete the transfer.");
  }
}

export async function GET(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["CUSTOMER"]);
  if (!authorization.ok) return authorization.response;
  const parsed = transferHistoryQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) return errorResponse(400, "Invalid transfer history query.");

  try {
    await connectToDatabase();
    const data = await listMyTransfers(authorization.user._id, parsed.data);
    return NextResponse.json({ status: "success", data });
  } catch {
    return errorResponse(500, "Could not retrieve your transfers.");
  }
}
