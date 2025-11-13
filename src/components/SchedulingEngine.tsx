// ============================================================================
// SchedulingEngine.tsx — FINAL UPDATED VERSION
// Works with:
//   - Updated parser
//   - Updated HardScheduler
//   - Updated index.ts
//   - Base64 Excel upload
//   - Template generation (with Coverage# row)
// ============================================================================

import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { generateScheduleTemplate } from "@/lib/scheduleTemplateGenerator";
import { supabase } from "@/integrations/supabase/client";

export const SchedulingEngine = () => {
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1); // 1–12
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>("");

  // --------------------------------------------------------------------------
  // LOAD PROVIDERS (sorted by last name)
  // --------------------------------------------------------------------------
  useEffect(() => {
    async function loadProviders() {
      const { data, error } = await supabase
        .from("provider_profiles")
        .select("id, first_name, last_name");

      if (error) {
        console.error("Provider load error:", error);
        return;
      }

      const sorted = [...(data || [])].sort((a, b) => {
        const last = a.last_name.localeCompare(b.last_name);
        if (last !== 0) return last;
        return a.first_name.localeCompare(b.first_name);
      });

      setProviders(sorted);
    }

    loadProviders();
  }, []);

  // --------------------------------------------------------------------------
  // CONVERT FILE TO BASE64
  // --------------------------------------------------------------------------
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve((e.target?.result as string).split(",")[1]);
      reader.onerror = e => reject(e);
      reader.readAsDataURL(file);
    });
  };

  // --------------------------------------------------------------------------
  // HANDLE FILE UPLOAD
  // --------------------------------------------------------------------------
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");
    setResult(null);

    try {
      const base64 = await fileToBase64(file);

      // Use Supabase functions.invoke with proper authentication
      const { data, error: invokeError } = await supabase.functions.invoke(
        "generate-schedule-v2",
        {
          body: { file: base64 }
        }
      );

      if (invokeError) {
        setError(invokeError.message || "Unknown error occurred.");
        setUploading(false);
        return;
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || "Upload failed.");
    }

    setUploading(false);
  };

  // --------------------------------------------------------------------------
  // DOWNLOAD MONTHLY TEMPLATE
  // --------------------------------------------------------------------------
  const handleDownloadTemplate = () => {
    if (!providers.length) {
      setError("No providers found. Add providers to begin.");
      return;
    }

    // Build provider name list
    const providerNames = providers.map(
      p => `${p.first_name} ${p.last_name}`.trim()
    );

    const monthIndex = selectedMonth - 1;
    const year = selectedYear;

    const wb = generateScheduleTemplate(
      monthIndex,
      year,
      providerNames,
      5,     // startingPP (Jan 2026 uses PP5 for Jan 1)
      0      // startingBlockIndex (first color block)
    );

    const wbout = XLSX.write(wb, {
      bookType: "xlsx",
      type: "array",
      cellStyles: true
    });

    const blob = new Blob([wbout], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const monthName = new Date(year, monthIndex, 1).toLocaleString("default", {
      month: "long",
    });

    const filename = `ScheduleTemplate-${monthName}-${year}.xlsx`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --------------------------------------------------------------------------
  // RENDER UI
  // --------------------------------------------------------------------------
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">ER Scheduling Engine</h1>

      <div className="mb-4">
        <label className="font-semibold block mb-1">Month</label>
        <select
          className="border p-2 rounded"
          value={selectedMonth}
          onChange={e => setSelectedMonth(Number(e.target.value))}
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <option key={i + 1} value={i + 1}>
              {new Date(2025, i).toLocaleString("default", { month: "long" })}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label className="font-semibold block mb-1">Year</label>
        <input
          type="number"
          className="border p-2 rounded"
          value={selectedYear}
          onChange={e => setSelectedYear(Number(e.target.value))}
        />
      </div>

      <button
        onClick={handleDownloadTemplate}
        className="bg-blue-600 text-white px-4 py-2 rounded mb-6"
      >
        Download Monthly Template
      </button>

      <div className="mb-6">
        <label className="font-semibold block mb-2">
          Upload Completed Template (.xls / .xlsx)
        </label>
        <input type="file" accept=".xls,.xlsx,.xlsm" onChange={handleUpload} />
      </div>

      {uploading && <p className="text-blue-600">Processing...</p>}
      {error && <p className="text-red-600 font-bold">{error}</p>}

      {result && (
        <div className="bg-green-100 p-4 rounded mt-4">
          <h2 className="text-xl font-bold mb-2">Generated Schedule</h2>
          <pre className="text-sm">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
