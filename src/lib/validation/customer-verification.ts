import { z } from "zod";
import { CUSTOMER_VERIFICATION_STATUSES } from "@/models/User";

export const customerVerificationQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  verificationStatus: z.enum(CUSTOMER_VERIFICATION_STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(1_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const customerVerificationActionSchema = z.discriminatedUnion("verificationStatus", [
  z.strictObject({ verificationStatus: z.literal("VERIFIED") }),
  z.strictObject({
    verificationStatus: z.literal("REJECTED"),
    verificationNote: z.string().trim().min(5).max(500),
  }),
]);

export type CustomerVerificationAction = z.infer<typeof customerVerificationActionSchema>;
