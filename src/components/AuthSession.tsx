"use client";

import { useCurrentUserQuery } from "@/store/authApi";
import type { ReactNode } from "react";

export function AuthSession({ children }: { children: ReactNode }) {
  useCurrentUserQuery(undefined, { refetchOnMountOrArgChange: true });

  return children;
}
