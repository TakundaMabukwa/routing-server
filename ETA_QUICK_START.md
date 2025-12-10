# ETA Monitoring - Quick Start Guide

## ✅ What You Now Have

Your routing server now automatically monitors if vehicles will arrive on time by:
- Tracking real-time vehicle GPS location
- Geocoding dropoff addresses
- Calculating driving routes with traffic conditions
- Comparing ETA against delivery deadlines
- Generating alerts when vehicles will be late

## 🚀 Quick Test

### 1. Test the Integration
```bash
node test-eta-integration.js
```

### 2. Start the Server
```bash
npm start
```

Look for this log message:
```
✅ ETA monitoring enabled - checking every 10 minutes
```

### 3. Check ETA for a Trip
```bash
curl http://localhost:3001/api/trips/123/eta?company=eps
```

## 📊 What Gets Monitored

### Every 10 Minutes Per Active Trip:
1. Gets current vehicle location
2. Gets dropoff destination
3. Calculates route with Mapbox (considers traffic)
4. Compares ETA vs delivery deadline
5. Creates alert if vehicle will be late

### Alert Example:
```
⏰ ETA DELAYED: Trip 123 - Late by 30 min (25.3km, 90min drive)
```

## 🔍 How to View Results

### Console Logs
Watch server console for:
- `✅ ETA ON TIME` - Vehicle on schedule
- `⏰ ETA DELAYED` - Vehicle running late

### Database
Check Supabase `trips` table:
- `alert_type` = 'eta_delayed'
- `alert_message` = Array with alert details

### API
```bash
GET /api/trips/:tripId/eta?company=eps
```

Returns:
```json
{
  "will_arrive_on_time": false,
  "eta": "2024-01-15T14:30:00Z",
  "deadline": "2024-01-15T14:00:00Z",
  "duration_minutes": 45,
  "distance_km": "12.5",
  "buffer_minutes": -30,
  "status": "delayed"
}
```

## ⚙️ Configuration

### Already Configured ✅
- Mapbox token in `.env`
- ETA checks every 10 minutes
- Results cached for 5 minutes
- Alerts stored in Supabase

### Required Trip Data
For ETA monitoring to work, trips need:
- ✅ `dropofflocations` - Destination address
- ✅ `delivery_date` - Delivery deadline
- ✅ Active vehicle sending GPS updates

## 📱 Integration Points

### Data Sources
- **EPS WebSocket**: `ws://64.227.138.235:8002`
- **CTrack API**: `https://apim.ctrackcrystal.com/api`

### Data Flow
```
Vehicle GPS → Trip Monitor → ETA Check → Mapbox API → Alert
```

### Alert Storage
```
Supabase trips table:
  - alert_type: 'eta_delayed'
  - alert_message: [{ type, message, eta, deadline, ... }]
  - alert_timestamp: ISO timestamp
```

## 🎯 Use Cases

### 1. Proactive Delay Management
- System detects vehicle will be late
- Dispatcher sees alert
- Contacts driver or customer
- Updates delivery expectations

### 2. Performance Monitoring
- Track on-time delivery rate
- Identify problematic routes
- Optimize scheduling

### 3. Customer Communication
- Provide accurate ETAs
- Send proactive delay notifications
- Improve customer satisfaction

## 🔧 Troubleshooting

### No ETA Checks Running?
1. Check Mapbox token: `echo $NEXT_PUBLIC_MAPBOX_TOKEN`
2. Verify trip has `delivery_date`
3. Ensure dropoff location has address
4. Confirm vehicle is sending GPS updates

### Inaccurate ETAs?
1. Verify geocoding: Test with `/api/trips/:id/eta`
2. Check delivery_date timezone
3. Ensure vehicle location is recent

### Too Many Alerts?
1. Adjust check interval (default: 10 min)
2. Review delivery_date accuracy
3. Add buffer time to deadlines

## 📚 Full Documentation

- **Complete Guide**: `ETA_MONITORING_README.md`
- **Integration Details**: `ETA_INTEGRATION_COMPLETE.md`
- **Test Script**: `test-eta-integration.js`

## 🎉 You're All Set!

The ETA monitoring system is:
- ✅ Integrated and running
- ✅ Checking every 10 minutes
- ✅ Using real-time road conditions
- ✅ Generating alerts automatically

Just start your server and it works! 🚀
