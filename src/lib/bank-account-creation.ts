import { isDuplicateKeyError } from "@/lib/admin-api";
import { generateAccountNumber } from "@/lib/account-number";
import { BankAccount, type BankAccountDocument, type AccountType } from "@/models/BankAccount";
import type { HydratedDocument, Types } from "mongoose";

type NewBankAccount = {
  userId: Types.ObjectId | string;
  accountType: AccountType;
};

type CreateAccount = (input: Record<string, unknown>) => Promise<HydratedDocument<BankAccountDocument>>;

export async function createBankAccountWithRetry(
  input: NewBankAccount,
  dependencies: {
    generate?: () => string;
    create?: CreateAccount;
    maxAttempts?: number;
  } = {},
) {
  const generate = dependencies.generate ?? generateAccountNumber;
  const create: CreateAccount =
    dependencies.create ?? ((data) => BankAccount.create(data));
  const maxAttempts = dependencies.maxAttempts ?? 3;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await create({
        ...input,
        accountNumber: generate(),
        balance: "0.00",
        currency: "BDT",
        status: "ACTIVE",
      });
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error) || attempt === maxAttempts - 1) {
        throw error;
      }
    }
  }

  throw new Error("Could not generate a unique account number.");
}
