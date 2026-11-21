import { randomBytes } from "node:crypto";

export function generateAccountNumber() {
  return `NB${randomBytes(8).toString("hex").toUpperCase()}`;
}
