-- Dashboard RPCs + recency index
-- The dashboard hero card and Recent Activity feed need two RPCs.
-- Both are SECURITY DEFINER by design — the dashboard surfaces
-- aggregate status (hero) and admin actions (activity feed), neither
-- of which leaks provider-level data through schedules RLS.
-- 1. Recency index — existing (month, year) index doesn't help
--    ORDER BY updated_at DESC.
CREATE INDEX IF NOT EXISTS idx_schedules_updated_at_desc
  ON public.schedules (updated_at DESC);
-- 2. get_next_open_period: returns ONE row describing the next
--    month/year an admin should work on. "Open" means not published
--    and not archived. Walks forward up to 24 months from today.
CREATE OR REPLACE FUNCTION public.get_next_open_period()
RETURNS TABLE (
  month         TEXT,
  year          INTEGER,
  status        TEXT,
  error_count   INTEGER,
  warn_count    INTEGER,
  locked_at     TIMESTAMPTZ,
  published_at  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today      DATE := date_trunc('month', now())::date;
  v_offset     INT := 0;
  v_target     DATE;
  v_month_name TEXT;
  v_year       INT;
  v_row        public.schedules%ROWTYPE;
BEGIN
  WHILE v_offset < 24 LOOP
    v_target := v_today + make_interval(months => v_offset);
    v_month_name := trim(to_char(v_target, 'FMMonth'));
    v_year := EXTRACT(YEAR FROM v_target)::INT;
    SELECT * INTO v_row
    FROM public.schedules s
    WHERE s.month = v_month_name AND s.year = v_year
    LIMIT 1;
    IF NOT FOUND THEN
      month := v_month_name;
      year := v_year;
      status := 'not_started';
      error_count := 0;
      warn_count := 0;
      locked_at := NULL;
      published_at := NULL;
      updated_at := NULL;
      RETURN NEXT;
      RETURN;
    END IF;
    IF v_row.status NOT IN ('published', 'archived') THEN
      month := v_row.month;
      year := v_row.year;
      status := v_row.status;
      error_count := COALESCE(jsonb_array_length(v_row.validation_results->'errors'), 0);
      warn_count := COALESCE(jsonb_array_length(v_row.validation_results->'warnings'), 0);
      locked_at := v_row.locked_at;
      published_at := v_row.published_at;
      updated_at := v_row.updated_at;
      RETURN NEXT;
      RETURN;
    END IF;
    v_offset := v_offset + 1;
  END LOOP;
  -- 24 months out and everything is published/archived: surface the
  -- next month after today as not_started anyway, so the UI has
  -- something to render.
  v_target := v_today + interval '1 month';
  month := trim(to_char(v_target, 'FMMonth'));
  year := EXTRACT(YEAR FROM v_target)::INT;
  status := 'not_started';
  error_count := 0;
  warn_count := 0;
  locked_at := NULL;
  published_at := NULL;
  updated_at := NULL;
  RETURN NEXT;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_next_open_period() TO authenticated;
-- 3. get_recent_schedule_activity: dashboard activity feed.
--    Joins to auth.users so the UI can render an actor email.
CREATE OR REPLACE FUNCTION public.get_recent_schedule_activity(limit_n INT DEFAULT 5)
RETURNS TABLE (
  id           UUID,
  month        TEXT,
  year         INTEGER,
  status       TEXT,
  updated_at   TIMESTAMPTZ,
  created_by   UUID,
  actor_email  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.month,
    s.year,
    s.status,
    s.updated_at,
    s.created_by,
    u.email::TEXT
  FROM public.schedules s
  LEFT JOIN auth.users u ON u.id = s.created_by
  ORDER BY s.updated_at DESC
  LIMIT GREATEST(1, LEAST(limit_n, 50));
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_recent_schedule_activity(INT) TO authenticated;
