import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import {
  accountOwnershipCondition,
  buildTransactionFilter,
  listTransactions,
} from "@/lib/transaction-queries";
import { transactionQuerySchema } from "@/lib/validation/transaction";
import { BankAccount } from "@/models/BankAccount";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["CUSTOMER"]);
  if (!authorization.ok) return authorization.response;
  const query = transactionQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success) {
    return NextResponse.json({ status: "error", message: "Invalid transaction query." }, { status: 400 });
  }

  try {
    await connectToDatabase();
    const accounts = await BankAccount.find({ userId: authorization.user._id }).select("_id").lean();
    const filter = buildTransactionFilter(query.data);
    const data = await listTransactions(
      { $and: [filter, accountOwnershipCondition(accounts.map((account) => account._id))] },
      query.data,
    );
    return NextResponse.json({ status: "success", data });
  } catch {
    return NextResponse.json({ status: "error", message: "Could not retrieve your transactions." }, { status: 500 });
  }
}
