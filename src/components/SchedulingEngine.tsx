// ============================================================================
// SchedulingEngine.tsx — FINAL CORRECTED VERSION
// ============================================================================

import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const SchedulingEngine = ({ scheduleData, onScheduleGenerated }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const generateSchedule = async () => {
    setLoading(true);
    setError("");

    const { data, error: invokeError } = await supabase.functions.invoke(
      "generate-schedule-v2",
      {
        body: {
          mode: "schedule",
          scheduleData // <--- critical
        }
      }
    );

    if (invokeError) {
      setError(invokeError.message || "Error generating schedule.");
      setLoading(false);
      return;
    }

    onScheduleGenerated(data);
    setLoading(false);
  };

  return (
    <div className="mt-6 p-4 border rounded shadow bg-white">
      <h2 className="text-xl font-bold mb-4">Scheduling Engine</h2>

      {error && <p className="text-red-600 mb-2">{error}</p>}

      <button
        onClick={generateSchedule}
        className="bg-purple-600 text-white px-4 py-2 rounded"
        disabled={loading}
      >
        {loading ? "Generating..." : "Generate Schedule with AI"}
      </button>
    </div>
  );
};
