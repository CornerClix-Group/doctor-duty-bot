import * as XLSX from "xlsx";

/**
 * Generate a schedule template workbook for a given month/year.
 * @param monthIndex 0 = January, 11 = December
 * @param year four-digit year (e.g. 2026)
 * @param providerNames array of provider display names
 */
export function generateScheduleTemplate(
  monthIndex: number,
  year: number,
  providerNames: string[]
): XLSX.WorkBook {
  // Month name like "January"
  const monthName = new Date(year, monthIndex, 1).toLocaleString("default", {
    month: "long",
  });

  // Days in month
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const data: any[][] = [];

  // -----------------------------
  // Row 1: Month + PP headers
  // -----------------------------
  const row1: any[] = [`${monthName} ${year}`];
  for (let d = 1; d <= daysInMonth; d++) {
    const pp = Math.floor((d - 1) / 14) + 1; // PP1 = days 1–14, PP2 = 15–28, etc.
    row1.push(`PP${pp}`);
  }
  row1.push(""); // final column (AI)
  data.push(row1);

  // -----------------------------
  // Row 2: Pattern (default 7)
  // -----------------------------
  const row2: any[] = ["Pattern"];
  for (let d = 1; d <= daysInMonth; d++) {
    row2.push(7); // you can manually switch individual days to 8 later
  }
  row2.push("");
  data.push(row2);

  // -----------------------------
  // Row 3: Day-of-week
  // -----------------------------
  const row3: any[] = ["Day"];
  const dayAbbr = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, monthIndex, d).getDay();
    row3.push(dayAbbr[dow]);
  }
  row3.push("");
  data.push(row3);

  // -----------------------------
  // Row 4: Date numbers
  // -----------------------------
  const row4: any[] = ["Date"];
  for (let d = 1; d <= daysInMonth; d++) {
    row4.push(d);
  }
  row4.push("");
  data.push(row4);

  // -----------------------------
  // Provider rows
  // -----------------------------
  providerNames.forEach((name) => {
    const row: any[] = [];

    // Column A: Provider name
    row.push(name);

    // Column B: Weekend quota (default 0, you/your team will edit)
    row.push(0);

    // Columns C..(C + daysInMonth - 1): empty cells for daily constraints/locks
    for (let d = 1; d <= daysInMonth; d++) {
      row.push("");
    }

    // Final column (AI): Target total shifts (default 0, you/your team will edit)
    row.push(0);

    data.push(row);
  });

  // -----------------------------
  // Convert to Worksheet + Workbook
  // -----------------------------
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Schedule");

  return wb;
}
