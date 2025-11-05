-- Daily snapshots table for monthly statistics
CREATE TABLE IF NOT EXISTS eps_daily_snapshots (
    id SERIAL PRIMARY KEY,
    driver_name VARCHAR(255) NOT NULL,
    snapshot_date DATE NOT NULL,
    current_points INTEGER DEFAULT 100,
    points_deducted INTEGER DEFAULT 0,
    current_level VARCHAR(50) DEFAULT 'Gold',
    speed_violations INTEGER DEFAULT 0,
    harsh_braking_violations INTEGER DEFAULT 0,
    night_driving_violations INTEGER DEFAULT 0,
    route_violations INTEGER DEFAULT 0,
    other_violations INTEGER DEFAULT 0,
    total_violations INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint to prevent duplicate snapshots
    UNIQUE(driver_name, snapshot_date)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_snapshots_driver_date ON eps_daily_snapshots(driver_name, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON eps_daily_snapshots(snapshot_date);