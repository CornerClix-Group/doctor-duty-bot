import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const MONTHS_ORDER = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface HeroNextPeriodProps {
  month: string;
  year: number;
  status: string;
  errorCount: number;
  warnCount: number;
  lockedAt: string | null;
  publishedAt: string | null;
  activeProviders: number | null;
  lastUpdated: string | null;
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return '—';
  }
}

function addOneCalendarMonth(month: string, year: number): { month: string; year: number } {
  const idx = MONTHS_ORDER.indexOf(month);
  const monthIndex = idx >= 0 ? idx : 0;
  const d = new Date(year, monthIndex + 1, 1);
  return {
    month: MONTHS_ORDER[d.getMonth()],
    year: d.getFullYear(),
  };
}

export function HeroNextPeriod({
  month,
  year,
  status,
  errorCount,
  warnCount,
  lockedAt,
  publishedAt,
  activeProviders,
  lastUpdated,
}: HeroNextPeriodProps) {
  const nextPeriod = addOneCalendarMonth(month, year);
  const providersLabel = activeProviders ?? '—';

  let title: string;
  let body: string;
  let primaryHref: string;
  let primaryLabel: string;
  let secondaryHref: string | null = null;
  let secondaryLabel: string | null = null;
  let statusBadge: string | null = null;

  switch (status) {
    case 'not_started':
      title = `Next up: ${month} ${year}`;
      body = `${providersLabel} active providers · Nothing started for this period yet`;
      primaryLabel = `Start ${month} ${year} schedule →`;
      primaryHref = `/generate?month=${encodeURIComponent(month)}&year=${year}`;
      break;
    case 'draft':
    case 'validated':
    case 'solved':
      title = `In progress: ${month} ${year} (${status})`;
      body = `${errorCount} validation errors · ${warnCount} warnings · Last edited ${relativeTime(lastUpdated)}`;
      primaryLabel = `Continue ${month} ${year} →`;
      primaryHref = `/generate?month=${encodeURIComponent(month)}&year=${year}`;
      statusBadge = status;
      break;
    case 'locked':
      title = `Ready to publish: ${month} ${year}`;
      body = `Locked ${relativeTime(lockedAt)} · ${providersLabel} providers will be notified`;
      primaryLabel = `Review and publish →`;
      primaryHref = `/generate?month=${encodeURIComponent(month)}&year=${year}`;
      break;
    case 'published':
      title = `Live: ${month} ${year}`;
      body = `Published ${relativeTime(publishedAt)} · Visible to all providers`;
      primaryLabel = `Start ${nextPeriod.month} ${nextPeriod.year} schedule →`;
      primaryHref = `/generate?month=${encodeURIComponent(nextPeriod.month)}&year=${nextPeriod.year}`;
      secondaryLabel = 'View schedule';
      secondaryHref = '/schedule';
      break;
    default:
      title = `Next up: ${month} ${year}`;
      body = `${providersLabel} active providers · ${status}`;
      primaryLabel = `Start ${month} ${year} schedule →`;
      primaryHref = `/generate?month=${encodeURIComponent(month)}&year=${year}`;
  }

  return (
    <Card className="overflow-hidden border-primary/25 shadow-lg transition-all hover:shadow-xl">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-2xl tracking-tight">{title}</CardTitle>
            <CardDescription className="text-base leading-relaxed">{body}</CardDescription>
          </div>
          {statusBadge && (
            <Badge variant="outline" className="capitalize shrink-0">
              {statusBadge}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link to={primaryHref}>{primaryLabel}</Link>
        </Button>
        {secondaryHref && secondaryLabel && (
          <Button asChild variant="outline" size="lg">
            <Link to={secondaryHref}>{secondaryLabel}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
