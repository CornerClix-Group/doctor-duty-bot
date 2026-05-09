// Client entry: canonical parse in _shared, legacy shape for UI / HardScheduler.
import * as XLSX from "xlsx";
import {
  parseScheduleWorkbook,
  toClientLegacySchedule,
} from "../../supabase/functions/_shared/scheduleParserCore.ts";

export const SHIFT_CODES = new Set([
  "D1", "D2",
  "MIDA", "MIDB",
  "E", "N",
  "FT AM", "FT PM", "FT W",
  "C", "A10",
]);

export const OFF_CODES = new Set(["X", "L", "LH"]);

export function parseSchedule(workbook: XLSX.WorkBook) {
  const canonical = parseScheduleWorkbook(workbook, XLSX);
  return toClientLegacySchedule(canonical);
}
