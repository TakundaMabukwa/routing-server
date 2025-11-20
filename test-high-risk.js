require('dotenv').config();
const HighRiskMonitor = require('./services/high-risk-monitor');

async function test() {
  console.log('🧪 Testing High-Risk Zone Detection\n');
  
  const monitor = new HighRiskMonitor('eps');
  
  // Wait for zones to load
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log(`Loaded ${monitor.highRiskZones.length} high-risk zones\n`);
  
  // Test vehicle INSIDE Soweto high-risk area
  const testVehicle1 = {
    Plate: 'TEST123GP',
    DriverName: 'John Test',
    Latitude: -26.25,
    Longitude: 27.85,
    Speed: 50,
    LocTime: new Date().toISOString()
  };
  
  console.log('Test 1: Vehicle INSIDE high-risk zone');
  console.log(`Location: ${testVehicle1.Latitude}, ${testVehicle1.Longitude}`);
  await monitor.checkVehicleLocation(testVehicle1);
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test vehicle OUTSIDE high-risk area
  const testVehicle2 = {
    Plate: 'TEST456GP',
    DriverName: 'Jane Test',
    Latitude: -26.1,
    Longitude: 28.0,
    Speed: 50,
    LocTime: new Date().toISOString()
  };
  
  console.log('\nTest 2: Vehicle OUTSIDE high-risk zone');
  console.log(`Location: ${testVehicle2.Latitude}, ${testVehicle2.Longitude}`);
  await monitor.checkVehicleLocation(testVehicle2);
  
  console.log('\n✅ Test completed');
  process.exit(0);
}

test().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
