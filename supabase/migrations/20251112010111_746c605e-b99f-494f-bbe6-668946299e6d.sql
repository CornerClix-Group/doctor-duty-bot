-- Create provider_profiles table
CREATE TABLE IF NOT EXISTS public.provider_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'provider',
  weekend_quota INTEGER DEFAULT 4,
  target_shifts INTEGER DEFAULT 0,
  allowed_shifts TEXT[] DEFAULT ARRAY[]::TEXT[],
  block_pattern TEXT,
  saturday_restrictions TEXT,
  sunday_restrictions TEXT,
  preferred_shifts TEXT[] DEFAULT ARRAY[]::TEXT[],
  rest_hours INTEGER DEFAULT 12,
  n_recovery_days INTEGER DEFAULT 2,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email)
);

-- Enable RLS
ALTER TABLE public.provider_profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can view all provider profiles"
  ON public.provider_profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

CREATE POLICY "Providers can view their own profile"
  ON public.provider_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can insert provider profiles"
  ON public.provider_profiles
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

CREATE POLICY "Admins can update provider profiles"
  ON public.provider_profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

CREATE POLICY "Providers can update their own profile"
  ON public.provider_profiles
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_provider_profiles_updated_at
  BEFORE UPDATE ON public.provider_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();