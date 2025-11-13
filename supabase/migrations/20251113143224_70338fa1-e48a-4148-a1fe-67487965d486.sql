-- Add active column to provider_profiles table
ALTER TABLE provider_profiles
ADD COLUMN active boolean DEFAULT true;