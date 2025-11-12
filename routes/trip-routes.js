const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

const supabase = createClient(
  process.env.NEXT_PUBLIC_EPS_SUPABASE_URL,
  process.env.NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY
);

// Get all active trips
router.get('/active', async (req, res) => {
  try {
    const { data: trips, error } = await supabase
      .from('trips')
      .select('*')
      .not('status', 'in', '(Completed,Delivered)')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json(trips || []);
  } catch (error) {
    console.error('Error getting active trips:', error);
    res.status(500).json({ error: 'Failed to get active trips' });
  }
});

// Get trip details
router.get('/:tripId', async (req, res) => {
  try {
    const { tripId } = req.params;
    
    const { data: trip, error } = await supabase
      .from('trips')
      .select('*')
      .eq('id', tripId)
      .single();
    
    if (error) throw error;
    
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    res.json(trip);
  } catch (error) {
    console.error('Error getting trip details:', error);
    res.status(500).json({ error: 'Failed to get trip details' });
  }
});

// Get trip route points
router.get('/:tripId/route', async (req, res) => {
  try {
    const { tripId } = req.params;
    
    const { data: trip, error } = await supabase
      .from('trips')
      .select('route_points')
      .eq('id', tripId)
      .single();
    
    if (error) throw error;
    
    res.json(trip?.route_points || []);
  } catch (error) {
    console.error('Error getting trip route:', error);
    res.status(500).json({ error: 'Failed to get trip route' });
  }
});

// Get trips with alerts
router.get('/alerts/active', async (req, res) => {
  try {
    const { data: trips, error } = await supabase
      .from('trips')
      .select('*')
      .not('status', 'in', '(Completed,Delivered)')
      .not('alert_type', 'is', null)
      .order('alert_timestamp', { ascending: false });
    
    if (error) throw error;
    
    res.json(trips || []);
  } catch (error) {
    console.error('Error getting trips with alerts:', error);
    res.status(500).json({ error: 'Failed to get trips with alerts' });
  }
});

// Update trip status
router.patch('/:tripId/status', async (req, res) => {
  try {
    const { tripId } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    
    const { data: trip, error } = await supabase
      .from('trips')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', tripId)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json(trip);
  } catch (error) {
    console.error('Error updating trip status:', error);
    res.status(500).json({ error: 'Failed to update trip status' });
  }
});

// Clear trip alert
router.patch('/:tripId/clear-alert', async (req, res) => {
  try {
    const { tripId } = req.params;
    
    const { data: trip, error } = await supabase
      .from('trips')
      .update({ 
        alert_type: null,
        alert_message: null,
        alert_timestamp: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', tripId)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json(trip);
  } catch (error) {
    console.error('Error clearing trip alert:', error);
    res.status(500).json({ error: 'Failed to clear trip alert' });
  }
});

// Get stop points
router.get('/stop-points/all', async (req, res) => {
  try {
    const { data: stopPoints, error } = await supabase
      .from('stop_points')
      .select('*')
      .order('name');
    
    if (error) throw error;
    
    res.json(stopPoints || []);
  } catch (error) {
    console.error('Error getting stop points:', error);
    res.status(500).json({ error: 'Failed to get stop points' });
  }
});

module.exports = router;