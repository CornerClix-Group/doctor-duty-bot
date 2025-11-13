// ============================================================================
// validateSchedule.ts — FULL HARD-MODE VALIDATION ENGINE
// ============================================================================

import { SHIFT_CODES, OFF_CODES } from "./scheduleParser.ts";

// Allowed constraint tokens
const CONSTRAINT_TOKENS = new Set([
  "1","2","5","10","10p","am","pm","w","wk","ftw","x"
]);

// ============================================================================
// MAIN VALIDATION ENTRY POINT
// ============================================================================
export function validateSchedule(parsed: any, mergedProviders: any[]) {
  const errors: string[] = [];
  const warnings: string[] = [];

  const {
    month,
    year,
    providers: providerDays,
    coverage_pattern
  } = parsed;

  // ---------------------------------------------------
  // VALIDATE PROVIDER NAME MATCHES
  // ---------------------------------------------------
  const dbNames = new Set(
    mergedProviders.map(p => p.name.trim().toLowerCase())
  );

  for (let p of providerDays) {
    const name = p.name?.trim().toLowerCase();

    if (!name) {
      errors.push("Template contains a blank provider name row.");
      continue;
    }

    if (!dbNames.has(name)) {
      errors.push(`Provider '${p.name}' does not match any provider in the system.`);
    }
  }

  if (errors.length) return { valid: false, errors, warnings };

  // ---------------------------------------------------
  // MAP PROVIDERS FOR FAST LOOKUP
  // ---------------------------------------------------
  const providerMap: Record<string, any> = {};
  for (let p of mergedProviders) {
    providerMap[p.name.trim().toLowerCase()] = p;
  }

  // ---------------------------------------------------
  // VALIDATE EACH PROVIDER DAY CELL
  // ---------------------------------------------------
  for (let prov of providerDays) {
    const nameKey = prov.name.trim().toLowerCase();
    const ruleSet = providerMap[nameKey];

    for (let d of prov.days) {
      const raw = d.value;
      const date = d.date;

      // Skip blank (allowed)
      if (!raw) continue;

      // OFF block?
      if (OFF_CODES.has(raw)) continue;

      // Preassigned shift?
      if (SHIFT_CODES.has(raw)) {
        // extra: ensure provider is allowed this day under hard rules
        validatePreassignedShift(nameKey, raw, date, ruleSet, errors);
        continue;
      }

      // Constraint code?
      if (raw.includes("/") || CONSTRAINT_TOKENS.has(raw.toLowerCase())) {
        validateConstraintCode(raw, prov.name, date, errors);
        continue;
      }

      // If none matched → invalid token
      errors.push(
        `Invalid entry '${raw}' for provider '${prov.name}' on ${date}.`
      );
    }
  }

  if (errors.length) return { valid: false, errors, warnings };

  // ---------------------------------------------------
  // VALIDATE COVERAGE CAPACITY
  // ---------------------------------------------------
  for (let prov of providerDays) {
    // Check OFF blocks only here
  }

  for (let date in coverage_pattern) {
    const needed = coverage_pattern[date];

    // Do we have enough candidates in general?
    let availableCount = 0;

    for (let prov of providerDays) {
      const day = prov.days.find((d: any) => d.date === date);
      if (!day) continue;

      // Off blocks reduce availability
      if (day.assigned === "OFF") continue;

      // Preassigned shift counts as coverage
      if (day.assigned) {
        availableCount += 1;
        continue;
      }

      // Constraint code means provider is available (Option 2)
      if (day.constraint) {
        availableCount += 1;
        continue;
      }

      // Blank → use provider full rules
      availableCount += 1;
    }

    if (availableCount < needed) {
      errors.push(
        `Coverage conflict on ${date}: Need ${needed}, but only ${availableCount} providers can work.`
      );
    }
  }

  if (errors.length) return { valid: false, errors, warnings };

  // ---------------------------------------------------
  // RETURN HARD-MODE RESULTS
  // ---------------------------------------------------
  return {
    valid: true,
    errors: [],
    warnings
  };
}

// ============================================================================
// VALIDATE CONSTRAINT CODE
// ============================================================================

function validateConstraintCode(raw: string, providerName: string, date: string, errors: string[]) {
  const parts = raw.toLowerCase().split("/");

  for (let part of parts) {
    // strip trailing x
    part = part.replace(/x$/, "").trim();

    if (!CONSTRAINT_TOKENS.has(part)) {
      errors.push(
        `Invalid constraint code '${raw}' for provider '${providerName}' on ${date} — token '${part}' not recognized.`
      );
    }
  }
}

// ============================================================================
// VALIDATE PREASSIGNED SHIFT
// ============================================================================

function validatePreassignedShift(
  providerKey: string,
  shift: string,
  date: string,
  rules: any,
  errors: string[]
) {
  const disallowed = rules?.rules?.disallowed_shifts || [];

  if (disallowed.includes(shift)) {
    errors.push(
      `Provider '${providerKey}' is preassigned '${shift}' on ${date}, but this shift is disallowed in their profile.`
    );
  }

  // Weekend restrictions
  const dow = new Date(date).getDay(); // 0=Sun,6=Sat

  if (dow === 6 && rules.rules?.saturday_restrictions) {
    const set = rules.rules.saturday_restrictions.split(",").map((s: string) => s.trim());
    if (!set.includes(shift) && !set.includes("all")) {
      errors.push(
        `Provider '${providerKey}' violates Saturday restrictions with shift '${shift}' on ${date}.`
      );
    }
  }

  if (dow === 0 && rules.rules?.sunday_restrictions) {
    const set = rules.rules.sunday_restrictions.split(",").map((s: string) => s.trim());
    if (!set.includes(shift) && !set.includes("all")) {
      errors.push(
        `Provider '${providerKey}' violates Sunday restrictions with shift '${shift}' on ${date}.`
      );
    }
  }
}
