# ETA Monitoring System

## Overview
Real-time ETA monitoring that checks if vehicles will arrive at dropoff locations on time based on:
- Current vehicle GPS location
- Dropoff destination coordinates
- Real-time road conditions and traffic (via Mapbox Directions API)
- Delivery deadline

## Features

### ✅ Automatic ETA Checks
- Runs every **10 minutes** for active trips
- Calculates driving time based on current road conditions
- Compares ETA against delivery deadline
- Generates alerts if vehicle will be late

### ✅ Alert Types
**ETA Delayed Alert** - Triggered when:
- Vehicle's estimated arrival time exceeds the delivery deadline
- Alert includes:
  - How many minutes late
  - Distance remaining (km)
  - Estimated driving time (minutes)
  - Current vehicle location
  - Destination address

### ✅ API Endpoints

#### Get ETA Status for Trip
```
GET /api/trips/:tripId/eta?company=eps
```

**Response:**
```json
{
  "trip_id": 123,
  "vehicle_location": {
    "lat": -33.9249,
    "lng": 18.4241
  },
  "destination": "123 Main St, Cape Town",
  "destination_coords": {
    "lat": -33.9258,
    "lng": 18.4232
  },
  "will_arrive_on_time": false,
  "eta": "2024-01-15T14:30:00.000Z",
  "deadline": "2024-01-15T14:00:00.000Z",
  "duration_minutes": 45,
  "distance_km": "12.5",
  "buffer_minutes": -30,
  "status": "delayed"
}
```

**Status Values:**
- `on_time` - Vehicle will arrive before deadline
- `delayed` - Vehicle will arrive after deadline

**Buffer Minutes:**
- Positive number = minutes of buffer time (early)
- Negative number = minutes late

## How It Works

### 1. Data Collection
- Vehicle GPS location from EPS WebSocket or CTrack API
- Dropoff location from Supabase `trips.dropofflocations`
- Delivery deadline from `trips.delivery_date` or `dropofflocations.delivery_date`

### 2. ETA Calculation
- Geocodes dropoff address to coordinates (cached)
- Calls Mapbox Directions API for driving route
- Considers:
  - Current traffic conditions
  - Road types and speed limits
  - Turn-by-turn navigation
- Caches results for 5 minutes to reduce API calls

### 3. Alert Generation
- Compares ETA vs deadline
- If late: Creates alert in Supabase `trips.alert_message`
- Alert includes full context (distance, time, location)
- Prevents duplicate alerts with debouncing

## Configuration

### Environment Variables Required
```env
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token
```

### Timing Settings
```javascript
etaCheckInterval: 10 * 60 * 1000  // Check every 10 minutes
CACHE_DURATION: 5 * 60 * 1000     // Cache ETA for 5 minutes
```

## Database Schema

### Alert Message Format
```json
{
  "type": "eta_delayed",
  "message": "Vehicle ABC123 will arrive late by 30 minutes",
  "eta": "2024-01-15T14:30:00.000Z",
  "deadline": "2024-01-15T14:00:00.000Z",
  "duration_minutes": 45,
  "distance_km": "12.5",
  "buffer_minutes": -30,
  "destination": "123 Main St, Cape Town",
  "latitude": -33.9249,
  "longitude": 18.4241,
  "timestamp": "2024-01-15T13:45:00.000Z"
}
```

## Testing

### Run Test Script
```bash
node test-eta-integration.js
```

Tests:
1. Geocoding functionality
2. ETA calculation with comfortable deadline
3. Late arrival detection with tight deadline

### Manual API Test
```bash
# Get ETA for specific trip
curl http://localhost:3001/api/trips/123/eta?company=eps
```

## Integration Points

### Trip Monitor
- `checkETAStatus()` - Called on every vehicle location update
- Integrated into `processVehicleData()` pipeline
- Runs alongside other monitoring (high-risk zones, toll gates, unauthorized stops)

### Alert Flow
```
Vehicle GPS Update
    ↓
Find Active Trip
    ↓
Check ETA (every 10 min)
    ↓
Geocode Dropoff Address
    ↓
Calculate Route (Mapbox)
    ↓
Compare ETA vs Deadline
    ↓
Generate Alert if Late
    ↓
Store in Supabase
```

## Performance

### API Call Optimization
- Geocoding results cached indefinitely
- ETA calculations cached for 5 minutes
- ETA checks throttled to every 10 minutes per trip
- Prevents excessive Mapbox API usage

### Mapbox API Usage
- ~6 calls per hour per active trip (ETA checks)
- 1 call per unique dropoff address (geocoding)
- Cached results reduce actual API calls by ~80%

## Monitoring

### Console Logs
```
✅ ETA ON TIME: Trip 123 - 15 min buffer (12.5km, 45min drive)
⏰ ETA DELAYED: Trip 456 - Late by 30 min (25.3km, 90min drive)
```

### Alert Types in Database
- `alert_type: 'eta_delayed'`
- Stored in `trips.alert_message` array
- Timestamped for tracking

## Troubleshooting

### No ETA Checks Running
- Verify `NEXT_PUBLIC_MAPBOX_TOKEN` is set
- Check trip has `delivery_date` configured
- Ensure dropoff location has valid address
- Verify vehicle is sending GPS updates

### Inaccurate ETAs
- Check Mapbox token is valid
- Verify geocoding returns correct coordinates
- Ensure delivery_date is in correct timezone
- Check vehicle location is recent (not stale)

### Too Many Alerts
- Increase `etaCheckInterval` (default: 10 minutes)
- Adjust deadline buffer in trip configuration
- Review delivery_date accuracy

## Future Enhancements
- [ ] Multiple dropoff location support
- [ ] Historical ETA accuracy tracking
- [ ] Predictive delays based on patterns
- [ ] SMS/email notifications for late arrivals
- [ ] ETA updates to customers
- [ ] Route optimization suggestions
