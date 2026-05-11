import { existsSync } from "fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { solve, type ProviderRules } from "../supabase/functions/generate-schedule-v2/solver.ts";
import { maxClinicalInRolling7, maxConsecutiveClinicalDays, type ProviderRuleProfile } from "../supabase/functions/_shared/schedulerHardRules.ts";
import { parseScheduleWorkbook } from "../supabase/functions/_shared/scheduleParserCore.ts";

const MAY = "tests/fixtures/may-2026-production.xlsx";
const JUNE = "tests/fixtures/june-2026-production.xlsx";

function parseFixtureWorkbook(path: string) {
  const wb = XLSX.readFile(path);
  return parseScheduleWorkbook(wb as any, XLSX as any);
}

function buildRules(parsed: ReturnType<typeof parseFixtureWorkbook>): Map<string, ProviderRules> {
  const map = new Map<string, ProviderRules>();
  for (const p of parsed.providers) {
    map.set(p.name.toLowerCase(), {
      name: p.name,
      active: p.active,
      target: p.target_shifts,
      weekend_quota: p.weekend_quota,
      allowed_shifts: null,
      disallowed_shifts: [],
      sat_disallowed_shifts: [],
      sun_allowed_shifts: null,
      avoid_sunday: p.name.toLowerCase().includes("beach"),
      sat_no_start_after_hour: p.name.toLowerCase().includes("arnett") ? 15 : null,
      sun_no_start_before_hour: p.name.toLowerCase().includes("arnett") ? 14 : null,
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

function buildProfiles(parsed: ReturnType<typeof parseFixtureWorkbook>): Record<string, ProviderRuleProfile> {
  const out: Record<string, ProviderRuleProfile> = {};
  for (const p of parsed.providers) {
    out[p.name.toLowerCase()] = { requires_80hr_pp: true };
  }
  out.coffin = {
    night_only: true,
    monthly_max_nights: 12,
    night_block_min_length: 3,
    night_block_max_length: 4,
    nights_clean_days_after_block: 3,
    requires_80hr_pp: true,
  };
  out.venugopal = { evening_only: true, requires_80hr_pp: true };
  out.ryals = { ft_or_mida_only: true, requires_80hr_pp: true };
  out["sellars-pompey"] = { ft_or_mida_only: true, requires_80hr_pp: true };
  out["campo-ford"] = { ft_or_mida_only: true, requires_80hr_pp: true };
  // Treat likely military providers as exempt.
  for (const key of Object.keys(out)) {
    if (key.includes("mil") || key.includes("army") || key.includes("navy")) {
      out[key] = { ...out[key], provider_group: "military", requires_80hr_pp: false };
    }
  }
  return out;
}

function readFixture(path: string) {
  const parsed = parseFixtureWorkbook(path);
  const result = solve(parsed, buildRules(parsed), [], buildProfiles(parsed));
  return { parsed, result };
}

function scheduleByProvider(result: ReturnType<typeof solve>) {
  const out: Record<string, Record<string, string>> = {};
  for (const day of result.schedule) {
    for (const a of day.assignments) {
      if (!a.provider) continue;
      out[a.provider] = out[a.provider] || {};
      out[a.provider][day.date] = a.shift;
    }
  }
  return out;
}

function assertNightBlocks(shiftsByDate: Record<string, string>) {
  const dates = Object.keys(shiftsByDate).sort();
  const nightDates = dates.filter((d) => ["N", "10p", "21"].includes(shiftsByDate[d]));
  expect(nightDates.length).toBe(12);
  let i = 0;
  let prevBlockEnd: Date | null = null;
  while (i < nightDates.length) {
    let j = i + 1;
    while (j < nightDates.length) {
      const prev = new Date(`${nightDates[j - 1]}T12:00:00`).getTime();
      const cur = new Date(`${nightDates[j]}T12:00:00`).getTime();
      if ((cur - prev) / 86400000 !== 1) break;
      j++;
    }
    const block = nightDates.slice(i, j);
    expect(block.length).toBeGreaterThanOrEqual(3);
    expect(block.length).toBeLessThanOrEqual(4);
    if (prevBlockEnd) {
      const gap = (new Date(`${block[0]}T12:00:00`).getTime() - prevBlockEnd.getTime()) / 86400000 - 1;
      expect(gap).toBeGreaterThanOrEqual(3);
    }
    prevBlockEnd = new Date(`${block[block.length - 1]}T12:00:00`);
    i = j;
  }
}

function runAssertions(path: string) {
  const { result } = readFixture(path);
  const byProvider = scheduleByProvider(result);
  const allDates = result.schedule.map((d) => d.date).sort();

  expect(result.success).toBe(true);
  expect(result.violations.length).toBe(0);

  const coffin = byProvider.Coffin || byProvider.coffin;
  expect(coffin).toBeTruthy();
  assertNightBlocks(coffin!);

  const ven = byProvider.Venugopal || byProvider.venugopal;
  expect(ven).toBeTruthy();
  const eveningAllowed = new Set(["E", "16", "5p", "C", "A10", "OFF"]);
  for (const shift of Object.values(ven!)) {
    expect(eveningAllowed.has(shift)).toBe(true);
  }

  const ftOnly = ["Ryals", "Sellars-Pompey", "Campo-Ford"];
  const ftAllowed = new Set(["FT", "FT W", "FT W12", "FT AM", "FT PM", "FT 7a", "FT 2p", "FT 9", "FT W9", "MIDA", "11", "11a", "C", "A10", "OFF"]);
  for (const name of ftOnly) {
    const shifts = byProvider[name] || byProvider[name.toLowerCase()];
    if (!shifts) continue;
    for (const shift of Object.values(shifts)) {
      expect(ftAllowed.has(shift)).toBe(true);
    }
  }

  for (const [providerName, pp] of Object.entries(result.pp_hours)) {
    const lower = providerName.toLowerCase();
    const isMilitary = lower.includes("mil") || lower.includes("army") || lower.includes("navy");
    if (isMilitary) continue;
    for (const hours of Object.values(pp)) {
      expect(hours).toBe(80);
    }
  }

  const scheduleMap: Record<string, Record<string, string | null>> = {};
  for (const d of allDates) scheduleMap[d] = {};
  for (const [provider, shifts] of Object.entries(byProvider)) {
    for (const [date, shift] of Object.entries(shifts)) {
      scheduleMap[date][provider] = shift;
    }
  }
  for (const providerName of Object.keys(byProvider)) {
    expect(maxConsecutiveClinicalDays(scheduleMap, providerName, allDates)).toBeLessThanOrEqual(4);
    expect(maxClinicalInRolling7(scheduleMap, providerName, allDates)).toBeLessThanOrEqual(4);
  }

  for (const day of result.schedule) {
    for (const req of day.required) {
      const filled = day.assignments.some((a) => a.shift === req && !!a.provider);
      expect(filled).toBe(true);
    }
  }
}

describe("scheduler e2e (production fixtures)", () => {
  it.skipIf(!existsSync(MAY))(`May 2026 fixture regression (${MAY})`, () => {
    runAssertions(MAY);
  });

  it.skipIf(!existsSync(JUNE))(`June 2026 fixture regression (${JUNE})`, () => {
    runAssertions(JUNE);
  });
});
