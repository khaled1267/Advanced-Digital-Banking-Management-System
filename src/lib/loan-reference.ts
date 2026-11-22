import { randomBytes } from "node:crypto";

export function generateLoanId() {
  return `LON-${randomBytes(12).toString("hex").toUpperCase()}`;
}
