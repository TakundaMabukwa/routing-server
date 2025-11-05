# EPS Driver Rewards System - Supabase Migration Guide

## Overview
This guide shows how to migrate the EPS Driver Rewards System from PostgreSQL to Supabase while maintaining all functionality.

## Migration Steps

### 1. Setup Supabase Project
1. Create new Supabase project at https://supabase.com
2. Copy your project URL and service role key
3. Update `.env` file with Supabase credentials

### 2. Create Database Schema
Run the SQL in `supabase-schema.sql` in your Supabase SQL Editor:
- Creates all 8 EPS tables
- Adds performance indexes
- Inserts initial driver data (20 sample drivers)

### 3. Install Dependencies
```bash
npm install @supabase/supabase-js
```

### 4. Use New Files
- `supabase-migration.js` - Core EPS reward system adapted for Supabase
- `supabase-api-routes.js` - API endpoints using Supabase client
- `integrated-server.js` - Combined GPS + EPS system

## Key Changes from PostgreSQL Version

### Database Connection
**Before (PostgreSQL):**
```javascript
const { Pool } = require('pg');
const pgPool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD
});
```

**After (Supabase):**
```javascript
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
);
```

### Query Syntax
**Before (PostgreSQL):**
```javascript
const result = await pgPool.query(
  'SELECT * FROM eps_driver_rewards WHERE driver_name = $1',
  [driverName]
);
```

**After (Supabase):**
```javascript
const { data, error } = await supabase
  .from('eps_driver_rewards')
  .select('*')
  .eq('driver_name', driverName)
  .single();
```

### UPSERT Operations
**Before (PostgreSQL):**
```javascript
await pgPool.query(`
  INSERT INTO eps_daily_performance (...) VALUES (...)
  ON CONFLICT (driver_name, date) DO UPDATE SET ...
`);
```

**After (Supabase):**
```javascript
await supabase
  .from('eps_daily_performance')
  .upsert({...}, { onConflict: 'driver_name,date' });
```

## Core System Features Maintained

### 1. 100-Point Deduction Model
- ✅ Starting points: 100 per driver
- ✅ Violation thresholds: 4 violations before deduction
- ✅ Point deduction: 1 point per violation after threshold
- ✅ Performance levels: Gold, Silver, Bronze, Critical

### 2. Violation Types
- ✅ Speed violations (>120 km/h)
- ✅ Night driving violations (10 PM - 6 AM)
- ✅ Route violations (off assigned route)
- ✅ Harsh braking violations
- ✅ Other violations

### 3. Data Storage
- ✅ Real-time vehicle tracking
- ✅ Daily performance summaries
- ✅ Violation logging
- ✅ Driver rewards tracking
- ✅ Fuel monitoring
- ✅ Driving hours calculation

### 4. API Endpoints
All original endpoints maintained:
- `/api/eps-rewards/test` - Connection test
- `/api/eps-rewards/rewards` - Driver rewards
- `/api/eps-rewards/performance` - Performance data
- `/api/eps-rewards/violations` - Violation records
- `/api/eps-rewards/leaderboard` - Driver rankings
- `/api/eps-rewards/driver-performance/:name` - Individual reports

## Testing the Migration

### 1. Test Database Connection
```bash
curl http://localhost:3001/api/eps-rewards/test
```

### 2. Test Violation Processing
```bash
curl -X POST http://localhost:3001/test/eps-violation \
  -H "Content-Type: application/json" \
  -d '{
    "driverName": "SICELIMPILO WILFRED KHANYILE",
    "plate": "JY54WJGP M", 
    "violationType": "SPEED"
  }'
```

### 3. Test GPS Simulation with EPS
```bash
curl -X POST http://localhost:3001/test/simulate-gps-eps \
  -H "Content-Type: application/json" \
  -d '{
    "speed": 130,
    "driverName": "SICELIMPILO WILFRED KHANYILE",
    "plate": "JY54WJGP M"
  }'
```

## Benefits of Supabase Migration

### 1. Managed Infrastructure
- No server maintenance required
- Automatic backups and scaling
- Built-in monitoring and alerts

### 2. Real-time Features
- Real-time subscriptions for live updates
- WebSocket connections built-in
- Instant data synchronization

### 3. Enhanced Security
- Row Level Security (RLS) policies
- Built-in authentication
- API key management

### 4. Developer Experience
- Auto-generated REST APIs
- GraphQL support
- Web-based database management
- TypeScript support

### 5. Performance
- Global CDN for fast access
- Connection pooling
- Optimized queries

## Environment Variables Required

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# WebSocket for GPS data
WEBSOCKET_URL=ws://64.227.138.235:8002

# Server Configuration
PORT=3001
```

## Running the Migrated System

### 1. Start the integrated server
```bash
node integrated-server.js
```

### 2. Monitor logs for:
- WebSocket connection to GPS feed
- EPS violation processing
- Supabase database operations
- Driver point calculations

### 3. Access API endpoints
- Driver rewards: `GET /api/eps-rewards/rewards`
- Performance data: `GET /api/eps-rewards/performance`
- Leaderboard: `GET /api/eps-rewards/leaderboard`

## Data Migration from PostgreSQL

If you have existing PostgreSQL data:

1. Export data from PostgreSQL:
```bash
pg_dump -U postgres -d vehicles --data-only --inserts -t eps_driver_rewards > rewards_data.sql
```

2. Import to Supabase:
- Copy INSERT statements to Supabase SQL Editor
- Run the statements to populate tables

## Monitoring and Maintenance

### 1. Supabase Dashboard
- Monitor database performance
- View real-time connections
- Check API usage statistics

### 2. Logging
- All violations logged with timestamps
- Driver point changes tracked
- Performance metrics calculated daily

### 3. Alerts
- Set up alerts for system errors
- Monitor violation thresholds
- Track driver performance trends

This migration maintains full compatibility with the existing EPS Driver Rewards System while providing enhanced scalability, security, and management capabilities through Supabase.