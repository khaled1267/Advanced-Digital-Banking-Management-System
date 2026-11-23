import assert from "node:assert/strict";
import test from "node:test";
import { parseAnalyticsRange } from "../src/lib/analytics-range";

const now = new Date("2026-11-23T12:30:00.000Z");

test("preset analytics ranges use UTC calendar boundaries", () => {
  const result = parseAnalyticsRange(new URLSearchParams("range=7d"), now);
  assert.ok(result);
  assert.equal(result.start.toISOString(), "2026-11-17T00:00:00.000Z");
  assert.equal(result.end.toISOString(), "2026-11-24T00:00:00.000Z");
});

test("custom ranges include the end date and stay within one year", () => {
  const valid = parseAnalyticsRange(new URLSearchParams("range=custom&startDate=2026-10-01&endDate=2026-10-31"), now);
  assert.ok(valid);
  assert.equal(valid.start.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(valid.end.toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(parseAnalyticsRange(new URLSearchParams("range=custom&startDate=2025-11-22&endDate=2026-11-22"), now), null);
});

test("invalid, reversed, and future custom dates are rejected", () => {
  assert.equal(parseAnalyticsRange(new URLSearchParams("range=custom&startDate=2026-02-30&endDate=2026-03-01"), now), null);
  assert.equal(parseAnalyticsRange(new URLSearchParams("range=custom&startDate=2026-11-10&endDate=2026-11-01"), now), null);
  assert.equal(parseAnalyticsRange(new URLSearchParams("range=custom&startDate=2026-11-23&endDate=2026-11-24"), now), null);
});
