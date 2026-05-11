import { describe, expect, it } from "vitest";
import { HardScheduler } from "../src/lib/HardScheduler.ts";
import { solve, type ProviderRules } from "../supabase/functions/generate-schedule-v2/solver.ts";
import type { ParsedSchedule, ParsedProvider } from "../supabase/functions/generate-schedule-v2/scheduleParser.ts";
import type { ProviderRuleProfile, ScheduleViolation } from "../supabase/functions/_shared/schedulerHardRules.ts";

function buildJune2026Dates(): string[] {
  const out: string[] = [];
  for (let day = 1; day <= 30; day++) {
    out.push(`2026-06-${String(day).padStart(2, "0")}`);
  }
  return out;
}

function buildProviders(dates: string[]): ParsedProvider[] {
  const names = [
    "Coffin",
    "Venugopal",
    "Ryals",
    "Sellars-Pompey",
    "Campo-Ford",
    "Lopez",
    "Orlando",
    "Beckman",
    "Arnett",
    "Beach",
    "Akers",
    "Beres",
    "Illston",
    "Freeman",
    "Ferguson",
    "Jones",
    "Miller",
    "Kim",
    "Davis",
    "Clark",
    "Taylor",
  ];

  return names.map((name) => ({
    name,
    weekend_quota: 3,
    night_quota: name === "Coffin" ? 12 : 1,
    target_shifts: 10,
    active: true,
    days: dates.map((date) => ({
      date,
      rawValue: "",
      locked: false,
      assigned: null,
      offCode: null,
      constraint: null,
      offAllowedByConstraint: true,
    })),
  }));
}

function buildParsedFixture(): ParsedSchedule {
  const dates = buildJune2026Dates();
  const providers = buildProviders(dates);
  const days = dates.map((date, idx) => {
    const dayOfWeek = new Date(`${date}T12:00:00`).getDay();
    return {
      date,
      dayOfMonth: idx + 1,
      dayOfWeek,
      coverage: 7,
      mode: 7 as const,
      ppLabel: undefined,
    };
  });
  const coverage_pattern = Object.fromEntries(dates.map((d) => [d, 7]));
  return {
    month: "June",
    monthIndex: 5,
    year: 2026,
    daysInMonth: 30,
    base_coverage_value: 7,
    monday_ft_rule_active: false,
    coverage_pattern,
    days,
    providers,
  };
}

function buildRulesByName(parsed: ParsedSchedule): Map<string, ProviderRules> {
  const map = new Map<string, ProviderRules>();
  for (const p of parsed.providers) {
    map.set(p.name.toLowerCase(), {
      name: p.name,
      active: true,
      target: p.target_shifts,
      weekend_quota: p.weekend_quota,
      allowed_shifts: null,
      disallowed_shifts: [],
      sat_disallowed_shifts: [],
      sun_allowed_shifts: null,
      avoid_sunday: false,
      sat_no_start_after_hour: null,
      sun_no_start_before_hour: null,
      recovery_days: 2,
      block_min: null,
      block_max: null,
      max_consec: null,
      max_consec_n: null,
      max_consec_e: null,
      recovery_after_e: null,
      rest_hours: 12,
      is_specialist_n: false,
      is_specialist_e: false,
      is_specialist_ft: false,
    });
  }
  return map;
}

function buildProfiles(): Record<string, ProviderRuleProfile> {
  return {
    coffin: {
      night_only: true,
      monthly_max_nights: 12,
      night_block_min_length: 3,
      night_block_max_length: 4,
      nights_clean_days_after_block: 3,
      requires_80hr_pp: true,
    },
    venugopal: {
      evening_only: true,
      requires_80hr_pp: true,
    },
    ryals: {
      ft_or_mida_only: true,
      requires_80hr_pp: true,
    },
    "sellars-pompey": {
      ft_or_mida_only: true,
      requires_80hr_pp: true,
    },
    "campo-ford": {
      ft_or_mida_only: true,
      requires_80hr_pp: true,
    },
    miller: {
      provider_group: "military",
      requires_80hr_pp: false,
    },
    kim: {
      provider_group: "military",
      requires_80hr_pp: false,
    },
  };
}

function sortViolations(v: ScheduleViolation[]): ScheduleViolation[] {
  return [...v].sort((a, b) =>
    `${a.date ?? ""}|${a.provider ?? ""}|${a.type}|${a.shift ?? ""}`.localeCompare(
      `${b.date ?? ""}|${b.provider ?? ""}|${b.type}|${b.shift ?? ""}`,
    ));
}

describe("scheduler parity (HardScheduler vs edge solver)", () => {
  it("produces identical schedule result for shared fixture", () => {
    const parsed = buildParsedFixture();
    const rulesByName = buildRulesByName(parsed);
    const profiles = buildProfiles();

    const hard = new HardScheduler();
    hard.setMondayFtRuleActive(parsed.monday_ft_rule_active);
    hard.setProviderRuleProfiles(profiles);
    hard.loadProviders(parsed.providers.map((p) => ({
      name: p.name,
      active: p.active,
      allowed_shifts: rulesByName.get(p.name.toLowerCase())?.allowed_shifts ?? [],
      rules: rulesByName.get(p.name.toLowerCase()),
    })));
    hard.setProviderDays(parsed.providers.map((p) => ({
      name: p.name,
      target_shifts: p.target_shifts,
      weekend_quota: p.weekend_quota,
      night_quota: p.night_quota,
      days: p.days.map((d) => ({
        date: d.date,
        assigned: d.offCode ? "OFF" : d.assigned,
        locked: d.locked,
        offCode: d.offCode,
        constraint: d.constraint,
      })),
    })));
    hard.setCoveragePattern(parsed.coverage_pattern);
    const hardResult = hard.solve();
    const hardSchedule = hardResult.schedule ?? hard.toGeneratedSchedule();

    const edgeResult = solve(parsed, rulesByName, [], profiles);

    expect(edgeResult.success).toBe(hardResult.success);
    expect(sortViolations(edgeResult.violations)).toEqual(sortViolations(hardResult.violations));
    expect(edgeResult.schedule).toEqual(hardSchedule);
    expect(edgeResult.softScores).toEqual(hardResult.softScores);
  });
});
