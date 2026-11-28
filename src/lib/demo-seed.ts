export const DEMO_DATABASE = "banking_management_demo";
export const DEMO_SEED_CONFIRMATION = "CREATE_NORTHSTAR_DEMO_ACCOUNTS";

type DemoSeedEnvironment = {
  NODE_ENV?: string;
  MONGODB_DATABASE?: string;
  DEMO_SEED_CONFIRMATION?: string;
  MONGODB_DEMO_URI?: string;
};

export function assertSafeDemoSeedEnvironment(env: DemoSeedEnvironment) {
  if (env.NODE_ENV === "production") {
    throw new Error("Demo seeding is disabled when NODE_ENV is production.");
  }

  if (env.MONGODB_DATABASE !== DEMO_DATABASE) {
    throw new Error(`Set MONGODB_DATABASE exactly to ${DEMO_DATABASE} to seed demo accounts.`);
  }

  if (env.DEMO_SEED_CONFIRMATION !== DEMO_SEED_CONFIRMATION) {
    throw new Error(`Set DEMO_SEED_CONFIRMATION=${DEMO_SEED_CONFIRMATION} to confirm the demo seed.`);
  }

  if (!env.MONGODB_DEMO_URI) {
    throw new Error("Set MONGODB_DEMO_URI to the MongoDB deployment reserved for demo data.");
  }
}
