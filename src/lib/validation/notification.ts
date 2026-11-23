import { z } from "zod";

export const notificationListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(["all", "read", "unread"]).default("all"),
});

export const notificationIdSchema = z.string().regex(/^[\da-f]{24}$/i);
