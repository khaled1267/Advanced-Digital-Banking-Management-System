import { randomBytes } from "node:crypto";

export function generateDepositId() {
  return `DEP-${randomBytes(12).toString("hex").toUpperCase()}`;
}
