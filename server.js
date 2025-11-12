require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const EPSRewardSystem = require('./reward-system/eps-reward-system');
const epsRoutes = require('./reward-system/eps-rewards');
const statsRoutes = require('./reward-system/stats-routes');
const { parseWithNames } = require('./fuel-parsing/canbus-parser-v2');
const TripMonitor = require('./services/trip-monitor');

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

// SQLite database
const db = new Database(path.join(__dirname, 'canbus.db'));

// Create table
db.exec(`
  CREATE TABLE IF NOT EXISTS canbus (
    plate TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    timestamp TEXT NOT NULL
  )
`);

// Memory cache
const canBusCache = new Map();

// Load existing data into cache
const rows = db.prepare('SELECT * FROM canbus').all();
rows.forEach(row => {
  const vehicleData = JSON.parse(row.data);
  canBusCache.set(row.plate, vehicleData);
});
console.log(`Loaded CAN bus data for ${canBusCache.size} vehicles`);

// Prepared statement for upsert
const upsertStmt = db.prepare(`
  INSERT INTO canbus (plate, data, timestamp) 
  VALUES (?, ?, ?)
  ON CONFLICT(plate) DO UPDATE SET data = ?, timestamp = ?
`);

function saveCanBusData(plate, data) {
  const dataStr = JSON.stringify(data);
  const timestamp = data.timestamp;
  upsertStmt.run(plate, dataStr, timestamp, dataStr, timestamp);
}

// Initialize EPS Reward System
const rewardSystem = new EPSRewardSystem();

// Initialize Trip Monitor
const tripMonitor = new TripMonitor();

// WebSocket client connection
const ws = new WebSocket(process.env.WEBSOCKET_URL);

ws.on('open', () => {
  console.log('Connected to WebSocket:', process.env.WEBSOCKET_URL);
});

ws.on('message', async (data) => {
  try {
    const vehicleData = JSON.parse(data.toString());
    
    // Cache latest vehicle data
    vehicleDataCache.set(vehicleData.Plate, vehicleData);
    
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
          canBusCache.set(vehicleData.Plate, streamData);
          saveCanBusData(vehicleData.Plate, streamData);
          
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
    
    // Process through EPS reward system if driver name exists
    if (vehicleData.DriverName && vehicleData.Plate) {
      try {
        const result = await rewardSystem.processEPSData(vehicleData);
      } catch (error) {
        console.error('Error processing EPS data:', error);
      }
    }
    
    // Process through trip monitoring system
    if (vehicleData.DriverName && vehicleData.Latitude && vehicleData.Longitude) {
      try {
        await tripMonitor.processVehicleData(vehicleData);
      } catch (error) {
        console.error('Error processing trip monitoring data:', error);
      }
    }
    
  } catch (error) {
    console.error('Error parsing WebSocket data:', error);
  }
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', () => {
  console.log('WebSocket connection closed');
});

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
app.use('/api/stats', statsRoutes);

// Get trip route points by trip ID
app.get('/api/trips/:tripId/route', (req, res) => {
  const tripId = parseInt(req.params.tripId);
  const routeData = tripMonitor.getRoutePoints(tripId);
  if (routeData) {
    res.json(routeData);
  } else {
    res.status(404).json({ error: 'Trip route not found' });
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
  const allRoutes = tripMonitor.db.prepare('SELECT trip_id, company, created_at, updated_at FROM trip_routes').all();
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
  const snapshot = Array.from(canBusCache.values());
  res.json(snapshot);
});

// Get CAN bus data for specific vehicle
app.get('/canbus/:plate', validateApiKey, (req, res) => {
  const data = canBusCache.get(req.params.plate);
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
  
  // Send current snapshot on connect
  const snapshot = Array.from(canBusCache.values());
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
