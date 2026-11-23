import { requireApiRoles } from "@/lib/admin-api";
import { getCloudinaryConfig } from "@/lib/cloudinary";
import { connectToDatabase } from "@/lib/mongodb";
import { profileUpdateSchema } from "@/lib/validation/profile";
import { BankAccount } from "@/models/BankAccount";
import { User } from "@/models/User";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function errorResponse(status: number, message: string) {
  return NextResponse.json({ status: "error", message }, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["CUSTOMER"]);
  if (!authorization.ok) return authorization.response;

  try {
    await connectToDatabase();
    const [user, accounts] = await Promise.all([
      User.findById(authorization.user._id).select("name email role status createdAt profileImageUrl profileImagePublicId verificationStatus verifiedAt verificationNote").lean(),
      BankAccount.find({ userId: authorization.user._id })
        .select("accountNumber accountType status createdAt")
        .sort({ createdAt: -1, _id: -1 })
        .lean(),
    ]);

    if (!user) return errorResponse(404, "Your profile could not be found.");

    return NextResponse.json({
      status: "success",
      data: {
        profile: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          createdAt: user.createdAt,
          profileImageUrl: user.profileImageUrl ?? null,
          verificationStatus: user.verificationStatus ?? "PENDING",
          verifiedAt: user.verifiedAt ?? null,
          verificationNote: user.verificationNote ?? null,
        },
        accounts: accounts.map((account) => ({
          id: account._id.toString(),
          maskedAccountNumber: `•••• ${account.accountNumber.slice(-4)}`,
          accountType: account.accountType,
          status: account.status,
          createdAt: account.createdAt,
        })),
        cloudinaryConfigured: Boolean(getCloudinaryConfig()),
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return errorResponse(500, "Could not retrieve your profile.");
  }
}

export async function PATCH(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["CUSTOMER"]);
  if (!authorization.ok) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "The profile details are not valid.");
  }

  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(400, "Enter a valid full name.");

  try {
    await connectToDatabase();
    const user = await User.findOneAndUpdate(
      { _id: authorization.user._id, role: "CUSTOMER", status: "ACTIVE" },
      { $set: { name: parsed.data.name } },
      { new: true, runValidators: true },
    ).select("name email role status createdAt profileImageUrl verificationStatus verifiedAt verificationNote");

    if (!user) return errorResponse(404, "Your profile could not be found.");

    return NextResponse.json({
      status: "success",
      data: {
        profile: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          createdAt: user.createdAt,
          profileImageUrl: user.profileImageUrl ?? null,
          verificationStatus: user.verificationStatus ?? "PENDING",
          verifiedAt: user.verifiedAt ?? null,
          verificationNote: user.verificationNote ?? null,
        },
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return errorResponse(500, "Could not update your profile.");
  }
}
