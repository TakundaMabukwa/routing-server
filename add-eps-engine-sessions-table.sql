-- Engine session history for monthly kilometer reporting
-- Distance is derived from mileage deltas between engine ON and OFF.

CREATE TABLE IF NOT EXISTS eps_engine_sessions (
    id BIGSERIAL PRIMARY KEY,
    plate VARCHAR(50) NOT NULL,
    driver_name VARCHAR(255) NOT NULL,
    session_start_time TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    session_end_time TIMESTAMP WITHOUT TIME ZONE,
    start_mileage NUMERIC(12,2) NOT NULL,
    current_mileage NUMERIC(12,2) NOT NULL,
    end_mileage NUMERIC(12,2),
    distance_km NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_eps_engine_sessions_distance_non_negative CHECK (distance_km >= 0)
);

CREATE INDEX IF NOT EXISTS idx_eps_engine_sessions_driver_time
    ON eps_engine_sessions(driver_name, session_start_time);

CREATE INDEX IF NOT EXISTS idx_eps_engine_sessions_plate_time
    ON eps_engine_sessions(plate, session_start_time);

CREATE INDEX IF NOT EXISTS idx_eps_engine_sessions_open
    ON eps_engine_sessions(driver_name, plate)
    WHERE session_end_time IS NULL;
