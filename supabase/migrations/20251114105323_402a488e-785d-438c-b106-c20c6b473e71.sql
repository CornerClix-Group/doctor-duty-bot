-- Add status field to schedules table to track publication state
ALTER TABLE schedules 
ADD COLUMN status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived'));

-- Add index for faster queries on published schedules
CREATE INDEX idx_schedules_status ON schedules(status);

-- Update RLS policy to allow all authenticated users to view published schedules
DROP POLICY IF EXISTS "Everyone can view schedules" ON schedules;

CREATE POLICY "Everyone can view published schedules"
ON schedules
FOR SELECT
TO authenticated
USING (status = 'published');

-- Keep admin policy for all operations
CREATE POLICY "Admins can view all schedules"
ON schedules
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Admins can insert schedules (keep existing policy)
CREATE POLICY "Admins can insert schedules"
ON schedules
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Admins can update schedules
CREATE POLICY "Admins can update schedules"
ON schedules
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Admins can delete schedules
CREATE POLICY "Admins can delete schedules"
ON schedules
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'));