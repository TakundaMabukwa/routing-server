# Toll Gate Monitoring Setup

## Overview
Monitors vehicles approaching toll gates and sends alerts when they enter the toll gate radius.

---

## Step 1: Create Supabase Tables

### 1.1 Create toll_gates table (in BOTH EPS and Maysene Supabase)

```sql
CREATE TABLE public.toll_gates (
  id BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
  color TEXT NULL,
  outline TEXT NULL,
  name TEXT NULL,
  style_url TEXT NULL,
  coordinates TEXT NULL,
  name2 TEXT NULL,
  value TEXT NULL,
  radius NUMERIC(10, 2) NULL DEFAULT 100,
  coordinates5 TEXT NULL,
  coordinates6 TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NULL DEFAULT NOW(),
  type TEXT NULL DEFAULT 'warehouse'::TEXT,
  address TEXT NULL,
  street TEXT NULL,
  city TEXT NULL,
  state TEXT NULL,
  country TEXT NULL,
  coords TEXT NULL,
  contact_person TEXT NULL,
  contact_phone TEXT NULL,
  contact_email TEXT NULL,
  operating_hours TEXT NULL,
  capacity TEXT NULL,
  notes TEXT NULL,
  facilities TEXT[] NULL,
  CONSTRAINT toll_gates_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS toll_gates_name_idx ON public.toll_gates USING BTREE (name);
```

### 1.2 Insert sample toll gate

```sql
INSERT INTO public.toll_gates (
  name, 
  style_url, 
  coordinates, 
  name2, 
  value, 
  radius
) VALUES (
  'Tugela Toll Gate',
  '#Style653639',
  '29.564536,-28.464455,0 29.563452,-28.46525,0 29.560454,-28.462458,0 29.559622,-28.460422,0 29.561544,-28.460025,0 29.562473,-28.461807,0',
  'landmark_type',
  '2',
  100
);
```

### 1.3 Create toll_gate_alerts table (in BOTH EPS and Maysene Supabase)

```sql
CREATE TABLE public.toll_gate_alerts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plate TEXT NOT NULL,
  driver_name TEXT,
  toll_gate_name TEXT NOT NULL,
  distance_meters INTEGER,
  alert_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  company TEXT DEFAULT 'eps',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS toll_gate_alerts_plate_idx ON public.toll_gate_alerts(plate);
CREATE INDEX IF NOT EXISTS toll_gate_alerts_timestamp_idx ON public.toll_gate_alerts(alert_timestamp);
CREATE INDEX IF NOT EXISTS toll_gate_alerts_company_idx ON public.toll_gate_alerts(company);
```

---

## Step 2: Sync Toll Gates to Local SQLite

### For EPS:
```bash
node sync-toll-gates.js eps
```

### For Maysene:
```bash
node sync-toll-gates.js maysene
```

**Output:**
```
🚧 Syncing toll gates for EPS...

  ✅ Tugela Toll Gate (radius: 100m)

✅ Synced 1 toll gates to local database
```

---

## Step 3: Test the System

```bash
node test-toll-gates.js
```

**Expected Output:**
```
🧪 Testing Toll Gate Monitoring

Step 1: Checking loaded toll gates...
✅ Loaded 1 toll gates

  - Tugela Toll Gate (radius: 100m)

Step 2: Testing Tugela Toll Gate detection...
✅ Tugela centroid: -28.462458, 29.562473

Step 3: Simulating vehicle positions...

  Far away (5km):
    Distance: 5000m
    Should alert: NO
    Within radius: NO ❌

  Near (500m):
    Distance: 500m
    Should alert: NO
    Within radius: NO ❌

  At toll gate (50m):
    Distance: 50m
    Should alert: YES
    Within radius: YES ✅
    🚧 TOLL GATE: TEST-123 (Test Driver) at Tugela Toll Gate - 50m away

Step 4: Testing cooldown...
  Cooldown active: ✅

✅ Test completed!
```

---

## How It Works

### Architecture:
```
Supabase toll_gates table
    ↓ (sync once daily)
Local SQLite toll-gates-{company}.db
    ↓ (read on every vehicle update)
TollGateMonitor.checkVehicleLocation()
    ↓ (if within radius)
Alert sent to toll_gate_alerts table
```

### Data Flow:
1. **Initial Sync**: Run `sync-toll-gates.js` to load toll gates from Supabase to SQLite
2. **Runtime**: Monitor reads from local SQLite (fast, no API calls)
3. **Daily Sync**: Automatic sync from Supabase at midnight
4. **Alert**: When vehicle within toll gate radius, alert sent to Supabase

### Detection Logic:
- Parse polygon coordinates from toll gate
- Calculate centroid (center point)
- Check distance from vehicle to centroid
- If distance ≤ radius → Send alert
- Cooldown: 30 minutes per vehicle

---

## Features

✅ **Local SQLite Cache**: Fast lookups, no API calls  
✅ **Daily Sync**: Automatic updates from Supabase  
✅ **Polygon Support**: Handles complex toll gate shapes  
✅ **Cooldown**: Prevents duplicate alerts (30 min)  
✅ **Multi-Company**: Separate databases for EPS and Maysene  
✅ **Alert History**: All alerts stored in toll_gate_alerts table  

---

## Configuration

### Cooldown Period:
```javascript
this.ALERT_COOLDOWN = 30 * 60 * 1000; // 30 minutes
```

### Default Radius:
```javascript
radius NUMERIC(10, 2) NULL DEFAULT 100 // 100 meters
```

### Sync Interval:
```javascript
setInterval(() => this.syncFromSupabase(), 24 * 60 * 60 * 1000); // Daily
```

---

## Monitoring

### Check loaded toll gates:
```bash
sqlite3 toll-gates-eps.db "SELECT name, radius FROM toll_gates"
```

### Check recent alerts:
```sql
SELECT * FROM toll_gate_alerts 
ORDER BY alert_timestamp DESC 
LIMIT 10;
```

### Count alerts per toll gate:
```sql
SELECT toll_gate_name, COUNT(*) as alert_count
FROM toll_gate_alerts
GROUP BY toll_gate_name
ORDER BY alert_count DESC;
```

---

## Integration

The toll gate monitor is integrated into `server.js`:

```javascript
// Initialize Toll Gate Monitors per company
const tollGateMonitors = {
  eps: new TollGateMonitor('eps'),
  maysene: new TollGateMonitor('maysene')
};

// Check for toll gate proximity (in WebSocket handler)
if (vehicleData.Latitude && vehicleData.Longitude) {
  await tollGateMonitors[company].checkVehicleLocation(vehicleData);
}
```

---

## Files Created

1. `services/toll-gate-monitor.js` - Main monitoring service
2. `sync-toll-gates.js` - Sync script (Supabase → SQLite)
3. `test-toll-gates.js` - Test script
4. `toll-gate-alerts-schema.sql` - Alert table schema
5. `toll-gates-eps.db` - Local SQLite cache (EPS)
6. `toll-gates-maysene.db` - Local SQLite cache (Maysene)

---

## Next Steps

1. ✅ Create toll_gates table in Supabase (both EPS and Maysene)
2. ✅ Create toll_gate_alerts table in Supabase (both EPS and Maysene)
3. ✅ Insert toll gate data
4. ✅ Run sync script: `node sync-toll-gates.js eps`
5. ✅ Run sync script: `node sync-toll-gates.js maysene`
6. ✅ Test: `node test-toll-gates.js`
7. ✅ Start server: `npm start`

---

## Status

**Ready for deployment** once Supabase tables are created and initial sync is complete! 🚀
