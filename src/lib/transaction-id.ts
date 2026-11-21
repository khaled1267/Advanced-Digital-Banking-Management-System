import { randomBytes } from "node:crypto";

export function generateTransactionId() {
  return `TXN-${randomBytes(12).toString("hex").toUpperCase()}`;
}
