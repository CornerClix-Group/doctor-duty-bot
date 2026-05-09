// Edge entry: same canonical implementation as the Vite client.
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { parseScheduleWorkbook } from "../_shared/scheduleParserCore.ts";

export type {
  DayMode,
  ParsedDay,
  ParsedProvider,
  ParsedProviderDay,
  ParsedSchedule,
  ShiftCode,
} from "../_shared/scheduleParserCore.ts";

export function parseSchedule(workbook: XLSX.WorkBook) {
  return parseScheduleWorkbook(workbook, XLSX);
}
