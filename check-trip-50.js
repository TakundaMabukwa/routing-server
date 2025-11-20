require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const Database = require('better-sqlite3');
const path = require('path');

async function checkTrip50() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_EPS_SUPABASE_URL,
    process.env.NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY
  );
  
  console.log('🔍 Checking Trip 50...\n');
  
  // Get trip from Supabase
  const { data: trip } = await supabase
    .from('trips')
    .select('id, vehicleassignments, status')
    .eq('id', 50)
    .single();
  
  if (!trip) {
    console.log('❌ Trip 50 not found\n');
    return;
  }
  
  console.log('Trip Status:', trip.status);
  console.log('Vehicle Assignments:', JSON.stringify(trip.vehicleassignments, null, 2));
  console.log();
  
  // Parse vehicle and driver
  let assignments = trip.vehicleassignments;
  if (typeof assignments === 'string') {
    assignments = JSON.parse(assignments);
  }
  if (!Array.isArray(assignments)) {
    assignments = [assignments];
  }
  
  for (const assignment of assignments) {
    if (assignment.vehicle) {
      console.log('Vehicle Plate:', assignment.vehicle.plate || assignment.vehicle.name);
    }
    if (assignment.drivers) {
      const drivers = Array.isArray(assignment.drivers) ? assignment.drivers : [assignment.drivers];
      drivers.forEach(driver => {
        console.log('Driver:', driver.surname || driver.name || driver.first_name);
      });
    }
  }
  console.log();
  
  // Check route data in SQLite
  const db = new Database(path.join(__dirname, 'trip-routes-eps.db'));
  const route = db.prepare('SELECT * FROM trip_routes WHERE trip_id = ?').get(50);
  
  if (route) {
    const points = JSON.parse(route.route_points);
    console.log(`✅ Route data stored: ${points.length} GPS points`);
    console.log(`   First point: ${points[0].datetime}`);
    console.log(`   Last point: ${points[points.length - 1].datetime}`);
  } else {
    console.log('⚠️  No route data stored yet');
  }
  
  db.close();
}

checkTrip50().catch(console.error);
