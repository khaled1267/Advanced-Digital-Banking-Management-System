import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import {
  accountOwnershipCondition,
  buildTransactionFilter,
  getSafeTransaction,
} from "@/lib/transaction-queries";
import { transactionQuerySchema } from "@/lib/validation/transaction";
import { BankAccount } from "@/models/BankAccount";
import { Transaction } from "@/models/Transaction";
import { isObjectIdOrHexString } from "mongoose";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const authorization = await requireApiRoles(request, ["CUSTOMER"]);
  if (!authorization.ok) return authorization.response;
  const { id } = await context.params;
  if (!isObjectIdOrHexString(id)) {
    return NextResponse.json({ status: "error", message: "Invalid transaction id." }, { status: 400 });
  }
  const query = transactionQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success) {
    return NextResponse.json({ status: "error", message: "Invalid transaction query." }, { status: 400 });
  }

  try {
    await connectToDatabase();
    const accounts = await BankAccount.find({ userId: authorization.user._id }).select("_id").lean();
    const transaction = await Transaction.findOne({
      $and: [
        { _id: id },
        buildTransactionFilter(query.data),
        accountOwnershipCondition(accounts.map((account) => account._id)),
      ],
    })
      .select("transactionId transactionType fromAccount toAccount amount currency status description createdAt updatedAt")
      .lean();
    if (!transaction) {
      return NextResponse.json({ status: "error", message: "Transaction not found." }, { status: 404 });
    }
    const safeTransaction = await getSafeTransaction(transaction);
    return NextResponse.json({ status: "success", data: { transaction: safeTransaction } });
  } catch {
    return NextResponse.json({ status: "error", message: "Could not retrieve the transaction." }, { status: 500 });
  }
}
