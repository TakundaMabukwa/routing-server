-- Add alert_messages JSONB column to trips table
ALTER TABLE trips 
ADD COLUMN IF NOT EXISTS alert_messages JSONB DEFAULT '[]'::jsonb;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_trips_alert_messages ON trips USING gin(alert_messages);
