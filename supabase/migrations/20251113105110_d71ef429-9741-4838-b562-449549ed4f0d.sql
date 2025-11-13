-- Drop existing restrictive policies on provider_profiles
DROP POLICY IF EXISTS "Admins can view all provider profiles" ON public.provider_profiles;
DROP POLICY IF EXISTS "Providers can view their own profile" ON public.provider_profiles;
DROP POLICY IF EXISTS "Admins can insert provider profiles" ON public.provider_profiles;
DROP POLICY IF EXISTS "Admins can update provider profiles" ON public.provider_profiles;
DROP POLICY IF EXISTS "Providers can update their own profile" ON public.provider_profiles;

-- Create new policies using the has_role function
CREATE POLICY "Admins can view all provider profiles"
  ON public.provider_profiles
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Providers can view their own profile"
  ON public.provider_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can insert provider profiles"
  ON public.provider_profiles
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update provider profiles"
  ON public.provider_profiles
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Providers can update their own profile"
  ON public.provider_profiles
  FOR UPDATE
  USING (auth.uid() = user_id);