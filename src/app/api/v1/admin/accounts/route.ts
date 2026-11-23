import { requireApiRoles, isDuplicateKeyError } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { createBankAccountWithRetry } from "@/lib/bank-account-creation";
import {
  adminAccountsQuerySchema,
  createBankAccountSchema,
} from "@/lib/validation/bank-account";
import { BankAccount } from "@/models/BankAccount";
import { User } from "@/models/User";
import { serializeAccountTransactionLimits } from "@/lib/account-transaction-limits";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function errorResponse(status: number, message: string) {
  return NextResponse.json({ status: "error", message }, { status });
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["ADMIN", "STAFF"]);
  if (!authorization.ok) return authorization.response;

  const parsed = adminAccountsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) return errorResponse(400, "Invalid query parameters.");

  try {
    await connectToDatabase();
    const { search, accountType, status, page, limit } = parsed.data;
    const filter: Record<string, unknown> = {};
    if (accountType) filter.accountType = accountType;
    if (status) filter.status = status;

    if (search) {
      const pattern = new RegExp(escapeRegex(search), "i");
      const matchedUsers = await User.find({
        $or: [{ name: pattern }, { email: pattern }],
      }).select("_id").lean();
      filter.$or = [
        { accountNumber: pattern },
        ...(matchedUsers.length ? [{ userId: { $in: matchedUsers.map((user) => user._id) } }] : []),
      ];
    }

    const [accounts, total] = await Promise.all([
      BankAccount.find(filter)
        .select("accountNumber userId accountType balance currency status transactionLimits limitsUpdatedBy limitsUpdatedAt createdAt updatedAt")
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      BankAccount.countDocuments(filter),
    ]);
    const userIds = accounts.map((account) => account.userId);
    const holders = await User.find({ _id: { $in: userIds } }).select("name email").lean();
    const holderById = new Map(holders.map((holder) => [holder._id.toString(), holder]));

    return NextResponse.json({
      status: "success",
      data: {
        accounts: accounts.map((account) => {
          const holder = holderById.get(account.userId.toString());
          return {
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
          };
        }),
        total,
        page,
        totalPages: Math.ceil(total / limit),
        limit,
      },
    });
  } catch {
    return errorResponse(500, "Could not retrieve bank accounts.");
  }
}

export async function POST(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["ADMIN", "STAFF"]);
  if (!authorization.ok) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Request body must be valid JSON.");
  }
  const parsed = createBankAccountSchema.safeParse(body);
  if (!parsed.success) return errorResponse(400, "Invalid bank account data.");

  try {
    await connectToDatabase();
    const owner = await User.findById(parsed.data.userId).select("status");
    if (!owner) return errorResponse(404, "Account holder not found.");
    if (owner.status !== "ACTIVE") {
      return errorResponse(409, "An inactive user cannot receive a new account.");
    }

    const account = await createBankAccountWithRetry(parsed.data);
    return NextResponse.json(
      {
        status: "success",
        data: {
          account: {
            id: account._id.toString(),
            accountNumber: account.accountNumber,
            accountType: account.accountType,
            balance: account.balance.toString(),
            currency: account.currency,
            status: account.status,
            createdAt: account.createdAt,
            updatedAt: account.updatedAt,
          },
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    if (isDuplicateKeyError(error)) {
      return errorResponse(500, "Could not allocate a unique account number.");
    }
    return errorResponse(500, "Could not create the bank account.");
  }
}
