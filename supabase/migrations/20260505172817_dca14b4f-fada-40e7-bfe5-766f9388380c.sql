
-- 1. Extend provider_constraints
ALTER TABLE public.provider_constraints
  ADD COLUMN IF NOT EXISTS recovery_days INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS block_min INTEGER,
  ADD COLUMN IF NOT EXISTS block_max INTEGER,
  ADD COLUMN IF NOT EXISTS max_consec INTEGER,
  ADD COLUMN IF NOT EXISTS max_consec_e INTEGER,
  ADD COLUMN IF NOT EXISTS recovery_after_e INTEGER,
  ADD COLUMN IF NOT EXISTS sat_disallowed_shifts TEXT[],
  ADD COLUMN IF NOT EXISTS sun_allowed_shifts TEXT[],
  ADD COLUMN IF NOT EXISTS avoid_sunday BOOLEAN DEFAULT false;

-- 2. Extend schedules
ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS base_coverage_value INTEGER DEFAULT 6 CHECK (base_coverage_value IN (6,7,8)),
  ADD COLUMN IF NOT EXISTS monday_ft_rule_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS adjusted_targets JSONB,
  ADD COLUMN IF NOT EXISTS pp_hours JSONB,
  ADD COLUMN IF NOT EXISTS assignments JSONB,
  ADD COLUMN IF NOT EXISTS coverage_pattern JSONB,
  ADD COLUMN IF NOT EXISTS locked_by UUID,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_by UUID,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validation_results JSONB;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedules_status_check') THEN
    ALTER TABLE public.schedules DROP CONSTRAINT schedules_status_check;
  END IF;
END $$;

ALTER TABLE public.schedules
  ADD CONSTRAINT schedules_status_check
  CHECK (status IN ('draft','validated','solved','locked','published','archived'));

-- 3. monthly_requests
CREATE TABLE IF NOT EXISTS public.monthly_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES public.schedules(id) ON DELETE CASCADE,
  provider_id UUID,
  provider_name TEXT,
  request_date DATE,
  request_type TEXT CHECK (request_type IN ('off','must_work','prefer','avoid','must_avoid')),
  shift_code TEXT,
  note TEXT,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual','parsed_email','imported')),
  source_text TEXT,
  honored BOOLEAN,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.monthly_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage monthly requests" ON public.monthly_requests;
CREATE POLICY "Admins manage monthly requests"
  ON public.monthly_requests FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Providers view their own requests" ON public.monthly_requests;
CREATE POLICY "Providers view their own requests"
  ON public.monthly_requests FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.provider_profiles pp
      WHERE pp.id = monthly_requests.provider_id AND pp.user_id = auth.uid()
    )
  );

-- 4. pay_periods
CREATE TABLE IF NOT EXISTS public.pay_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pp_number INTEGER NOT NULL,
  pp_year INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  pay_date DATE,
  UNIQUE(pp_year, pp_number)
);

ALTER TABLE public.pay_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view pay periods" ON public.pay_periods;
CREATE POLICY "Authenticated users can view pay periods"
  ON public.pay_periods FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage pay periods" ON public.pay_periods;
CREATE POLICY "Admins can manage pay periods"
  ON public.pay_periods FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.pay_periods (pp_number, pp_year, start_date, end_date)
SELECT n, 2026,
  (DATE '2025-12-28' + ((n - 1) * 14))::date,
  (DATE '2025-12-28' + ((n - 1) * 14) + 13)::date
FROM generate_series(1, 27) AS n
ON CONFLICT (pp_year, pp_number) DO NOTHING;

-- 5. Unique constraint on provider_constraints.provider_id (so ON CONFLICT works)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'provider_constraints_provider_id_key'
  ) THEN
    ALTER TABLE public.provider_constraints
      ADD CONSTRAINT provider_constraints_provider_id_key UNIQUE (provider_id);
  END IF;
END $$;

