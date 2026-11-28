import { loadEnvConfig } from "@next/env";
import { assertSafeDemoSeedEnvironment, DEMO_DATABASE } from "../src/lib/demo-seed";
import { hashPassword, verifyPassword } from "../src/lib/password";
import { User } from "../src/models/User";
import mongoose from "mongoose";

const demoUsers = [
  {
    name: "Northstar Demo Admin",
    email: "admin.demo@northstar.test",
    password: "Demo-Admin-2026-Northstar!",
    role: "ADMIN",
  },
  {
    name: "Northstar Demo Staff",
    email: "staff.demo@northstar.test",
    password: "Demo-Staff-2026-Northstar!",
    role: "STAFF",
  },
  {
    name: "Northstar Demo Customer",
    email: "customer.demo@northstar.test",
    password: "Demo-Customer-2026-Northstar!",
    role: "CUSTOMER",
  },
] as const;

async function seedDemoUsers() {
  loadEnvConfig(process.cwd());
  assertSafeDemoSeedEnvironment(process.env);

  try {
    await mongoose.connect(process.env.MONGODB_DEMO_URI!, {
      dbName: DEMO_DATABASE,
      serverSelectionTimeoutMS: 5000,
    });

    const emails = demoUsers.map(({ email }) => email);
    const existingUsers = await User.find({ email: { $in: emails } }).select("+passwordHash");
    const existingByEmail = new Map(existingUsers.map((user) => [user.email, user]));

    // Validate every collision before creating anything, and never change existing records.
    for (const demoUser of demoUsers) {
      const existing = existingByEmail.get(demoUser.email);
      if (!existing) continue;

      if (
        existing.role !== demoUser.role ||
        existing.status !== "ACTIVE" ||
        !(await verifyPassword(demoUser.password, existing.passwordHash))
      ) {
        throw new Error(`An existing record conflicts with the expected demo account ${demoUser.email}; no records were changed.`);
      }
    }

    const missingUsers = demoUsers.filter(({ email }) => !existingByEmail.has(email));
    const documents = await Promise.all(
      missingUsers.map(async ({ password, ...user }) => ({
        ...user,
        passwordHash: await hashPassword(password),
        status: "ACTIVE",
        ...(user.role === "CUSTOMER" ? { verificationStatus: "VERIFIED" } : {}),
      })),
    );

    if (documents.length > 0) {
      await User.insertMany(documents, { ordered: true });
    }

    console.log(`Demo accounts are ready in the ${DEMO_DATABASE} database (${demoUsers.length} accounts).`);
  } finally {
    await mongoose.disconnect();
  }
}

seedDemoUsers().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Demo account seeding failed.");
  process.exitCode = 1;
});
