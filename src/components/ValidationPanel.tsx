// ============================================================================
// ValidationPanel.tsx — Professional Validation UI Component
// ============================================================================

import React from "react";

interface Props {
  errors?: any[];
  warnings?: any[];
}

export const ValidationPanel = ({ errors = [], warnings = [] }: Props) => {
  if (errors.length === 0 && warnings.length === 0) return null;

  const hasErrors = errors.length > 0;

  return (
    <div className="mt-6">
      {/* VALIDATION FAILED */}
      {hasErrors && (
        <div className="border border-red-400 bg-red-50 p-4 rounded shadow">
          <h2 className="text-xl font-bold text-red-700 mb-3">
            ❌ Validation Failed — Cannot Generate Schedule
          </h2>

          <p className="text-red-600 mb-4">
            You must fix the following issues in your Excel template before scheduling can proceed.
          </p>

          {/* ERROR LIST */}
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-red-700 mb-2">Errors</h3>
            <ul className="list-disc ml-6 text-red-800 space-y-1">
              {errors.map((err: string, idx: number) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          </div>

          {/* WARNINGS (non-blocking) */}
          {warnings.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-yellow-700 mb-2">
                ⚠️ Warnings (not blocking)
              </h3>
              <ul className="list-disc ml-6 text-yellow-800 space-y-1">
                {warnings.map((w: string, idx: number) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggested Fixes */}
          <div className="mt-6 border-t pt-4">
            <h3 className="text-lg font-semibold text-gray-700 mb-2">
              💡 Suggested Fixes
            </h3>
            <ul className="list-disc ml-6 text-gray-700 space-y-1">
              <li>
                Ensure all provider names in the template exactly match your current provider list.
              </li>
              <li>
                Check for invalid shift codes (allowed: D1, D2, MIDA, MIDB, E, N, FT AM, FT PM, FT W, C, A10).
              </li>
              <li>
                Confirm constraint codes use valid syntax: 1/2/x, 5/10/x, amx, pmx.
              </li>
              <li>
                Make sure OFF cells use only X, L, or LH.
              </li>
              <li>
                Ensure coverage limits (Pattern row) are correct for all dates.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* WARNINGS ONLY (no errors) */}
      {!hasErrors && warnings.length > 0 && (
        <div className="border border-yellow-400 bg-yellow-50 p-4 rounded shadow">
          <h2 className="text-xl font-bold text-yellow-700 mb-3">
            ⚠️ Validation Warnings
          </h2>
          <ul className="list-disc ml-6 text-yellow-800 space-y-1">
            {warnings.map((w: string, idx: number) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
