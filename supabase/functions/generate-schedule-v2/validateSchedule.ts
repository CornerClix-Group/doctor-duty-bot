// Pre-solve validation — checks input file before scheduling.
// Produces non-blocking errors/warnings/info; solver runs regardless.

import type { ParsedSchedule } from "./scheduleParser.ts";
import type { ProviderRules, ValidationIssue } from "./solver.ts";
import { requiredShiftsForDay } from "./shifts.ts";

export function validateInputs(
  parsed: ParsedSchedule,
  rulesByName: Map<string, ProviderRules>,
): { errors: ValidationIssue[]; warnings: ValidationIssue[]; info: ValidationIssue[] } {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const info: ValidationIssue[] = [];

  // Check provider profiles
  for (const p of parsed.providers) {
    const r = rulesByName.get(p.name.toLowerCase());
    if (!r) {
      warnings.push({
        rule: 3, severity: "warning", provider: p.name,
        message: `Provider "${p.name}" not found in database — using defaults.`,
      });
    }
    if (!p.active) {
      info.push({
        rule: 1, severity: "info", provider: p.name,
        message: `${p.name} is inactive this month (target blank or DP/TL).`,
      });
    }
  }

  // Coverage demand vs target sum
  let demand = 0;
  for (const d of parsed.days) {
    demand += requiredShiftsForDay(d.mode, d.dayOfWeek, parsed.monday_ft_rule_active).length;
  }
  const targetSum = parsed.providers
    .filter(p => p.active)
    .reduce((s, p) => s + p.target_shifts, 0);
  if (targetSum !== demand) {
    info.push({
      rule: 1, severity: "info",
      message: `Sum of provider targets (${targetSum}) ≠ coverage demand (${demand}). Adjustment proposals will surface.`,
      suggestion: "Adjust targets in Build tab before solving.",
    });
  }

  return { errors, warnings, info };
}