-- Create providers table
CREATE TABLE public.providers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  email TEXT,
  target_shifts INTEGER NOT NULL DEFAULT 0,
  weekend_quota INTEGER NOT NULL DEFAULT 0,
  phone TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create provider_constraints table
CREATE TABLE public.provider_constraints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  allowed_shifts TEXT[],
  disallowed_shifts TEXT[],
  preferred_shifts TEXT[],
  max_consecutive_n INTEGER,
  weekend_rules TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(provider_id)
);

-- Create provider_blocked_days table
CREATE TABLE public.provider_blocked_days (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  blocked_date DATE NOT NULL,
  reason TEXT,
  block_type TEXT NOT NULL DEFAULT 'X' CHECK (block_type IN ('X', 'L', 'HL', 'A10')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(provider_id, blocked_date)
);

-- Create indexes for better performance
CREATE INDEX idx_providers_name ON public.providers(name);
CREATE INDEX idx_providers_active ON public.providers(active);
CREATE INDEX idx_provider_constraints_provider ON public.provider_constraints(provider_id);
CREATE INDEX idx_provider_blocked_days_provider ON public.provider_blocked_days(provider_id);
CREATE INDEX idx_provider_blocked_days_date ON public.provider_blocked_days(blocked_date);

-- Enable Row Level Security
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_blocked_days ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow public read access for now (can be restricted later)
-- Providers
CREATE POLICY "Anyone can view providers"
ON public.providers FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert providers"
ON public.providers FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update providers"
ON public.providers FOR UPDATE
USING (true);

CREATE POLICY "Anyone can delete providers"
ON public.providers FOR DELETE
USING (true);

-- Provider Constraints
CREATE POLICY "Anyone can view provider constraints"
ON public.provider_constraints FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert provider constraints"
ON public.provider_constraints FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update provider constraints"
ON public.provider_constraints FOR UPDATE
USING (true);

CREATE POLICY "Anyone can delete provider constraints"
ON public.provider_constraints FOR DELETE
USING (true);

-- Provider Blocked Days
CREATE POLICY "Anyone can view blocked days"
ON public.provider_blocked_days FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert blocked days"
ON public.provider_blocked_days FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update blocked days"
ON public.provider_blocked_days FOR UPDATE
USING (true);

CREATE POLICY "Anyone can delete blocked days"
ON public.provider_blocked_days FOR DELETE
USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_providers_updated_at
BEFORE UPDATE ON public.providers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_provider_constraints_updated_at
BEFORE UPDATE ON public.provider_constraints
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();