-- 6. Seed provider special rules using providers table (FK target)
DO $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.providers WHERE name ILIKE '%Coffin%' LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO public.provider_constraints (provider_id, allowed_shifts, recovery_days, block_min, block_max)
    VALUES (v_id, ARRAY['N'], 4, 3, 4)
    ON CONFLICT (provider_id) DO UPDATE SET
      allowed_shifts = EXCLUDED.allowed_shifts,
      recovery_days = EXCLUDED.recovery_days,
      block_min = EXCLUDED.block_min,
      block_max = EXCLUDED.block_max;
  END IF;

  SELECT id INTO v_id FROM public.providers WHERE name ILIKE '%Venugopal%' LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO public.provider_constraints (provider_id, allowed_shifts, max_consec_e, recovery_after_e)
    VALUES (v_id, ARRAY['E'], 2, 2)
    ON CONFLICT (provider_id) DO UPDATE SET
      allowed_shifts = EXCLUDED.allowed_shifts,
      max_consec_e = EXCLUDED.max_consec_e,
      recovery_after_e = EXCLUDED.recovery_after_e;
  END IF;

  SELECT id INTO v_id FROM public.providers WHERE name ILIKE '%Cary%' LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO public.provider_constraints (provider_id, disallowed_shifts, max_consecutive_n)
    VALUES (v_id, ARRAY['D1','C'], 4)
    ON CONFLICT (provider_id) DO UPDATE SET
      disallowed_shifts = EXCLUDED.disallowed_shifts,
      max_consecutive_n = EXCLUDED.max_consecutive_n;
  END IF;

  SELECT id INTO v_id FROM public.providers WHERE name ILIKE '%Lopez%' LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO public.provider_constraints (provider_id, allowed_shifts, disallowed_shifts, max_consec)
    VALUES (v_id, ARRAY['D1','FT','FT AM','FT PM','FT W','FT W12'], ARRAY['N'], 2)
    ON CONFLICT (provider_id) DO UPDATE SET
      allowed_shifts = EXCLUDED.allowed_shifts,
      disallowed_shifts = EXCLUDED.disallowed_shifts,
      max_consec = EXCLUDED.max_consec;
  END IF;

  SELECT id INTO v_id FROM public.providers WHERE name ILIKE '%Akers%' LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO public.provider_constraints (provider_id, disallowed_shifts)
    VALUES (v_id, ARRAY['C'])
    ON CONFLICT (provider_id) DO UPDATE SET disallowed_shifts = EXCLUDED.disallowed_shifts;
  END IF;

  SELECT id INTO v_id FROM public.providers WHERE name ILIKE '%Beckman%' LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO public.provider_constraints (provider_id, disallowed_shifts)
    VALUES (v_id, ARRAY['N'])
    ON CONFLICT (provider_id) DO UPDATE SET disallowed_shifts = EXCLUDED.disallowed_shifts;
  END IF;

  SELECT id INTO v_id FROM public.providers WHERE name ILIKE '%Orlando%' LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO public.provider_constraints (provider_id, disallowed_shifts)
    VALUES (v_id, ARRAY['N'])
    ON CONFLICT (provider_id) DO UPDATE SET disallowed_shifts = EXCLUDED.disallowed_shifts;
  END IF;

  SELECT id INTO v_id FROM public.providers WHERE name ILIKE '%Ryals%' LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO public.provider_constraints (provider_id, allowed_shifts)
    VALUES (v_id, ARRAY['MIDA','FT','FT AM','FT PM','FT W','FT W12'])
    ON CONFLICT (provider_id) DO UPDATE SET allowed_shifts = EXCLUDED.allowed_shifts;
  END IF;

  SELECT id INTO v_id FROM public.providers WHERE name ILIKE '%Campo%Ford%' LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO public.provider_constraints (provider_id, allowed_shifts)
    VALUES (v_id, ARRAY['MIDA','FT','FT AM','FT PM','FT W','FT W12'])
    ON CONFLICT (provider_id) DO UPDATE SET allowed_shifts = EXCLUDED.allowed_shifts;
  END IF;

  SELECT id INTO v_id FROM public.providers WHERE name ILIKE '%Sellars%Pompey%' LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO public.provider_constraints (provider_id, allowed_shifts)
    VALUES (v_id, ARRAY['MIDA','FT','FT AM','FT PM','FT W','FT W12'])
    ON CONFLICT (provider_id) DO UPDATE SET allowed_shifts = EXCLUDED.allowed_shifts;
  END IF;

  SELECT id INTO v_id FROM public.providers WHERE name ILIKE '%Arnett%' LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO public.provider_constraints (provider_id, sat_disallowed_shifts, sun_allowed_shifts, avoid_sunday)
    VALUES (v_id, ARRAY['E','N'], ARRAY['MIDB','E','N'], true)
    ON CONFLICT (provider_id) DO UPDATE SET
      sat_disallowed_shifts = EXCLUDED.sat_disallowed_shifts,
      sun_allowed_shifts = EXCLUDED.sun_allowed_shifts,
      avoid_sunday = EXCLUDED.avoid_sunday;
  END IF;

  SELECT id INTO v_id FROM public.providers WHERE name ILIKE '%Beach%' LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO public.provider_constraints (provider_id, sun_allowed_shifts, avoid_sunday)
    VALUES (v_id, ARRAY['MIDB','E','N'], true)
    ON CONFLICT (provider_id) DO UPDATE SET
      sun_allowed_shifts = EXCLUDED.sun_allowed_shifts,
      avoid_sunday = EXCLUDED.avoid_sunday;
  END IF;
END $$;
