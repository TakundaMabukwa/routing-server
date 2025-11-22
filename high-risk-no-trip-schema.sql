-- Table to log vehicles entering high-risk zones without active trips
CREATE TABLE IF NOT EXISTS high_risk_no_trip_logs (
  id BIGSERIAL PRIMARY KEY,
  plate TEXT NOT NULL,
  driver_name TEXT,
  vehicle_id TEXT,
  device_id TEXT,
  driver_id TEXT,
  high_risk_zone_name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  distance_from_zone DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_high_risk_no_trip_plate ON high_risk_no_trip_logs(plate);
CREATE INDEX IF NOT EXISTS idx_high_risk_no_trip_timestamp ON high_risk_no_trip_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_high_risk_no_trip_zone ON high_risk_no_trip_logs(high_risk_zone_name);
