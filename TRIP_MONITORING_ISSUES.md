# Trip Monitoring Performance Issues

## 🔥 Critical Problems Identified

### 1. **Excessive Database Queries in `findActiveTrip()`**
**Location**: `services/trip-monitor.js` lines 130-180

**Problem**: 
- NO database queries in the current implementation (good!)
- However, caching could be improved

### 2. **Excessive Database Queries in `getActiveTrip()` (EPS)**
**Location**: `trip-monitoring/eps-trip-monitor.js` line 163

**Problem**:
```javascript
// THIS RUNS FOR EVERY VEHICLE UPDATE!
const { data: dbDriver } = await supabase
  .from('drivers')
  .select('surname')
  .eq('id', driver.id)
  .single();
```

**Impact**:
- With 5 active trips, each with 1 driver = **5 queries per vehicle update**
- With 50 vehicles updating every 30 seconds = **500 queries/minute**
- **30,000 queries/hour**
- **720,000 queries/day**

### 3. **Realtime Subscription Overhead**
**Location**: `services/trip-monitor.js` lines 52-60

**Problem**:
- Reloads ALL trips on ANY trip change
- Clears caches unnecessarily
- Triggers on every trip update (which happens frequently)

### 4. **Stop Points Query on Every Stop Check**
**Location**: `services/trip-monitor.js` lines 380-400

**Problem**:
- Queries `stop_points` table every time a vehicle is stationary
- Not cached between checks

### 5. **Route Points Stored in Supabase**
**Location**: `trip-monitoring/eps-trip-monitor.js` lines 220-250

**Problem**:
- Updates `route_points` array in Supabase on EVERY vehicle update
- Large JSON arrays cause slow writes
- Better to use local SQLite (which trip-monitor.js does correctly)

## 📊 Load Calculations

### Current System (with 5 active trips, 50 vehicles):
- **Driver queries**: 5 per vehicle update × 50 vehicles × 2 updates/min = **500 queries/min**
- **Trip queries**: 1 per realtime event (varies)
- **Stop point queries**: ~10 per stationary vehicle check
- **Route updates**: 50 vehicles × 2 updates/min = **100 writes/min**

### Total: ~600-700 queries/minute = **36,000-42,000 queries/hour**

## ✅ Solutions

### Solution 1: Cache Driver Surnames
Cache driver ID → surname mapping to avoid repeated queries.

### Solution 2: Optimize Realtime Subscription
Only reload specific trips that changed, not all trips.

### Solution 3: Cache Stop Points
Load stop points once per trip and cache them.

### Solution 4: Use Local SQLite for Route Points
Already implemented in `trip-monitor.js` ✅

### Solution 5: Batch Database Operations
Group multiple updates into single transactions.

## 🎯 Recommended Approach

Use `services/trip-monitor.js` (the better implementation) and remove `trip-monitoring/eps-trip-monitor.js`.

The `trip-monitor.js` already:
- ✅ Uses local SQLite for route points
- ✅ Has better caching logic
- ✅ Doesn't query drivers table repeatedly
- ✅ Supports both EPS and Maysene

Just needs minor optimizations for stop points caching.
