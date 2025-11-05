# EPS Driver Rewards System - Supabase Migration Guide

## Overview
This document provides complete instructions for migrating the EPS Driver Rewards System from PostgreSQL to Supabase. The system tracks driver performance using a 100-point deduction model with violation thresholds.

## Migration Context
- **Source**: PostgreSQL Docker container (postgres-secure) on Digital Ocean
- **Target**: Supabase (PostgreSQL-compatible cloud database)
- **Database**: vehicles
- **Total Drivers**: ~160 active drivers
- **System**: 100-point deduction model with 4-violation thresholds

## Database Schema

### 1. eps_driver_rewards (Main Points Table)
**Primary table for tracking driver points and violations**

```sql
CREATE TABLE eps_driver_rewards (
    id BIGSERIAL PRIMARY KEY,
    plate VARCHAR(20) NOT NULL,
    driver_name VARCHAR(255) NOT NULL,
    reward_type VARCHAR(50) DEFAULT 'performance',
    points INTEGER DEFAULT 0,
    description TEXT,
    timestamp TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    current_level VARCHAR(20) DEFAULT 'Rookie',
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
    other_threshold_exceeded BOOLEAN DEFAULT false,
    UNIQUE(driver_name),
    UNIQUE(plate)
);
```

### 2. eps_driver_violations (Individual Violations)
```sql
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
```

### 3. eps_daily_performance (Daily Summaries)
```sql
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
    reward_level VARCHAR(20) DEFAULT 'Rookie',
    total_updates_count INTEGER DEFAULT 1,
    last_update_time TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    total_risk_score NUMERIC(10,4) DEFAULT 0.0,
    risk_level VARCHAR(20) DEFAULT 'Bronze',
    UNIQUE(driver_name, date)
);
```

### 4. eps_daily_stats (Driving Hours & Distance)
```sql
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
```

### 5. eps_daily_violations (Daily Violation Summaries)
```sql
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
```

