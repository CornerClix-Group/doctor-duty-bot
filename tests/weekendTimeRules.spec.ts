// Tests for the new weekend scheduling rules:
//   1. Will Arnett weekend time windows (Sat: no start after 3 pm, Sun: no start before 2 pm)
//   2. John Beach avoid_sunday soft preference

import { describe, expect, it } from "vitest";
import {
  weekendTimeWindowAllows,
  type SchedulerProviderProfile,
} from "../supabase/functions/_shared/schedulerHardRules.ts";
import { shiftStartHour } from "../supabase/functions/_shared/shifts.ts";

// ----------------------------------------------------------------------------
// 1. weekendTimeWindowAllows — direct unit tests
// ----------------------------------------------------------------------------

describe("weekendTimeWindowAllows — Arnett-style hard rules", () => {
  const arnett: SchedulerProviderProfile = {
    sat_no_start_after_hour: 15,
    sun_no_start_before_hour: 14,
  };

  it("Saturday: shifts starting at or before 3 pm are allowed", () => {
    expect(weekendTimeWindowAllows(arnett, "D1",   6)).toBe(true);
    expect(weekendTimeWindowAllows(arnett, "D2",   6)).toBe(true);
    expect(weekendTimeWindowAllows(arnett, "MIDA", 6)).toBe(true);
    expect(weekendTimeWindowAllows(arnett, "MIDB", 6)).toBe(true);
    expect(weekendTimeWindowAllows(arnett, "3p",   6)).toBe(true);
  });

  it("Saturday: shifts starting after 3 pm are banned", () => {
    expect(weekendTimeWindowAllows(arnett, "E",   6)).toBe(false);
    expect(weekendTimeWindowAllows(arnett, "N",   6)).toBe(false);
    expect(weekendTimeWindowAllows(arnett, "5p",  6)).toBe(false);
    expect(weekendTimeWindowAllows(arnett, "10p", 6)).toBe(false);
    expect(weekendTimeWindowAllows(arnett, "16",  6)).toBe(false);
    expect(weekendTimeWindowAllows(arnett, "21",  6)).toBe(false);
  });

  it("Sunday: shifts starting at or after 2 pm are allowed", () => {
    expect(weekendTimeWindowAllows(arnett, "MIDB",  0)).toBe(true);
    expect(weekendTimeWindowAllows(arnett, "3p",    0)).toBe(true);
    expect(weekendTimeWindowAllows(arnett, "E",     0)).toBe(true);
    expect(weekendTimeWindowAllows(arnett, "5p",    0)).toBe(true);
    expect(weekendTimeWindowAllows(arnett, "N",     0)).toBe(true);
    expect(weekendTimeWindowAllows(arnett, "10p",   0)).toBe(true);
    expect(weekendTimeWindowAllows(arnett, "FT PM", 0)).toBe(true);
  });

  it("Sunday: shifts starting before 2 pm are banned", () => {
    expect(weekendTimeWindowAllows(arnett, "D1",    0)).toBe(false);
    expect(weekendTimeWindowAllows(arnett, "D2",    0)).toBe(false);
    expect(weekendTimeWindowAllows(arnett, "MIDA",  0)).toBe(false);
    expect(weekendTimeWindowAllows(arnett, "1p",    0)).toBe(false);
    expect(weekendTimeWindowAllows(arnett, "FT AM", 0)).toBe(false);
    expect(weekendTimeWindowAllows(arnett, "FT",    0)).toBe(false);
  });

  it("Weekday: time-window rules do not apply", () => {
    for (const dow of [1, 2, 3, 4, 5]) {
      expect(weekendTimeWindowAllows(arnett, "D1",  dow)).toBe(true);
      expect(weekendTimeWindowAllows(arnett, "N",   dow)).toBe(true);
      expect(weekendTimeWindowAllows(arnett, "10p", dow)).toBe(true);
    }
  });

  it("No profile or no rules set: never blocks", () => {
    expect(weekendTimeWindowAllows(undefined, "N", 6)).toBe(true);
    expect(weekendTimeWindowAllows({}, "N", 6)).toBe(true);
    expect(weekendTimeWindowAllows({ avoid_sunday: true }, "D1", 0)).toBe(true);
  });

  it("Unknown / non-canonical shift codes: not blocked", () => {
    expect(weekendTimeWindowAllows(arnett, "WAT_THE_HECK", 6)).toBe(true);
    expect(weekendTimeWindowAllows(arnett, "WAT_THE_HECK", 0)).toBe(true);
  });

  it("Saturday rule only — Sunday cap is independent", () => {
    const satOnly: SchedulerProviderProfile = { sat_no_start_after_hour: 15 };
    expect(weekendTimeWindowAllows(satOnly, "N",  6)).toBe(false);
    expect(weekendTimeWindowAllows(satOnly, "D1", 0)).toBe(true);
  });

  it("Sunday rule only — Saturday cap is independent", () => {
    const sunOnly: SchedulerProviderProfile = { sun_no_start_before_hour: 14 };
    expect(weekendTimeWindowAllows(sunOnly, "N",  6)).toBe(true);
    expect(weekendTimeWindowAllows(sunOnly, "D1", 0)).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// 2. shiftStartHour sanity checks
// ----------------------------------------------------------------------------

describe("shiftStartHour", () => {
  it("returns canonical start hours", () => {
    expect(shiftStartHour("D1")).toBe(6);
    expect(shiftStartHour("MIDB")).toBe(14);
    expect(shiftStartHour("3p")).toBe(15);
    expect(shiftStartHour("E")).toBe(16);
    expect(shiftStartHour("5p")).toBe(17);
    expect(shiftStartHour("N")).toBe(21);
    expect(shiftStartHour("10p")).toBe(22);
  });

  it("resolves aliases", () => {
    expect(shiftStartHour("6")).toBe(shiftStartHour("D1"));
    expect(shiftStartHour("16")).toBe(shiftStartHour("E"));
    expect(shiftStartHour("21")).toBe(shiftStartHour("N"));
  });

  it("returns null for unknown codes", () => {
    expect(shiftStartHour("BOGUS")).toBeNull();
    expect(shiftStartHour("")).toBeNull();
  });
});
