const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
);

// Test Supabase connection
router.get('/test', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('eps_driver_rewards')
      .select('count')
      .limit(1);
    
    if (error) throw error;
    
    res.json({
      success: true,
      message: 'Supabase connection successful',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Supabase connection error:', error);
    res.status(500).json({ 
      error: 'Supabase connection failed',
      details: error.message 
    });
  }
});

// Get all driver rewards
router.get('/rewards', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('eps_driver_rewards')
      .select('*')
      .order('current_points', { ascending: false });
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error getting rewards:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get rewards by driver
router.get('/rewards/driver/:driverName', async (req, res) => {
  try {
    const { driverName } = req.params;
    const { data, error } = await supabase
      .from('eps_driver_rewards')
      .select('*')
      .eq('driver_name', driverName)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Driver not found' });
      }
      throw error;
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error getting driver rewards:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get daily performance
router.get('/performance', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('eps_daily_performance')
      .select('*')
      .order('date', { ascending: false })
      .order('last_update_time', { ascending: false })
      .limit(100);
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error getting performance data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get performance by driver
router.get('/performance/driver/:driverName', async (req, res) => {
  try {
    const { driverName } = req.params;
    const { data, error } = await supabase
      .from('eps_daily_performance')
      .select('*')
      .eq('driver_name', driverName)
      .order('date', { ascending: false })
      .limit(30);
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error getting driver performance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get violations
router.get('/violations', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('eps_daily_violations')
      .select('*')
      .order('date', { ascending: false })
      .limit(100);
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error getting violations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get violations by driver
router.get('/violations/driver/:driverName', async (req, res) => {
  try {
    const { driverName } = req.params;
    const { data, error } = await supabase
      .from('eps_driver_violations')
      .select('*')
      .eq('driver_name', driverName)
      .order('timestamp', { ascending: false })
      .limit(50);
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error getting driver violations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get daily stats
router.get('/daily-stats', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('eps_daily_stats')
      .select('*')
      .order('date', { ascending: false })
      .limit(100);
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error getting daily stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get daily stats by driver
router.get('/daily-stats/driver/:driverName', async (req, res) => {
  try {
    const { driverName } = req.params;
    const { data, error } = await supabase
      .from('eps_daily_stats')
      .select('*')
      .eq('driver_name', driverName)
      .order('date', { ascending: false })
      .limit(30);
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error getting driver daily stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get latest vehicle data
router.get('/vehicles', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('eps_vehicles')
      .select('*')
      .order('updated_at', { ascending: false });
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error getting vehicles:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get vehicle by plate
router.get('/vehicles/:plate', async (req, res) => {
  try {
    const { plate } = req.params;
    const { data, error } = await supabase
      .from('eps_vehicles')
      .select('*')
      .eq('plate', plate)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Vehicle not found' });
      }
      throw error;
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error getting vehicle:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get driver leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const { data, error } = await supabase
      .from('eps_driver_rewards')
      .select('driver_name, current_points, current_level, violations_count, last_updated')
      .order('current_points', { ascending: false })
      .limit(parseInt(limit));
    
    if (error) throw error;
    
    const leaderboard = data.map((driver, index) => ({
      rank: index + 1,
      driverName: driver.driver_name,
      currentPoints: driver.current_points,
      level: driver.current_level,
      violations: driver.violations_count,
      lastUpdated: driver.last_updated
    }));
    
    res.json(leaderboard);
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get driver performance report
router.get('/driver-performance/:driverName', async (req, res) => {
  try {
    const { driverName } = req.params;
    const { startDate, endDate } = req.query;
    
    // Default to current month
    const now = new Date();
    const defaultStartDate = startDate || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const defaultEndDate = endDate || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    
    // Get performance data
    const { data: performanceData, error: perfError } = await supabase
      .from('eps_daily_performance')
      .select('*')
      .eq('driver_name', driverName)
      .gte('date', defaultStartDate)
      .lte('date', defaultEndDate);
    
    if (perfError) throw perfError;
    
    // Get violations data
    const { data: violationsData, error: violError } = await supabase
      .from('eps_daily_violations')
      .select('*')
      .eq('driver_name', driverName)
      .gte('date', defaultStartDate)
      .lte('date', defaultEndDate);
    
    if (violError) throw violError;
    
    // Calculate summary
    const totalDays = performanceData.length;
    const totalViolations = violationsData.reduce((sum, day) => sum + day.total_violations, 0);
    const speedingIncidents = violationsData.reduce((sum, day) => sum + day.speeding_count, 0);
    const avgEfficiency = totalDays > 0 ? 
      performanceData.reduce((sum, day) => sum + day.efficiency, 0) / totalDays : 0;
    const avgSafetyScore = totalDays > 0 ? 
      performanceData.reduce((sum, day) => sum + day.safety_score, 0) / totalDays : 0;
    
    const report = {
      driverName,
      period: `${defaultStartDate} to ${defaultEndDate}`,
      totalDays,
      totalViolations,
      speedingIncidents,
      averageEfficiency: (avgEfficiency * 100).toFixed(2),
      averageSafetyScore: (avgSafetyScore * 100).toFixed(2),
      performanceScore: Math.round((avgEfficiency * 100 + avgSafetyScore * 100) / 2)
    };
    
    res.json(report);
  } catch (error) {
    console.error('Error getting driver performance report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset all driver points (monthly reset)
router.post('/reset-points', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('eps_driver_rewards')
      .update({
        current_points: 100,
        points_deducted: 0,
        speed_violations_count: 0,
        harsh_braking_count: 0,
        night_driving_count: 0,
        route_violations_count: 0,
        other_violations_count: 0,
        speed_threshold_exceeded: false,
        braking_threshold_exceeded: false,
        night_threshold_exceeded: false,
        route_threshold_exceeded: false,
        other_threshold_exceeded: false,
        current_level: 'Gold',
        last_updated: new Date().toISOString()
      })
      .select('driver_name');
    
    if (error) throw error;
    
    res.json({
      success: true,
      message: `Reset ${data.length} drivers to 100 points`,
      drivers: data.map(d => d.driver_name)
    });
  } catch (error) {
    console.error('Error resetting points:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;