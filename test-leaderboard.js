const axios = require('axios');
const fs = require('fs');

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
    console.log(`   - Total Distance: ${leaderboard.data.fleet_summary.total_distance_km} km\n`);
    
    // Performance Levels
    console.log('📊 Performance Levels:');
    console.log(`   🥇 Gold: ${leaderboard.data.fleet_summary.performance_levels.gold} drivers`);
    console.log(`   🥈 Silver: ${leaderboard.data.fleet_summary.performance_levels.silver} drivers`);
    console.log(`   🥉 Bronze: ${leaderboard.data.fleet_summary.performance_levels.bronze} drivers`);
    console.log(`   ⚠️  Critical: ${leaderboard.data.fleet_summary.performance_levels.critical} drivers\n`);
    
    // Top 10 Best Performers
    console.log('🏆 Top 10 Best Performers:');
    leaderboard.data.best_performers.forEach((driver, i) => {
      console.log(`   ${i+1}. ${driver.driver_name}: ${driver.current_points} pts (${driver.current_level}) - ${driver.total_violations} violations`);
    });
    console.log('');
    
    // Top 10 Worst Performers
    console.log('⚠️  Top 10 Worst Performers:');
    leaderboard.data.worst_performers.forEach((driver, i) => {
      console.log(`   ${i+1}. ${driver.driver_name}: ${driver.current_points} pts (${driver.current_level}) - ${driver.total_violations} violations`);
    });
    console.log('');
    
    // Top 10 Speeders
    console.log('🚨 Top 10 Speeders:');
    leaderboard.data.top_speeders.forEach((driver, i) => {
      console.log(`   ${i+1}. ${driver.driver_name}: ${driver.speed_violations} speed violations (${driver.current_points} pts)`);
    });
    console.log('');
    
    // Save full data to file
    fs.writeFileSync('leaderboard-full-data.json', JSON.stringify(leaderboard.data, null, 2));
    console.log('💾 Full leaderboard data saved to: leaderboard-full-data.json\n');
    
    // Test 2: Get All Driver Rewards
    console.log('2️⃣ Testing GET /api/eps-rewards/rewards');
    const rewards = await axios.get(`${BASE_URL}/api/eps-rewards/rewards`);
    console.log(`✅ Found ${rewards.data.length} drivers`);
    
    // Save all drivers to file
    fs.writeFileSync('all-drivers-data.json', JSON.stringify(rewards.data, null, 2));
    console.log('💾 All drivers data saved to: all-drivers-data.json\n');
    
    console.log('✅ All tests completed!');
    console.log('\n📁 Check these files for full data:');
    console.log('   - leaderboard-full-data.json');
    console.log('   - all-drivers-data.json');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testEndpoints();
