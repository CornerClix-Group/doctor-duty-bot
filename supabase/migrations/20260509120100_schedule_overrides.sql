-- Manual editor overrides that violate hard rules (acknowledged at publish time)

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
