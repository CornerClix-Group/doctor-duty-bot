// ============================================================================
// Index.tsx — FINAL CORRECTED PIPELINE
// ============================================================================

import React, { useState } from "react";
import * as XLSX from "xlsx";
import { ValidationPanel } from "@/components/ValidationPanel";
import { SchedulingEngine } from "@/components/SchedulingEngine";

export default function IndexPage() {
  const [parsedData, setParsedData] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const [validationWarnings, setValidationWarnings] = useState([]);
  const [validated, setValidated] = useState(false);
  const [generatedSchedule, setGeneratedSchedule] = useState(null);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // Send raw workbook to backend for parsing + validation
    const base64 = XLSX.write(workbook, { type: "base64" });

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-schedule-v2`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Auth auto-inserted by Supabase client for backend
        },
        body: JSON.stringify({ file: base64, mode: "validateOnly" })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      setValidationErrors(result.validation_errors || []);
      setValidationWarnings(result.validation_warnings || []);
      setValidated(false);
      return;
    }

    // Valid template; save parsed JSON
    setParsedData(result.parsedSchedule);
    setValidationWarnings(result.validation_warnings || []);
    setValidated(true);
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Schedule Generator</h1>

      {/* Upload */}
      <input type="file" onChange={handleUpload} />

      {/* Validation Results */}
      {(validationErrors.length > 0 || validationWarnings.length > 0) && (
        <ValidationPanel
          errors={validationErrors}
          warnings={validationWarnings}
        />
      )}

      {/* Scheduling Phase */}
      {validated && parsedData && (
        <SchedulingEngine
          scheduleData={parsedData}
          onScheduleGenerated={(sched) => setGeneratedSchedule(sched)}
        />
      )}

      {/* Output */}
      {generatedSchedule && (
        <pre className="mt-6 bg-gray-100 p-4 rounded">
          {JSON.stringify(generatedSchedule, null, 2)}
        </pre>
      )}
    </div>
  );
}
