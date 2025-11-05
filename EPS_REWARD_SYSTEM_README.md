# EPS Driver Rewards System - Technical Documentation

## Overview
The EPS Driver Rewards System is a real-time driver performance monitoring and scoring system that processes TCP vehicle tracking data to calculate driver rewards based on safety, compliance, and efficiency metrics.

## System Architecture

### Core Components
1. **TCP Data Processor** (`routes/eps.js`) - Receives and processes real-time vehicle data
2. **Reward Engine** (`services/eps-reward-system.js`) - Calculates scores and violations
3. **API Layer** (`routes/eps-rewards.js`) - Provides REST endpoints for data access

### Data Flow
```
TCP Vehicle Data → Parser → Reward Engine → Database → API Endpoints
```

## Scoring System

### Point-Based System (100-Point Deduction Model)
- **Starting Points**: 100 points per driver
- **Violation Thresholds**: 4 violations before point deduction begins
- **Deduction Rate**: 1 point per violation after threshold exceeded
- **Performance Levels**: Gold (80-100), Silver (60-79), Bronze (40-59), Critical (0-39)

### Violation Types & Thresholds
```javascript
VIOLATION_THRESHOLDS = {
  SPEED: 4,           // Speed > 120 km/h
  HARSH_BRAKING: 4,   // Harsh braking events
  NIGHT_DRIVING: 4,   // Driving 10 PM - 6 AM
  ROUTE: 4,           // Off assigned route
  OTHER: 4            // Other violations
}
```

## Database Schema

### Core Tables

