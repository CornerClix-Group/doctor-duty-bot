-- Add invitation tracking fields to providers table
ALTER TABLE public.providers 
ADD COLUMN invitation_sent_at timestamp with time zone,
ADD COLUMN invitation_token text,
ADD COLUMN invitation_accepted_at timestamp with time zone;

-- Create index for faster token lookups
CREATE INDEX idx_providers_invitation_token ON public.providers(invitation_token);
