import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface GeneratedSchedule {
  month: string;
  year: number;
  assignments: {
    [date: string]: {
      [shift: string]: string; // shift -> provider name
    };
  };
  provider_totals?: {
    [providerName: string]: {
      worked: number;
      weekends: number;
      call: number;
      admin: number;
      target?: number;
      weekend_quota?: number;
    };
  };
  warnings?: string[];
}

interface GenerateScheduleProps {
  generatedSchedule: GeneratedSchedule;
}

export const GenerateSchedule = ({ generatedSchedule }: GenerateScheduleProps) => {
  const { assignments } = generatedSchedule;

  // Extract dates and sort them
  const dates = useMemo(() => {
    return Object.keys(assignments).sort();
  }, [assignments]);

  // Extract shift names from the first date
  const shiftNames = useMemo(() => {
    if (dates.length === 0) return [];
    const firstDate = dates[0];
    return Object.keys(assignments[firstDate]).sort();
  }, [dates, assignments]);

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' });
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate();
    return `${dayOfWeek}, ${month} ${day}`;
  };

  // Check if date is weekend
  const isWeekend = (dateStr: string) => {
    const date = new Date(dateStr);
    const dow = date.getDay();
    return dow === 0 || dow === 6;
  };

  if (!assignments || dates.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">No schedule data to display</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>
          Generated Schedule - {generatedSchedule.month}/{generatedSchedule.year}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px] w-full rounded-md border">
          <div className="w-full">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10 bg-background">
                <tr>
                  <th className="border border-border bg-muted p-3 text-left font-semibold">
                    Date
                  </th>
                  {shiftNames.map((shift) => (
                    <th
                      key={shift}
                      className="border border-border bg-muted p-3 text-center font-semibold min-w-[120px]"
                    >
                      {shift}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dates.map((date, index) => (
                  <tr
                    key={date}
                    className={`
                      ${index % 2 === 0 ? 'bg-background' : 'bg-muted/30'}
                      ${isWeekend(date) ? 'bg-accent/20' : ''}
                      hover:bg-muted/50 transition-colors
                    `}
                  >
                    <td className="border border-border p-3 font-medium whitespace-nowrap">
                      {formatDate(date)}
                    </td>
                    {shiftNames.map((shift) => (
                      <td
                        key={`${date}-${shift}`}
                        className="border border-border p-3 text-center"
                      >
                        {assignments[date][shift] || (
                          <span className="text-muted-foreground italic">-</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScrollArea>

        {/* Provider Totals Summary */}
        {generatedSchedule.provider_totals && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-3">Provider Totals</h3>
            <ScrollArea className="h-[200px] w-full rounded-md border">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr>
                    <th className="border border-border bg-muted p-2 text-left font-semibold">
                      Provider
                    </th>
                    <th className="border border-border bg-muted p-2 text-center font-semibold">
                      Worked
                    </th>
                    <th className="border border-border bg-muted p-2 text-center font-semibold">
                      Target
                    </th>
                    <th className="border border-border bg-muted p-2 text-center font-semibold">
                      Weekends
                    </th>
                    <th className="border border-border bg-muted p-2 text-center font-semibold">
                      Weekend Quota
                    </th>
                    <th className="border border-border bg-muted p-2 text-center font-semibold">
                      Nights
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(generatedSchedule.provider_totals).map(([name, totals], index) => (
                    <tr
                      key={name}
                      className={index % 2 === 0 ? 'bg-background' : 'bg-muted/30'}
                    >
                      <td className="border border-border p-2 font-medium">{name}</td>
                      <td className="border border-border p-2 text-center">{totals.worked}</td>
                      <td className="border border-border p-2 text-center">{totals.target || '-'}</td>
                      <td className="border border-border p-2 text-center">{totals.weekends}</td>
                      <td className="border border-border p-2 text-center">{totals.weekend_quota || '-'}</td>
                      <td className="border border-border p-2 text-center">{totals.call}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </div>
        )}

        {/* Warnings */}
        {generatedSchedule.warnings && generatedSchedule.warnings.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-3 text-destructive">Warnings</h3>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {generatedSchedule.warnings.map((warning, index) => (
                <li key={index} className="text-muted-foreground">
                  {warning}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
