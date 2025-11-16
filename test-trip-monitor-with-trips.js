require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Create real Supabase client to check actual data
const supabase = createClient(
  process.env.NEXT_PUBLIC_EPS_SUPABASE_URL,
  process.env.NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY
);

async function analyzeCurrentLoad() {
  console.log('🔍 Analyzing Current Trip Monitoring Load\n');
  console.log('=' .repeat(60));
  
  // Check active trips
  console.log('\n1️⃣ Checking active trips...');
  const { data: trips, error } = await supabase
    .from('trips')
    .select('id, status, vehicleassignments')
    .not('status', 'in', '(Completed,Delivered)');
  
  if (error) {
    console.error('Error fetching trips:', error);
    return;
  }
  
  console.log(`   Found ${trips.length} active trips`);
  
  // Analyze vehicle assignments
  let totalDrivers = 0;
  let totalVehicles = 0;
  let driverQueriesNeeded = 0;
  
  for (const trip of trips) {
    if (!trip.vehicleassignments) continue;
    
    const assignments = Array.isArray(trip.vehicleassignments) 
      ? trip.vehicleassignments 
      : [trip.vehicleassignments];
    
    for (const assignment of assignments) {
      if (assignment.drivers) {
        const drivers = Array.isArray(assignment.drivers) 
          ? assignment.drivers 
          : [assignment.drivers];
        totalDrivers += drivers.length;
        driverQueriesNeeded += drivers.length; // Each driver needs a DB query
      }
      if (assignment.vehicle) {
        totalVehicles++;
      }
    }
  }
  
  console.log(`   Total drivers in assignments: ${totalDrivers}`);
  console.log(`   Total vehicles in assignments: ${totalVehicles}`);
  
  // Calculate load
  console.log('\n2️⃣ Calculating query load per vehicle update:');
  console.log(`   ⚠️  Driver queries per vehicle update: ${driverQueriesNeeded}`);
  console.log(`   (This happens because getActiveTrip() queries drivers table for EACH trip)`);
  
  // Real-world scenario
  console.log('\n3️⃣ Real-world load calculation:');
  const vehiclesInFleet = 50;
  const updatesPerMinute = 2; // Every 30 seconds
  
  const queriesPerVehicleUpdate = driverQueriesNeeded;
  const queriesPerMinute = vehiclesInFleet * updatesPerMinute * queriesPerVehicleUpdate;
  const queriesPerHour = queriesPerMinute * 60;
  const queriesPerDay = queriesPerHour * 24;
  
  console.log(`   Fleet size: ${vehiclesInFleet} vehicles`);
  console.log(`   Update frequency: ${updatesPerMinute} updates/min per vehicle`);
  console.log(`   `);
  console.log(`   🔥 ${queriesPerMinute.toLocaleString()} queries/minute`);
  console.log(`   🔥 ${queriesPerHour.toLocaleString()} queries/hour`);
  console.log(`   🔥 ${queriesPerDay.toLocaleString()} queries/day`);
  
  // Identify the problem
  console.log('\n4️⃣ Problem Identification:');
  console.log(`   ❌ ISSUE: eps-trip-monitor.js line 163`);
  console.log(`      Queries drivers table for EVERY vehicle update`);
  console.log(`      Inside nested loops (trips -> assignments -> drivers)`);
  console.log(`   `);
  console.log(`   ❌ ISSUE: trip-monitor.js line 52-60`);
  console.log(`      Realtime subscription reloads ALL trips on ANY change`);
  console.log(`   `);
  console.log(`   ❌ ISSUE: No effective caching of driver surnames`);
  
  // Check stop_points queries
  console.log('\n5️⃣ Additional query sources:');
  const { data: stopPoints } = await supabase
    .from('trips')
    .select('selectedstoppoints')
    .not('status', 'in', '(Completed,Delivered)');
  
  let totalStopPoints = 0;
  stopPoints?.forEach(trip => {
    if (trip.selectedstoppoints) {
      totalStopPoints += trip.selectedstoppoints.length;
    }
  });
  
  console.log(`   Stop points to check: ${totalStopPoints}`);
  console.log(`   (Queried when checking unauthorized stops)`);
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Analysis complete\n');
  
  process.exit(0);
}

analyzeCurrentLoad().catch(error => {
  console.error('❌ Analysis failed:', error);
  process.exit(1);
});
