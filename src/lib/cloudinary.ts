import { createHash, randomUUID } from "node:crypto";
import { PROFILE_IMAGE_MAX_BYTES } from "@/lib/validation/profile";

type CloudinaryConfig = { cloudName: string; apiKey: string; apiSecret: string };
type SignedParams = Record<string, string | number | boolean>;

export type CloudinaryAsset = {
  public_id: string;
  resource_type: string;
  format: string;
  bytes: number;
  secure_url: string;
};

const AVATAR_FOLDER = "northstar/profile-avatars";
const ALLOWED_FORMATS = "jpg,jpeg,png,webp";
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

export function getCloudinaryConfig(): CloudinaryConfig | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !/^[a-zA-Z0-9_-]+$/.test(cloudName) || !apiKey || !apiSecret) return null;
  return { cloudName, apiKey, apiSecret };
}

export function signCloudinaryParams(params: SignedParams, apiSecret: string) {
  const serialized = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("&");
  return createHash("sha1").update(`${serialized}${apiSecret}`).digest("hex");
}

export function createAvatarUploadSignature(userId: string, config: CloudinaryConfig) {
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `${AVATAR_FOLDER}/${userId}/${randomUUID()}`;
  const params = {
    allowed_formats: ALLOWED_FORMATS,
    overwrite: "false",
    public_id: publicId,
    timestamp,
  };
  return { ...params, apiKey: config.apiKey, cloudName: config.cloudName, signature: signCloudinaryParams(params, config.apiSecret) };
}

export function isAvatarPublicIdOwnedBy(publicId: string, userId: string) {
  const prefix = `${AVATAR_FOLDER}/${userId}/`;
  const uuid = publicId.startsWith(prefix) ? publicId.slice(prefix.length) : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}

export function detectProfileImageFormat(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length >= 8 && bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10") return "png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "webp";
  return null;
}

export function isAllowedAvatarAsset(asset: CloudinaryAsset, publicId: string, cloudName: string) {
  if (asset.public_id !== publicId || asset.resource_type !== "image") return false;
  if (!ALLOWED_EXTENSIONS.has(asset.format.toLowerCase()) || asset.bytes <= 0 || asset.bytes > PROFILE_IMAGE_MAX_BYTES) return false;
  try {
    const imageUrl = new URL(asset.secure_url);
    return imageUrl.protocol === "https:" && imageUrl.hostname === "res.cloudinary.com" && imageUrl.pathname.startsWith(`/${cloudName}/image/upload/`);
  } catch {
    return false;
  }
}

export async function getCloudinaryAsset(config: CloudinaryConfig, publicId: string): Promise<CloudinaryAsset | null> {
  const encodedPublicId = publicId.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/resources/image/upload/${encodedPublicId}`, {
    headers: { authorization: `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64")}`, accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Cloudinary resource lookup failed.");
  const asset: unknown = await response.json();
  if (!asset || typeof asset !== "object") return null;
  const candidate = asset as Partial<CloudinaryAsset>;
  if (typeof candidate.public_id !== "string" || typeof candidate.resource_type !== "string" || typeof candidate.format !== "string" || typeof candidate.bytes !== "number" || typeof candidate.secure_url !== "string") return null;
  return candidate as CloudinaryAsset;
}

export async function deleteCloudinaryAsset(config: CloudinaryConfig, publicId: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { invalidate: "true", public_id: publicId, timestamp };
  const body = new FormData();
  body.set("public_id", publicId);
  body.set("timestamp", String(timestamp));
  body.set("invalidate", "true");
  body.set("api_key", config.apiKey);
  body.set("signature", signCloudinaryParams(params, config.apiSecret));

  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/destroy`, {
      method: "POST",
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return false;
    const result: unknown = await response.json();
    return Boolean(result && typeof result === "object" && "result" in result && (result.result === "ok" || result.result === "not found"));
  } catch {
    return false;
  }
}

