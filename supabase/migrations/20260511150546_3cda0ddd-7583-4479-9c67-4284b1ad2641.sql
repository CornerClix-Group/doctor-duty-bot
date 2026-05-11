
-- ============ PR #3a: provider rule columns ============
ALTER TABLE public.provider_profiles
  ADD COLUMN IF NOT EXISTS provider_group TEXT
    CHECK (provider_group IN ('military','gs','resident'))
    DEFAULT 'gs',
  ADD COLUMN IF NOT EXISTS requires_80hr_pp BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS night_only BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS evening_only BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ft_or_mida_only BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS monthly_max_nights INTEGER,
  ADD COLUMN IF NOT EXISTS night_block_min_length INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS night_block_max_length INTEGER DEFAULT 4,
  ADD COLUMN IF NOT EXISTS nights_clean_days_after_block INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS counts_in_quotas BOOLEAN DEFAULT TRUE;

UPDATE public.provider_profiles SET
  night_only = TRUE, monthly_max_nights = 12,
  night_block_min_length = 3, night_block_max_length = 4,
  nights_clean_days_after_block = 3
  WHERE LOWER(last_name) = 'coffin';

UPDATE public.provider_profiles SET evening_only = TRUE
  WHERE LOWER(last_name) = 'venugopal';

UPDATE public.provider_profiles SET ft_or_mida_only = TRUE
  WHERE LOWER(last_name) IN ('ryals','sellars-pompey','campo-ford');

UPDATE public.provider_profiles SET
  provider_group = 'military', requires_80hr_pp = FALSE
  WHERE LOWER(last_name) IN ('beach','cary','davison','sellars-pompey','swift');

UPDATE public.provider_profiles SET provider_group = 'gs'
  WHERE LOWER(last_name) = 'lopez';

UPDATE public.provider_profiles SET active = FALSE
  WHERE LOWER(last_name) IN ('apple','swift');

-- ============ PR #3b: schedule_overrides ============
CREATE TABLE IF NOT EXISTS public.schedule_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES public.provider_profiles(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  shift_assigned TEXT,
  rule_violated TEXT NOT NULL,
  rationale TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_schedule_overrides_schedule_id ON public.schedule_overrides(schedule_id);
ALTER TABLE public.schedule_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage schedule overrides" ON public.schedule_overrides;
CREATE POLICY "Admins manage schedule overrides"
  ON public.schedule_overrides
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ============ Weekend time window rules ============
ALTER TABLE public.provider_profiles
  ADD COLUMN IF NOT EXISTS sat_no_start_after_hour INTEGER CHECK (sat_no_start_after_hour BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS sun_no_start_before_hour INTEGER CHECK (sun_no_start_before_hour BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS avoid_sunday BOOLEAN DEFAULT FALSE;

ALTER TABLE public.provider_constraints
  ADD COLUMN IF NOT EXISTS sat_no_start_after_hour INTEGER CHECK (sat_no_start_after_hour BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS sun_no_start_before_hour INTEGER CHECK (sun_no_start_before_hour BETWEEN 0 AND 23);

-- Seed Arnett
UPDATE public.provider_profiles
  SET sat_no_start_after_hour = 15, sun_no_start_before_hour = 15
  WHERE LOWER(last_name) = 'arnett';
UPDATE public.provider_constraints SET sat_no_start_after_hour = 15, sun_no_start_before_hour = 15
  WHERE provider_id IN (SELECT id FROM public.providers WHERE LOWER(name) LIKE '%arnett%');

-- Seed Beach
UPDATE public.provider_profiles
  SET sat_no_start_after_hour = 15, sun_no_start_before_hour = 15, avoid_sunday = TRUE
  WHERE LOWER(last_name) = 'beach';
UPDATE public.provider_constraints SET sat_no_start_after_hour = 15, sun_no_start_before_hour = 15, avoid_sunday = TRUE
  WHERE provider_id IN (SELECT id FROM public.providers WHERE LOWER(name) LIKE '%beach%');
