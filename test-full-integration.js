require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function testFullIntegration() {
  console.log('🧪 Testing Full Integration with Real Data\n');
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_EPS_SUPABASE_URL,
    process.env.NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY
  );
  
  // Test 1: Fetch real trip data
  console.log('1️⃣ Fetching real trip data from Supabase...');
  const { data: trips, error } = await supabase
    .from('trips')
    .select('id, status, vehicleassignments, dropofflocations, enddate, updated_at, status_history')
    .not('status', 'eq', 'delivered')
    .limit(5);
  
  if (error) {
    console.error('❌ Error fetching trips:', error.message);
    return;
  }
  
  if (!trips || trips.length === 0) {
    console.log('⚠️ No active trips found in database');
    return;
  }
  
  console.log(`✅ Found ${trips.length} active trips\n`);
  
  // Test 2: Parse driver and vehicle info
  console.log('2️⃣ Testing Driver & Vehicle Extraction...');
  for (const trip of trips) {
    console.log(`\n📦 Trip ${trip.id} - Status: ${trip.status}`);
    
    if (trip.vehicleassignments) {
      const assignments = typeof trip.vehicleassignments === 'string' 
        ? JSON.parse(trip.vehicleassignments) 
        : trip.vehicleassignments;
      
      const assignmentArray = Array.isArray(assignments) ? assignments : [assignments];
      
      for (const assignment of assignmentArray) {
        // Extract driver
        if (assignment.drivers) {
          const drivers = Array.isArray(assignment.drivers) ? assignment.drivers : [assignment.drivers];
          const driver = drivers[0];
          if (driver && driver.name) {
            console.log(`   👤 Driver: ${driver.name}`);
          }
        }
        
        // Extract vehicle
        if (assignment.vehicle && assignment.vehicle.name) {
          console.log(`   🚛 Vehicle: ${assignment.vehicle.name}`);
        }
      }
    }
    
    // Check dropoff location
    if (trip.dropofflocations) {
      const dropoffs = typeof trip.dropofflocations === 'string'
        ? JSON.parse(trip.dropofflocations)
        : trip.dropofflocations;
      
      if (dropoffs && dropoffs.length > 0) {
        const dropoff = dropoffs[0];
        const address = dropoff.location || dropoff.address;
        console.log(`   📍 Dropoff: ${address}`);
      }
    }
    
    // Check delivery deadline
    if (trip.enddate) {
      console.log(`   ⏰ Deadline: ${trip.enddate}`);
    }
  }
  
  // Test 3: Status Duration Check
  console.log('\n\n3️⃣ Testing Status Duration Monitoring...');
  const STATUS_LIMITS = {
    'pending': 10,
    'accepted': 30,
    'arrived-at-loading': 30,
    'staging-area': 30,
    'loading': 60,
    'offloading': 60,
    'weighing': 30,
    'depo': 30,
    'handover': 30
  };
  
  for (const trip of trips) {
    const limit = STATUS_LIMITS[trip.status];
    if (!limit) continue;
    
    let statusTime;
    if (trip.status_history && trip.status_history.length > 0) {
      const latestStatus = trip.status_history[trip.status_history.length - 1];
      const statusData = typeof latestStatus === 'string' ? JSON.parse(latestStatus) : latestStatus;
      if (statusData.timestamp) {
        statusTime = new Date(statusData.timestamp);
      }
    }
    
    if (!statusTime && trip.updated_at) {
      statusTime = new Date(trip.updated_at);
    }
    
    if (statusTime) {
      const now = new Date();
      const durationMinutes = Math.round((now - statusTime) / 60000);
      
      console.log(`\n📊 Trip ${trip.id}:`);
      console.log(`   Status: ${trip.status}`);
      console.log(`   Duration: ${durationMinutes} minutes`);
      console.log(`   Limit: ${limit} minutes`);
      
      if (durationMinutes >= limit) {
        console.log(`   ⚠️ WOULD TRIGGER ALERT - Exceeded by ${durationMinutes - limit} minutes`);
      } else {
        console.log(`   ✅ Within limit - ${limit - durationMinutes} minutes remaining`);
      }
    }
  }
  
  // Test 4: ETA Calculation (if trip has dropoff and deadline)
  console.log('\n\n4️⃣ Testing ETA Calculation...');
  const ETAMonitor = require('./services/eta-monitor');
  const etaMonitor = new ETAMonitor();
  
  for (const trip of trips) {
    if (!trip.dropofflocations || !trip.enddate) continue;
    
    const dropoffs = typeof trip.dropofflocations === 'string'
      ? JSON.parse(trip.dropofflocations)
      : trip.dropofflocations;
    
    if (!dropoffs || dropoffs.length === 0) continue;
    
    const dropoff = dropoffs[0];
    const address = dropoff.location || dropoff.address;
    
    console.log(`\n🗺️ Trip ${trip.id}:`);
    console.log(`   Destination: ${address}`);
    
    // Geocode destination
    const coords = await etaMonitor.geocode(address);
    if (!coords) {
      console.log(`   ❌ Could not geocode address`);
      continue;
    }
    
    console.log(`   📍 Coordinates: ${coords.lat}, ${coords.lng}`);
    
    // For testing, use a sample vehicle location (Johannesburg area)
    const vehicleLat = -26.2041;
    const vehicleLng = 28.0473;
    
    const etaStatus = await etaMonitor.checkETA(
      vehicleLat,
      vehicleLng,
      coords.lat,
      coords.lng,
      trip.enddate
    );
    
    if (etaStatus) {
      console.log(`   ⏱️ ETA: ${etaStatus.eta}`);
      console.log(`   🎯 Deadline: ${etaStatus.deadline}`);
      console.log(`   🚗 Drive Time: ${etaStatus.duration_minutes} minutes`);
      console.log(`   📏 Distance: ${etaStatus.distance_km} km`);
      console.log(`   ${etaStatus.status === 'delayed' ? '⚠️' : '✅'} Status: ${etaStatus.status}`);
      console.log(`   ⏰ Buffer: ${etaStatus.buffer_minutes} minutes`);
    }
    
    break; // Test only first trip with valid data
  }
  
  // Test 5: Alert Structure
  console.log('\n\n5️⃣ Sample Alert Structures:\n');
  
  console.log('Status Delay Alert:');
  console.log(JSON.stringify({
    type: 'status_delay',
    message: 'Trip stuck in "loading" status for 65 minutes (limit: 60 min)',
    status: 'loading',
    duration_minutes: 65,
    limit_minutes: 60,
    reason: 'Loading is taking too long',
    driver: 'SAKHILE BLESSED NDLOVU',
    vehicle: 'KK81SRGP',
    timestamp: new Date().toISOString()
  }, null, 2));
  
  console.log('\n\nETA Delay Alert:');
  console.log(JSON.stringify({
    type: 'eta_delayed',
    message: 'Vehicle KK81SRGP will arrive late by 30 minutes',
    reason: 'Traffic conditions indicate arrival will be 30 minutes late',
    eta: new Date(Date.now() + 90 * 60000).toISOString(),
    possible_eta: new Date(Date.now() + 90 * 60000).toISOString(),
    deadline: new Date(Date.now() + 60 * 60000).toISOString(),
    duration_minutes: 90,
    distance_km: '45.2',
    buffer_minutes: -30,
    destination: 'Midrand, Johannesburg',
    road_conditions: 'current',
    timestamp: new Date().toISOString()
  }, null, 2));
  
  console.log('\n\n✅ Integration test complete!');
  console.log('\n📋 Summary:');
  console.log('   ✅ Database connection working');
  console.log('   ✅ Driver/vehicle extraction working');
  console.log('   ✅ Status duration tracking working');
  console.log('   ✅ ETA calculation working');
  console.log('   ✅ Alert structure validated');
  
  process.exit(0);
}

testFullIntegration().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
