import { z } from "zod";
import { nameSchema } from "@/lib/validation/user";

export const profileUpdateSchema = z.strictObject({ name: nameSchema });
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export const transactionPinUpdateSchema = z.strictObject({
  newPin: z.string().regex(/^\d{6}$/, "Transaction PIN must contain exactly six digits."),
  confirmPin: z.string().regex(/^\d{6}$/, "Confirmation must contain exactly six digits."),
  currentPassword: z.string().min(1).max(256),
}).refine((value) => value.newPin === value.confirmPin, {
  message: "Transaction PIN entries do not match.",
  path: ["confirmPin"],
});
export type TransactionPinUpdateInput = z.infer<typeof transactionPinUpdateSchema>;
export const profileAvatarFinalizeSchema = z.strictObject({ publicId: z.string().trim().min(1).max(255) });

export const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PROFILE_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function validateProfileImage(file: Pick<File, "type" | "size">) {
  if (file.size <= 0) return "Choose an image that is not empty.";
  if (!PROFILE_IMAGE_MIME_TYPES.includes(file.type as (typeof PROFILE_IMAGE_MIME_TYPES)[number])) {
    return "Choose a JPG, PNG, or WebP image.";
  }
  if (file.size > PROFILE_IMAGE_MAX_BYTES) {
    return "Choose an image smaller than 5 MB.";
  }
  return null;
}
