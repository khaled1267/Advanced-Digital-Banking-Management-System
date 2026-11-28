import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeDemoSeedEnvironment, DEMO_DATABASE, DEMO_SEED_CONFIRMATION } from "../src/lib/demo-seed";

const safeEnvironment = {
  NODE_ENV: "development",
  MONGODB_DATABASE: DEMO_DATABASE,
  DEMO_SEED_CONFIRMATION,
  MONGODB_DEMO_URI: "mongodb://demo.invalid",
};

test("demo seed requires the explicit demo database, URI, and confirmation", () => {
  assert.doesNotThrow(() => assertSafeDemoSeedEnvironment(safeEnvironment));
  assert.throws(() => assertSafeDemoSeedEnvironment({ ...safeEnvironment, MONGODB_DATABASE: "banking_management" }));
  assert.throws(() => assertSafeDemoSeedEnvironment({ ...safeEnvironment, MONGODB_DEMO_URI: undefined }));
  assert.throws(() => assertSafeDemoSeedEnvironment({ ...safeEnvironment, DEMO_SEED_CONFIRMATION: undefined }));
});

test("demo seed refuses production mode", () => {
  assert.throws(() => assertSafeDemoSeedEnvironment({ ...safeEnvironment, NODE_ENV: "production" }), /disabled/);
});
