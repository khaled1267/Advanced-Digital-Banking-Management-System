import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { parseBdtPaisa } from "@/lib/bdt-money";
import { serializeAccountTransactionLimits, updateAccountTransactionLimits } from "@/lib/account-transaction-limits";
import { updateAccountTransactionLimitsSchema } from "@/lib/validation/bank-account";
import { BankAccount } from "@/models/BankAccount";
import { User } from "@/models/User";
import { isObjectIdOrHexString } from "mongoose";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(status: number, message: string) {
  return NextResponse.json({ status: "error", message }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const authorization = await requireApiRoles(request, ["ADMIN"]);
  if (!authorization.ok) return authorization.response;
  const { id } = await context.params;
  if (!isObjectIdOrHexString(id)) return errorResponse(400, "Invalid account id.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Request body must be valid JSON.");
  }
  const parsed = updateAccountTransactionLimitsSchema.safeParse(body);
  if (!parsed.success) return errorResponse(400, "Enter valid account transaction limits.");

  try {
    await connectToDatabase();
    const current = await BankAccount.findById(id).select("transactionLimits");
    if (!current) return errorResponse(404, "Bank account not found.");

    const currentDaily = current.transactionLimits?.dailyTransferLimit?.toString();
    const currentMaximum = current.transactionLimits?.maximumSingleTransferAmount?.toString();
    const nextDaily = parsed.data.dailyTransferLimit === undefined
      ? currentDaily
      : parsed.data.dailyTransferLimit ?? undefined;
    const nextMaximum = parsed.data.maximumSingleTransferAmount === undefined
      ? currentMaximum
      : parsed.data.maximumSingleTransferAmount ?? undefined;
    const dailyPaisa = nextDaily ? parseBdtPaisa(nextDaily) : null;
    const maximumPaisa = nextMaximum ? parseBdtPaisa(nextMaximum) : null;
    if (dailyPaisa !== null && maximumPaisa !== null && maximumPaisa > dailyPaisa) {
      return errorResponse(400, "Maximum single transfer cannot exceed the daily transfer limit.");
    }

    const account = await updateAccountTransactionLimits({
      accountId: id,
      actorId: authorization.user._id,
      values: parsed.data,
    });
    if (!account) return errorResponse(404, "Bank account not found.");
    const [holder, updater] = await Promise.all([
      User.findById(account.userId).select("name email").lean(),
      User.findById(account.limitsUpdatedBy).select("name").lean(),
    ]);
    return NextResponse.json({
      status: "success",
      data: {
        account: {
          id: account._id.toString(),
          accountNumber: account.accountNumber,
          accountType: account.accountType,
          balance: account.balance.toString(),
          currency: account.currency,
          status: account.status,
          transactionLimits: serializeAccountTransactionLimits(account.transactionLimits),
          limitsUpdatedAt: account.limitsUpdatedAt ?? null,
          limitsUpdatedBy: updater ? { id: account.limitsUpdatedBy?.toString(), name: updater.name } : null,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
          accountHolder: holder ? { id: holder._id.toString(), name: holder.name, email: holder.email } : null,
        },
      },
    });
  } catch {
    return errorResponse(500, "Could not update account transaction limits.");
  }
}
