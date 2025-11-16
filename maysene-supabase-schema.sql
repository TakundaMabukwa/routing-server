-- Maysene Driver Rewards System - Supabase Schema
-- Run this in Maysene Supabase SQL Editor (https://jbactgkcijnkjpyqqzxv.supabase.co)
-- Uses same table names as EPS for consistency

-- 1. eps_driver_rewards (Main Points Table)
CREATE TABLE IF NOT EXISTS eps_driver_rewards (
    id BIGSERIAL PRIMARY KEY,
    plate VARCHAR(20),
    driver_name VARCHAR(255) NOT NULL UNIQUE,
    current_points INTEGER DEFAULT 100,
    points_deducted INTEGER DEFAULT 0,
    current_level VARCHAR(20) DEFAULT 'Gold',
    speed_violations_count INTEGER DEFAULT 0,
    harsh_braking_count INTEGER DEFAULT 0,
    night_driving_count INTEGER DEFAULT 0,
    route_violations_count INTEGER DEFAULT 0,
    other_violations_count INTEGER DEFAULT 0,
    speed_threshold_exceeded BOOLEAN DEFAULT false,
    braking_threshold_exceeded BOOLEAN DEFAULT false,
    night_threshold_exceeded BOOLEAN DEFAULT false,
    route_threshold_exceeded BOOLEAN DEFAULT false,
    other_threshold_exceeded BOOLEAN DEFAULT false,
    last_updated TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. eps_daily_performance (Daily Summaries)
CREATE TABLE IF NOT EXISTS eps_daily_performance (
    id BIGSERIAL PRIMARY KEY,
    plate VARCHAR(20) NOT NULL,
    driver_name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    latest_speed INTEGER DEFAULT 0,
    latest_latitude NUMERIC(10,6),
    latest_longitude NUMERIC(10,6),
    latest_loc_time TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    latest_mileage INTEGER DEFAULT 0,
    latest_geozone VARCHAR(255),
    latest_address TEXT,
    speed_compliance BOOLEAN DEFAULT true,
    route_compliance BOOLEAN DEFAULT true,
    time_compliance BOOLEAN DEFAULT true,
    efficiency NUMERIC(5,4) DEFAULT 0.0,
    safety_score NUMERIC(5,4) DEFAULT 1.0,
    total_points INTEGER DEFAULT 0,
    reward_level VARCHAR(20) DEFAULT 'Gold',
    risk_level VARCHAR(20) DEFAULT 'Gold',
    last_update_time TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(driver_name, date)
);

-- 3. eps_daily_violations (Daily Violation Summaries)
CREATE TABLE IF NOT EXISTS eps_daily_violations (
    id BIGSERIAL PRIMARY KEY,
    plate VARCHAR(20) NOT NULL,
    driver_name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    speeding_count INTEGER DEFAULT 0,
    harsh_braking_count INTEGER DEFAULT 0,
    excessive_night_count INTEGER DEFAULT 0,
    route_deviation_count INTEGER DEFAULT 0,
    total_violations INTEGER DEFAULT 0,
    last_violation_time TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(driver_name, date)
);

-- 4. eps_vehicles (Vehicle Status)
CREATE TABLE IF NOT EXISTS eps_vehicles (
    id SERIAL PRIMARY KEY,
    plate VARCHAR(50) NOT NULL,
    driver_name VARCHAR(255) UNIQUE,
    speed NUMERIC(5,2) DEFAULT 0,
    latitude NUMERIC(10,8),
    longitude NUMERIC(11,8),
    loc_time TIMESTAMP WITHOUT TIME ZONE,
    mileage NUMERIC(10,2) DEFAULT 0,
    geozone TEXT,
    address TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_eps_daily_performance_date ON eps_daily_performance(date);
CREATE INDEX IF NOT EXISTS idx_eps_daily_performance_driver ON eps_daily_performance(driver_name);
CREATE INDEX IF NOT EXISTS idx_eps_daily_violations_date ON eps_daily_violations(date);
CREATE INDEX IF NOT EXISTS idx_eps_daily_violations_driver ON eps_daily_violations(driver_name);
