import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { BankAccount } from "@/models/BankAccount";
import { serializeAccountTransactionLimits } from "@/lib/account-transaction-limits";
import { isObjectIdOrHexString } from "mongoose";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(status: number, message: string) {
  return NextResponse.json({ status: "error", message }, { status });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const authorization = await requireApiRoles(request, ["CUSTOMER"]);
  if (!authorization.ok) return authorization.response;
  const { id } = await context.params;
  if (!isObjectIdOrHexString(id)) return errorResponse(400, "Invalid account id.");

  try {
    await connectToDatabase();
    const account = await BankAccount.findOne({
      _id: id,
      userId: authorization.user._id,
    })
      .select("accountNumber accountType balance currency status transactionLimits createdAt updatedAt")
      .lean();
    if (!account) return errorResponse(404, "Bank account not found.");

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
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        },
      },
    });
  } catch {
    return errorResponse(500, "Could not retrieve the account.");
  }
}
