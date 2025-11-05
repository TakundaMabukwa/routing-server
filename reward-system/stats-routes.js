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

module.exports = router;