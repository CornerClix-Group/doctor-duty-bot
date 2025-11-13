// ============================================================================
// Index.tsx — FINAL CORRECTED PIPELINE
// ============================================================================

import React, { useState } from "react";
import * as XLSX from "xlsx";
import { ValidationPanel } from "@/components/ValidationPanel";
import { SchedulingEngine } from "@/components/SchedulingEngine";
import { supabase } from "@/integrations/supabase/client";

export default function IndexPage() {
  const [parsedData, setParsedData] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const [validationWarnings, setValidationWarnings] = useState([]);
  const [validated, setValidated] = useState(false);
  const [generatedSchedule, setGeneratedSchedule] = useState(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Read file locally (XLSX)
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const base64 = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });

    // Call Edge Function via Supabase client
    const { data, error } = await supabase.functions.invoke(
      "generate-schedule-v2",
      {
        body: { file: base64, mode: "validateOnly" },
      }
    );

    // Handle response
    if (error) {
      console.error("Edge Function error:", error);
      setValidationErrors(["Failed to contact scheduling service. Check console for details."]);
      setValidationWarnings([]);
      setValidated(false);
      return;
    }

    // Success path
    if (data.validation_errors?.length) {
      setValidationErrors(data.validation_errors);
      setValidationWarnings(data.validation_warnings || []);
      setValidated(false);
    } else {
      setParsedData(data.parsedSchedule);
      setValidationWarnings(data.validation_warnings || []);
      setValidated(true);
      setValidationErrors([]);
    }
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
