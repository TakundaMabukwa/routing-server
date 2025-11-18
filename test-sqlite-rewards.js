const EPSRewardSystem = require('./reward-system/eps-reward-system');

async function testSQLiteRewards() {
  console.log('🧪 Testing SQLite + Hourly Sync Reward System...\n');
  
  const rewardSystem = new EPSRewardSystem();
  
  // Test data
  const testDriver = 'JOHN DOE';
  const mockEPSData = {
    Plate: 'TEST123',
    DriverName: testDriver,
    Speed: 125, // Over 120 threshold
    Latitude: -26.1234,
    Longitude: 28.5678,
    LocTime: new Date().toISOString(),
    NameEvent: 'Vehicle In Motion'
  };
  
  console.log('📊 Initial state check...');
  let driverState = rewardSystem.getLocalDriverState(testDriver);
  console.log(`Points: ${driverState.current_points}, Level: ${driverState.current_level}`);
  
  console.log('\n🚗 Processing 6 speed violations...');
  for (let i = 1; i <= 6; i++) {
    const result = await rewardSystem.processEPSData(mockEPSData);
    
    if (result && result.violations.length > 0) {
      const violation = result.violations[0];
      console.log(`Violation ${i}: Count=${violation.violation_count}, Points=${violation.points_remaining}`);
    }
  }
  
  console.log('\n📈 Final driver state (memory):');
  driverState = rewardSystem.getLocalDriverState(testDriver);
  console.log(`Points: ${driverState.current_points}`);
  console.log(`Level: ${driverState.current_level}`);
  console.log(`Speed violations: ${driverState.speed_violations_count}`);
  
  console.log('\n💾 SQLite database check:');
  const sqliteData = rewardSystem.db.prepare('SELECT * FROM driver_rewards WHERE driver_name = ?').get(testDriver);
  if (sqliteData) {
    console.log(`SQLite Points: ${sqliteData.current_points}`);
    console.log(`SQLite Violations: ${sqliteData.speed_violations_count}`);
    console.log(`Synced to Supabase: ${sqliteData.synced_to_supabase ? 'YES' : 'NO'}`);
  } else {
    console.log('No SQLite data found');
  }
  
  console.log('\n☁️ Testing Supabase sync...');
  await rewardSystem.syncToSupabase();
  
  console.log('\n🔍 Testing API compatibility...');
  try {
    const apiResult = await rewardSystem.getDriverRewards(testDriver);
    console.log(`API getDriverRewards works: ${apiResult ? 'YES' : 'NO'}`);
    console.log(`API Points: ${apiResult.current_points}`);
    
  } catch (error) {
    console.log('API compatibility error:', error.message);
  }
  
  console.log('\n✅ Test completed!');
}

// Run test
testSQLiteRewards().catch(console.error);