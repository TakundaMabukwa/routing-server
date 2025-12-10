require('dotenv').config();
const ETAMonitor = require('./services/eta-monitor');

async function testETAIntegration() {
  console.log('🧪 Testing ETA Integration\n');
  
  const etaMonitor = new ETAMonitor();
  
  // Test 1: Geocoding
  console.log('1️⃣ Testing Geocoding...');
  const address = 'Cape Town, South Africa';
  const coords = await etaMonitor.geocode(address);
  if (coords) {
    console.log(`✅ Geocoded "${address}" to:`, coords);
  } else {
    console.log('❌ Geocoding failed');
    return;
  }
  
  // Test 2: ETA Calculation
  console.log('\n2️⃣ Testing ETA Calculation...');
  const vehicleLat = -33.9249;
  const vehicleLng = 18.4241;
  const destLat = coords.lat;
  const destLng = coords.lng;
  
  // Deadline in 2 hours
  const deadline = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  
  console.log(`Vehicle: ${vehicleLat}, ${vehicleLng}`);
  console.log(`Destination: ${destLat}, ${destLng}`);
  console.log(`Deadline: ${deadline}`);
  
  const etaStatus = await etaMonitor.checkETA(vehicleLat, vehicleLng, destLat, destLng, deadline);
  
  if (etaStatus) {
    console.log('\n✅ ETA Calculation Result:');
    console.log(`   Status: ${etaStatus.status}`);
    console.log(`   Will arrive on time: ${etaStatus.will_arrive_on_time}`);
    console.log(`   ETA: ${etaStatus.eta}`);
    console.log(`   Deadline: ${etaStatus.deadline}`);
    console.log(`   Duration: ${etaStatus.duration_minutes} minutes`);
    console.log(`   Distance: ${etaStatus.distance_km} km`);
    console.log(`   Buffer: ${etaStatus.buffer_minutes} minutes`);
  } else {
    console.log('❌ ETA calculation failed');
    return;
  }
  
  // Test 3: Late arrival scenario
  console.log('\n3️⃣ Testing Late Arrival Scenario...');
  const tightDeadline = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes
  
  const lateStatus = await etaMonitor.checkETA(vehicleLat, vehicleLng, destLat, destLng, tightDeadline);
  
  if (lateStatus) {
    console.log('\n✅ Late Arrival Test:');
    console.log(`   Status: ${lateStatus.status}`);
    console.log(`   Will arrive on time: ${lateStatus.will_arrive_on_time}`);
    console.log(`   Buffer: ${lateStatus.buffer_minutes} minutes (negative = late)`);
    
    if (lateStatus.status === 'delayed') {
      console.log(`   ⚠️ Vehicle will be late by ${Math.abs(lateStatus.buffer_minutes)} minutes`);
    }
  }
  
  console.log('\n✅ All ETA integration tests completed!');
}

testETAIntegration().catch(console.error);
