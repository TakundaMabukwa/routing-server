# C-Track Integration

## Overview
C-Track integration polls vehicle GPS data every 15 seconds and feeds it into the existing monitoring systems (trip monitoring, border warnings, toll gates, high-risk zones).

## Architecture

### Components

1. **CTrackClient** (`ctrack-client.js`)
   - Handles authentication with C-Track API
   - Provides methods to fetch vehicles, positions, and drivers
   - Auto-refreshes JWT tokens

2. **CTrackPoller** (`ctrack-poller.js`)
   - Polls vehicle positions every 15 seconds
   - Transforms C-Track data format to match existing WebSocket format
   - Caches driver information to reduce API calls
   - Feeds data to all monitoring systems

3. **API Routes** (`routes/ctrack-routes.js`)
   - Monitor C-Track integration status
   - Manually trigger polls
   - View cached driver data

## Configuration

Add to `.env`:
```env
CTRACK_BASE_URL=https://stgapi.ctrackcrystal.co.za/api
CTRACK_USERNAME=your_username
CTRACK_PASSWORD=your_password
CTRACK_PK=your_subscription_key
CTRACK_TENANT_ID=your_tenant_id
```

## API Endpoints

### Get Status
```bash
GET /api/ctrack/status
```
Returns C-Track integration status and statistics.

### Manual Poll
```bash
POST /api/ctrack/poll
```
Manually trigger a data fetch (useful for testing).

### Get Cached Drivers
```bash
GET /api/ctrack/drivers
```
View all cached driver information.

## Data Flow

```
C-Track API (15s poll)
    ↓
CTrackPoller
    ↓
Transform to standard format
    ↓
┌─────────────────────────────┐
│  Trip Monitor               │
│  - Track routes             │
│  - Detect unauthorized stops│
└─────────────────────────────┘
    ↓
┌─────────────────────────────┐
│  Border Monitor             │
│  - Border crossing alerts   │
└─────────────────────────────┘
    ↓
┌─────────────────────────────┐
│  High Risk Monitor          │
│  - High-risk zone alerts    │
└─────────────────────────────┘
    ↓
┌─────────────────────────────┐
│  Toll Gate Monitor          │
│  - Toll gate proximity      │
└─────────────────────────────┘
```

## Features

- ✅ Automatic JWT token refresh
- ✅ Driver information caching
- ✅ 15-second polling interval
- ✅ Seamless integration with existing systems
- ✅ No disruption to WebSocket data flow
- ✅ Works alongside existing EPS/Maysene WebSocket feeds

## Testing

1. Check status:
```bash
curl http://localhost:3001/api/ctrack/status
```

2. Manual poll:
```bash
curl -X POST http://localhost:3001/api/ctrack/poll
```

3. View cached drivers:
```bash
curl http://localhost:3001/api/ctrack/drivers
```

## Notes

- C-Track data runs in parallel with existing WebSocket feeds
- Driver cache reduces API calls (drivers fetched once per session)
- All existing monitoring features work with C-Track data
- Poll interval can be adjusted in `ctrack-poller.js` (default: 15s)
