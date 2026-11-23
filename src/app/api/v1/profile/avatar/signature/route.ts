import { requireApiRoles } from "@/lib/admin-api";
import { createAvatarUploadSignature, getCloudinaryConfig } from "@/lib/cloudinary";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const authorization = await requireApiRoles(request, ["CUSTOMER"]);
  if (!authorization.ok) return authorization.response;

  const config = getCloudinaryConfig();
  if (!config) {
    return NextResponse.json(
      { status: "error", message: "Profile photo storage is not configured. Add the Cloudinary credentials to the server environment." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  return NextResponse.json(
    { status: "success", data: createAvatarUploadSignature(authorization.user._id.toString(), config) },
    { headers: { "cache-control": "no-store" } },
  );
}
