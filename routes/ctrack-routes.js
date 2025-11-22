const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

let ctrackPoller = null;

// Set poller instance (called from server.js)
router.setCTrackPoller = (poller) => {
  ctrackPoller = poller;
};

// Get C-Track status
router.get('/status', (req, res) => {
  if (!ctrackPoller) {
    return res.json({ enabled: false, message: 'C-Track integration not initialized' });
  }

  res.json({
    enabled: true,
    running: ctrackPoller.isRunning,
    pollInterval: ctrackPoller.pollInterval,
    cachedDrivers: ctrackPoller.driverCache.size
  });
});

// Manually trigger a poll
router.post('/poll', async (req, res) => {
  if (!ctrackPoller) {
    return res.status(400).json({ error: 'C-Track integration not initialized' });
  }

  try {
    await ctrackPoller.fetchAndProcessData();
    res.json({ success: true, message: 'Poll completed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get cached drivers
router.get('/drivers', (req, res) => {
  if (!ctrackPoller) {
    return res.status(400).json({ error: 'C-Track integration not initialized' });
  }

  const drivers = Array.from(ctrackPoller.driverCache.entries()).map(([id, driver]) => ({
    id,
    displayName: driver.displayName,
    surname: driver.surname,
    givenName: driver.givenName
  }));

  res.json({ count: drivers.length, drivers });
});

// Get all drivers from C-Track API
router.get('/drivers/all', async (req, res) => {
  if (!ctrackPoller) {
    return res.status(400).json({ error: 'C-Track integration not initialized' });
  }

  try {
    const drivers = await ctrackPoller.client.getAllDrivers();
    if (!drivers) {
      return res.status(500).json({ error: 'Failed to fetch drivers from C-Track API' });
    }
    res.json(drivers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get driver by ID
router.get('/drivers/:driverId', async (req, res) => {
  if (!ctrackPoller) {
    return res.status(400).json({ error: 'C-Track integration not initialized' });
  }

  try {
    const driver = await ctrackPoller.client.getDriver(req.params.driverId);
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }
    res.json(driver);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get cached vehicles
router.get('/vehicles', (req, res) => {
  if (!ctrackPoller) {
    return res.status(400).json({ error: 'C-Track integration not initialized' });
  }

  const vehicles = Array.from(ctrackPoller.vehicleCache.values());
  res.json({ count: vehicles.length, vehicles });
});

// Get all formatted C-Track vehicles from database
router.get('/data', (req, res) => {
  if (!ctrackPoller) {
    return res.status(400).json({ error: 'C-Track integration not initialized' });
  }

  try {
    const stmt = ctrackPoller.vehicleDB.db.prepare('SELECT * FROM eps_ctrack_vehicles');
    const vehicles = stmt.all();
    res.json({ count: vehicles.length, vehicles });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific vehicle by plate
router.get('/data/:plate', (req, res) => {
  if (!ctrackPoller) {
    return res.status(400).json({ error: 'C-Track integration not initialized' });
  }

  try {
    const stmt = ctrackPoller.vehicleDB.db.prepare('SELECT * FROM eps_ctrack_vehicles WHERE plate = ?');
    const vehicle = stmt.get(req.params.plate);
    if (vehicle) {
      res.json(vehicle);
    } else {
      res.status(404).json({ error: 'Vehicle not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Raw C-Track API proxy
router.get('/api/raw/*', async (req, res) => {
  if (!ctrackPoller) {
    return res.status(400).json({ error: 'C-Track integration not initialized' });
  }

  try {
    const endpoint = req.params[0];
    await ctrackPoller.client.ensureAuthenticated();
    
    const axios = require('axios');
    const response = await axios.get(
      `${ctrackPoller.client.baseURL}/${endpoint}`,
      {
        headers: {
          'Accept': 'application/json',
          'Ocp-Apim-Subscription-Key': ctrackPoller.client.subscriptionKey,
          'x-token': ctrackPoller.client.token,
          'x-tenant': ctrackPoller.client.tenantId
        }
      }
    );
    
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message, details: error.response?.data });
  }
});

module.exports = router;
