import { z } from "zod";

const objectIdSchema = z.string().regex(/^[\da-f]{24}$/i, "A valid MongoDB ObjectId is required.");

export const accountStatementQuerySchema = z
  .strictObject({
    accountId: objectIdSchema,
    startDate: z.iso.date().optional(),
    endDate: z.iso.date().optional(),
    page: z.coerce.number().int().min(1).max(1_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine(
    ({ startDate, endDate }) => !startDate || !endDate || startDate <= endDate,
    { path: ["endDate"], message: "End date must be on or after the start date." },
  );

export type AccountStatementQuery = z.infer<typeof accountStatementQuerySchema>;