#### 1. eps_vehicles
```sql
CREATE TABLE eps_vehicles (
  id SERIAL PRIMARY KEY,
  plate VARCHAR(20),
  driver_name VARCHAR(100),
  speed INTEGER,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  loc_time TIMESTAMP,
  mileage INTEGER,
  geozone TEXT,
  address TEXT,
  name_event TEXT,
  statuses TEXT,
  fuel_level DECIMAL(8,2),
  fuel_volume DECIMAL(8,2),
  fuel_temperature DECIMAL(5,2),
  fuel_percentage INTEGER,
  engine_status VARCHAR(20),
  last_activity_time TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 2. eps_driver_rewards
```sql
CREATE TABLE eps_driver_rewards (
  id SERIAL PRIMARY KEY,
  driver_name VARCHAR(100) UNIQUE,
  plate VARCHAR(20),
  current_points INTEGER DEFAULT 100,
  points_deducted INTEGER DEFAULT 0,
  current_level VARCHAR(20) DEFAULT 'Gold',
  speed_violations_count INTEGER DEFAULT 0,
  harsh_braking_count INTEGER DEFAULT 0,
  night_driving_count INTEGER DEFAULT 0,
  route_violations_count INTEGER DEFAULT 0,
  other_violations_count INTEGER DEFAULT 0,
  speed_threshold_exceeded BOOLEAN DEFAULT FALSE,
  braking_threshold_exceeded BOOLEAN DEFAULT FALSE,
  night_threshold_exceeded BOOLEAN DEFAULT FALSE,
  route_threshold_exceeded BOOLEAN DEFAULT FALSE,
  other_threshold_exceeded BOOLEAN DEFAULT FALSE,
  total_risk_score INTEGER DEFAULT 0,
  violations_count INTEGER DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 3. eps_daily_performance
```sql
CREATE TABLE eps_daily_performance (
  id SERIAL PRIMARY KEY,
  plate VARCHAR(20),
  driver_name VARCHAR(100),
  date DATE,
  latest_speed INTEGER,
  latest_latitude DECIMAL(10,8),
  latest_longitude DECIMAL(11,8),
  latest_loc_time TIMESTAMP,
  latest_mileage INTEGER,
  latest_geozone TEXT,
  latest_address TEXT,
  speed_compliance BOOLEAN,
  route_compliance BOOLEAN,
  time_compliance BOOLEAN,
  efficiency DECIMAL(5,4),
  safety_score DECIMAL(5,4),
  total_risk_score INTEGER,
  risk_level VARCHAR(20),
  total_updates_count INTEGER DEFAULT 1,
  last_update_time TIMESTAMP,
  UNIQUE(driver_name, date)
);
```

#### 4. eps_daily_violations
```sql
CREATE TABLE eps_daily_violations (
  id SERIAL PRIMARY KEY,
  plate VARCHAR(20),
  driver_name VARCHAR(100),
  date DATE,
  speeding_count INTEGER DEFAULT 0,
  harsh_braking_count INTEGER DEFAULT 0,
  excessive_day_count INTEGER DEFAULT 0,
  excessive_night_count INTEGER DEFAULT 0,
  route_deviation_count INTEGER DEFAULT 0,
  total_violations INTEGER DEFAULT 0,
  total_penalty_points INTEGER DEFAULT 0,
  last_violation_time TIMESTAMP,
  UNIQUE(driver_name, date)
);
```

#### 5. eps_daily_stats
```sql
CREATE TABLE eps_daily_stats (
  id SERIAL PRIMARY KEY,
  plate VARCHAR(20),
  driver_name VARCHAR(100),
  date DATE,
  total_distance INTEGER DEFAULT 0,
  total_violations INTEGER DEFAULT 0,
  total_risk_score INTEGER DEFAULT 0,
  speed_violations INTEGER DEFAULT 0,
  route_violations INTEGER DEFAULT 0,
  night_driving_violations INTEGER DEFAULT 0,
  first_drive_time TIMESTAMP,
  last_drive_time TIMESTAMP,
  total_driving_hours DECIMAL(5,2) DEFAULT 0,
  day_driving_hours DECIMAL(5,2) DEFAULT 0,
  night_driving_hours DECIMAL(5,2) DEFAULT 0,
  engine_on_time TIMESTAMP,
  engine_off_time TIMESTAMP,
  UNIQUE(driver_name, date)
);
```

#### 6. eps_fuel_data
```sql
CREATE TABLE eps_fuel_data (
  id SERIAL PRIMARY KEY,
  plate VARCHAR(20),
  driver_name VARCHAR(100),
  fuel_level DECIMAL(8,2),
  fuel_volume DECIMAL(8,2),
  fuel_temperature DECIMAL(5,2),
  fuel_percentage INTEGER,
  engine_status VARCHAR(20),
  loc_time TIMESTAMP,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Key Business Logic

### 1. Violation Processing
```javascript
// Process violation and deduct points after threshold
async processViolation(driverName, plate, violationType) {
  // Get current violation count
  const currentCount = (driver[violationField] || 0) + 1;
  const threshold = this.VIOLATION_THRESHOLDS[violationType];
  
  // Deduct point only after threshold exceeded
  if (currentCount > threshold) {
    pointsDeducted = this.POINTS_PER_VIOLATION;
    thresholdExceeded = true;
  }
  
  // Update driver record
  const newPoints = Math.max(0, (driver.current_points || 100) - pointsDeducted);
  const newLevel = this.calculateLevel(newPoints);
}
```

### 2. Driving Detection
```javascript
isVehicleDriving(epsData) {
  // Check for explicit stationary indicators
  if (nameEvent.includes('IGNITION OFF') || 
      nameEvent.includes('ENGINE OFF') || 
      nameEvent.includes('STATIONARY')) {
    return false;
  }
  
  // Vehicle is driving if speed > 5 OR has driving indicators
  return hasSpeed || hasDrivingNameEvent || hasDrivingStatuses;
}
```

### 3. Performance Calculation
```javascript
calculatePerformance(epsData) {
  return {
    speedCompliance: Boolean(epsData.Speed <= 80),
    routeCompliance: Boolean(this.isOnAssignedRoute(epsData.Plate, epsData.Geozone)),
    timeCompliance: Boolean(this.isWithinWorkingHours(epsData.LocTime)),
    efficiency: this.calculateEfficiency(epsData),
    safetyScore: this.calculateSafetyScore(epsData)
  };
}
```

## API Endpoints

### Core Data Access
- `GET /api/eps-rewards/rewards` - All driver rewards
- `GET /api/eps-rewards/rewards/driver/:driverName` - Driver-specific rewards
- `GET /api/eps-rewards/performance` - Daily performance summaries
- `GET /api/eps-rewards/violations` - Violation records
- `GET /api/eps-rewards/daily-stats` - Daily statistics with driving hours

### Reports
- `GET /api/eps-rewards/driver-performance/:driverName` - Vehicle behavior report
- `GET /api/eps-rewards/fleet-performance` - Fleet-wide performance
- `GET /api/eps-rewards/leaderboard` - Driver rankings
- `GET /api/eps-rewards/executive-dashboard` - Executive summary

### Specialized
- `GET /api/eps-rewards/bi-weekly-categories` - Haul category analysis
- `GET /api/eps-rewards/penalty-cap/:driverName` - Penalty calculations
- `GET /api/eps-rewards/driver-risk-assessment` - Risk scoring

## TCP Data Processing

### Input Data Format
```javascript
{
  Plate: "ABC123",
  Speed: 65,
  Latitude: -26.2041,
  Longitude: 28.0473,
  LocTime: "2024/01/15 14:30:00",
  Mileage: 12500,
  DriverName: "John Smith",
  Geozone: "Depot Area",
  NameEvent: "VEHICLE IN MOTION",
  Statuses: "ENGINE ON",
  fuel_level: 45.5,
  fuel_percentage: 75
}
```

### Processing Steps
1. **Parse TCP Data** - Extract vehicle information
2. **Validate Driving Status** - Determine if vehicle is actually moving
3. **Process Violations** - Check speed, route, time compliance
4. **Calculate Performance** - Efficiency and safety metrics
5. **Update Database** - Store daily summaries and violations
6. **Broadcast WebSocket** - Real-time updates

## Monthly Reset System
```javascript
// Reset all drivers to 100 points monthly
async resetAllDriverPoints() {
  await pgPool.query(`
    UPDATE eps_driver_rewards 
    SET current_points = 100,
        points_deducted = 0,
        speed_violations_count = 0,
        harsh_braking_count = 0,
        night_driving_count = 0,
        route_violations_count = 0,
        other_violations_count = 0,
        current_level = 'Gold'
  `);
}
```

## Environment Configuration
```env
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=vehicles
PG_USER=app_user
PG_PASSWORD=12345
EPSPORT=9002
EPS_HTTP_PORT=8002
```

## Integration Points

### WebSocket Broadcasting
- **Endpoint**: `ws://localhost:8002`
- **Data**: Real-time parsed TCP data
- **Format**: JSON vehicle tracking data

### Database Triggers
- **UPSERT Operations**: Daily performance, violations, stats
- **Conflict Resolution**: ON CONFLICT DO UPDATE for daily records
- **Timestamps**: Automatic created_at/updated_at tracking

## Performance Considerations

### Optimization Strategies
1. **UPSERT Pattern** - Single query for insert/update operations
2. **Daily Aggregation** - Summarize data by day to reduce query load
3. **Indexed Queries** - Primary keys on driver_name, date combinations
4. **Batch Processing** - Process multiple violations in single transaction

### Scaling Notes
- System processes real-time TCP data streams
- Database designed for high-frequency updates
- API endpoints optimized for dashboard queries
- WebSocket broadcasting for real-time monitoring

## Migration to Supabase

### Required Changes
1. **Replace PostgreSQL Pool** with Supabase client
2. **Update Connection String** to Supabase URL
3. **Implement Row Level Security** policies
4. **Add Real-time Subscriptions** for live updates
5. **Configure Edge Functions** for TCP processing if needed

### Supabase-Specific Features
- **Real-time Subscriptions** - Replace WebSocket broadcasting
- **Row Level Security** - Secure driver data access
- **Edge Functions** - Process TCP data at edge locations
- **Auto-generated APIs** - Reduce custom endpoint code

This system provides comprehensive driver monitoring with real-time processing, violation tracking, and performance analytics suitable for fleet management operations.