// Client entry: canonical parse in _shared, legacy shape for UI / HardScheduler.
import * as XLSX from "xlsx";
import {
  parseScheduleWorkbook,
  toClientLegacySchedule,
} from "../../supabase/functions/_shared/scheduleParserCore.ts";
import { ALL_SHIFTS } from "../../supabase/functions/_shared/shifts.ts";

export const SHIFT_CODES = new Set<string>(ALL_SHIFTS);

export const OFF_CODES = new Set(["X", "L", "LH"]);

export function parseSchedule(workbook: XLSX.WorkBook) {
  const canonical = parseScheduleWorkbook(workbook, XLSX);
  return toClientLegacySchedule(canonical);
}
