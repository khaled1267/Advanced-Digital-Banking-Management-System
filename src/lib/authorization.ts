import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isValidObjectId, type HydratedDocument } from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { User, USER_ROLES, type UserDocument } from "@/models/User";

export type UserRole = (typeof USER_ROLES)[number];
export type AuthenticatedUser = HydratedDocument<UserDocument>;

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Authentication is required.");
    this.name = "AuthenticationRequiredError";
  }
}

export class RoleAuthorizationError extends Error {
  constructor(readonly actualRole: UserRole) {
    super("You do not have permission to access this resource.");
    this.name = "RoleAuthorizationError";
  }
}

const dashboardPathByRole: Record<UserRole, string> = {
  ADMIN: "/admin/dashboard",
  STAFF: "/staff/dashboard",
  CUSTOMER: "/dashboard",
};

export function getDashboardPath(role: UserRole) {
  return dashboardPathByRole[role];
}

export async function getCurrentUser(
  sessionToken?: string,
): Promise<AuthenticatedUser | null> {
  const token =
    sessionToken ?? (await cookies()).get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const session = await verifySessionToken(token);

  if (!session || !isValidObjectId(session.userId)) {
    return null;
  }

  await connectToDatabase();
  const user = await User.findById(session.userId);

  return user?.status === "ACTIVE" ? user : null;
}

export async function requireAuth(
  sessionToken?: string,
): Promise<AuthenticatedUser> {
  const user = await getCurrentUser(sessionToken);

  if (!user) {
    throw new AuthenticationRequiredError();
  }

  return user;
}

export async function requireRole(
  role: UserRole,
  sessionToken?: string,
): Promise<AuthenticatedUser> {
  const user = await requireAuth(sessionToken);

  if (user.role !== role) {
    throw new RoleAuthorizationError(user.role);
  }

  return user;
}

export async function requireAnyRole(
  roles: readonly UserRole[],
  sessionToken?: string,
): Promise<AuthenticatedUser> {
  const user = await requireAuth(sessionToken);

  if (!roles.includes(user.role)) {
    throw new RoleAuthorizationError(user.role);
  }

  return user;
}

export async function requireDashboardRole(
  role: UserRole,
  sessionToken?: string,
) {
  try {
    return await requireRole(role, sessionToken);
  } catch (error: unknown) {
    if (error instanceof AuthenticationRequiredError) {
      redirect("/login");
    }

    if (error instanceof RoleAuthorizationError) {
      redirect(getDashboardPath(error.actualRole));
    }

    throw error;
  }
}

export async function requireDashboardRoles(roles: readonly UserRole[]) {
  try {
    return await requireAnyRole(roles);
  } catch (error: unknown) {
    if (error instanceof AuthenticationRequiredError) {
      redirect("/login");
    }

    if (error instanceof RoleAuthorizationError) {
      redirect(getDashboardPath(error.actualRole));
    }

    throw error;
  }
}
