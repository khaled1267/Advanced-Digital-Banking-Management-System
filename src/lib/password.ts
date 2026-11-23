import argon2 from "argon2";

export function hashPassword(password: string) {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(password: string, passwordHash: string) {
  return argon2.verify(passwordHash, password);
}

export function hashTransactionPin(pin: string) {
  return argon2.hash(pin, { type: argon2.argon2id });
}

export function verifyTransactionPinHash(pin: string, pinHash: string) {
  return argon2.verify(pinHash, pin);
}
