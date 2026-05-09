import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ScheduleViolation } from "../../../supabase/functions/_shared/schedulerHardRules.ts";

function humanizeViolationType(t: string): string {
  const map: Record<string, string> = {
    coverage_unfilled: "Coverage gap",
    pp_hours_short: "Pay period hours",
    pp_hours_over: "Pay period overage",
    eligibility: "Eligibility",
    max_consecutive_clinical: "Consecutive clinical cap",
    rolling_7_clinical: "Rolling 7-day clinical cap",
    night_block_length: "Night block length",
    nights_clean_window: "Nights-clean window",
    monthly_max_nights: "Monthly night maximum",
    circadian_ratchet: "Circadian ratchet",
  };
  return map[t] || t.replace(/_/g, " ");
}

export interface OverrideConfirmDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (rationale: string) => void;
  providerName: string;
  date: string;
  proposedShift: string;
  violation: ScheduleViolation;
}

export function OverrideConfirmDialog({
  open,
  onCancel,
  onConfirm,
  providerName,
  date,
  proposedShift,
  violation,
}: OverrideConfirmDialogProps) {
  const [rationale, setRationale] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setRationale("");
          onCancel();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Override {humanizeViolationType(violation.type)}?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-1.5">
            <div>
              <span className="text-muted-foreground">Provider:</span>{" "}
              <span className="font-medium">{providerName}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Date:</span>{" "}
              <span className="font-medium">{date}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Proposed shift:</span>{" "}
              <span className="font-medium">{proposedShift}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Rule violated:</span>{" "}
              <span className="font-medium">{humanizeViolationType(violation.type)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Description:</span>{" "}
              <span className="font-medium">{violation.message}</span>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Why is this override necessary? (optional)
            </label>
            <Textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => { setRationale(""); onCancel(); }}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm(rationale);
              setRationale("");
            }}
          >
            Override and apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
