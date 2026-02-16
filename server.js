require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const axios = require('axios');
const EPSRewardSystem = require('./reward-system/eps-reward-system');
const epsRoutes = require('./reward-system/eps-rewards');
const mayseneRoutes = require('./reward-system/maysene-rewards');
const statsRoutes = require('./reward-system/stats-routes');
const { parseWithNames } = require('./fuel-parsing/canbus-parser-v2');
const TripMonitor = require('./services/trip-monitor-ultra-minimal');
const HighRiskMonitor = require('./services/high-risk-monitor');
const TollGateMonitor = require('./services/toll-gate-monitor');
const BorderMonitor = require('./services/border-monitor');
const CTrackPoller = require('./services/ctrack-poller');
const StatusMonitor = require('./services/status-monitor');

const app = express();
const PORT = process.env.PORT || 3001;
const WS_PORT = process.env.WS_PORT || 3002;
const path = require('path');
const Database = require('better-sqlite3');
const { WebSocketServer } = require('ws');
const BACKUP_VEHICLES_ENDPOINT = process.env.TCP_BASE_URL || 'http://64.227.138.235:3000/api/maysene-vehicles';

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Store for SSE clients
const sseClients = new Set();

// Cache latest vehicle data
const vehicleDataCache = new Map();

// SQLite databases per company
const databases = {
  eps: new Database(path.join(__dirname, 'canbus-eps.db')),
  maysene: new Database(path.join(__dirname, 'canbus-maysene.db'))
};

