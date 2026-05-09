import { describe, expect, it } from "vitest";
import {
  eligibleShiftCodesForProfile,
  isNightShiftToken,
  isShiftEligibleForProfile,
  maxClinicalInRolling7,
  maxConsecutiveClinicalDays,
} from "../supabase/functions/_shared/schedulerHardRules.ts";

describe("schedulerHardRules (data-driven eligibility)", () => {
  it("night_only allows only night-family + admin + call", () => {
    const s = eligibleShiftCodesForProfile({ night_only: true });
    expect(s.has("N")).toBe(true);
    expect(s.has("10p")).toBe(true);
    expect(s.has("D1")).toBe(false);
  });

  it("evening_only allows E / 16 / 5p + admin + call", () => {
    expect(isShiftEligibleForProfile({ evening_only: true }, "5p")).toBe(true);
    expect(isShiftEligibleForProfile({ evening_only: true }, "N")).toBe(false);
  });

  it("ft_or_mida_only allows FT family and MIDA / 11 / 11a", () => {
    expect(isShiftEligibleForProfile({ ft_or_mida_only: true }, "FT AM")).toBe(true);
    expect(isShiftEligibleForProfile({ ft_or_mida_only: true }, "11a")).toBe(true);
    expect(isShiftEligibleForProfile({ ft_or_mida_only: true }, "N")).toBe(false);
  });

  it("detects night tokens including 10p", () => {
    expect(isNightShiftToken("N")).toBe(true);
    expect(isNightShiftToken("10p")).toBe(true);
    expect(isNightShiftToken("D1")).toBe(false);
  });
});

describe("clinical streak metrics", () => {
  const sched: Record<string, Record<string, string | null>> = {
    "2026-05-01": { Alice: "D1" },
    "2026-05-02": { Alice: "D2" },
    "2026-05-03": { Alice: "MIDA" },
    "2026-05-04": { Alice: "MIDB" },
    "2026-05-05": { Alice: "E" },
    "2026-05-06": { Alice: "A10" },
    "2026-05-07": { Alice: "D1" },
  };
  const dates = Object.keys(sched).sort();

  it("max consecutive clinical respects admin break", () => {
    expect(maxConsecutiveClinicalDays(sched, "Alice", dates)).toBe(5);
  });

  it("rolling 7-day clinical cap detects 5 clinical days in window", () => {
    const s2: Record<string, Record<string, string | null>> = {
      "2026-05-01": { Bob: "D1" },
      "2026-05-02": { Bob: "D2" },
      "2026-05-03": { Bob: "MIDA" },
      "2026-05-04": { Bob: "MIDB" },
      "2026-05-05": { Bob: "E" },
      "2026-05-06": { Bob: "N" },
      "2026-05-07": { Bob: "A10" },
    };
    const d2 = Object.keys(s2).sort();
    expect(maxClinicalInRolling7(s2, "Bob", d2)).toBeGreaterThan(4);
  });
});