### 6. eps_driver_performance (Real-time Tracking)
```sql
CREATE TABLE eps_driver_performance (
    id BIGSERIAL PRIMARY KEY,
    plate VARCHAR(20) NOT NULL,
    driver_name VARCHAR(255) NOT NULL,
    speed INTEGER DEFAULT 0,
    latitude NUMERIC(10,6),
    longitude NUMERIC(10,6),
    loc_time TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    mileage INTEGER DEFAULT 0,
    geozone VARCHAR(255),
    address TEXT,
    speed_compliance BOOLEAN DEFAULT true,
    route_compliance BOOLEAN DEFAULT true,
    time_compliance BOOLEAN DEFAULT true,
    efficiency NUMERIC(5,4) DEFAULT 0.0,
    safety_score NUMERIC(5,4) DEFAULT 1.0,
    total_points INTEGER DEFAULT 0,
    reward_level VARCHAR(20) DEFAULT 'Rookie',
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    total_risk_score NUMERIC(10,4) DEFAULT 0.0,
    risk_level VARCHAR(20) DEFAULT 'Bronze',
    latest_speed INTEGER DEFAULT 0,
    latest_latitude NUMERIC(10,6),
    latest_longitude NUMERIC(10,6),
    latest_loc_time TIMESTAMP WITHOUT TIME ZONE,
    latest_mileage INTEGER DEFAULT 0,
    latest_geozone VARCHAR(255),
    latest_address TEXT,
    total_updates_count INTEGER DEFAULT 0,
    last_update_time TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 7. eps_biweekly_category_points (Biweekly Reports)
```sql
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
```

### 8. eps_fuel_data (Fuel Monitoring)
```sql
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
```

### 9. eps_vehicles (Vehicle Status)
```sql
CREATE TABLE eps_vehicles (
    id SERIAL PRIMARY KEY,
    plate VARCHAR(50) NOT NULL,
    driver_name VARCHAR(255),
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
    company VARCHAR(255) DEFAULT 'EPS Courier Services'
);
```

## Current Driver List (160 Drivers)
All drivers currently have 100 points (no deductions yet):

```
SICELIMPILO WILFRED KHANYILE | JY54WJGP M
MTHUTHUZELI SAMUEL LEISA     | HW22SNGP
ZAMOKWAKHE MAKHAZA           | JK68DMGP M
JAN MKGAE                    | KB24WWGP
BUKHOSI KINGDOM NTOYI        | HY74XFGP
BHEKABENGUNI SIMON KWESWA    | JK68FMGP
KHAYELIHLE ANDILE ZULU       | HW67VCGP M
MPUMZI PERE                  | HY87GHGP
IKAGENG MALEBANA             | HS30WSGP
Vincent Mzikawukhule Mhlambo | MK88LKGP
LEBOHANG VINCENT THEDE       | JL64ZGGP
Bongani Arson Nkuna          | JV26SNGP
HLULANI WITNESS VUKEYA       | HY87GLGP
NTLANTLA  MADANGALA          | JF74XHGP M
Lesiba Kaizer Molele         | HY87GWGP M
NCEDILE MQOLO                | JK68DFGP
TSHINGELO CECIL MAKHUMISANE  | KB24XHGP
Jabulani Amos Mahlangu       | JY54XGGP
TANDISWE KWITSHANE           | HW67VSGP
LULAMILE MBANGI              | JY54WZGP
Nchapa Petrus Ntsilo         | HY40DZGP
MAFEMANI CHESTER  MATHYE     | JX63GBGP
Motlokoe Simon Matshela      | JR30TKGP M
Velaphi Jagi Themba Gazu     | JL64YJGP
REUBEN LINDA ZWANE           | JX63CJGP
JOSIA OUPA  MOTAUNG          | JV26ZJGP M
KHANGLELANI MOSES LEHANA     | JF74YXGP M
SKHUMBUZO PANUEL MHLANGA     | HY40CGGP M
SPARE CODE SPARE CODE        | JM27KHGP
Sihle Innocent Hlophe        | FF63JRGP
MOSHE THEBE                  | KD05WCGP
khethukuthula Godfer Xulu    | KF84HXGP
ANDRIES HABOFANOE LESAWANA   | JT07LVGP
BANNANA MAKULOBISHI MAKUA    | KF84NVGP
Mduduzi Samson MTSHALI       | KB24WYGP
MARK BUYS                    | KY69YHGP
SBONGISENI  KOLWANA          | KF84HMGP
Thobile Meva                 | WLD641GP M
Philemon Sizakele Ndabelanga | HY74WDGP
andile mabece                | JR30TFGP
Bhefika Ernest Tembe         | JV26XMGP
THABANG MOKOENA              | HY74WLGP
AMOS NTSAKO MSIMEKI          | HY74XJGP
SAMUEL SAM NHLAPHO           | FF63MKGP M
Adore Lungile Ngoma          | MK88MPGP
MDUDUZI ERIC NZALA           | HW22SFGP
Bhekumndeni Xolani Buthelez  | JX63CSGP
TSWALENDI PRINCE MASHABELA   | KB24WLGP
Thulani Alex Dlamini         | MK88LTGP
LINDEN JOUESTON FRANSE       | HS30YYGP
msanenkosi musa mbatha       | WCX045GP
LUZUKO NTSVAM                | JF74XDGP
NHLANHLA NGUBO               | JL65CPGP
LESANG BERNARD MACHABA       | JV26PXGP
DANIEL GOVUZA                | JR30SXGP
SBONISO NGCONGO              | JL65HNGP
Madida Paulos Zwane          | JY54XJGP
THULANI SIZWE GUMEDE         | MK88PSGP
Solomon Bunu                 | KG32NTGP
SIBUSISO SAMUAL RADEBE       | JF74XGGP M
SITHEMBISO SOKHELA           | KY69YCGP
Christopher Ivor Brown       | LZ23HTGP
Sonwabile Maqolo             | JR30SZGP
Muziwakite Eewart Mbatha     | JF74YJGP
THAMSANQA RONALD MCHUNU      | KG32NLGP
Maphadime Charles Tsebetsebe | JV34JJGP M
NKOSINATHI THIWANI           | HS30XGGP
MOEKETSI JOHANNES MZANGWA    | JR30VBGP
Nkosinathi Zulu              | KY69YNGP
Tobela Mbekeli               | JY54VNGP
MSEKELI BUXEKA               | KB24XFGP
ODWA GIJANA                  | FF63JDGP
Lungisani Penuel Mkwanazi    | HY87GPGP
Thabo Algrin Sithole         | FF63KMGP
AVHATAKALI RAMANDZHANZHA     | MK88MLGP
NJABULO PATRICK MJOLI        | FF63HJGP
```

## How the System Works

### 100-Point Deduction Model
1. **Starting Points**: Every driver starts with 100 points
2. **Violation Thresholds**: 4 violations allowed before point deduction begins
3. **Point Deduction**: After 4th violation, points are deducted per additional violation
4. **Performance Levels**: Gold (90-100), Silver (70-89), Bronze (50-69), Critical (<50)

### Violation Types
- **Speed Violations**: Exceeding speed limits
- **Harsh Braking**: Sudden braking events
- **Night Driving**: Excessive night driving hours
- **Route Violations**: Deviating from assigned routes
- **Other Violations**: Miscellaneous infractions

### Data Flow
1. **Real-time Data**: TCP feed updates `eps_driver_performance`
2. **Daily Aggregation**: Data summarized in `eps_daily_*` tables
3. **Violation Processing**: Individual violations logged in `eps_driver_violations`
4. **Point Calculation**: Points updated in `eps_driver_rewards`
5. **Biweekly Reports**: Performance summaries in `eps_biweekly_category_points`

## Migration Steps

### 1. Export Current Data
```bash
# Export all table schemas
docker exec postgres-secure pg_dump -U postgres -d vehicles --schema-only -t eps_biweekly_category_points -t eps_daily_performance -t eps_daily_stats -t eps_daily_violations -t eps_driver_performance -t eps_driver_rewards -t eps_driver_violations -t eps_fuel_data -t eps_vehicles

