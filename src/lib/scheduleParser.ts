import * as XLSX from 'xlsx';

export interface Provider {
  name: string;
  weekendQuota: number;
  targetShifts: number;
  constraints: {
    allowedShifts?: string[];
    disallowedShifts?: string[];
    maxConsecutive?: { [shift: string]: number };
    weekendRules?: string[];
    preferredShifts?: string[];
  };
}

export interface DayData {
  date: string;
  dayOfWeek: string;
  pattern: number;
  isWeekend: boolean;
  isHoliday: boolean;
  shifts: { [shiftType: string]: string }; // shiftType -> provider name or "X"/"L"/"HL"
}

export interface ScheduleData {
  month: string;
  year: number;
  days: DayData[];
  providers: { [name: string]: Provider };
}

const SHIFT_NAMES = ['D1', 'D2', 'MIDA', 'MIDB', 'E', 'N', 'FT AM', 'FT PM', 'FT W'];

const PROVIDER_RULES: { [name: string]: Provider['constraints'] } = {
  'Coffin': {
    allowedShifts: ['N'],
    maxConsecutive: { 'N': 4 }
  },
  'Cary': {
    disallowedShifts: ['D1'],
    preferredShifts: ['MIDB', 'E', 'N'],
    maxConsecutive: { 'N': 4 }
  },
  'Venugopal': {
    allowedShifts: ['E'],
    maxConsecutive: { 'E': 2 }
  },
  'Lopez': {
    allowedShifts: ['D1', 'FT AM'],
    maxConsecutive: { 'D1': 2, 'FT AM': 2 }
  },
  'Orlando': {
    disallowedShifts: ['N']
  },
  'Beckman': {
    disallowedShifts: ['N']
  },
  'Ryals': {
    allowedShifts: ['FT AM', 'FT PM', 'FT W', 'MIDA']
  },
  'Campo-Ford': {
    allowedShifts: ['FT AM', 'FT PM', 'FT W', 'MIDA']
  },
  'Sellars-Pompey': {
    allowedShifts: ['FT AM', 'FT PM', 'FT W', 'MIDA']
  },
  'Arnett': {
    weekendRules: ['no-e-n-sat', 'only-midb-e-n-sun', 'avoid-sun']
  },
  'Beach': {
    weekendRules: ['avoid-sun', 'only-midb-e-n-sun']
  }
};

const D1_PROVIDERS = ['Lopez', 'Arnett', 'Beres', 'Illston', 'Freeman', 'Ferguson', 'Jones'];
const D1_PRIORITY = ['Lopez', 'Arnett', 'Beres', 'Illston', 'Freeman', 'Ferguson', 'Jones'];

export function parseScheduleData(worksheet: XLSX.WorkSheet): ScheduleData {
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  
  // Parse providers from row 2 (index 1)
  const providers: { [name: string]: Provider } = {};
  for (let col = 2; col <= range.e.c; col++) {
    const nameCell = worksheet[XLSX.utils.encode_cell({ r: 1, c: col })];
    const quotaCell = worksheet[XLSX.utils.encode_cell({ r: 1, c: 1 })]; // Weekend quota in column B
    const targetCell = worksheet[XLSX.utils.encode_cell({ r: 1, c: 35 })]; // Column AI
    
    if (nameCell && nameCell.v) {
      const name = String(nameCell.v).trim();
      providers[name] = {
        name,
        weekendQuota: quotaCell?.v || 4,
        targetShifts: targetCell?.v || 30,
        constraints: PROVIDER_RULES[name] || {}
      };
    }
  }

  // Parse days starting from row 4
  const days: DayData[] = [];
  const currentDate = new Date();
  const month = currentDate.toLocaleString('default', { month: 'long' });
  const year = currentDate.getFullYear();

  for (let row = 3; row <= range.e.r; row++) {
    const dateCell = worksheet[XLSX.utils.encode_cell({ r: row, c: 0 })];
    const patternCell = worksheet[XLSX.utils.encode_cell({ r: row, c: 1 })];
    
    if (!dateCell?.v) continue;

    const date = new Date(dateCell.v);
    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' });
    const isWeekend = dayOfWeek === 'Sat' || dayOfWeek === 'Sun';
    const pattern = patternCell?.v || 7;

    const shifts: { [shiftType: string]: string } = {};
    
    // Parse existing shift assignments
    let colIdx = 2;
    for (const shiftType of SHIFT_NAMES) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: colIdx })];
      if (cell?.v) {
        shifts[shiftType] = String(cell.v).trim();
      }
      colIdx++;
    }

    days.push({
      date: date.toISOString().split('T')[0],
      dayOfWeek,
      pattern,
      isWeekend,
      isHoliday: false, // Can be enhanced to detect HL
      shifts
    });
  }

  return { month, year, days, providers };
}
