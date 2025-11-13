import Papa from "papaparse";
import { AVAILABLE_SHIFTS } from "./csvTemplateGenerator";

export interface ParsedProvider {
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  rest_hours: number;
  n_recovery_days: number;
  allowed_shifts: string[];
  preferred_shifts: string[];
  saturday_restrictions: string | null;
  sunday_restrictions: string | null;
  block_pattern: string | null;
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export interface CSVParseResult {
  providers: ParsedProvider[];
  errors: ValidationError[];
  isValid: boolean;
}

const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const parseShiftArray = (value: string | undefined): string[] => {
  if (!value || value.trim() === "") return [];
  
  // Check for "all" keyword (case-insensitive)
  const trimmedValue = value.trim().toLowerCase();
  if (trimmedValue === "all") {
    return AVAILABLE_SHIFTS;
  }
  
  return value
    .split(",")
    .map(s => s.trim())
    .filter(s => s.length > 0);
};

const validateShifts = (shifts: string[]): boolean => {
  return shifts.every(shift => AVAILABLE_SHIFTS.includes(shift));
};

export const parseProviderCSV = (file: File): Promise<CSVParseResult> => {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const providers: ParsedProvider[] = [];
        const errors: ValidationError[] = [];
        const emailSet = new Set<string>();

        results.data.forEach((row: any, index: number) => {
          const rowNum = index + 2; // +2 because of header row and 0-indexing

          // Validate required fields
          if (!row.first_name || row.first_name.trim() === "") {
            errors.push({
              row: rowNum,
              field: "first_name",
              message: "First name is required"
            });
          }

          if (!row.last_name || row.last_name.trim() === "") {
            errors.push({
              row: rowNum,
              field: "last_name",
              message: "Last name is required"
            });
          }

          if (!row.email || row.email.trim() === "") {
            errors.push({
              row: rowNum,
              field: "email",
              message: "Email is required"
            });
          } else if (!isValidEmail(row.email.trim())) {
            errors.push({
              row: rowNum,
              field: "email",
              message: "Invalid email format"
            });
          } else {
            const email = row.email.trim().toLowerCase();
            if (emailSet.has(email)) {
              errors.push({
                row: rowNum,
                field: "email",
                message: "Duplicate email in CSV"
              });
            }
            emailSet.add(email);
          }

          // Parse shift arrays
          const allowed_shifts = parseShiftArray(row.allowed_shifts);
          const preferred_shifts = parseShiftArray(row.preferred_shifts);

          // Validate shift codes
          if (allowed_shifts.length > 0 && !validateShifts(allowed_shifts)) {
            errors.push({
              row: rowNum,
              field: "allowed_shifts",
              message: `Invalid shift codes. Valid shifts: ${AVAILABLE_SHIFTS.join(", ")}`
            });
          }

          if (preferred_shifts.length > 0 && !validateShifts(preferred_shifts)) {
            errors.push({
              row: rowNum,
              field: "preferred_shifts",
              message: `Invalid shift codes. Valid shifts: ${AVAILABLE_SHIFTS.join(", ")}`
            });
          }

          // Parse numeric fields
          const rest_hours = row.rest_hours ? parseInt(row.rest_hours) : 12;
          const n_recovery_days = row.n_recovery_days ? parseInt(row.n_recovery_days) : 2;

          if (isNaN(rest_hours)) {
            errors.push({
              row: rowNum,
              field: "rest_hours",
              message: "Rest hours must be a number"
            });
          }

          if (isNaN(n_recovery_days)) {
            errors.push({
              row: rowNum,
              field: "n_recovery_days",
              message: "Recovery days must be a number"
            });
          }

          // Only add provider if required fields are present
          if (row.first_name && row.last_name && row.email) {
            providers.push({
              first_name: row.first_name.trim(),
              last_name: row.last_name.trim(),
              email: row.email.trim().toLowerCase(),
              role: row.role?.trim() || "provider",
              rest_hours,
              n_recovery_days,
              allowed_shifts,
              preferred_shifts,
              saturday_restrictions: row.saturday_restrictions?.trim() || null,
              sunday_restrictions: row.sunday_restrictions?.trim() || null,
              block_pattern: row.block_pattern?.trim() || null
            });
          }
        });

        resolve({
          providers,
          errors,
          isValid: errors.length === 0
        });
      },
      error: () => {
        resolve({
          providers: [],
          errors: [{ row: 0, field: "file", message: "Failed to parse CSV file" }],
          isValid: false
        });
      }
    });
  });
};
