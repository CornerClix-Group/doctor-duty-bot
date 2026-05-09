import { describe, expect, it } from "vitest";
import { HardScheduler } from "../src/lib/HardScheduler.ts";
import {
  checkPlacement,
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

describe("checkPlacement (generation-time hard rules)", () => {
  const dates = ["2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07", "2026-05-08"];
  const ctx = (mode: 6 | 7 | 8) => ({
    dayMode: () => mode,
    mondayFtRuleActive: false,
  });

  it("refuses D1 for night_only profile", () => {
    const schedule: Record<string, Record<string, string | null>> = {};
    dates.forEach((d) => { schedule[d] = {}; });
    const v = checkPlacement(
      schedule,
      "Coffin",
      { night_only: true, night_block_min_length: 3, night_block_max_length: 4 },
      "2026-05-06",
      "D1",
      dates,
      ctx(7),
    );
    expect(v).not.toBeNull();
    expect(v?.type).toBe("eligibility");
  });

  it("refuses 5p on mode-7 day for evening_only (5p requires mode 8)", () => {
    const schedule: Record<string, Record<string, string | null>> = {};
    dates.forEach((d) => { schedule[d] = {}; });
    const v = checkPlacement(
      schedule,
      "Ven",
      { evening_only: true },
      "2026-05-06",
      "5p",
      dates,
      ctx(7),
    );
    expect(v?.type).toBe("eligibility");
  });

  it("allows 5p on mode-8 for evening_only", () => {
    const schedule: Record<string, Record<string, string | null>> = {};
    dates.forEach((d) => { schedule[d] = {}; });
    const v = checkPlacement(
      schedule,
      "Ven",
      { evening_only: true },
      "2026-05-06",
      "5p",
      dates,
      ctx(8),
    );
    expect(v).toBeNull();
  });

  it("refuses fifth consecutive clinical day", () => {
    const schedule: Record<string, Record<string, string | null>> = {
      "2026-05-04": { Alice: "D1" },
      "2026-05-05": { Alice: "D2" },
      "2026-05-06": { Alice: "MIDA" },
      "2026-05-07": { Alice: "MIDB" },
    };
    const d = ["2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07", "2026-05-08"];
    d.forEach((x) => { schedule[x] = schedule[x] || {}; });
    const v = checkPlacement(schedule, "Alice", {}, "2026-05-08", "E", d, ctx(7));
    expect(v?.type).toBe("max_consecutive_clinical");
  });

  it("refuses circadian backward start on consecutive clinical days", () => {
    const schedule: Record<string, Record<string, string | null>> = {
      "2026-05-06": { Alice: "E" },
    };
    const d = ["2026-05-06", "2026-05-07"];
    schedule["2026-05-07"] = {};
    const v = checkPlacement(schedule, "Alice", {}, "2026-05-07", "D1", d, ctx(7));
    expect(v?.type).toBe("circadian_ratchet");
  });

  it("allows backward start after an off day between clinical shifts", () => {
    const schedule: Record<string, Record<string, string | null>> = {
      "2026-05-06": { Alice: "E" },
      "2026-05-07": { Alice: "OFF" },
    };
    const d = ["2026-05-06", "2026-05-07", "2026-05-08"];
    schedule["2026-05-08"] = {};
    const v = checkPlacement(schedule, "Alice", {}, "2026-05-08", "D1", d, ctx(7));
    expect(v).toBeNull();
  });

  it("refuses 13th night when monthly_max_nights is 12", () => {
    const schedule: Record<string, Record<string, string | null>> = {};
    const month = Array.from({ length: 28 }, (_, i) => {
      const day = String(i + 1).padStart(2, "0");
      return `2026-05-${day}`;
    });
    month.forEach((dt) => { schedule[dt] = {}; });
    for (let i = 0; i < 12; i++) {
      schedule[month[i * 2]]["Ndoc"] = "N";
    }
    const v = checkPlacement(
      schedule,
      "Ndoc",
      {
        night_only: true,
        night_block_min_length: 1,
        night_block_max_length: 10,
        monthly_max_nights: 12,
        nights_clean_days_after_block: 0,
      },
      month[24],
      "N",
      month,
      ctx(7),
    );
    expect(v?.type).toBe("monthly_max_nights");
  });
});

describe("HardScheduler monthSolve smoke", () => {
  it("fills mode-6 days with six flexible providers", () => {
    const dates = Array.from({ length: 5 }, (_, i) => {
      const day = String(i + 1).padStart(2, "0");
      return `2026-06-${day}`;
    });
    const names = ["P1", "P2", "P3", "P4", "P5", "P6"];
    const sch = new HardScheduler();
    sch.setMondayFtRuleActive(false);
    // Mixed-case keys: setProviderRuleProfiles normalizes to lowercase for lookup.
    sch.setProviderRuleProfiles(
      Object.fromEntries(names.map((n, i) => [i % 2 === 0 ? n : n.toLowerCase(), {}])) as Record<
        string,
        object
      >,
    );
    sch.loadProviders(names.map((name) => ({ name, active: true })));
    sch.setProviderDays(
      names.map((name) => ({
        name,
        target_shifts: 20,
        weekend_quota: 0,
        night_quota: 0,
        days: dates.map((date) => ({ date })),
      })),
    );
    const cov: Record<string, number> = {};
    dates.forEach((d) => { cov[d] = 6; });
    sch.setCoveragePattern(cov);
    const out = sch.solve();
    expect(out.success).toBe(true);
    expect(out.schedule).not.toBeNull();
    const day1 = out.schedule!.find((x) => x.date === "2026-06-01");
    expect(day1?.assignments.filter((a) => a.provider).length).toBe(6);
  });
});
