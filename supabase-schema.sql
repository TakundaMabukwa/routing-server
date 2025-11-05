-- EPS Driver Rewards System - Supabase Schema
-- Run this in Supabase SQL Editor to create all required tables

-- 1. eps_driver_rewards (Main Points Table)
CREATE TABLE eps_driver_rewards (
    id BIGSERIAL PRIMARY KEY,
    plate VARCHAR(20),
    driver_name VARCHAR(255) NOT NULL UNIQUE,
    reward_type VARCHAR(50) DEFAULT 'performance',
    points INTEGER DEFAULT 0,
    description TEXT,
    timestamp TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    current_level VARCHAR(20) DEFAULT 'Gold',
    violations_count INTEGER DEFAULT 0,
    last_updated TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    total_points INTEGER DEFAULT 0,
    total_risk_score NUMERIC(10,4) DEFAULT 0.0,
    current_points INTEGER DEFAULT 100,
    points_deducted INTEGER DEFAULT 0,
    speed_violations_count INTEGER DEFAULT 0,
    harsh_braking_count INTEGER DEFAULT 0,
    night_driving_count INTEGER DEFAULT 0,
    route_violations_count INTEGER DEFAULT 0,
    other_violations_count INTEGER DEFAULT 0,
    speed_threshold_exceeded BOOLEAN DEFAULT false,
    braking_threshold_exceeded BOOLEAN DEFAULT false,
    night_threshold_exceeded BOOLEAN DEFAULT false,
    route_threshold_exceeded BOOLEAN DEFAULT false,
    other_threshold_exceeded BOOLEAN DEFAULT false
);

