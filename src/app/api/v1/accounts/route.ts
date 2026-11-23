import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { BankAccount } from "@/models/BankAccount";
import { serializeAccountTransactionLimits } from "@/lib/account-transaction-limits";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["CUSTOMER"]);
  if (!authorization.ok) return authorization.response;

  try {
    await connectToDatabase();
    const accounts = await BankAccount.find({ userId: authorization.user._id })
      .select("accountNumber accountType balance currency status transactionLimits createdAt updatedAt")
      .sort({ createdAt: -1, _id: -1 })
      .lean();
    return NextResponse.json({
      status: "success",
      data: {
        accounts: accounts.map((account) => ({
          id: account._id.toString(),
          accountNumber: account.accountNumber,
          accountType: account.accountType,
          balance: account.balance.toString(),
          currency: account.currency,
          status: account.status,
          transactionLimits: serializeAccountTransactionLimits(account.transactionLimits),
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        })),
      },
    });
  } catch {
    return NextResponse.json({ status: "error", message: "Could not retrieve your accounts." }, { status: 500 });
  }
}
