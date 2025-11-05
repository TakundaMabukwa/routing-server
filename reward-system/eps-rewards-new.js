const express = require('express');
const { supabase } = require('./eps-reward-system');

const router = express.Router();

// Get driver rewards by name
router.get('/driver/:driverName', async (req, res) => {
  try {
    const { driverName } = req.params;
    
    const { data, error } = await supabase
      .from('eps_driver_rewards')
      .select('*')
      .eq('driver_name', driverName)
      .single();
    
    if (error) throw error;
    
    res.json(data);
  } catch (error) {
    console.error('Error getting driver rewards:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all drivers
router.get('/drivers', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('eps_driver_rewards')
      .select('*')
      .order('current_points', { ascending: false });
    
    if (error) throw error;
    
    res.json(data);
  } catch (error) {
    console.error('Error getting all drivers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
router.get('/health', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('eps_driver_rewards')
      .select('count')
      .limit(1);
    
    if (error) throw error;
    
    res.json({ 
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({ 
      status: 'unhealthy',
      error: error.message 
    });
  }
});

module.exports = router;