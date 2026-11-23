import { requireApiRoles } from "@/lib/admin-api";
import { connectToDatabase } from "@/lib/mongodb";
import { hashTransactionPin, verifyPassword } from "@/lib/password";
import { transactionPinUpdateSchema } from "@/lib/validation/profile";
import { User } from "@/models/User";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function errorResponse(status: number, message: string) {
  return NextResponse.json({ status: "error", message }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["CUSTOMER"]);
  if (!authorization.ok) return authorization.response;

  try {
    await connectToDatabase();
    const user = await User.findOne({ _id: authorization.user._id, role: "CUSTOMER", status: "ACTIVE" })
      .select("+transactionPinHash")
      .lean();
    if (!user) return errorResponse(404, "Your customer profile could not be found.");
    return NextResponse.json({ status: "success", data: { configured: Boolean(user.transactionPinHash) } }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return errorResponse(500, "Could not check your Transaction PIN status.");
  }
}

export async function POST(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["CUSTOMER"]);
  if (!authorization.ok) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Enter a valid Transaction PIN request.");
  }
  const parsed = transactionPinUpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(400, parsed.error.issues[0]?.message ?? "Enter a valid Transaction PIN request.");

  try {
    await connectToDatabase();
    const user = await User.findOne({ _id: authorization.user._id, role: "CUSTOMER", status: "ACTIVE" })
      .select("+passwordHash +transactionPinHash");
    if (!user?.passwordHash) return errorResponse(404, "Your customer profile could not be found.");

    let passwordMatches = false;
    try {
      passwordMatches = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
    } catch {
      passwordMatches = false;
    }
    if (!passwordMatches) return errorResponse(400, "Current login password is incorrect.");

    const transactionPinHash = await hashTransactionPin(parsed.data.newPin);
    const updated = await User.updateOne(
      {
        _id: user._id,
        role: "CUSTOMER",
        status: "ACTIVE",
        passwordHash: user.passwordHash,
      },
      {
        $set: { transactionPinHash, transactionPinFailedAttempts: 0 },
        $unset: { transactionPinFailureWindowStartedAt: 1, transactionPinLockedUntil: 1 },
      },
    );
    if (updated.matchedCount !== 1) return errorResponse(409, "Your security details changed. Please retry.");

    return NextResponse.json({ status: "success", data: { configured: true } }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return errorResponse(500, "Could not save your Transaction PIN.");
  }
}
