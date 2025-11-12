const express = require('express');
const router = express.Router();
const EPSTripMonitor = require('../services/eps-trip-monitor');
const { pgPool } = require('../services/eps-trip-monitor');

const tripMonitor = new EPSTripMonitor();

// Start new trip
router.post('/start', async (req, res) => {
  try {
    const { driverName, plate, routeName, selectedStopPoints } = req.body;
    
    if (!driverName || !plate) {
      return res.status(400).json({ error: 'Driver name and plate are required' });
    }
    
    const trip = await tripMonitor.startTrip(driverName, plate, routeName, selectedStopPoints);
    res.json({ success: true, trip });
  } catch (error) {
    console.error('Error starting trip:', error);
    res.status(500).json({ error: 'Failed to start trip' });
  }
});

// End trip
router.post('/end/:tripId', async (req, res) => {
  try {
    const { tripId } = req.params;
    const trip = await tripMonitor.endTrip(tripId);
    res.json({ success: true, trip });
  } catch (error) {
    console.error('Error ending trip:', error);
    res.status(500).json({ error: 'Failed to end trip' });
  }
});

// Reset break reminder
router.post('/break-reset/:tripId', async (req, res) => {
  try {
    const { tripId } = req.params;
    const trip = await tripMonitor.resetBreakReminder(tripId);
    res.json({ success: true, trip });
  } catch (error) {
    console.error('Error resetting break reminder:', error);
    res.status(500).json({ error: 'Failed to reset break reminder' });
  }
});

// Get active trips
router.get('/active', async (req, res) => {
  try {
    const query = `
      SELECT t.*, 
        COUNT(tr.id) as route_points_count,
        COUNT(ta.id) as alerts_count
      FROM eps_trips t
      LEFT JOIN eps_trip_routes tr ON t.id = tr.trip_id
      LEFT JOIN eps_trip_alerts ta ON t.id = ta.trip_id AND ta.acknowledged = FALSE
      WHERE t.status = 'active'
      GROUP BY t.id
      ORDER BY t.start_time DESC
    `;
    
    const result = await pgPool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting active trips:', error);
    res.status(500).json({ error: 'Failed to get active trips' });
  }
});

// Get trip details
router.get('/:tripId', async (req, res) => {
  try {
    const { tripId } = req.params;
    
    const tripQuery = 'SELECT * FROM eps_trips WHERE id = $1';
    const tripResult = await pgPool.query(tripQuery, [tripId]);
    
    if (tripResult.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    const trip = tripResult.rows[0];
    
    // Get route points
    const routeQuery = `
      SELECT latitude, longitude, speed, timestamp
      FROM eps_trip_routes
      WHERE trip_id = $1
      ORDER BY timestamp ASC
    `;
    const routeResult = await pgPool.query(routeQuery, [tripId]);
    
    // Get alerts
    const alertsQuery = `
      SELECT * FROM eps_trip_alerts
      WHERE trip_id = $1
      ORDER BY created_at DESC
    `;
    const alertsResult = await pgPool.query(alertsQuery, [tripId]);
    
    // Get stop points
    const stopPointsQuery = `
      SELECT tsp.*, sp.name, sp.coordinates, sp.radius
      FROM eps_trip_stop_points tsp
      JOIN stop_points sp ON tsp.stop_point_id = sp.id
      WHERE tsp.trip_id = $1
    `;
    const stopPointsResult = await pgPool.query(stopPointsQuery, [tripId]);
    
    res.json({
      trip,
      route: routeResult.rows,
      alerts: alertsResult.rows,
      stopPoints: stopPointsResult.rows
    });
  } catch (error) {
    console.error('Error getting trip details:', error);
    res.status(500).json({ error: 'Failed to get trip details' });
  }
});

// Get trip alerts
router.get('/:tripId/alerts', async (req, res) => {
  try {
    const { tripId } = req.params;
    
    const query = `
      SELECT * FROM eps_trip_alerts
      WHERE trip_id = $1
      ORDER BY created_at DESC
    `;
    
    const result = await pgPool.query(query, [tripId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting trip alerts:', error);
    res.status(500).json({ error: 'Failed to get trip alerts' });
  }
});

// Acknowledge alert
router.post('/alerts/:alertId/acknowledge', async (req, res) => {
  try {
    const { alertId } = req.params;
    
    const query = `
      UPDATE eps_trip_alerts
      SET acknowledged = TRUE, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await pgPool.query(query, [alertId]);
    res.json({ success: true, alert: result.rows[0] });
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

// Get all stop points
router.get('/stop-points/all', async (req, res) => {
  try {
    const query = 'SELECT * FROM stop_points ORDER BY name';
    const result = await pgPool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting stop points:', error);
    res.status(500).json({ error: 'Failed to get stop points' });
  }
});

// Create stop point
router.post('/stop-points', async (req, res) => {
  try {
    const { name, coordinates, radius, color } = req.body;
    
    if (!name || !coordinates) {
      return res.status(400).json({ error: 'Name and coordinates are required' });
    }
    
    const query = `
      INSERT INTO stop_points (name, coordinates, radius, color)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    
    const result = await pgPool.query(query, [name, coordinates, radius || 100, color]);
    res.json({ success: true, stopPoint: result.rows[0] });
  } catch (error) {
    console.error('Error creating stop point:', error);
    res.status(500).json({ error: 'Failed to create stop point' });
  }
});

// Add note to trip
router.post('/:tripId/notes', async (req, res) => {
  try {
    const { tripId } = req.params;
    const { note, status } = req.body;
    
    if (!note) {
      return res.status(400).json({ error: 'Note is required' });
    }
    
    const noteEntry = {
      note,
      status: status || 'general',
      timestamp: new Date().toISOString(),
      id: Date.now()
    };
    
    const query = `
      UPDATE trips 
      SET notes = COALESCE(notes, '[]'::jsonb) || $2::jsonb,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await pgPool.query(query, [tripId, JSON.stringify(noteEntry)]);
    res.json({ success: true, trip: result.rows[0] });
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// Get trip notes
router.get('/:tripId/notes', async (req, res) => {
  try {
    const { tripId } = req.params;
    
    const query = 'SELECT notes FROM trips WHERE id = $1';
    const result = await pgPool.query(query, [tripId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    res.json(result.rows[0].notes || []);
  } catch (error) {
    console.error('Error getting notes:', error);
    res.status(500).json({ error: 'Failed to get notes' });
  }
});

module.exports = router;