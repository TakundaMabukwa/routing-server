# High-Risk Alert Deduplication System

## 🎯 How It Works

### 3-Hour Deduplication Window
- Alert received → Check SQLite for recent alerts (last 3 hours)
- If **no recent alert** → Write to **both** Supabase + SQLite
- If **recent alert exists** → Skip (no Supabase write)

## 📊 Flow Diagram

```
Vehicle enters high-risk zone
         ↓
Check SQLite: Alert in last 3 hours?
         ↓
    ┌────┴────┐
   NO        YES
    ↓          ↓
Write to:    Skip
- SQLite     (no write)
- Supabase
```

## 💾 SQLite Table Structure

```sql
CREATE TABLE high_risk_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plate TEXT NOT NULL,
  zone_id INTEGER NOT NULL,
  zone_name TEXT,
  latitude REAL,
  longitude REAL,
  timestamp TEXT NOT NULL,
  synced_to_supabase INTEGER DEFAULT 1
);

CREATE INDEX idx_alerts_plate_zone 
ON high_risk_alerts(plate, zone_id, timestamp);
```

## 🔍 Deduplication Logic

```javascript
shouldSendAlert(plate, zoneId) {
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  
  const recentAlert = this.db.prepare(`
    SELECT id FROM high_risk_alerts 
    WHERE plate = ? AND zone_id = ? AND timestamp > ?
    LIMIT 1
  `).get(plate, zoneId, threeHoursAgo);
  
  return !recentAlert; // Send if no recent alert
}
```

## 📈 Example Scenarios

### Scenario 1: First Alert
```
Time: 10:00 AM
Vehicle: ABC123
Zone: Hillbrow
SQLite: No recent alerts
Result: ✅ Write to Supabase + SQLite
```

### Scenario 2: Duplicate Within 3 Hours
```
Time: 11:30 AM (1.5 hours later)
Vehicle: ABC123
Zone: Hillbrow
SQLite: Alert found at 10:00 AM
Result: ❌ Skip (no Supabase write)
```

### Scenario 3: After 3 Hours
```
Time: 1:30 PM (3.5 hours later)
Vehicle: ABC123
Zone: Hillbrow
SQLite: No alerts in last 3 hours
Result: ✅ Write to Supabase + SQLite
```

### Scenario 4: Different Zone
```
Time: 10:30 AM
Vehicle: ABC123
Zone: Alexandra (different zone)
SQLite: No alerts for this zone
Result: ✅ Write to Supabase + SQLite
```

## 🧹 Automatic Cleanup

Old alerts are cleaned up every 24 hours:
```javascript
// Delete alerts older than 7 days
cleanupOldAlerts() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  this.db.prepare('DELETE FROM high_risk_alerts WHERE timestamp < ?').run(sevenDaysAgo);
}
```

## 📊 Query Reduction

### Before (No Deduplication)
```
Vehicle in zone for 1 hour (120 GPS updates)
= 120 Supabase writes
```

### After (3-Hour Window)
```
Vehicle in zone for 1 hour (120 GPS updates)
= 1 Supabase write + 119 SQLite checks
= 99.2% reduction
```

### Real-World Example
```
10 vehicles × 5 zones × 8 hours/day
Without deduplication: ~4,800 alerts/day
With deduplication: ~40 alerts/day
Reduction: 99.2%
```

## ✅ Benefits

1. **Massive Query Reduction**: 99%+ fewer Supabase writes
2. **Fast Local Checks**: SQLite queries are instant
3. **No Duplicate Alerts**: Same vehicle/zone within 3 hours
4. **Automatic Cleanup**: Old data removed automatically
5. **Reliable**: SQLite persists across server restarts

## 🎯 Configuration

Change the 3-hour window:
```javascript
this.ALERT_COOLDOWN = 3 * 60 * 60 * 1000; // 3 hours

// Change to 1 hour:
this.ALERT_COOLDOWN = 1 * 60 * 60 * 1000;

// Change to 6 hours:
this.ALERT_COOLDOWN = 6 * 60 * 60 * 1000;
```

## 📝 Summary

- ✅ Alerts stored in SQLite first
- ✅ 3-hour deduplication window per vehicle/zone
- ✅ Only unique alerts sent to Supabase
- ✅ 99%+ reduction in database writes
- ✅ Automatic cleanup of old alerts
- ✅ Works immediately, no configuration needed
