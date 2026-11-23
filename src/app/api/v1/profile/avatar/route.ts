import { requireApiRoles } from "@/lib/admin-api";
import {
  deleteCloudinaryAsset,
  getCloudinaryAsset,
  getCloudinaryConfig,
  isAllowedAvatarAsset,
  isAvatarPublicIdOwnedBy,
} from "@/lib/cloudinary";
import { connectToDatabase } from "@/lib/mongodb";
import { profileAvatarFinalizeSchema } from "@/lib/validation/profile";
import { User } from "@/models/User";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function errorResponse(status: number, message: string) {
  return NextResponse.json({ status: "error", message }, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["CUSTOMER"]);
  if (!authorization.ok) return authorization.response;
  const config = getCloudinaryConfig();
  if (!config) return errorResponse(503, "Profile photo storage is not configured. Add the Cloudinary credentials to the server environment.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "The uploaded photo could not be verified.");
  }
  const parsed = profileAvatarFinalizeSchema.safeParse(body);
  const userId = authorization.user._id.toString();
  if (!parsed.success || !isAvatarPublicIdOwnedBy(parsed.data.publicId, userId)) {
    return errorResponse(400, "The uploaded photo could not be verified.");
  }

  let asset;
  try {
    asset = await getCloudinaryAsset(config, parsed.data.publicId);
  } catch {
    await deleteCloudinaryAsset(config, parsed.data.publicId);
    return errorResponse(502, "Could not verify the photo with Cloudinary. Please try again.");
  }
  if (!asset) return errorResponse(400, "The uploaded photo could not be found.");
  if (!isAllowedAvatarAsset(asset, parsed.data.publicId, config.cloudName)) {
    await deleteCloudinaryAsset(config, parsed.data.publicId);
    return errorResponse(400, "Choose a valid JPG, PNG, or WebP image smaller than 5 MB.");
  }

  let previousPublicId: string | null | undefined;
  let user;
  try {
    await connectToDatabase();
    previousPublicId = authorization.user.profileImagePublicId;
    user = await User.findOneAndUpdate(
      { _id: authorization.user._id, role: "CUSTOMER", status: "ACTIVE" },
      { $set: { profileImageUrl: asset.secure_url, profileImagePublicId: asset.public_id } },
      { new: true, runValidators: true },
    ).select("name email role status createdAt profileImageUrl");
  } catch {
    await deleteCloudinaryAsset(config, asset.public_id);
    return errorResponse(500, "Could not save your profile photo. Your previous photo has been kept.");
  }
  if (!user) {
    await deleteCloudinaryAsset(config, asset.public_id);
    return errorResponse(404, "Your profile could not be found.");
  }

  const cleanupPending = Boolean(previousPublicId && previousPublicId !== asset.public_id && !(await deleteCloudinaryAsset(config, previousPublicId)));
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
        profileImageUrl: user.profileImageUrl,
      },
      cleanupPending,
    },
  }, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["CUSTOMER"]);
  if (!authorization.ok) return authorization.response;

  const previousPublicId = authorization.user.profileImagePublicId;
  try {
    await connectToDatabase();
    const user = await User.findOneAndUpdate(
      { _id: authorization.user._id, role: "CUSTOMER", status: "ACTIVE" },
      { $unset: { profileImageUrl: 1, profileImagePublicId: 1 } },
      { new: true, runValidators: true },
    ).select("name email role status createdAt profileImageUrl");
    if (!user) return errorResponse(404, "Your profile could not be found.");

    const config = getCloudinaryConfig();
    const cleanupPending = Boolean(previousPublicId && (!config || !(await deleteCloudinaryAsset(config, previousPublicId))));
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
          profileImageUrl: null,
        },
        cleanupPending,
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return errorResponse(500, "Could not remove your profile photo.");
  }
}
