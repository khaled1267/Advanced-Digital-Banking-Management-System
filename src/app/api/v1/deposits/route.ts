import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { buildCustomerDepositFilter, listDeposits } from "@/lib/deposit-queries";
import { createDepositSchema, customerDepositsQuerySchema } from "@/lib/validation/deposit";
import { BankAccount } from "@/models/BankAccount";
import { Deposit } from "@/models/Deposit";
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
  const parsed = createDepositSchema.safeParse(body);
  if (!parsed.success) return errorResponse(400, "Invalid deposit request.");

  try {
    await connectToDatabase();
    const account = await BankAccount.findOne({
      _id: parsed.data.accountId,
      userId: authorization.user._id,
      status: "ACTIVE",
    }).select("_id");
    if (!account) return errorResponse(404, "Active account not found.");

    const deposit = await Deposit.create({
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
        deposit: {
          id: deposit._id.toString(),
          depositId: deposit.depositId,
          amount: deposit.amount.toString(),
          currency: deposit.currency,
          status: deposit.status,
          description: deposit.description,
          createdAt: deposit.createdAt,
        },
      },
    }, { status: 201 });
  } catch {
    return errorResponse(500, "Could not submit the deposit request.");
  }
}

export async function GET(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["CUSTOMER"]);
  if (!authorization.ok) return authorization.response;
  const parsed = customerDepositsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) return errorResponse(400, "Invalid deposit query.");

  try {
    await connectToDatabase();
    const filter = buildCustomerDepositFilter(authorization.user._id, parsed.data);
    const summaryFilter = buildCustomerDepositFilter(authorization.user._id, { ...parsed.data, status: undefined });
    const data = await listDeposits(filter, parsed.data.page, parsed.data.limit, false, summaryFilter);
    return NextResponse.json({ status: "success", data });
  } catch {
    return errorResponse(500, "Could not retrieve your deposit requests.");
  }
}
