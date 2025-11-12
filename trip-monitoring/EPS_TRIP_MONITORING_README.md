# EPS Trip Monitoring System

## Overview
The EPS Trip Monitoring System provides real-time GPS tracking and automated compliance monitoring for delivery trips. It integrates with vehicle tracking data to ensure drivers follow authorized routes, take required breaks, and complete deliveries efficiently.

## How It Works

### 1. **Real-Time GPS Tracking**
- Monitors GPS coordinates from `eps_vehicles` table every 5 minutes
- Matches driver names between TCP feed and trip assignments
- Stores route points in `trips.route_points` JSON array
- Updates current location, speed, and mileage in real-time

### 2. **Driver-Trip Matching**
```
TCP Feed (eps_vehicles) → Driver Name → Match → Trip Assignment (Supabase)
```
- Queries active trips from Supabase `trips` table
- Extracts driver names from `vehicleassignments.drivers` array
- Cross-references with `drivers` table using surname matching
- Fuzzy name matching handles variations in driver names

### 3. **Automated Monitoring**
- **Unauthorized Stops**: Detects 5+ minute stops outside authorized zones
- **Break Compliance**: Monitors 2-hour driving intervals, requires 15-minute breaks
- **Route Adherence**: Uses polygon geofencing for authorized stop points
- **Trip Timing**: Tracks actual start/end times vs. scheduled times

## What It Achieves

### **Compliance Monitoring**
- ✅ **Unauthorized Stop Detection**: Prevents drivers from making unscheduled stops
- ✅ **Break Enforcement**: Ensures drivers take mandatory rest periods
- ✅ **Route Compliance**: Verifies drivers stay within authorized delivery zones
- ✅ **Time Tracking**: Monitors trip duration and punctuality

### **Operational Insights**
- 📊 **Real-Time Location**: Live GPS tracking of all active deliveries
- 📊 **Distance Calculation**: Automatic mileage tracking (start to end)
- 📊 **Speed Monitoring**: Tracks vehicle speed throughout journey
- 📊 **Route History**: Complete GPS trail stored for each trip

### **Alert System**
- 🚨 **Unauthorized Stops**: Flags stops outside approved locations
- 🚨 **Break Violations**: Alerts when drivers exceed 2-hour driving limit
- 🚨 **Late Acceptance**: Notifies when trips aren't accepted within 5 minutes
- 🚨 **Late Arrival**: Alerts when drivers don't reach loading location within 30 minutes

## Database Architecture

### **Supabase Tables**
- **`trips`**: Main trip data with route_points, alerts, and status
- **`stop_points`**: Authorized locations with polygon coordinates
- **`drivers`**: Driver information for name matching

### **PostgreSQL Tables**
- **`eps_vehicles`**: Real-time GPS data from vehicle tracking system

## Key Features

### **Polygon Geofencing**
- Uses coordinate strings to define authorized stop zones
- Ray-casting algorithm determines if GPS point is inside polygon
- Supports complex shapes and multiple authorized locations per trip

### **Break Management**
- Tracks continuous driving time from trip start or last break
- Detects stationary periods (speed < 5 km/h) as potential breaks
- Requires minimum 15-minute break duration to reset 2-hour timer
- Logs all breaks with timestamps and GPS coordinates

### **Route Point Storage**
```json
{
  "lat": -26.232723,
  "lng": 28.141508,
  "speed": 45,
  "timestamp": 1703123456,
  "datetime": "2023-12-21T10:30:56Z"
}
```

### **Real-Time Subscriptions**
- Supabase real-time listeners for new trips and status changes
- Automatic cache updates when trips are created or completed
- Memory cleanup for completed trips to prevent memory leaks

## Active Components

### **EPSTripTracker** (Primary Service)
- **File**: `services/eps-trip-tracker.js`
- **Function**: Real-time GPS monitoring and compliance checking
- **Frequency**: Every 5 minutes
- **Status**: ✅ Active (started in routes/eps.js)

### **EPSRewardSystem** (Database Connection)
- **File**: `services/eps-reward-system.js`
- **Function**: PostgreSQL connection for eps_vehicles queries
- **Status**: ✅ Active (used by trip tracker)

### **Trip Management API** (Optional)
- **File**: `routes/eps-trips.js`
- **Function**: REST API for trip management
- **Status**: ❌ Not mounted (available but unused)

## Environment Variables Required

```env
# Supabase Configuration
NEXT_PUBLIC_EPS_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY=your_supabase_key

# PostgreSQL Configuration
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=vehicles
PG_USER=app_user
PG_PASSWORD=your_password

# Optional: Mapbox for geocoding
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token
```

## Benefits

### **For Fleet Managers**
- Real-time visibility of all delivery vehicles
- Automated compliance reporting
- Reduced manual monitoring overhead
- Historical route data for analysis

### **For Drivers**
- Clear authorized stop locations
- Automatic break reminders
- Trip completion tracking
- Reduced paperwork

### **For Operations**
- Improved delivery efficiency
- Enhanced security through route monitoring
- Compliance with driving regulations
- Data-driven route optimization

## Technical Implementation

### **Startup Process**
1. EPS TCP server starts (`routes/eps.js`)
2. EPSTripTracker initializes and loads active trips cache
3. Real-time Supabase subscriptions established
4. 5-minute GPS tracking timer starts
5. System begins monitoring all active trips

### **Data Flow**
```
GPS Data (TCP) → eps_vehicles (PostgreSQL) → Trip Tracker → 
Route Analysis → Compliance Checks → Supabase Updates → 
Real-time Notifications
```

### **Memory Management**
- Active trips cached in memory for performance
- Completed trips automatically removed from cache
- Stationary driver tracking cleaned up on trip completion
- Break tracking data purged when trips end

## Monitoring Capabilities

- **Live GPS Tracking**: Real-time location updates every 5 minutes
- **Geofence Violations**: Instant alerts for unauthorized locations
- **Driver Fatigue Management**: Automated break compliance monitoring
- **Route Optimization**: Historical data for improving delivery routes
- **Performance Analytics**: Trip duration, distance, and efficiency metrics