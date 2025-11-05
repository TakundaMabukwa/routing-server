const EPSRewardSystem = require('./reward-system/eps-reward-system');

const rewardSystem = new EPSRewardSystem();

// Test function to simulate violations for a driver
async function testViolations() {
  const testDriver = "MMAFU JOHANNES NGUBENI";
  const testPlate = "KK81SMGP";
  
  console.log(`🧪 Testing violations for ${testDriver}`);
  
  // Get initial driver state
  let driver = await rewardSystem.getDriverRewards(testDriver);
  console.log(`Initial state: ${driver.current_points} points, Level: ${driver.current_level}`);
  
  // Test 1: Speed violations (threshold = 4)
  console.log('\n--- Testing Speed Violations ---');
  for (let i = 1; i <= 6; i++) {
    const mockData = {
      Plate: testPlate,
      Speed: 125, // Over 120 threshold
      DriverName: testDriver,
      LocTime: new Date().toISOString(),
      NameEvent: "Vehicle In Motion"
    };
    
    await rewardSystem.processEPSData(mockData);
    driver = await rewardSystem.getDriverRewards(testDriver);
    console.log(`Speed violation #${i}: ${driver.current_points} points, Speed count: ${driver.speed_violations_count}`);
  }
  
  // Test 2: Harsh braking violations (threshold = 4)
  console.log('\n--- Testing Harsh Braking Violations ---');
  for (let i = 1; i <= 6; i++) {
    const mockData = {
      Plate: testPlate,
      Speed: 50,
      DriverName: testDriver,
      LocTime: new Date().toISOString(),
      NameEvent: "Harsh Braking Detected"
    };
    
    await rewardSystem.processEPSData(mockData);
    driver = await rewardSystem.getDriverRewards(testDriver);
    console.log(`Harsh braking #${i}: ${driver.current_points} points, Braking count: ${driver.harsh_braking_count}`);
  }
  
  // Test 3: Night driving violations (threshold = 4)
  console.log('\n--- Testing Night Driving Violations ---');
  for (let i = 1; i <= 6; i++) {
    const nightTime = new Date();
    nightTime.setHours(23, 0, 0, 0); // 11 PM
    
    const mockData = {
      Plate: testPlate,
      Speed: 60,
      DriverName: testDriver,
      LocTime: nightTime.toISOString(),
      NameEvent: "Vehicle In Motion"
    };
    
    await rewardSystem.processEPSData(mockData);
    driver = await rewardSystem.getDriverRewards(testDriver);
    console.log(`Night driving #${i}: ${driver.current_points} points, Night count: ${driver.night_driving_count}`);
  }
  
  // Final state
  console.log('\n--- Final Results ---');
  console.log(`Final points: ${driver.current_points}/100`);
  console.log(`Final level: ${driver.current_level}`);
  console.log(`Points deducted: ${driver.points_deducted}`);
  console.log(`Speed violations: ${driver.speed_violations_count}`);
  console.log(`Harsh braking: ${driver.harsh_braking_count}`);
  console.log(`Night driving: ${driver.night_driving_count}`);
  
  // Process batch updates
  await rewardSystem.processBatch();
}

// Run the test
testViolations().catch(console.error);