import { randomBytes } from "node:crypto";

export function generateWithdrawalId() {
  return "WDR-" + randomBytes(12).toString("hex").toUpperCase();
}
