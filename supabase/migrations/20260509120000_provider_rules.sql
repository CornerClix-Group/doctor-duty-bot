-- EMSchedule rule columns: data-driven provider restrictions (replaces hardcoded names in scheduler)

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

COMMENT ON COLUMN public.provider_profiles.provider_group IS
  'Display grouping: military / gs / resident. military have soft 80hr target; gs hard; resident exempt.';
COMMENT ON COLUMN public.provider_profiles.night_only IS
  'Provider works only night shifts (N/21/10p). Triggers night-block enforcement.';
COMMENT ON COLUMN public.provider_profiles.evening_only IS
  'Provider works only the evening slot (E/16 in 10-hr mode, 5p in 9-hr mode).';
COMMENT ON COLUMN public.provider_profiles.ft_or_mida_only IS
  'Provider works only FT shifts or MIDA (11/11a). Reassigns to MIDA when no FT scheduled.';

-- Coffin: nights only, max 12/month, 3-4 night blocks, 3 days clean after.
UPDATE public.provider_profiles SET
  night_only = TRUE,
  monthly_max_nights = 12,
  night_block_min_length = 3,
  night_block_max_length = 4,
  nights_clean_days_after_block = 3
  WHERE LOWER(last_name) = 'coffin';

-- Venugopal: evening-only (5p in 9-hr mode, 16 in 10-hr mode).
UPDATE public.provider_profiles SET evening_only = TRUE
  WHERE LOWER(last_name) = 'venugopal';

-- FT-only providers: Ryals, Sellars-Pompey, Campo-Ford
UPDATE public.provider_profiles SET ft_or_mida_only = TRUE
  WHERE LOWER(last_name) IN ('ryals','sellars-pompey','campo-ford');

-- Military providers (soft 80-hr target, but still in fairness pool)
UPDATE public.provider_profiles SET
  provider_group = 'military',
  requires_80hr_pp = FALSE
  WHERE LOWER(last_name) IN ('beach','cary','davison','sellars-pompey','swift');

-- Lopez: GS group, currently TL until further notice. (TL handled via parser whole-month-off.)
UPDATE public.provider_profiles SET provider_group = 'gs'
  WHERE LOWER(last_name) = 'lopez';

-- Apple is removed from the roster entirely; deactivate.
UPDATE public.provider_profiles SET active = FALSE
  WHERE LOWER(last_name) = 'apple';

-- Swift: status unknown, deactivate until confirmed.
UPDATE public.provider_profiles SET active = FALSE
  WHERE LOWER(last_name) = 'swift';
