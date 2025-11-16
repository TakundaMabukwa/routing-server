const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_MAYSENE_SUPABASE_URL,
  process.env.NEXT_PUBLIC_MAYSENE_SUPABASE_ANON_KEY
);

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

// Get all driver performance records
router.get('/performance', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('eps_daily_performance')
      .select('*')
      .order('date', { ascending: false })
      .limit(100);
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error getting performance data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all violations
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

// Get all daily stats
router.get('/daily-stats', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('eps_daily_performance')
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

// Get latest tracking data
router.get('/latest', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('eps_daily_performance')
      .select('*')
      .order('latest_loc_time', { ascending: false })
      .limit(1)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'No data available' });
      }
      throw error;
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error getting latest data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get driver leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const { data, error } = await supabase
      .from('eps_driver_rewards')
      .select('*')
      .order('current_points', { ascending: false })
      .limit(parseInt(limit));
    
    if (error) throw error;
    
    const leaderboard = data.map((driver, index) => ({
      rank: index + 1,
      driverName: driver.driver_name,
      currentPoints: driver.current_points,
      performanceLevel: driver.current_level,
      totalViolations: (driver.speed_violations_count || 0) + 
                      (driver.harsh_braking_count || 0) + 
                      (driver.night_driving_count || 0)
    }));
    
    res.json(leaderboard);
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get driver risk assessment
router.get('/driver-risk-assessment', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('eps_driver_rewards')
      .select('*')
      .order('current_points', { ascending: true });
    
    if (error) throw error;
    
    const driversWithRisk = data.map(driver => {
      const totalViolations = (driver.speed_violations_count || 0) + 
                             (driver.harsh_braking_count || 0) + 
                             (driver.night_driving_count || 0);
      
      const pointsRisk = 100 - driver.current_points;
      const violationRisk = Math.min(totalViolations * 5, 50);
      const speedRisk = Math.min((driver.speed_violations_count || 0) * 10, 30);
      const nightRisk = Math.min((driver.night_driving_count || 0) * 8, 20);
      const overallRiskScore = Math.round(pointsRisk + violationRisk + speedRisk + nightRisk);
      
      return {
        driver_name: driver.driver_name,
        plate: driver.plate,
        current_points: driver.current_points,
        current_level: driver.current_level,
        total_violations: totalViolations,
        overall_risk_score: Math.min(overallRiskScore, 200),
        risk_category: overallRiskScore <= 30 ? 'Low Risk' : 
                      overallRiskScore <= 70 ? 'Medium Risk' : 'High Risk'
      };
    });
    
    const totalDrivers = driversWithRisk.length;
    const fleetRiskScore = totalDrivers > 0 ? 
      Math.round(driversWithRisk.reduce((sum, d) => sum + d.overall_risk_score, 0) / totalDrivers) : 0;
    
    res.json({
      fleet_overall_risk_score: fleetRiskScore,
      total_drivers: totalDrivers,
      risk_distribution: {
        low_risk: driversWithRisk.filter(d => d.risk_category === 'Low Risk').length,
        medium_risk: driversWithRisk.filter(d => d.risk_category === 'Medium Risk').length,
        high_risk: driversWithRisk.filter(d => d.risk_category === 'High Risk').length
      },
      drivers: driversWithRisk
    });
  } catch (error) {
    console.error('Error getting risk assessment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get monthly incident criteria
router.get('/monthly-incident-criteria', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('eps_driver_rewards')
      .select('*');
    
    if (error) throw error;
    
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    
    const monthlyStats = {
      period: currentMonth,
      total_drivers: data.length,
      penalty_events: {
        speed_violations: data.reduce((sum, d) => sum + (d.speed_violations_count || 0), 0),
        harsh_braking: data.reduce((sum, d) => sum + (d.harsh_braking_count || 0), 0),
        night_driving: data.reduce((sum, d) => sum + (d.night_driving_count || 0), 0),
        total_penalties: data.reduce((sum, d) => sum + 
          (d.speed_violations_count || 0) + 
          (d.harsh_braking_count || 0) + 
          (d.night_driving_count || 0), 0)
      },
      points_deducted: data.reduce((sum, d) => sum + (d.points_deducted || 0), 0),
      drivers_affected: data.filter(d => (d.points_deducted || 0) > 0).length,
      performance_levels: {
        gold: data.filter(d => d.current_level === 'Gold').length,
        silver: data.filter(d => d.current_level === 'Silver').length,
        bronze: data.filter(d => d.current_level === 'Bronze').length,
        critical: data.filter(d => d.current_level === 'Critical').length
      }
    };
    
    res.json(monthlyStats);
  } catch (error) {
    console.error('Error getting monthly incident criteria:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get top worst drivers
router.get('/top-worst-drivers', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const { data, error } = await supabase
      .from('eps_driver_rewards')
      .select('driver_name, speed_violations_count, current_points, current_level')
      .order('speed_violations_count', { ascending: false })
      .limit(parseInt(limit));
    
    if (error) throw error;
    
    const worstDrivers = data.map(driver => ({
      name: driver.driver_name,
      speed_violations: driver.speed_violations_count,
      current_points: driver.current_points,
      risk_level: driver.current_level
    }));
    
    res.json({
      period: 'Current standings',
      worst_drivers: worstDrivers
    });
  } catch (error) {
    console.error('Error getting worst drivers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all driver profiles
router.get('/all-driver-profiles', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('eps_driver_rewards')
      .select('*')
      .order('current_points', { ascending: false });
    
    if (error) throw error;
    
    const driverProfiles = data.map(driver => {
      const totalViolations = (driver.speed_violations_count || 0) + 
                             (driver.harsh_braking_count || 0) + 
                             (driver.night_driving_count || 0);
      
      return {
        driverName: driver.driver_name,
        plate: driver.plate,
        currentPoints: driver.current_points,
        performanceLevel: driver.current_level,
        violations: {
          total: totalViolations,
          speed: driver.speed_violations_count || 0,
          harshBraking: driver.harsh_braking_count || 0,
          nightDriving: driver.night_driving_count || 0
        }
      };
    });
    
    res.json({
      totalDrivers: driverProfiles.length,
      drivers: driverProfiles
    });
  } catch (error) {
    console.error('Error getting all driver profiles:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get executive dashboard
router.get('/executive-dashboard', async (req, res) => {
  try {
    const { data: drivers, error } = await supabase
      .from('eps_driver_rewards')
      .select('current_points, current_level, speed_violations_count, route_violations_count, night_driving_count');
    
    if (error) throw error;
    
    const dashboard = {
      driver_performance: {
        total_drivers: drivers.length,
        average_points: drivers.length > 0 ? 
          Math.round(drivers.reduce((sum, d) => sum + d.current_points, 0) / drivers.length) : 100,
        performance_levels: {
          gold: drivers.filter(d => d.current_level === 'Gold').length,
          silver: drivers.filter(d => d.current_level === 'Silver').length,
          bronze: drivers.filter(d => d.current_level === 'Bronze').length,
          critical: drivers.filter(d => d.current_level === 'Critical').length
        }
      },
      violations_summary: {
        speed_violations: drivers.reduce((sum, d) => sum + (d.speed_violations_count || 0), 0),
        route_violations: drivers.reduce((sum, d) => sum + (d.route_violations_count || 0), 0),
        night_violations: drivers.reduce((sum, d) => sum + (d.night_driving_count || 0), 0),
        total_violations: drivers.reduce((sum, d) => sum + 
          (d.speed_violations_count || 0) + 
          (d.route_violations_count || 0) + 
          (d.night_driving_count || 0), 0)
      },
      status: 'OK'
    };
    
    res.json(dashboard);
  } catch (error) {
    console.error('Error getting executive dashboard:', error);
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
      database_connection: 'ok',
      database_type: 'Supabase (Maysene)',
      current_time: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: 'Supabase connection failed'
    });
  }
});

module.exports = router;
