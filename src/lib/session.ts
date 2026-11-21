import { jwtVerify, SignJWT } from "jose";
import { getAuthEnv } from "@/lib/env";

export const AUTH_COOKIE_NAME = "banking_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

const SESSION_ISSUER = "bank-management-system";
const SESSION_AUDIENCE = "bank-management-system-app";

function getSigningKey() {
  const { JWT_SECRET } = getAuthEnv();
  return new TextEncoder().encode(JWT_SECRET);
}

export async function createSessionToken(userId: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSigningKey());
}

export async function verifySessionToken(token: string) {
  const key = getSigningKey();

  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });

    return typeof payload.sub === "string" ? { userId: payload.sub } : null;
  } catch {
    return null;
  }
}
