import * as XLSX from "xlsx";

const PP_COLORS = [
  "FFF2A8", // Yellow
  "B7D4F8", // Blue
  "D9B4F7"  // Purple
];

const WEEKEND_COLOR = "EEEEEE"; // Light gray

/**
 * Compute a PP number (PP1–PP14) given the day offset and month starting PP.
 */
function computePP(dayIndex: number, startingPP: number): number {
  return ((startingPP - 1 + dayIndex) % 14) + 1;
}

/**
 * Generate monthly ER schedule Excel template with SheetJS.
 * 
 * Format:
 * Row 1: Provider Name | Weekend | Night | Total | PP1 | PP2 | ... (cycling 1-14)
 * Row 2: (empty cols A-D) | Coverage# | Coverage# | ...
 * Row 3: (empty cols A-D) | Mo | Tu | We | ...
 * Row 4: (empty cols A-D) | 1 | 2 | 3 | ...
 * Row 5+: Provider | Weekend Quota | Night Quota | Total Target | (constraint cells)
 */
export function generateScheduleTemplate(
  monthIndex: number,
  year: number,
  providerNames: string[],
  startingPP: number,
  colorBlockStartIndex: number
): XLSX.WorkBook {
  const monthName = new Date(year, monthIndex, 1).toLocaleString("default", {
    month: "long"
  });

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const data: any[][] = [];

  // ---------------- Row 1 — Header ----------------
  const row1 = ["Provider Name", "Weekend", "Night", "Total"];
  const blockColors: string[] = [];
  let blockIdx = colorBlockStartIndex;

  for (let d = 1; d <= daysInMonth; d++) {
    const pp = computePP(d - 1, startingPP);

    // If PP resets from 14 → 1 (and not on day 1), advance block color
    if (pp === 1 && d !== 1) {
      blockIdx = (blockIdx + 1) % PP_COLORS.length;
    }

    row1.push(`PP${pp}`);
    blockColors.push(PP_COLORS[blockIdx]);
  }

  data.push(row1);

  // ---------------- Row 2 — Coverage ----------------
  const row2: any[] = ["", "", "", ""];
  for (let d = 1; d <= daysInMonth; d++) {
    row2.push(7); // Default coverage number
  }
  data.push(row2);

  // ---------------- Row 3 — Day-of-week ----------------
  const row3: any[] = ["", "", "", ""];
  const dayAbbr = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const weekendFlags: boolean[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, monthIndex, d).getDay(); // 0 = Sun, 6 = Sat
    row3.push(dayAbbr[dow]);
    weekendFlags.push(dow === 0 || dow === 6);
  }

  data.push(row3);

  // ---------------- Row 4 — Date row ----------------
  const row4: any[] = ["", "", "", ""];
  for (let d = 1; d <= daysInMonth; d++) {
    row4.push(d);
  }
  data.push(row4);

  // ---------------- Provider Rows ----------------
  providerNames.forEach((name) => {
    const row = [
      name,    // Provider Name
      0,       // Weekend Quota
      0,       // Night Quota
      0        // Total Shift Target
    ];
    for (let d = 1; d <= daysInMonth; d++) {
      row.push(""); // Constraint/lock cells
    }
    data.push(row);
  });

  // Build sheet
  const ws = XLSX.utils.aoa_to_sheet(data);

  // ---------------- Apply PP block colors ----------------
  for (let col = 4; col < 4 + daysInMonth; col++) {
    const ppColor = blockColors[col - 4];
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
    if (!ws[cellRef]) continue;

    ws[cellRef].s = {
      fill: {
        patternType: "solid",
        fgColor: { rgb: ppColor }
      },
      font: { bold: true },
      alignment: { horizontal: "center", vertical: "center" }
    };
  }

  // Apply header styling for columns A-D in row 1
  for (let col = 0; col < 4; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
    if (!ws[cellRef]) continue;

    ws[cellRef].s = {
      font: { bold: true },
      alignment: { horizontal: "center", vertical: "center" }
    };
  }

  // ---------------- Apply weekend shading ----------------
  const firstDataRow = 1; // Coverage row starts weekend shading
  const lastRow = data.length - 1;

  for (let col = 4; col < 4 + daysInMonth; col++) {
    const isWeekend = weekendFlags[col - 4];
    if (!isWeekend) continue;

    for (let row = firstDataRow; row <= lastRow; row++) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: col });

      if (!ws[cellRef]) ws[cellRef] = { t: "s", v: "" };
      if (!ws[cellRef].s) ws[cellRef].s = {};

      ws[cellRef].s.fill = {
        patternType: "solid",
        fgColor: { rgb: WEEKEND_COLOR }
      };
    }
  }

  // Set column widths
  const colWidths = [
    { wch: 15 }, // Provider Name
    { wch: 10 }, // Weekend
    { wch: 10 }, // Night
    { wch: 10 }, // Total
  ];

  for (let d = 0; d < daysInMonth; d++) {
    colWidths.push({ wch: 8 }); // Day columns
  }

  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${monthName} ${year}`);

  return wb;
}
