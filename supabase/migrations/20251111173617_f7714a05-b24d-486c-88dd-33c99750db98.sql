-- Add missing fields to provider_constraints table
ALTER TABLE provider_constraints
ADD COLUMN IF NOT EXISTS rest_hours integer DEFAULT 12,
ADD COLUMN IF NOT EXISTS n_recovery_days integer DEFAULT 2,
ADD COLUMN IF NOT EXISTS block_pattern text,
ADD COLUMN IF NOT EXISTS saturday_restrictions text,
ADD COLUMN IF NOT EXISTS sunday_restrictions text;

-- Link providers to user accounts via email matching
ALTER TABLE providers
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;