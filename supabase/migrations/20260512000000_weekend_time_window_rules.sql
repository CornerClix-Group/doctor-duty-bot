-- Weekend time-of-day windows + Arnett / Beach seed rules
--
-- New columns let us express "no shift starting after 3 pm on Saturdays" and
-- "no shift starting before 2 pm on Sundays" as time windows rather than
-- enumerated shift-code lists, so they stay correct as the shift catalog
-- evolves (e.g. when 9-hr / 10-hr modes change which slots exist).
--
-- Columns are added to BOTH provider_constraints (used by legacy edge solver
-- path) and provider_profiles (used by the new runMonthSolve / HardScheduler
-- architecture) so both code paths honor the rules.
--
-- Seeds:
--   * Will Arnett   -> Sat: no shifts starting after 3 pm (sat_no_start_after_hour = 15)
--                     Sun: no shifts starting before 2 pm (sun_no_start_before_hour = 14)
--   * John Beach    -> avoid_sunday = TRUE (soft preference, scoring penalty)

-- ---- Legacy: provider_constraints (edge solver path) ----------------------
ALTER TABLE public.provider_constraints
  ADD COLUMN IF NOT EXISTS sat_no_start_after_hour  INTEGER,
  ADD COLUMN IF NOT EXISTS sun_no_start_before_hour INTEGER;

COMMENT ON COLUMN public.provider_constraints.sat_no_start_after_hour IS
  'On Saturdays, ban any shift whose start hour is strictly greater than this value (0-23). NULL = no restriction. Example: 15 means no shift starting after 3 pm.';
COMMENT ON COLUMN public.provider_constraints.sun_no_start_before_hour IS
  'On Sundays, ban any shift whose start hour is strictly less than this value (0-23). NULL = no restriction. Example: 14 means no shift starting before 2 pm.';

-- ---- New: provider_profiles (runMonthSolve path) --------------------------
ALTER TABLE public.provider_profiles
  ADD COLUMN IF NOT EXISTS sat_no_start_after_hour  INTEGER,
  ADD COLUMN IF NOT EXISTS sun_no_start_before_hour INTEGER,
  ADD COLUMN IF NOT EXISTS avoid_sunday             BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.provider_profiles.sat_no_start_after_hour IS
  'On Saturdays, ban any shift whose start hour is strictly greater than this value (0-23). NULL = no restriction.';
COMMENT ON COLUMN public.provider_profiles.sun_no_start_before_hour IS
  'On Sundays, ban any shift whose start hour is strictly less than this value (0-23). NULL = no restriction.';
COMMENT ON COLUMN public.provider_profiles.avoid_sunday IS
  'Soft preference to avoid Sundays. Applied as scoring penalty, not a hard ban.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'sat_no_start_after_hour_range'
  ) THEN
    ALTER TABLE public.provider_constraints
      ADD CONSTRAINT sat_no_start_after_hour_range
        CHECK (sat_no_start_after_hour IS NULL
               OR (sat_no_start_after_hour BETWEEN 0 AND 23));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'sun_no_start_before_hour_range'
  ) THEN
    ALTER TABLE public.provider_constraints
      ADD CONSTRAINT sun_no_start_before_hour_range
        CHECK (sun_no_start_before_hour IS NULL
               OR (sun_no_start_before_hour BETWEEN 0 AND 23));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'pp_sat_no_start_after_hour_range'
  ) THEN
    ALTER TABLE public.provider_profiles
      ADD CONSTRAINT pp_sat_no_start_after_hour_range
        CHECK (sat_no_start_after_hour IS NULL
               OR (sat_no_start_after_hour BETWEEN 0 AND 23));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'pp_sun_no_start_before_hour_range'
  ) THEN
    ALTER TABLE public.provider_profiles
      ADD CONSTRAINT pp_sun_no_start_before_hour_range
        CHECK (sun_no_start_before_hour IS NULL
               OR (sun_no_start_before_hour BETWEEN 0 AND 23));
  END IF;
END $$;

-- ---- Will Arnett (provider_constraints) -----------------------------------
UPDATE public.provider_constraints AS pc
SET sat_no_start_after_hour  = 15,
    sun_no_start_before_hour = 14,
    updated_at = NOW()
WHERE pc.provider_id IN (
  SELECT id FROM public.providers WHERE LOWER(name) LIKE '%arnett%'
);

INSERT INTO public.provider_constraints (provider_id, sat_no_start_after_hour, sun_no_start_before_hour)
SELECT p.id, 15, 14
FROM public.providers p
WHERE LOWER(p.name) LIKE '%arnett%'
  AND NOT EXISTS (
    SELECT 1 FROM public.provider_constraints pc WHERE pc.provider_id = p.id
  );

-- ---- Will Arnett (provider_profiles, keyed by last_name) ------------------
UPDATE public.provider_profiles
SET sat_no_start_after_hour  = 15,
    sun_no_start_before_hour = 14
WHERE LOWER(last_name) LIKE '%arnett%';

-- ---- John Beach (provider_constraints) ------------------------------------
UPDATE public.provider_constraints AS pc
SET avoid_sunday = TRUE,
    updated_at = NOW()
WHERE pc.provider_id IN (
  SELECT id FROM public.providers WHERE LOWER(name) LIKE '%beach%'
);

INSERT INTO public.provider_constraints (provider_id, avoid_sunday)
SELECT p.id, TRUE
FROM public.providers p
WHERE LOWER(p.name) LIKE '%beach%'
  AND NOT EXISTS (
    SELECT 1 FROM public.provider_constraints pc WHERE pc.provider_id = p.id
  );

-- ---- John Beach (provider_profiles) ---------------------------------------
UPDATE public.provider_profiles
SET avoid_sunday = TRUE
WHERE LOWER(last_name) LIKE '%beach%';
