require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const EPSRewardSystem = require('./reward-system/eps-reward-system');
const epsRoutes = require('./reward-system/eps-rewards');
const statsRoutes = require('./reward-system/stats-routes');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());

// Cache latest vehicle data
const vehicleDataCache = new Map();

// Initialize EPS Reward System
const rewardSystem = new EPSRewardSystem();

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
    
    console.log(`Received data for vehicle ${vehicleData.Plate}:`, {
      speed: vehicleData.Speed,
      lat: vehicleData.Latitude,
      lng: vehicleData.Longitude
    });
    
    console.log('Full data:', JSON.stringify(vehicleData, null, 2));
    
    // Check for fuel data in various formats
    const hasFuelData = vehicleData.fuel_level || vehicleData.fuel_volume || 
                       vehicleData.FuelLevel || vehicleData.FuelVolume ||
                       vehicleData.Fuel || vehicleData.fuel;
    
    if (hasFuelData) {
      console.log(`⛽ Fuel Data - ${vehicleData.Plate}: Level=${vehicleData.fuel_level || vehicleData.FuelLevel}L, Volume=${vehicleData.fuel_volume || vehicleData.FuelVolume}L, Percentage=${vehicleData.fuel_percentage}%`);
      try {
        await rewardSystem.storeFuelDataHourly(vehicleData);
      } catch (error) {
        console.error('Error storing independent fuel data:', error);
      }
    } else {
      // Log available fields to debug fuel data structure
      const availableFields = Object.keys(vehicleData).filter(key => 
        key.toLowerCase().includes('fuel') || key.toLowerCase().includes('tank')
      );
      if (availableFields.length > 0) {
        console.log(`🔍 Potential fuel fields for ${vehicleData.Plate}:`, availableFields);
      }
    }
    
    // Process through EPS reward system if driver name exists
    if (vehicleData.DriverName && vehicleData.Plate) {
      try {
        const result = await rewardSystem.processEPSData(vehicleData);
        if (result) {
          console.log(`📊 EPS Result for ${vehicleData.DriverName}:`, {
            violations: result.violations.length,
            points: result.driverScore.currentPoints,
            level: result.driverScore.level
          });
        }
      } catch (error) {
        console.error('Error processing EPS data:', error);
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

app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});