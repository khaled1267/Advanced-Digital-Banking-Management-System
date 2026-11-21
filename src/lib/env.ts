import { z } from "zod";

const databaseEnvSchema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI is not configured"),
  MONGODB_DATABASE: z.string().min(1, "MONGODB_DATABASE is not configured"),
});

const authEnvSchema = z.object({
  JWT_SECRET: z.string().trim().min(32, "JWT_SECRET must be at least 32 characters"),
});

export function getDatabaseEnv() {
  return databaseEnvSchema.parse(process.env);
}

export function getAuthEnv() {
  return authEnvSchema.parse(process.env);
}
