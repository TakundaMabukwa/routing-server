require('dotenv').config();
const EPSRewardSystem = require('./reward-system/eps-reward-system');

console.log('🧪 Testing Reward System Optimization\n');

const rewardSystem = new EPSRewardSystem();

// Simulate vehicle data
const testData = {
  Plate: 'TEST123',
  DriverName: 'TEST DRIVER',
  Speed: 85,
  Latitude: -26.1439,
  Longitude: 28.0434,
  LocTime: new Date().toISOString(),
  Mileage: 12345,
  Geozone: 'Test Area',
  Address: 'Test Location',
  NameEvent: 'VEHICLE IN MOTION',
  Statuses: 'ENGINE ON'
};

let updateCount = 0;
const originalUpdate = rewardSystem.updateDriverRewards.bind(rewardSystem);

// Intercept updates to count them
rewardSystem.updateDriverRewards = async function(...args) {
  updateCount++;
  console.log(`📊 Supabase UPDATE #${updateCount}`);
  return originalUpdate(...args);
};

console.log('Simulating 10 vehicle updates over 10 seconds...\n');

let processCount = 0;
const interval = setInterval(async () => {
  processCount++;
  console.log(`[${processCount}/10] Processing vehicle data...`);
  
  try {
    await rewardSystem.processEPSData(testData);
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  if (processCount >= 10) {
    clearInterval(interval);
    
    setTimeout(() => {
      console.log('\n========================================');
      console.log('📊 TEST RESULTS:');
      console.log(`- Vehicle updates processed: ${processCount}`);
      console.log(`- Supabase updates made: ${updateCount}`);
      console.log(`- Reduction: ${Math.round((1 - updateCount/processCount) * 100)}%`);
      console.log('========================================\n');
      
      if (updateCount <= 2) {
        console.log('✅ EXCELLENT: Batching is working!');
      } else if (updateCount <= 5) {
        console.log('✅ GOOD: Significant reduction achieved');
      } else {
        console.log('⚠️ WARNING: Still making many updates');
      }
      
      process.exit(0);
    }, 3000);
  }
}, 1000);
