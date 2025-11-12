-- Remove target_shifts and weekend_quota from provider_profiles table
-- These values are now month-specific and read from uploaded Excel files

ALTER TABLE public.provider_profiles 
DROP COLUMN IF EXISTS target_shifts,
DROP COLUMN IF EXISTS weekend_quota;