import * as XLSX from "xlsx";

const PP_COLORS = [
  "FFF2A8", // Yellow
  "B7D4F8", // Blue
  "D9B4F7"  // Purple
];

/**
 * Compute a PP number (PP1–PP14) given the day offset and month starting PP.
 */
function computePP(dayIndex: number, startingPP: number): number {
  return ((startingPP - 1 + dayIndex) % 14) + 1;
}

/**
 * Generate template with:
 * - PP1→PP14 cycles
 * - PP block color cycling with carryover
 */
export function generateScheduleTemplate(
  monthIndex: number,
  year: number,
  providerNames: string[],
  startingPP: number,
  startingBlockIndex: number
): XLSX.WorkBook {
  const monthName = new Date(year, monthIndex, 1).toLocaleString("default", {
    month: "long"
  });

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const data: any[][] = [];

  // ---------------- Row 1 — PP Header ----------------
  const row1 = [`${monthName} ${year}`, ""];
  const blockColors: string[] = [];

  let blockIdx = startingBlockIndex;

  for (let d = 1; d <= daysInMonth; d++) {
    const pp = computePP(d - 1, startingPP);

    // If PP resets from 14 → 1 (and not on day 1), advance block
    if (pp === 1 && d !== 1) {
      blockIdx = (blockIdx + 1) % PP_COLORS.length;
    }

    row1.push(`PP${pp}`);
    blockColors.push(PP_COLORS[blockIdx]);
  }

  row1.push("");
  data.push(row1);

  // ---------------- Row 2 — Pattern ----------------
  const row2: any[] = ["Pattern", ""];
  for (let d = 1; d <= daysInMonth; d++) row2.push(7 as any);
  row2.push("");
  data.push(row2);

  // ---------------- Row 3 — Day-of-week ----------------
  const row3: any[] = ["Day", ""];
  const dayAbbr = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, monthIndex, d).getDay();
    row3.push(dayAbbr[dow]);
  }
  row3.push("");
  data.push(row3);

  // ---------------- Row 4 — Date row ----------------
  const row4: any[] = ["Date", ""];
  for (let d = 1; d <= daysInMonth; d++) row4.push(d as any);
  row4.push("");
  data.push(row4);

  // ---------------- Provider Rows ----------------
  providerNames.forEach((name) => {
    const row = [name, 0];
    for (let d = 1; d <= daysInMonth; d++) row.push("");
    row.push(0);
    data.push(row);
  });

  // Build sheet
  const ws = XLSX.utils.aoa_to_sheet(data);

  // ---------------- Apply Colors ----------------
  for (let col = 2; col < 2 + daysInMonth; col++) {
    const color = blockColors[col - 2];
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });

    if (!ws[cellRef]) continue;

    ws[cellRef].s = {
      fill: { fgColor: { rgb: color } }
    };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Schedule");

  return wb;
}
