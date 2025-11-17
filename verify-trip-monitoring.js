// Quick verification script
require('dotenv').config();
const TripMonitor = require('./services/trip-monitor-ultra-minimal');

console.log('✅ Trip Monitor loaded successfully');
console.log('✅ Using: trip-monitor-ultra-minimal.js');

const monitor = new TripMonitor('eps');

setTimeout(() => {
  console.log('\n📊 Trip Monitor Status:');
  console.log(`- Active trips: ${monitor.activeTrips.size}`);
  console.log(`- Cached drivers: ${monitor.matchedDrivers.size}`);
  console.log(`- Cached vehicles: ${monitor.matchedVehicles.size}`);
  console.log(`- Stop points cached: ${monitor.stopPointsCache.size}`);
  
  if (monitor.activeTrips.size > 0) {
    console.log('\n✅ Trip monitoring is ACTIVE');
  } else {
    console.log('\n⚠️ No active trips found (create a trip in Supabase)');
  }
  
  process.exit(0);
}, 3000);
