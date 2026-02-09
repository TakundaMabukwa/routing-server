const express = require('express');
const EPSRewardSystem = require('./eps-reward-system');

const router = express.Router();
const epsSystem = new EPSRewardSystem();

// Get monthly driver statistics
router.get('/driver/:driverName/monthly/:year/:month', async (req, res) => {
  try {
    const { driverName, year, month } = req.params;
    const stats = await epsSystem.getMonthlyDriverStats(driverName, parseInt(year), parseInt(month));
    
    if (!stats) {
      return res.status(404).json({ error: 'No data found for this driver/month' });
    }
    
    res.json(stats);
  } catch (error) {
    console.error('Error getting monthly driver stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get fleet monthly risk score
router.get('/fleet/monthly/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    const riskScore = await epsSystem.getFleetMonthlyRiskScore(parseInt(year), parseInt(month));
    
    res.json(riskScore);
  } catch (error) {
    console.error('Error getting fleet monthly risk score:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current month stats for all drivers
router.get('/drivers/current-month', async (req, res) => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    // Get all drivers
    const { data: drivers, error } = await epsSystem.supabase
      .from('eps_driver_rewards')
      .select('driver_name');
    
    if (error) throw error;
    
    // Get stats for each driver
    const allStats = await Promise.all(
      drivers.map(d => epsSystem.getMonthlyDriverStats(d.driver_name, year, month))
    );
    
    res.json(allStats.filter(s => s !== null));
  } catch (error) {
    console.error('Error getting current month stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Manually trigger daily snapshot (for testing)
router.post('/snapshot/create', async (req, res) => {
  try {
    await epsSystem.createDailySnapshot();
    res.json({ message: 'Daily snapshot created successfully' });
  } catch (error) {
    console.error('Error creating snapshot:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test violations for a driver
router.post('/test-violations/:driverName', async (req, res) => {
  try {
    const { driverName } = req.params;
    const { violationType = 'speed', count = 6 } = req.body;
    
    console.log(`🧪 Testing ${violationType} violations for ${driverName}`);
    
    // Ensure driver exists in Supabase first
    let driver = await epsSystem.getDriverRewards(driverName);
    if (!driver) {
      console.log(`Creating driver ${driverName} in Supabase...`);
      driver = await epsSystem.getDriverRewards(driverName); // This will create the driver via upsert
    }
    
    const initialPoints = driver ? driver.current_points : 100;
    console.log(`Initial driver state: ${initialPoints} points, Level: ${driver ? driver.current_level : 'Gold'}`);
    
    const results = [];
    
    for (let i = 1; i <= count; i++) {
      let mockData = {
        Plate: 'KK81SMGP', // Real plate for MMAFU JOHANNES NGUBENI
        Speed: 50,
        DriverName: driverName,
        LocTime: new Date().toISOString(),
        NameEvent: 'Vehicle In Motion'
      };
      
      // Modify based on violation type
      switch (violationType) {
        case 'speed':
          mockData.Speed = 125; // Over 120 threshold
          break;
        case 'harsh_braking':
          mockData.NameEvent = 'Harsh Braking Detected';
          break;
        case 'night_driving':
          const nightTime = new Date();
          nightTime.setHours(23, 0, 0, 0); // 11 PM
          mockData.LocTime = nightTime.toISOString();
          break;
      }
      
      // Directly process violations without going through full EPS pipeline
      if (violationType === 'speed' && mockData.Speed > 120) {
        await epsSystem.processViolation(driverName, mockData.Plate, 'SPEED');
      } else if (violationType === 'harsh_braking' && mockData.NameEvent.includes('Harsh Braking')) {
        await epsSystem.processViolation(driverName, mockData.Plate, 'HARSH_BRAKING');
      } else if (violationType === 'night_driving') {
        await epsSystem.processViolation(driverName, mockData.Plate, 'NIGHT_DRIVING');
      }
      
      // Force immediate batch processing for testing
      await epsSystem.processBatch();
      driver = await epsSystem.getDriverRewards(driverName);
      
      if (driver) {
        let violationCount = 0;
        switch (violationType) {
          case 'speed':
            violationCount = driver.speed_violations_count || 0;
            break;
          case 'harsh_braking':
            violationCount = driver.harsh_braking_count || 0;
            break;
          case 'night_driving':
            violationCount = driver.night_driving_count || 0;
            break;
        }
        
        results.push({
          violation_number: i,
          current_points: driver.current_points,
          points_deducted: driver.points_deducted,
          violation_count: violationCount
        });
      } else {
        results.push({
          violation_number: i,
          error: 'Driver not found after processing'
        });
      }
    }
    
    // Process batch updates
    await epsSystem.processBatch();
    
    // Get final driver state
    const finalDriver = await epsSystem.getDriverRewards(driverName);
    
    res.json({
      driver_name: driverName,
      violation_type: violationType,
      initial_points: initialPoints,
      final_points: finalDriver ? finalDriver.current_points : 100,
      points_deducted: finalDriver ? finalDriver.points_deducted : 0,
      final_level: finalDriver ? finalDriver.current_level : 'Gold',
      results: results
    });
    
  } catch (error) {
    console.error('Error testing violations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Manually trigger bi-weekly reset (for testing/admin)
router.post('/biweekly-reset', async (req, res) => {
  try {
    await epsSystem.performBiweeklyReset();
    res.json({ message: 'Bi-weekly reset completed successfully' });
  } catch (error) {
    console.error('Error triggering bi-weekly reset:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get bi-weekly distance for a driver
router.get('/driver/:driverName/biweekly-distance', async (req, res) => {
  try {
    const { driverName } = req.params;
    const distance = epsSystem.getBiWeeklyDistance(driverName);
    
    if (!distance) {
      return res.status(404).json({ error: 'No bi-weekly distance data available' });
    }
    
    res.json({
      driver_name: driverName,
      ...distance
    });
  } catch (error) {
    console.error('Error getting bi-weekly distance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get leaderboard with top speeders and rankings
router.get('/leaderboard', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    // Get all drivers from Supabase
    const { data: drivers, error } = await epsSystem.supabase
      .from('eps_driver_rewards')
      .select('*')
      .order('current_points', { ascending: false });
    
    if (error) throw error;
    
    // Calculate rankings and stats
    const leaderboard = drivers.map((driver, index) => {
      const totalViolations = (driver.speed_violations_count || 0) + 
                             (driver.harsh_braking_count || 0) + 
                             (driver.night_driving_count || 0);
      
      const distance = driver.current_mileage && driver.starting_mileage 
        ? driver.current_mileage - driver.starting_mileage 
        : 0;
      
      return {
        rank: index + 1,
        driver_name: driver.driver_name,
        current_points: driver.current_points,
        points_deducted: driver.points_deducted,
        current_level: driver.current_level,
        speed_violations: driver.speed_violations_count || 0,
        harsh_braking: driver.harsh_braking_count || 0,
        night_driving: driver.night_driving_count || 0,
        total_violations: totalViolations,
        biweekly_distance_km: distance,
        starting_mileage: driver.starting_mileage,
        current_mileage: driver.current_mileage,
        last_updated: driver.last_updated
      };
    });
    
    // Top speeders (most speed violations)
    const topSpeeders = [...leaderboard]
      .sort((a, b) => b.speed_violations - a.speed_violations)
      .slice(0, parseInt(limit));
    
    // Top distance drivers
    const topDistance = [...leaderboard]
      .filter(d => d.biweekly_distance_km > 0)
      .sort((a, b) => b.biweekly_distance_km - a.biweekly_distance_km)
      .slice(0, parseInt(limit));
    
    // Best performers (highest points)
    const bestPerformers = leaderboard.slice(0, parseInt(limit));
    
    // Worst performers (lowest points)
    const worstPerformers = [...leaderboard]
      .sort((a, b) => a.current_points - b.current_points)
      .slice(0, parseInt(limit));
    
    // Fleet summary
    const fleetSummary = {
      total_drivers: drivers.length,
      average_points: Math.round(drivers.reduce((sum, d) => sum + d.current_points, 0) / drivers.length),
      total_violations: drivers.reduce((sum, d) => 
        sum + (d.speed_violations_count || 0) + (d.harsh_braking_count || 0) + (d.night_driving_count || 0), 0),
      total_speed_violations: drivers.reduce((sum, d) => sum + (d.speed_violations_count || 0), 0),
      total_harsh_braking: drivers.reduce((sum, d) => sum + (d.harsh_braking_count || 0), 0),
      total_night_driving: drivers.reduce((sum, d) => sum + (d.night_driving_count || 0), 0),
      total_distance_km: drivers.reduce((sum, d) => {
        const dist = d.current_mileage && d.starting_mileage ? d.current_mileage - d.starting_mileage : 0;
        return sum + dist;
      }, 0),
      performance_levels: {
        gold: drivers.filter(d => d.current_level === 'Gold').length,
        silver: drivers.filter(d => d.current_level === 'Silver').length,
        bronze: drivers.filter(d => d.current_level === 'Bronze').length,
        critical: drivers.filter(d => d.current_level === 'Critical').length
      }
    };
    
    res.json({
      fleet_summary: fleetSummary,
      best_performers: bestPerformers,
      worst_performers: worstPerformers,
      top_speeders: topSpeeders,
      top_distance: topDistance,
      all_drivers: leaderboard
    });
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;