# Export all data as INSERT statements
docker exec postgres-secure pg_dump -U postgres -d vehicles --data-only --inserts -t eps_biweekly_category_points -t eps_daily_performance -t eps_daily_stats -t eps_daily_violations -t eps_driver_performance -t eps_driver_rewards -t eps_driver_violations -t eps_fuel_data -t eps_vehicles
```

### 2. Supabase Setup
1. Create new Supabase project
2. Run table creation scripts in Supabase SQL editor
3. Import data using INSERT statements
4. Create indexes for performance
5. Set up Row Level Security (RLS) if needed

### 3. Application Changes
1. Update database connection from PostgreSQL to Supabase
2. Replace connection string in `config/postgres.js`
3. Update environment variables
4. Test all API endpoints

### 4. Required Indexes
```sql
-- Performance indexes
CREATE INDEX idx_eps_daily_performance_date ON eps_daily_performance(date);
CREATE INDEX idx_eps_daily_performance_driver ON eps_daily_performance(driver_name);
CREATE INDEX idx_eps_daily_performance_plate_date ON eps_daily_performance(plate, date);

-- Violations indexes
CREATE INDEX idx_eps_daily_violations_date ON eps_daily_violations(date);
CREATE INDEX idx_eps_daily_violations_driver ON eps_daily_violations(driver_name);
CREATE INDEX idx_eps_daily_violations_plate_date ON eps_daily_violations(plate, date);

-- Stats indexes
CREATE INDEX idx_eps_daily_stats_time ON eps_daily_stats(first_drive_time, last_drive_time);

-- Fuel data indexes
CREATE INDEX idx_eps_fuel_data_created_at ON eps_fuel_data(created_at);
CREATE INDEX idx_eps_fuel_data_driver_time ON eps_fuel_data(driver_name, loc_time);
CREATE INDEX idx_eps_fuel_data_plate_time ON eps_fuel_data(plate, loc_time);

-- Biweekly points indexes
CREATE INDEX idx_eps_biweekly_category_points_driver_name ON eps_biweekly_category_points(driver_name);
```

## API Endpoints
The system provides comprehensive REST API endpoints:

- `/api/eps-rewards/test` - Database connection test
- `/api/eps-rewards/performance` - Daily performance summaries
- `/api/eps-rewards/violations` - Violation records
- `/api/eps-rewards/daily-stats` - Driving statistics
- `/api/eps-rewards/rewards` - Driver reward points
- `/api/eps-rewards/reports/vehicle-behavior` - Performance reports

## Benefits of Supabase Migration
1. **Managed Service**: No server maintenance required
2. **Real-time Features**: Built-in real-time subscriptions
3. **Auto-scaling**: Handles traffic spikes automatically
4. **Backup & Recovery**: Automated backups
5. **Security**: Built-in authentication and RLS
6. **API Generation**: Auto-generated REST and GraphQL APIs
7. **Dashboard**: Web-based database management

## Post-Migration Verification
1. Verify all 160 drivers imported correctly
2. Test violation processing logic
3. Confirm point deduction calculations
4. Validate API endpoint responses
5. Check real-time data updates
6. Test biweekly report generation

## Support Files
- `services/eps-reward-system.js` - Core business logic
- `routes/eps-rewards.js` - API endpoints
- `EPS_REWARD_SYSTEM_README.md` - Detailed system documentation

This migration maintains full compatibility with the existing EPS Driver Rewards System while providing enhanced scalability and management capabilities through Supabase.