-- 2. eps_driver_violations (Individual Violations)
CREATE TABLE eps_driver_violations (
    id BIGSERIAL PRIMARY KEY,
    plate VARCHAR(20) NOT NULL,
    driver_name VARCHAR(255) NOT NULL,
    violation_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    value VARCHAR(255),
    threshold VARCHAR(255),
    points INTEGER DEFAULT 0,
    timestamp TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. eps_daily_performance (Daily Summaries)
CREATE TABLE eps_daily_performance (
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
    total_updates_count INTEGER DEFAULT 1,
    last_update_time TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    total_risk_score NUMERIC(10,4) DEFAULT 0.0,
    risk_level VARCHAR(20) DEFAULT 'Gold',
    UNIQUE(driver_name, date)
);

-- 4. eps_daily_stats (Driving Hours & Distance)
CREATE TABLE eps_daily_stats (
    id BIGSERIAL PRIMARY KEY,
    plate VARCHAR(20) NOT NULL,
    driver_name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    total_distance INTEGER DEFAULT 0,
    total_violations INTEGER DEFAULT 0,
    total_points INTEGER DEFAULT 0,
    speed_violations INTEGER DEFAULT 0,
    route_violations INTEGER DEFAULT 0,
    night_driving_violations INTEGER DEFAULT 0,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    daily_distance INTEGER DEFAULT 0,
    first_drive_time TIMESTAMP WITHOUT TIME ZONE,
    last_drive_time TIMESTAMP WITHOUT TIME ZONE,
    total_driving_hours NUMERIC(5,2) DEFAULT 0.0,
    day_driving_hours NUMERIC(5,2) DEFAULT 0.0,
    night_driving_hours NUMERIC(5,2) DEFAULT 0.0,
    total_risk_score NUMERIC(10,4) DEFAULT 0.0,
    engine_on_time TIMESTAMP WITHOUT TIME ZONE,
    engine_off_time TIMESTAMP WITHOUT TIME ZONE,
    UNIQUE(driver_name, date)
);

-- 5. eps_daily_violations (Daily Violation Summaries)
CREATE TABLE eps_daily_violations (
    id BIGSERIAL PRIMARY KEY,
    plate VARCHAR(20) NOT NULL,
    driver_name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    speeding_count INTEGER DEFAULT 0,
    harsh_braking_count INTEGER DEFAULT 0,
    excessive_day_count INTEGER DEFAULT 0,
    excessive_night_count INTEGER DEFAULT 0,
    route_deviation_count INTEGER DEFAULT 0,
    total_violations INTEGER DEFAULT 0,
    total_penalty_points INTEGER DEFAULT 0,
    last_violation_time TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(driver_name, date)
);

-- 6. eps_vehicles (Vehicle Status)
CREATE TABLE eps_vehicles (
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
    name_event VARCHAR(255),
    statuses TEXT,
    fuel_level NUMERIC(5,2) DEFAULT 0,
    fuel_volume NUMERIC(8,2) DEFAULT 0,
    fuel_temperature NUMERIC(5,2) DEFAULT 0,
    fuel_percentage NUMERIC(5,2) DEFAULT 0,
    engine_status VARCHAR(50) DEFAULT 'OFF',
    activity_duration INTEGER DEFAULT 0,
    last_activity_time TIMESTAMP WITHOUT TIME ZONE,
    status_changed_time TIMESTAMP WITHOUT TIME ZONE,
    theft_flag BOOLEAN DEFAULT false,
    theft_detected_time TIMESTAMP WITHOUT TIME ZONE,
    theft_amount NUMERIC(8,2) DEFAULT 0,
    fill_detected BOOLEAN DEFAULT false,
    fill_amount NUMERIC(8,2) DEFAULT 0,
    fill_time TIMESTAMP WITHOUT TIME ZONE,
    spillage_detected BOOLEAN DEFAULT false,
    spillage_amount NUMERIC(8,2) DEFAULT 0,
    spillage_time TIMESTAMP WITHOUT TIME ZONE,
    company VARCHAR(255) DEFAULT 'EPS Courier Services',
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. eps_fuel_data (Fuel Monitoring)
CREATE TABLE eps_fuel_data (
    id SERIAL PRIMARY KEY,
    plate VARCHAR(50) NOT NULL,
    driver_name VARCHAR(100),
    fuel_level NUMERIC(6,2),
    fuel_volume NUMERIC(8,2),
    fuel_temperature NUMERIC(6,2),
    fuel_percentage INTEGER,
    engine_status VARCHAR(20),
    loc_time TIMESTAMP WITHOUT TIME ZONE,
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. eps_biweekly_category_points (Biweekly Reports)
CREATE TABLE eps_biweekly_category_points (
    id BIGSERIAL PRIMARY KEY,
    driver_name VARCHAR(255) NOT NULL,
    plate VARCHAR(20) NOT NULL,
    haul_type VARCHAR(20) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    speed_compliance_cap INTEGER NOT NULL DEFAULT 0,
    harsh_braking_cap INTEGER NOT NULL DEFAULT 0,
    day_driving_cap INTEGER NOT NULL DEFAULT 0,
    night_driving_cap INTEGER NOT NULL DEFAULT 0,
    speed_compliance_earned INTEGER NOT NULL DEFAULT 0,
    harsh_braking_earned INTEGER NOT NULL DEFAULT 0,
    day_driving_earned INTEGER NOT NULL DEFAULT 0,
    night_driving_earned INTEGER NOT NULL DEFAULT 0,
    total_points_earned INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    speed_compliance_violations INTEGER DEFAULT 0,
    harsh_braking_violations INTEGER DEFAULT 0,
    day_driving_violations INTEGER DEFAULT 0,
    night_driving_violations INTEGER DEFAULT 0,
    kilometers_violations INTEGER DEFAULT 0,
    total_violations INTEGER DEFAULT 0,
    kilometers_cap DOUBLE PRECISION DEFAULT 20.0,
    kilometers_earned INTEGER DEFAULT 0,
    UNIQUE(driver_name, plate, period_start)
);

-- Create indexes for performance
CREATE INDEX idx_eps_daily_performance_date ON eps_daily_performance(date);
CREATE INDEX idx_eps_daily_performance_driver ON eps_daily_performance(driver_name);
CREATE INDEX idx_eps_daily_performance_plate_date ON eps_daily_performance(plate, date);

CREATE INDEX idx_eps_daily_violations_date ON eps_daily_violations(date);
CREATE INDEX idx_eps_daily_violations_driver ON eps_daily_violations(driver_name);
CREATE INDEX idx_eps_daily_violations_plate_date ON eps_daily_violations(plate, date);

CREATE INDEX idx_eps_daily_stats_time ON eps_daily_stats(first_drive_time, last_drive_time);

CREATE INDEX idx_eps_fuel_data_created_at ON eps_fuel_data(created_at);
CREATE INDEX idx_eps_fuel_data_driver_time ON eps_fuel_data(driver_name, loc_time);
CREATE INDEX idx_eps_fuel_data_plate_time ON eps_fuel_data(plate, loc_time);

CREATE INDEX idx_eps_biweekly_category_points_driver_name ON eps_biweekly_category_points(driver_name);

-- Insert initial driver data (160 drivers with 100 points each)
INSERT INTO eps_driver_rewards (driver_name, plate, current_points, current_level) VALUES
('SICELIMPILO WILFRED KHANYILE', 'JY54WJGP M', 100, 'Gold'),
('MTHUTHUZELI SAMUEL LEISA', 'HW22SNGP', 100, 'Gold'),
('ZAMOKWAKHE MAKHAZA', 'JK68DMGP M', 100, 'Gold'),
('JAN MKGAE', 'KB24WWGP', 100, 'Gold'),
('BUKHOSI KINGDOM NTOYI', 'HY74XFGP', 100, 'Gold'),
('BHEKABENGUNI SIMON KWESWA', 'JK68FMGP', 100, 'Gold'),
('KHAYELIHLE ANDILE ZULU', 'HW67VCGP M', 100, 'Gold'),
('MPUMZI PERE', 'HY87GHGP', 100, 'Gold'),
('IKAGENG MALEBANA', 'HS30WSGP', 100, 'Gold'),
('Vincent Mzikawukhule Mhlambo', 'MK88LKGP', 100, 'Gold'),
('LEBOHANG VINCENT THEDE', 'JL64ZGGP', 100, 'Gold'),
('Bongani Arson Nkuna', 'JV26SNGP', 100, 'Gold'),
('HLULANI WITNESS VUKEYA', 'HY87GLGP', 100, 'Gold'),
('NTLANTLA  MADANGALA', 'JF74XHGP M', 100, 'Gold'),
('Lesiba Kaizer Molele', 'HY87GWGP M', 100, 'Gold'),
('NCEDILE MQOLO', 'JK68DFGP', 100, 'Gold'),
('TSHINGELO CECIL MAKHUMISANE', 'KB24XHGP', 100, 'Gold'),
('Jabulani Amos Mahlangu', 'JY54XGGP', 100, 'Gold'),
('TANDISWE KWITSHANE', 'HW67VSGP', 100, 'Gold'),
('LULAMILE MBANGI', 'JY54WZGP', 100, 'Gold');

-- Insert corresponding vehicle records
INSERT INTO eps_vehicles (plate, driver_name, company) VALUES
('JY54WJGP M', 'SICELIMPILO WILFRED KHANYILE', 'EPS Courier Services'),
('HW22SNGP', 'MTHUTHUZELI SAMUEL LEISA', 'EPS Courier Services'),
('JK68DMGP M', 'ZAMOKWAKHE MAKHAZA', 'EPS Courier Services'),
('KB24WWGP', 'JAN MKGAE', 'EPS Courier Services'),
('HY74XFGP', 'BUKHOSI KINGDOM NTOYI', 'EPS Courier Services'),
('JK68FMGP', 'BHEKABENGUNI SIMON KWESWA', 'EPS Courier Services'),
('HW67VCGP M', 'KHAYELIHLE ANDILE ZULU', 'EPS Courier Services'),
('HY87GHGP', 'MPUMZI PERE', 'EPS Courier Services'),
('HS30WSGP', 'IKAGENG MALEBANA', 'EPS Courier Services'),
('MK88LKGP', 'Vincent Mzikawukhule Mhlambo', 'EPS Courier Services'),
('JL64ZGGP', 'LEBOHANG VINCENT THEDE', 'EPS Courier Services'),
('JV26SNGP', 'Bongani Arson Nkuna', 'EPS Courier Services'),
('HY87GLGP', 'HLULANI WITNESS VUKEYA', 'EPS Courier Services'),
('JF74XHGP M', 'NTLANTLA  MADANGALA', 'EPS Courier Services'),
('HY87GWGP M', 'Lesiba Kaizer Molele', 'EPS Courier Services'),
('JK68DFGP', 'NCEDILE MQOLO', 'EPS Courier Services'),
('KB24XHGP', 'TSHINGELO CECIL MAKHUMISANE', 'EPS Courier Services'),
('JY54XGGP', 'Jabulani Amos Mahlangu', 'EPS Courier Services'),
('HW67VSGP', 'TANDISWE KWITSHANE', 'EPS Courier Services'),
('JY54WZGP', 'LULAMILE MBANGI', 'EPS Courier Services');

-- Enable Row Level Security (optional)
-- ALTER TABLE eps_driver_rewards ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE eps_vehicles ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE eps_daily_performance ENABLE ROW LEVEL SECURITY;

-- Create policies (optional - for multi-tenant access)
-- CREATE POLICY "Enable read access for all users" ON eps_driver_rewards FOR SELECT USING (true);
-- CREATE POLICY "Enable insert for authenticated users only" ON eps_driver_rewards FOR INSERT WITH CHECK (auth.role() = 'authenticated');