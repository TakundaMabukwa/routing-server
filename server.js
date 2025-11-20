require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const EPSRewardSystem = require('./reward-system/eps-reward-system');
const epsRoutes = require('./reward-system/eps-rewards');
const mayseneRoutes = require('./reward-system/maysene-rewards');
const statsRoutes = require('./reward-system/stats-routes');
const { parseWithNames } = require('./fuel-parsing/canbus-parser-v2');
const TripMonitor = require('./services/trip-monitor-ultra-minimal');
const HighRiskMonitor = require('./services/high-risk-monitor');
const TollGateMonitor = require('./services/toll-gate-monitor');
const BorderMonitor = require('./services/border-monitor');

const app = express();
const PORT = process.env.PORT || 3001;
const WS_PORT = process.env.WS_PORT || 3002;
const path = require('path');
const Database = require('better-sqlite3');
const { WebSocketServer } = require('ws');

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

// WebSocket connections per company
const websockets = {
  eps: new WebSocket(process.env.EPS_WEBSOCKET_URL),
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
    console.log(`\n[${company.toUpperCase()}] RAW DATA:`, JSON.stringify(vehicleData, null, 2));
    
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
          console.log(`\n========== ${vehicleData.Plate} ==========`);
          parsed.forEach(item => {
            console.log(`${item.code.padEnd(6)} | ${item.name.padEnd(40)} | ${item.value}`);
          });
          console.log(`========================================\n`);
          
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
    if (vehicleData.DriverName && vehicleData.Latitude && vehicleData.Longitude) {
      try {
        const monitor = company === 'eps' ? borderMonitor : null;
        await tripMonitors[company].processVehicleData(vehicleData, monitor);
      } catch (error) {
        console.error('Error processing trip monitoring data:', error);
      }
    }
    
    // Check for high-risk zone entry (EPS only)
    if (company === 'eps' && vehicleData.Latitude && vehicleData.Longitude) {
      try {
        await highRiskMonitor.checkVehicleLocation(vehicleData);
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
    const { plate, driverName, latitude, longitude } = req.body;
    
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
    
    await highRiskMonitor.checkVehicleLocation(testVehicleData);
    
    res.json({
      success: true,
      message: 'High-risk zone check completed',
      vehicle: testVehicleData
    });
  } catch (error) {
    console.error('Test error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mount cached trips routes
const tripsCachedRoutes = require('./routes/trips-cached');
app.use('/api/trips', tripsCachedRoutes);

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
});