// Create tables for both companies
Object.values(databases).forEach(db => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS canbus (
      plate TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      timestamp TEXT NOT NULL
    )
  `);
});

// Memory caches per company
const canBusCaches = {
  eps: new Map(),
  maysene: new Map()
};

// Load existing data into caches
Object.entries(databases).forEach(([company, db]) => {
  const rows = db.prepare('SELECT * FROM canbus').all();
  rows.forEach(row => {
    const vehicleData = JSON.parse(row.data);
    canBusCaches[company].set(row.plate, vehicleData);
  });
  console.log(`Loaded CAN bus data for ${canBusCaches[company].size} ${company} vehicles`);
});

// Prepared statements per company
const upsertStmts = {};
Object.entries(databases).forEach(([company, db]) => {
  upsertStmts[company] = db.prepare(`
    INSERT INTO canbus (plate, data, timestamp) 
    VALUES (?, ?, ?)
    ON CONFLICT(plate) DO UPDATE SET data = ?, timestamp = ?
  `);
});

function saveCanBusData(company, plate, data) {
  const dataStr = JSON.stringify(data);
  const timestamp = data.timestamp;
  upsertStmts[company].run(plate, dataStr, timestamp, dataStr, timestamp);
}

function normalizePlate(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getBackupVehicles(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.vehicles)) return payload.vehicles;
  if (Array.isArray(payload)) return payload;
  return [];
}

function findBackupVehicleByPlate(vehicles, plate) {
  const target = normalizePlate(plate);
  if (!target) return null;

  const exact = vehicles.find(v =>
    normalizePlate(v?.plate || v?.Plate || v?.registration_number || v?.registrationNumber) === target
  );
  if (exact) return exact;

  return vehicles.find(v => {
    const candidate = normalizePlate(v?.plate || v?.Plate || v?.registration_number || v?.registrationNumber);
    return candidate && (candidate.includes(target) || target.includes(candidate));
  }) || null;
}

function toLocationFromBackupVehicle(vehicle) {
  if (!vehicle) return null;

  const latitude = toNumber(vehicle.latitude ?? vehicle.Latitude ?? vehicle.lat);
  const longitude = toNumber(vehicle.longitude ?? vehicle.Longitude ?? vehicle.lng);

  if (latitude === null || longitude === null) return null;

  return {
    Latitude: latitude,
    Longitude: longitude,
    Speed: toNumber(vehicle.speed ?? vehicle.Speed) ?? 0,
    LocTime: vehicle.loc_time || vehicle.LocTime || vehicle.timestamp || new Date().toISOString()
  };
}

async function fetchVehicleFromBackupApi(plate) {
  try {
    const response = await axios.get(BACKUP_VEHICLES_ENDPOINT, { timeout: 12000 });
    const vehicles = getBackupVehicles(response.data);
    const vehicle = findBackupVehicleByPlate(vehicles, plate);
    return toLocationFromBackupVehicle(vehicle);
  } catch (error) {
    console.error('Error fetching from backup vehicles API:', error.message);
    return null;
  }
}

// Initialize EPS Reward System
const rewardSystem = new EPSRewardSystem();

// Initialize Maysene Reward System
const MayseneRewardSystem = require('./reward-system/maysene-reward-system');
const mayseneRewardSystem = new MayseneRewardSystem();

// Initialize Trip Monitors per company
const tripMonitors = {
  eps: new TripMonitor('eps'),
  maysene: new TripMonitor('maysene')
};

// Initialize High Risk Monitor for EPS only
const highRiskMonitor = new HighRiskMonitor('eps');

// Initialize Toll Gate Monitor for EPS only
const tollGateMonitor = new TollGateMonitor('eps');

// Initialize Border Monitor for EPS only
const borderMonitor = new BorderMonitor('eps');

// Initialize Status Monitors per company
const statusMonitors = {
  eps: new StatusMonitor('eps'),
  maysene: new StatusMonitor('maysene')
};

// Initialize C-Track Poller for EPS
let ctrackPoller = null;
if (process.env.CTRACK_USERNAME && process.env.CTRACK_PASSWORD) {
  ctrackPoller = new CTrackPoller(
    tripMonitors.eps,
    highRiskMonitor,
    tollGateMonitor,
    borderMonitor,
    vehicleDataCache,
    sseClients,
    null,
    rewardSystem
  );
  ctrackPoller.start();
  console.log('✅ C-Track integration enabled');
} else {
  console.log('⚠️ C-Track credentials not found, skipping C-Track integration');
}

// WebSocket connections per company
const websockets = {
  eps: new WebSocket(process.env.EPS_WEBSOCKET_URL_2017_FEED),
  maysene: new WebSocket(process.env.MAYSENE_WEBSOCKET_URL)
};

function setupWebSocket(company, ws) {
  ws.on('open', () => {
    console.log(`${company.toUpperCase()} WebSocket connected`);
  });

  ws.on('message', async (data) => {
  try {
    const vehicleData = JSON.parse(data.toString());
    
    // Log raw WebSocket data
    // console.log(`\n[${company.toUpperCase()}] RAW DATA:`, JSON.stringify(vehicleData, null, 2));
    
    // Cache latest vehicle data with company prefix
    vehicleDataCache.set(`${company}:${vehicleData.Plate}`, vehicleData);
    
    // console.log(`Received data for vehicle ${vehicleData.Plate}:`, {
    //   speed: vehicleData.Speed,
    //   lat: vehicleData.Latitude,
    //   lng: vehicleData.Longitude
    // });
    
    // Parse CAN bus data from rawMessage
    if (vehicleData.rawMessage) {
      const parts = vehicleData.rawMessage.split('|');
      const canBusData = parts[parts.length - 1];
      
      if (canBusData && canBusData.trim() !== '') {
        const parsed = parseWithNames(canBusData);
        if (parsed.length > 0) {
          // Stream to SSE clients
          const streamData = {
            plate: vehicleData.Plate,
            timestamp: new Date().toISOString(),
            data: parsed
          };
          
          // Store in CAN bus cache and database
          canBusCaches[company].set(vehicleData.Plate, streamData);
          saveCanBusData(company, vehicleData.Plate, streamData);
          
          // Broadcast to SSE clients
          sseClients.forEach(client => {
            client.write(`data: ${JSON.stringify(streamData)}\n\n`);
          });
          
          // Broadcast to WebSocket clients
          wsClients.forEach(client => {
            if (client.readyState === 1) {
              client.send(JSON.stringify({ type: 'update', data: streamData }));
            }
          });
        }
      }
    }
    
    // Process through reward system if driver name exists
    if (vehicleData.DriverName && vehicleData.Plate) {
      try {
        if (company === 'eps') {
          const result = await rewardSystem.processEPSData(vehicleData);
        }
        // Maysene reward system disabled
        // else if (company === 'maysene') {
        //   const result = await mayseneRewardSystem.processMayseneData(vehicleData);
        // }
      } catch (error) {
        console.error(`Error processing ${company.toUpperCase()} reward data:`, error);
      }
    }
    
    // Process through trip monitoring system
    let activeTripId = null;
    if (vehicleData.DriverName && vehicleData.Latitude && vehicleData.Longitude) {
      try {
        const monitor = company === 'eps' ? borderMonitor : null;
        activeTripId = await tripMonitors[company].processVehicleData(vehicleData, monitor);
      } catch (error) {
        console.error('Error processing trip monitoring data:', error);
      }
    }
    
    // Check for high-risk zone entry (EPS only)
    if (company === 'eps' && vehicleData.Latitude && vehicleData.Longitude) {
      try {
        await highRiskMonitor.checkVehicleLocation(vehicleData, activeTripId);
      } catch (error) {
        console.error('Error checking high-risk zones:', error);
      }
    }
    
    // Check for toll gate proximity (EPS only)
    if (company === 'eps' && vehicleData.Latitude && vehicleData.Longitude) {
      try {
        await tollGateMonitor.checkVehicleLocation(vehicleData);
      } catch (error) {
        console.error('Error checking toll gates:', error);
      }
    }
    
  } catch (error) {
    console.error(`${company.toUpperCase()} WebSocket error:`, error);
  }
  });

  ws.on('error', (error) => {
    console.error(`${company.toUpperCase()} WebSocket error:`, error);
  });

  ws.on('close', () => {
    console.log(`${company.toUpperCase()} WebSocket closed`);
  });
}

// Setup both WebSocket connections
setupWebSocket('eps', websockets.eps);
setupWebSocket('maysene', websockets.maysene);

// Serve the stream client
app.get('/stream-client', (req, res) => {
  const path = require('path');
  res.sendFile(path.join(__dirname, 'stream-client.html'));
});

// Basic Express route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Fidelity Server with EPS Driver Rewards',
    features: ['GPS Tracking', 'Driver Performance', 'Supabase Integration']
  });
});

// Mount EPS reward system routes
app.use('/api/eps-rewards', epsRoutes);
app.use('/api/maysene-rewards', mayseneRoutes);
app.use('/api/stats', statsRoutes);

// Test endpoint for high-risk zone simulation
app.post('/api/test/high-risk-zone', async (req, res) => {
  try {
    const { plate, driverName, latitude, longitude, tripId } = req.body;
    
    if (!plate || !latitude || !longitude) {
      return res.status(400).json({ error: 'plate, latitude, and longitude are required' });
    }
    
    const testVehicleData = {
      Plate: plate,
      DriverName: driverName || 'Test Driver',
      Latitude: parseFloat(latitude),
      Longitude: parseFloat(longitude),
      Speed: 50,
      LocTime: new Date().toISOString()
    };
    
    await highRiskMonitor.checkVehicleLocation(testVehicleData, tripId);
    
    res.json({
      success: true,
      message: 'High-risk zone check completed',
      vehicle: testVehicleData,
      tripId
    });
  } catch (error) {
    console.error('Test error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mount cached trips routes
const tripsCachedRoutes = require('./routes/trips-cached');
app.use('/api/trips', tripsCachedRoutes);

// Mount C-Track routes
const ctrackRoutes = require('./routes/ctrack-routes');
if (ctrackPoller) {
  ctrackRoutes.setCTrackPoller(ctrackPoller);
}
app.use('/api/ctrack', ctrackRoutes);

// Get trip route points by trip ID (with company parameter)
app.get('/api/trips/:tripId/route', async (req, res) => {
  const tripId = parseInt(req.params.tripId);
  const company = req.query.company || 'eps';
  
  if (!tripMonitors[company]) {
    return res.status(400).json({ error: 'Invalid company' });
  }
  
  const routeData = tripMonitors[company].getRoutePoints(tripId);
  if (!routeData) {
    return res.status(404).json({ error: 'Trip route not found' });
  }
  
  // Get trip info from Supabase
  try {
    const { data: trip } = await tripMonitors[company].supabase
      .from('trips')
      .select('id, vehicleassignments, status')
      .eq('id', tripId)
      .single();
    
    if (trip) {
      const driverName = tripMonitors[company].getDriverNameFromAssignments(trip);
      const plate = tripMonitors[company].getVehiclePlateFromAssignments(trip);
      
      routeData.vehicle = plate;
      routeData.driver = driverName;
      routeData.status = trip.status;
    }
  } catch (error) {
    console.error('Error fetching trip info:', error);
  }
  
  res.json(routeData);
});

// Get unauthorized stops for a trip (from local DB)
app.get('/api/trips/:tripId/unauthorized-stops', (req, res) => {
  const tripId = parseInt(req.params.tripId);
  const company = req.query.company || 'eps';
  
  if (!tripMonitors[company]) {
    return res.status(400).json({ error: 'Invalid company' });
  }
  
  const stops = tripMonitors[company].getUnauthorizedStops(tripId);
  res.json({ trip_id: tripId, unauthorized_stops: stops });
});

// Get stored ETA alerts for a trip
app.get('/api/trips/:tripId/eta-alerts', async (req, res) => {
  try {
    const tripId = parseInt(req.params.tripId);
    const company = req.query.company || 'eps';
    
    if (!tripMonitors[company]) {
      return res.status(400).json({ error: 'Invalid company' });
    }
    
    const { data: trip, error } = await tripMonitors[company].supabase
      .from('trips')
      .select('id, alert_message, alert_type, alert_timestamp')
      .eq('id', tripId)
      .single();
    
    if (error || !trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    const alerts = trip.alert_message || [];
    const etaAlerts = alerts.filter(a => 
      a.type === 'eta_delayed' || a.type === 'eta_update'
    );
    
    res.json({
      trip_id: tripId,
      latest_alert_type: trip.alert_type,
      latest_alert_timestamp: trip.alert_timestamp,
      eta_alerts: etaAlerts,
      total_alerts: etaAlerts.length
    });
  } catch (error) {
    console.error('Error fetching ETA alerts:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get ETA status for a trip using real-time vehicle location
app.get('/api/trips/:tripId/eta', async (req, res) => {
  try {
    const tripId = parseInt(req.params.tripId);
    const company = req.query.company || 'eps';
    
    if (!tripMonitors[company]) {
      return res.status(400).json({ error: 'Invalid company' });
    }
    
    // Get trip from Supabase (not just active trips cache)
    const { data: trip, error: tripError } = await tripMonitors[company].supabase
      .from('trips')
      .select('id, vehicleassignments, status, enddate, pickuplocations, dropofflocations')
      .eq('id', tripId)
      .single();
    
    if (tripError) {
      console.error('Supabase error:', tripError);
      return res.status(404).json({ error: 'Trip not found', details: tripError.message });
    }
    
    if (tripError || !trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    // Get vehicle plate from trip
    const plate = tripMonitors[company].getVehiclePlateFromAssignments(trip);
    if (!plate) {
      return res.status(404).json({ error: 'No vehicle assigned to trip' });
    }
    
    // Get real-time vehicle location from cache, then backup API
    const vehicleKey = `${company}:${plate}`;
    let vehicleData = vehicleDataCache.get(vehicleKey);
    let locationSource = 'real-time';

    if (!vehicleData || !vehicleData.Latitude || !vehicleData.Longitude) {
      const backupLocation = await fetchVehicleFromBackupApi(plate);
      if (backupLocation) {
        vehicleData = backupLocation;
        locationSource = 'backup_api';
      }
    }
    
    let currentLat, currentLng, lastUpdate, dataAge;
    if (vehicleData && vehicleData.Latitude && vehicleData.Longitude) {
      // Use real-time GPS data
      currentLat = vehicleData.Latitude;
      currentLng = vehicleData.Longitude;
      lastUpdate = vehicleData.LocTime || new Date().toISOString();
      // Age is informational only
      const gpsTime = new Date(lastUpdate);
      const now = new Date();
      dataAge = Math.floor((now - gpsTime) / 1000 / 60); // minutes
    } else {
      // Fallback to last known location from route history
      const routeData = tripMonitors[company].getRoutePoints(tripId);
      if (!routeData || routeData.route_points.length === 0) {
        return res.status(404).json({ error: 'No GPS data available for vehicle' });
      }
      const lastPoint = routeData.route_points[routeData.route_points.length - 1];
      currentLat = lastPoint.lat;
      currentLng = lastPoint.lng;
      lastUpdate = lastPoint.datetime;
      // Age is informational only
      const gpsTime = new Date(lastUpdate);
      const now = new Date();
      dataAge = Math.floor((now - gpsTime) / 1000 / 60);
      locationSource = 'route_history';
    }
    
    // Get dropoff location
    const dropofflocations = trip.dropofflocations;
    if (!dropofflocations || dropofflocations.length === 0) {
      return res.status(404).json({ error: 'No dropoff location configured' });
    }
    
    const dropoffs = Array.isArray(dropofflocations) ? dropofflocations : JSON.parse(dropofflocations);
    const dropoff = dropoffs[0];
    const address = dropoff.location || dropoff.address;
    
    if (!address) {
      return res.status(404).json({ error: 'Dropoff address not found' });
    }
    
    // Geocode destination address
    const coords = await tripMonitors[company].etaMonitor.geocode(address);
    if (!coords) {
      return res.status(500).json({ error: 'Failed to geocode dropoff address' });
    }
    
    // Deadline is optional; ETA can still be calculated from live location -> destination
    const deadline = trip.enddate || dropoff.delivery_date || dropoff.scheduled_time || null;
    
    // Calculate ETA using Mapbox Directions API with real-time traffic
    const etaStatus = await tripMonitors[company].etaMonitor.checkETA(
      currentLat,
      currentLng,
      coords.lat,
      coords.lng,
      deadline,
      lastUpdate
    );
    
    if (!etaStatus) {
      return res.status(500).json({ error: 'Failed to calculate ETA' });
    }
    
    res.json({
      trip_id: tripId,
      vehicle_plate: plate,
      vehicle_location: { 
        lat: currentLat, 
        lng: currentLng,
        last_update: lastUpdate,
        age_minutes: dataAge,
        source: locationSource
      },
      destination: address,
      destination_coords: coords,
      ...etaStatus
    });
  } catch (error) {
    console.error('Error calculating ETA:', error);
    res.status(500).json({ error: error.message });
  }
});



// Get cached vehicle data
app.get('/vehicles/:plate', (req, res) => {
  const vehicleData = vehicleDataCache.get(req.params.plate);
  if (vehicleData) {
    res.json(vehicleData);
  } else {
    res.status(404).json({ error: 'Vehicle not found' });
  }
});

// Get all cached vehicles
app.get('/vehicles', (req, res) => {
  const vehicles = Array.from(vehicleDataCache.entries()).map(([plate, data]) => ({
    plate,
    ...data
  }));
  res.json(vehicles);
});

// Get all trip routes (optional - for debugging)
app.get('/api/trips/routes/all', (req, res) => {
  const company = req.query.company || 'eps';
  
  if (!tripMonitors[company]) {
    return res.status(400).json({ error: 'Invalid company' });
  }
  
  const allRoutes = tripMonitors[company].db.prepare('SELECT trip_id, company, created_at, updated_at FROM trip_routes').all();
  res.json(allRoutes);
});

// API key validation
const CANBUS_API_KEY = process.env.CANBUS_API_KEY || 'your-secret-key-here';

function validateApiKey(req, res, next) {
  const apiKey = req.query.key || req.headers['x-api-key'];
  if (apiKey !== CANBUS_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
  }
  next();
}

// Get latest CAN bus data snapshot
app.get('/canbus/snapshot', validateApiKey, (req, res) => {
  const company = req.query.company || 'eps';
  
  if (!canBusCaches[company]) {
    return res.status(400).json({ error: 'Invalid company' });
  }
  
  const snapshot = Array.from(canBusCaches[company].values());
  res.json(snapshot);
});

// Get CAN bus data for specific vehicle
app.get('/canbus/:plate', validateApiKey, (req, res) => {
  const company = req.query.company || 'eps';
  
  if (!canBusCaches[company]) {
    return res.status(400).json({ error: 'Invalid company' });
  }
  
  const data = canBusCaches[company].get(req.params.plate);
  if (data) {
    res.json(data);
  } else {
    res.status(404).json({ error: 'No CAN bus data found for vehicle' });
  }
});

// SSE endpoint for streaming CAN bus data
app.get('/stream/canbus', validateApiKey, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  sseClients.add(res);
  
  req.on('close', () => {
    sseClients.delete(res);
  });
});

// WebSocket server for outgoing data
const wss = new WebSocketServer({ port: WS_PORT });
const wsClients = new Set();

wss.on('connection', (ws, req) => {
  const apiKey = new URL(req.url, 'ws://localhost').searchParams.get('key');
  
  if (apiKey !== (process.env.CANBUS_API_KEY || 'K9mX^7pQ')) {
    ws.close(1008, 'Unauthorized');
    return;
  }
  
  wsClients.add(ws);
  console.log(`WebSocket client connected (${wsClients.size} total)`);
  
  if (ctrackPoller && !ctrackPoller.wsClients) {
    ctrackPoller.wsClients = wsClients;
  }
  
  // Send current snapshot on connect (combined from both companies)
  const epsSnapshot = Array.from(canBusCaches.eps.values());
  const mayseneSnapshot = Array.from(canBusCaches.maysene.values());
  const snapshot = [...epsSnapshot, ...mayseneSnapshot];
  ws.send(JSON.stringify({ type: 'snapshot', data: snapshot }));
  
  ws.on('close', () => {
    wsClients.delete(ws);
    console.log(`WebSocket client disconnected (${wsClients.size} remaining)`);
  });
});

app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
  console.log(`WebSocket server running on port ${WS_PORT}`);
  console.log('✅ ETA monitoring enabled - updating every 30 minutes');
  console.log('✅ Status monitoring enabled - checking every 5 minutes');
});
