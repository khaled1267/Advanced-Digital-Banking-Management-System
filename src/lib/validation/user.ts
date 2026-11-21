import { z } from "zod";

export const nameSchema = z.string().trim().min(2).max(100);

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const passwordSchema = z.string().min(12).max(128);

export const userRegistrationSchema = z.strictObject({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const registrationFormSchema = userRegistrationSchema
  .extend({ confirmPassword: z.string() })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const userLoginSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const adminUserRoleSchema = z.enum(["STAFF", "CUSTOMER"]);
export const adminUserStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);

export const adminUserQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  role: z.enum(["ADMIN", "STAFF", "CUSTOMER"]).optional(),
  status: adminUserStatusSchema.optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const adminUserCreateSchema = z.strictObject({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: adminUserRoleSchema,
});

export const adminUserUpdateSchema = z
  .strictObject({
    name: nameSchema.optional(),
    role: adminUserRoleSchema.optional(),
    status: adminUserStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export type UserRegistrationInput = z.infer<typeof userRegistrationSchema>;
export type UserLoginInput = z.infer<typeof userLoginSchema>;
export type RegistrationFormInput = z.infer<typeof registrationFormSchema>;
export type AdminUserCreateInput = z.infer<typeof adminUserCreateSchema>;
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;
