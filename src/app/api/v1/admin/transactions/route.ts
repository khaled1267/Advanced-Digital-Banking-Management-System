import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { buildTransactionFilter, listTransactions } from "@/lib/transaction-queries";
import { transactionQuerySchema } from "@/lib/validation/transaction";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["ADMIN", "STAFF"]);
  if (!authorization.ok) return authorization.response;
  const query = transactionQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success) {
    return NextResponse.json({ status: "error", message: "Invalid transaction query." }, { status: 400 });
  }

  try {
    await connectToDatabase();
    const data = await listTransactions(buildTransactionFilter(query.data), query.data);
    return NextResponse.json({ status: "success", data });
  } catch {
    return NextResponse.json({ status: "error", message: "Could not retrieve transactions." }, { status: 500 });
  }
}
