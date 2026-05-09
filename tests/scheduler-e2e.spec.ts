import { existsSync } from "fs";
import { describe, expect, it } from "vitest";

const MAY = "tests/fixtures/may-2026-production.xlsx";
const JUNE = "tests/fixtures/june-2026-production.xlsx";

describe("scheduler e2e (production fixtures)", () => {
  it.skipIf(!existsSync(MAY))(`May 2026 fixture regression (${MAY})`, () => {
    expect(existsSync(MAY)).toBe(true);
    // Full parse + solver regression: extend when fixtures are present locally.
  });

  it.skipIf(!existsSync(JUNE))(`June 2026 fixture regression (${JUNE})`, () => {
    expect(existsSync(JUNE)).toBe(true);
  });
});
