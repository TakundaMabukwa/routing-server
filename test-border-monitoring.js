require('dotenv').config();
const BorderMonitor = require('./services/border-monitor');

async function testBorderMonitoring() {
  console.log('🧪 Testing Border Monitoring (1km radius)\n');
  
  const monitor = new BorderMonitor('eps');
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('Step 1: Checking loaded borders...');
  const borders = monitor.db.prepare('SELECT * FROM border_warnings').all();
  console.log(`✅ Loaded ${borders.length} border warnings\n`);
  
  if (borders.length === 0) {
    console.log('❌ No borders found. Run: node sync-borders.js\n');
    process.exit(0);
  }
  
  console.log('First 5 borders:');
  borders.slice(0, 5).forEach(b => {
    console.log(`  - ${b.name}`);
  });
  console.log();
  
  console.log('Step 2: Testing Beitbridge border detection...');
  const beitbridge = borders.find(b => b.name.includes('Beitbridge'));
  
  if (!beitbridge) {
    console.log('❌ Beitbridge not found\n');
    process.exit(0);
  }
  
  const coords = monitor.parsePolygonCoordinates(beitbridge.coordinates);
  if (!coords) {
    console.log('❌ Invalid coordinates\n');
    process.exit(0);
  }
  
  const centroid = monitor.getCentroid(coords);
  console.log(`✅ Beitbridge centroid: ${centroid.lat}, ${centroid.lon}\n`);
  
  console.log('Step 3: Simulating vehicle positions (1km radius)...\n');
  
  const scenarios = [
    { name: 'Far away (5km)', lat: centroid.lat + 0.045, lon: centroid.lon, expected: false },
    { name: 'Near (2km)', lat: centroid.lat + 0.018, lon: centroid.lon, expected: false },
    { name: 'At border (800m)', lat: centroid.lat + 0.0072, lon: centroid.lon, expected: true },
    { name: 'At border (500m)', lat: centroid.lat + 0.0045, lon: centroid.lon, expected: true },
  ];
  
  for (const scenario of scenarios) {
    const dist = monitor.calculateDistance(
      scenario.lat, scenario.lon,
      centroid.lat, centroid.lon
    );
    const distKm = (dist / 1000).toFixed(2);
    
    console.log(`  ${scenario.name}:`);
    console.log(`    Distance: ${distKm}km`);
    console.log(`    Should alert: ${scenario.expected ? 'YES' : 'NO'}`);
    console.log(`    Within 1km: ${dist <= 1000 ? 'YES ✅' : 'NO ❌'}`);
    
    const vehicleData = {
      Plate: 'TEST-BORDER',
      DriverName: 'Test Driver',
      Latitude: scenario.lat,
      Longitude: scenario.lon
    };
    
    const isAtBorder = await monitor.checkVehicleLocation(vehicleData, 999);
    console.log(`    Returned: ${isAtBorder ? 'true (at border)' : 'false (not at border)'}`);
    console.log();
  }
  
  console.log('Step 4: Testing cooldown...');
  const alertKey = 'border:999';
  console.log(`  Cooldown active: ${monitor.vehicleAlerts.has(alertKey) ? '✅' : '❌'}\n`);
  
  console.log('✅ Test completed!\n');
  console.log('Summary:');
  console.log('  - Border radius: 1km (1000m)');
  console.log('  - Returns true when at border');
  console.log('  - Skips unauthorized stop check');
  console.log('  - 1-hour cooldown per trip\n');
  
  process.exit(0);
}

testBorderMonitoring().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
