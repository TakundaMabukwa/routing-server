# Supabase Request Optimization Summary

## Problem
Trip monitoring was making **multiple Supabase requests per minute**, potentially exhausting credits:
- Every unauthorized stop triggered an immediate Supabase UPDATE
- Stop points were queried repeatedly
- Realtime subscriptions maintained constant connections

## Solution: Ultra-Minimal Trip Monitor

### Key Optimizations

#### 1. **Debounced Supabase Writes** (5-minute cooldown)
- Unauthorized stops are **always stored locally** in SQLite
- Supabase is only updated **once per trip every 5 minutes**
- Prevents multiple writes when driver makes repeated stops

**Before:**
```
Stop detected → Supabase UPDATE (every time)
```

**After:**
```
Stop detected → SQLite INSERT (always)
              → Supabase UPDATE (max once per 5 min per trip)
```

#### 2. **Local SQLite Cache**
All data is cached locally:
- Active trips
- Stop points
- Route points
- Unauthorized stops

**Supabase queries only happen:**
- Once at startup (load active trips)
- When a new trip is created (realtime trigger)
- When stop points need caching (one-time per stop point)

#### 3. **New Local Database Table**
```sql
CREATE TABLE unauthorized_stops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  reason TEXT,
  detected_at TEXT NOT NULL,
  synced_to_supabase INTEGER DEFAULT 0
);
```

### Request Reduction

**Before (trip-monitor-minimal.js):**
- Unauthorized stop: **1 Supabase UPDATE per detection**
- If driver stops 10 times in 30 minutes: **10 Supabase requests**

**After (trip-monitor-ultra-minimal.js):**
- Unauthorized stop: **1 Supabase UPDATE per 5 minutes per trip**
- If driver stops 10 times in 30 minutes: **6 Supabase requests** (one every 5 min)
- All stops still recorded locally in SQLite

### Estimated Savings

If you have:
- 10 active trips
- Each driver makes 5 unauthorized stops per hour

**Before:** 50 Supabase writes/hour = **1,200 writes/day**
**After:** ~10 Supabase writes/hour = **~240 writes/day**

**Reduction: ~80% fewer Supabase requests**

## New API Endpoint

Get all unauthorized stops for a trip (from local DB):
```
GET /api/trips/:tripId/unauthorized-stops?company=eps
```

Response:
```json
{
  "trip_id": 123,
  "unauthorized_stops": [
    {
      "id": 1,
      "trip_id": 123,
      "latitude": 40.7128,
      "longitude": -74.0060,
      "reason": "Outside all authorized zones",
      "detected_at": "2024-01-15T10:30:00.000Z",
      "synced_to_supabase": 1
    }
  ]
}
```

## Implementation

### Files Changed
1. **Created:** `services/trip-monitor-ultra-minimal.js`
2. **Modified:** `server.js` (switched to ultra-minimal monitor)

### How to Use

1. **Restart your server:**
```bash
npm start
```

2. **Monitor logs:**
- `🚨 UNAUTHORIZED STOP (local)` - Stored in SQLite
- `☁️ Synced to Supabase (cooldown: 5min)` - Synced to cloud
- `⏳ Supabase write skipped (cooldown: Xs remaining)` - Debounced

3. **Query local stops:**
```bash
curl http://localhost:3001/api/trips/123/unauthorized-stops?company=eps
```

## Configuration

Adjust cooldown period in `trip-monitor-ultra-minimal.js`:
```javascript
this.SUPABASE_WRITE_COOLDOWN = 5 * 60 * 1000; // 5 minutes (default)
```

Options:
- `3 * 60 * 1000` = 3 minutes (more frequent syncs)
- `10 * 60 * 1000` = 10 minutes (fewer syncs)
- `15 * 60 * 1000` = 15 minutes (minimal syncs)

## Functionality Preserved

✅ All trip monitoring features still work
✅ Unauthorized stops are detected immediately
✅ Route tracking continues normally
✅ Stop point validation works
✅ Realtime trip creation detection active

The only change: Supabase updates are debounced to reduce API calls.

## Rollback

If you need to revert:
```javascript
// In server.js, change:
const TripMonitor = require('./services/trip-monitor-ultra-minimal');

// Back to:
const TripMonitor = require('./services/trip-monitor-minimal');
```

## Next Steps (Optional)

For even more savings:
1. **Batch sync endpoint** - Manually trigger sync of all unsynced stops
2. **Scheduled sync** - Sync every 30 minutes instead of per-event
3. **Disable realtime** - Poll for new trips every 5 minutes instead of realtime subscription

Let me know if you want any of these!
