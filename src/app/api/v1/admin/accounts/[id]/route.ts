import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { updateAccountStatusSchema } from "@/lib/validation/bank-account";
import { BankAccount, type AccountStatus } from "@/models/BankAccount";
import { User } from "@/models/User";
import { serializeAccountTransactionLimits } from "@/lib/account-transaction-limits";
import { isObjectIdOrHexString } from "mongoose";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };
const allowedNextStatuses: Record<AccountStatus, readonly AccountStatus[]> = {
  ACTIVE: ["INACTIVE", "FROZEN", "CLOSED"],
  INACTIVE: ["ACTIVE", "FROZEN", "CLOSED"],
  FROZEN: ["ACTIVE", "INACTIVE", "CLOSED"],
  CLOSED: [],
};

function errorResponse(status: number, message: string) {
  return NextResponse.json({ status: "error", message }, { status });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const authorization = await requireApiRoles(request, ["ADMIN", "STAFF"]);
  if (!authorization.ok) return authorization.response;
  const { id } = await context.params;
  if (!isObjectIdOrHexString(id)) return errorResponse(400, "Invalid account id.");

  try {
    await connectToDatabase();
    const account = await BankAccount.findById(id)
      .select("accountNumber userId accountType balance currency status transactionLimits limitsUpdatedBy limitsUpdatedAt createdAt updatedAt")
      .lean();
    if (!account) return errorResponse(404, "Bank account not found.");
    const [holder, limitsUpdater] = await Promise.all([
      User.findById(account.userId).select("name email").lean(),
      account.limitsUpdatedBy ? User.findById(account.limitsUpdatedBy).select("name").lean() : null,
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
          limitsUpdatedBy: limitsUpdater ? { id: account.limitsUpdatedBy?.toString(), name: limitsUpdater.name } : null,
          limitsUpdatedAt: account.limitsUpdatedAt ?? null,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
          accountHolder: holder
            ? { id: holder._id.toString(), name: holder.name, email: holder.email }
            : null,
        },
      },
    });
  } catch {
    return errorResponse(500, "Could not retrieve the bank account.");
  }
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
  const parsed = updateAccountStatusSchema.safeParse(body);
  if (!parsed.success) return errorResponse(400, "Only a valid account status can be updated.");

  try {
    await connectToDatabase();
    const current = await BankAccount.findById(id).select("status");
    if (!current) return errorResponse(404, "Bank account not found.");
    const nextStatus = parsed.data.status;
    if (current.status !== nextStatus && !allowedNextStatuses[current.status].includes(nextStatus)) {
      return errorResponse(409, "This account status transition is not allowed.");
    }

    const account = current.status === nextStatus
      ? await BankAccount.findById(id)
          .select("accountNumber userId accountType balance currency status transactionLimits limitsUpdatedBy limitsUpdatedAt createdAt updatedAt")
          .lean()
      : await BankAccount.findOneAndUpdate(
          { _id: id, status: current.status },
          { $set: { status: nextStatus } },
          { returnDocument: "after", runValidators: true },
        ).lean();
    if (!account) return errorResponse(409, "Account status changed during the update. Refresh and try again.");
    const holder = await User.findById(account.userId).select("name email").lean();

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
          limitsUpdatedBy: account.limitsUpdatedBy?.toString() ?? null,
          limitsUpdatedAt: account.limitsUpdatedAt ?? null,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
          accountHolder: holder
            ? { id: holder._id.toString(), name: holder.name, email: holder.email }
            : null,
        },
      },
    });
  } catch {
    return errorResponse(500, "Could not update the account status.");
  }
}
