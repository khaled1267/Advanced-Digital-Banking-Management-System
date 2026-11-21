import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { buildCustomerWithdrawalFilter, listWithdrawals } from "@/lib/withdrawal-queries";
import { createWithdrawalSchema, customerWithdrawalsQuerySchema } from "@/lib/validation/withdrawal";
import { BankAccount } from "@/models/BankAccount";
import { Withdrawal } from "@/models/Withdrawal";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function errorResponse(status: number, message: string) {
  return NextResponse.json({ status: "error", message }, { status });
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
  const parsed = createWithdrawalSchema.safeParse(body);
  if (!parsed.success) return errorResponse(400, "Invalid withdrawal request.");

  try {
    await connectToDatabase();
    const account = await BankAccount.findOne({
      _id: parsed.data.accountId,
      userId: authorization.user._id,
      status: "ACTIVE",
    }).select("_id");
    if (!account) return errorResponse(404, "Active account not found.");

    const withdrawal = await Withdrawal.create({
      customerId: authorization.user._id,
      accountId: account._id,
      amount: parsed.data.amount,
      currency: "BDT",
      description: parsed.data.description || undefined,
      status: "PENDING",
    });
    return NextResponse.json({
      status: "success",
      data: {
        withdrawal: {
          id: withdrawal._id.toString(),
          withdrawalId: withdrawal.withdrawalId,
          amount: withdrawal.amount.toString(),
          currency: withdrawal.currency,
          status: withdrawal.status,
          description: withdrawal.description,
          createdAt: withdrawal.createdAt,
        },
      },
    }, { status: 201 });
  } catch {
    return errorResponse(500, "Could not submit the withdrawal request.");
  }
}

export async function GET(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["CUSTOMER"]);
  if (!authorization.ok) return authorization.response;
  const parsed = customerWithdrawalsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) return errorResponse(400, "Invalid withdrawal query.");

  try {
    await connectToDatabase();
    const filter = buildCustomerWithdrawalFilter(authorization.user._id, parsed.data);
    const summaryFilter = buildCustomerWithdrawalFilter(authorization.user._id, { ...parsed.data, status: undefined });
    const data = await listWithdrawals(filter, parsed.data.page, parsed.data.limit, false, summaryFilter);
    return NextResponse.json({ status: "success", data });
  } catch {
    return errorResponse(500, "Could not retrieve your withdrawal requests.");
  }
}
