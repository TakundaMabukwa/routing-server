require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const SupabaseEPSRewardSystem = require('./supabase-migration');
const supabaseRoutes = require('./supabase-api-routes');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());

// Cache latest vehicle data
const vehicleDataCache = new Map();

// Initialize EPS Reward System
const rewardSystem = new SupabaseEPSRewardSystem();

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
          console.log(`📊 EPS Processing Result for ${vehicleData.DriverName}:`, {
            violations: result.violations.length,
            currentPoints: result.driverScore.currentPoints,
            level: result.driverScore.level,
            isDriving: result.isDriving
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

// Basic Express routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'Fidelity Server with EPS Driver Rewards System',
    features: [
      'Real-time GPS tracking',
      'Driver performance monitoring', 
      '100-point deduction system',
      'Violation tracking with thresholds',
      'Supabase integration'
    ]
  });
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

// Mount EPS reward system API routes
app.use('/api/eps-rewards', supabaseRoutes);

// Test EPS system endpoint
app.post('/test/eps-violation', async (req, res) => {
  try {
    const { driverName, plate, violationType } = req.body;
    
    if (!driverName || !plate || !violationType) {
      return res.status(400).json({ 
        error: 'Missing required fields: driverName, plate, violationType' 
      });
    }
    
    const result = await rewardSystem.processViolation(driverName, plate, violationType);
    
    res.json({
      success: true,
      message: `Processed ${violationType} violation for ${driverName}`,
      result: {
        currentPoints: result.current_points,
        level: result.current_level,
        violationCount: result[`${violationType.toLowerCase()}_violations_count`] || 0
      }
    });
    
  } catch (error) {
    console.error('Error testing EPS violation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Simulate GPS data with EPS processing
app.post('/test/simulate-gps-eps', async (req, res) => {
  try {
    const { 
      plate = 'JY54WJGP M', 
      driverName = 'SICELIMPILO WILFRED KHANYILE',
      speed = 0, 
      latitude = -26.1439, 
      longitude = 28.0434,
      nameEvent = 'VEHICLE IN MOTION'
    } = req.body;
    
    const testGPSData = {
      Plate: plate,
      DriverName: driverName,
      Speed: speed,
      Latitude: latitude,
      Longitude: longitude,
      LocTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
      Mileage: 12345,
      Geozone: 'Test Area',
      Address: 'Test Location',
      NameEvent: nameEvent,
      Statuses: 'ENGINE ON',
      fuel_level: 45.5,
      fuel_percentage: 75
    };
    
    console.log('Simulating GPS data with EPS processing:', testGPSData);
    
    // Process through EPS system
    const result = await rewardSystem.processEPSData(testGPSData);
    
    res.json({ 
      success: true, 
      gpsData: testGPSData,
      epsResult: result
    });
    
  } catch (error) {
    console.error('Error simulating GPS with EPS:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Fidelity Server with EPS Driver Rewards running on port ${PORT}`);
  console.log(`📊 Features: GPS Tracking + Driver Performance Monitoring`);
  console.log(`🔗 API Endpoints: /api/eps-rewards/*`);
});

module.exports = app;