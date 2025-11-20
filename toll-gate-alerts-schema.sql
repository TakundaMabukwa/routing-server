-- Toll Gate Alerts Table
CREATE TABLE IF NOT EXISTS public.toll_gate_alerts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plate TEXT NOT NULL,
  driver_name TEXT,
  toll_gate_name TEXT NOT NULL,
  distance_meters INTEGER,
  alert_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  company TEXT DEFAULT 'eps',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS toll_gate_alerts_plate_idx ON public.toll_gate_alerts(plate);
CREATE INDEX IF NOT EXISTS toll_gate_alerts_timestamp_idx ON public.toll_gate_alerts(alert_timestamp);
CREATE INDEX IF NOT EXISTS toll_gate_alerts_company_idx ON public.toll_gate_alerts(company);
