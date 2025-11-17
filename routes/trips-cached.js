const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cache = require('../middleware/supabase-cache');
const router = express.Router();

const supabase = createClient(
  process.env.NEXT_PUBLIC_EPS_SUPABASE_URL,
  process.env.NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY
);

// Get all active trips (cached 30s)
router.get('/active', async (req, res) => {
  try {
    const trips = await cache.getCached('active-trips', async () => {
      const { data } = await supabase
        .from('trips')
        .select('*')
        .not('status', 'in', '(Completed,Delivered)')
        .order('created_at', { ascending: false });
      return data || [];
    }, 30000);
    
    res.json(trips);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get active trips' });
  }
});

// Get trip details (cached 15s)
router.get('/:tripId', async (req, res) => {
  try {
    const { tripId } = req.params;
    
    const trip = await cache.getCached(`trip-${tripId}`, async () => {
      const { data } = await supabase
        .from('trips')
        .select('*')
        .eq('id', tripId)
        .single();
      return data;
    }, 15000);
    
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    res.json(trip);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get trip details' });
  }
});

// Update trip status (invalidates cache)
router.patch('/:tripId/status', async (req, res) => {
  try {
    const { tripId } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    
    const { data: trip } = await supabase
      .from('trips')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', tripId)
      .select()
      .single();
    
    cache.invalidate(`trip-${tripId}`);
    cache.invalidate('active-trips');
    
    res.json(trip);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update trip status' });
  }
});

// Clear trip alert (invalidates cache)
router.patch('/:tripId/clear-alert', async (req, res) => {
  try {
    const { tripId } = req.params;
    
    const { data: trip } = await supabase
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
    
    cache.invalidate(`trip-${tripId}`);
    cache.invalidate('active-trips');
    
    res.json(trip);
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear trip alert' });
  }
});

module.exports = router;
