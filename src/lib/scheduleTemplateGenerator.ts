import * as XLSX from "xlsx";

const FED_PP_START: Record<number, { month: number; day: number }> = {
  // OPM leave year = first full biweekly PP start
  // 2024–2030 pulled from OPM leave year fact sheet
  2024: { month: 0, day: 14 }, // Jan 14, 2024
  2025: { month: 0, day: 12 }, // Jan 12, 2025
  2026: { month: 0, day: 11 }, // Jan 11, 2026
  2027: { month: 0, day: 10 }, // Jan 10, 2027
  2028: { month: 0, day: 9 },  // Jan 9, 2028
  2029: { month: 0, day: 7 },  // Jan 7, 2029
  2030: { month: 0, day: 6 },  // Jan 6, 2030
};

function getFederalPayPeriod(date: Date): number {
  const year = date.getFullYear();
  const def = FED_PP_START[year];

  const msDay = 1000 * 60 * 60 * 24;

  if (!def) {
    // Fallback: naive 26 x 14-day periods starting Jan 1
    const start = new Date(year, 0, 1);
    const diffDays = Math.floor((date.getTime() - start.getTime()) / msDay);
    const ppIndex = Math.floor(diffDays / 14);
    return ((ppIndex % 26) + 1);
  }

  const start = new Date(year, def.month, def.day);
  let diffDays = Math.floor((date.getTime() - start.getTime()) / msDay);

  if (diffDays < 0) {
    // Dates before the first PP of the year: treat as PP 26 of prior year
    return 26;
  }

  const ppIndex = Math.floor(diffDays / 14);
  return ((ppIndex % 26) + 1);
}

/**
 * Generate a schedule template workbook for a given month/year.
 * Month index is 0-based (0 = January, 11 = December).
 */
export function generateScheduleTemplate(
  monthIndex: number,
  year: number,
  providerNames: string[]
): XLSX.WorkBook {
  const monthName = new Date(year, monthIndex, 1).toLocaleString("default", {
    month: "long",
  });

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const data: any[][] = [];

  // -----------------------------
  // Row 1: Month + PP headers
  // A1 = "January 2026"
  // B1 = "" (blank)
  // C1.. = PP#
  // -----------------------------
  const row1: any[] = [`${monthName} ${year}`, ""];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, monthIndex, d);
    const ppNum = getFederalPayPeriod(date);
    row1.push(`PP${ppNum}`);
  }
  row1.push(""); // trailing padding
  data.push(row1);

  // -----------------------------
  // Row 2: Pattern
  // A2 = "Pattern"
  // B2 = "" (blank)
  // C2.. = 7 (default) or edited later
  // -----------------------------
  const row2: any[] = ["Pattern", ""];
  for (let d = 1; d <= daysInMonth; d++) {
    row2.push(7);
  }
  row2.push("");
  data.push(row2);

  // -----------------------------
  // Row 3: Day-of-week
  // A3 = "Day"
  // B3 = "" (blank)
  // C3.. = Su/Mo/Tu...
  // -----------------------------
  const row3: any[] = ["Day", ""];
  const dayAbbr = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, monthIndex, d).getDay();
    row3.push(dayAbbr[dow]);
  }
  row3.push("");
  data.push(row3);

  // -----------------------------
  // Row 4: Date numbers
  // A4 = "Date"
  // B4 = "" (blank)
  // C4.. = 1..days
  // -----------------------------
  const row4: any[] = ["Date", ""];
  for (let d = 1; d <= daysInMonth; d++) {
    row4.push(d);
  }
  row4.push("");
  data.push(row4);

  // -----------------------------
  // Provider rows
  // A = name
  // B = weekend_quota (0 default)
  // C.. = blank per day
  // last col = target_shifts
  // -----------------------------
  providerNames.forEach((name) => {
    const row: any[] = [];
    row.push(name);   // A
    row.push(0);      // B weekend_quota (editable)

    for (let d = 1; d <= daysInMonth; d++) {
      row.push("");   // C..(C+days-1)
    }

    row.push(0);      // last col (target_shifts), editable
    data.push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Schedule");

  return wb;
}
