const axios = require('axios');

const BASE_URL = 'http://localhost:3001';

async function testEndpoints() {
  console.log('🧪 Testing Reward System Endpoints\n');
  
  try {
    // Test 1: Get Leaderboard
    console.log('1️⃣ Testing GET /api/stats/leaderboard');
    const leaderboard = await axios.get(`${BASE_URL}/api/stats/leaderboard?limit=10`);
    console.log('✅ Leaderboard Response:');
    console.log(`   - Total Drivers: ${leaderboard.data.fleet_summary.total_drivers}`);
    console.log(`   - Average Points: ${leaderboard.data.fleet_summary.average_points}`);
    console.log(`   - Total Violations: ${leaderboard.data.fleet_summary.total_violations}`);
    console.log(`   - Total Distance: ${leaderboard.data.fleet_summary.total_distance_km} km`);
    console.log(`   - Best Performer: ${leaderboard.data.best_performers[0]?.driver_name || 'N/A'} (${leaderboard.data.best_performers[0]?.current_points || 0} pts)`);
    console.log(`   - Top Speeder: ${leaderboard.data.top_speeders[0]?.driver_name || 'N/A'} (${leaderboard.data.top_speeders[0]?.speed_violations || 0} violations)\n`);
    
    // Test 2: Get All Driver Rewards
    console.log('2️⃣ Testing GET /api/eps-rewards/rewards');
    const rewards = await axios.get(`${BASE_URL}/api/eps-rewards/rewards`);
    console.log(`✅ Found ${rewards.data.length} drivers in system`);
    if (rewards.data.length > 0) {
      const sample = rewards.data[0];
      console.log(`   Sample Driver: ${sample.driver_name}`);
      console.log(`   - Points: ${sample.current_points}`);
      console.log(`   - Level: ${sample.current_level}`);
      console.log(`   - Speed Violations: ${sample.speed_violations_count || 0}\n`);
    }
    
    // Test 3: Get Specific Driver (if exists)
    if (rewards.data.length > 0) {
      const driverName = rewards.data[0].driver_name;
      console.log(`3️⃣ Testing GET /api/eps-rewards/rewards/driver/${encodeURIComponent(driverName)}`);
      const driver = await axios.get(`${BASE_URL}/api/eps-rewards/rewards/driver/${encodeURIComponent(driverName)}`);
      console.log('✅ Driver Details:');
      console.log(`   - Name: ${driver.data.driver_name}`);
      console.log(`   - Points: ${driver.data.current_points}/100`);
      console.log(`   - Level: ${driver.data.current_level}`);
      console.log(`   - Points Deducted: ${driver.data.points_deducted}`);
      console.log(`   - Speed Violations: ${driver.data.speed_violations_count || 0}`);
      console.log(`   - Harsh Braking: ${driver.data.harsh_braking_count || 0}`);
      console.log(`   - Night Driving: ${driver.data.night_driving_count || 0}\n`);
      
      // Test 4: Get Bi-weekly Distance
      console.log(`4️⃣ Testing GET /api/stats/driver/${encodeURIComponent(driverName)}/biweekly-distance`);
      try {
        const distance = await axios.get(`${BASE_URL}/api/stats/driver/${encodeURIComponent(driverName)}/biweekly-distance`);
        console.log('✅ Bi-weekly Distance:');
        console.log(`   - Starting Mileage: ${distance.data.starting_mileage || 'N/A'}`);
        console.log(`   - Current Mileage: ${distance.data.current_mileage || 'N/A'}`);
        console.log(`   - Distance Covered: ${distance.data.distance_covered || 0} km`);
        console.log(`   - Period Start: ${distance.data.biweek_start_date || 'N/A'}\n`);
      } catch (error) {
        console.log('⚠️  No bi-weekly distance data available yet\n');
      }
    }
    
    // Test 5: Fleet Summary
    console.log('5️⃣ Testing Performance Levels Distribution');
    const levels = leaderboard.data.fleet_summary.performance_levels;
    console.log('✅ Performance Distribution:');
    console.log(`   🥇 Gold: ${levels.gold} drivers`);
    console.log(`   🥈 Silver: ${levels.silver} drivers`);
    console.log(`   🥉 Bronze: ${levels.bronze} drivers`);
    console.log(`   ⚠️  Critical: ${levels.critical} drivers\n`);
    
    // Test 6: Top Speeders
    console.log('6️⃣ Testing Top Speeders');
    console.log('✅ Top 5 Speeders:');
    leaderboard.data.top_speeders.slice(0, 5).forEach((driver, index) => {
      console.log(`   ${index + 1}. ${driver.driver_name}: ${driver.speed_violations} violations (${driver.current_points} pts)`);
    });
    console.log('');
    
    // Test 7: Top Distance
    console.log('7️⃣ Testing Top Distance Drivers');
    console.log('✅ Top 5 Distance:');
    leaderboard.data.top_distance.slice(0, 5).forEach((driver, index) => {
      console.log(`   ${index + 1}. ${driver.driver_name}: ${driver.biweekly_distance_km} km (${driver.current_points} pts)`);
    });
    console.log('');
    
    console.log('✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Error testing endpoints:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
  }
}

// Run tests
testEndpoints();
