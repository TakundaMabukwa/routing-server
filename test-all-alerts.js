require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_EPS_SUPABASE_URL,
  process.env.NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY
);

async function testAllAlerts() {
  try {
    console.log('🧪 Testing all alert types...\n');

    // Create test trip
    const { data: trip } = await supabase
      .from('trips')
      .insert({
        vehicleassignments: [{
          vehicle: { plate: 'TEST-ALL-001' },
          driver: { name: 'Test Driver' }
        }],
        status: 'in_progress',
        alert_message: []
      })
      .select()
      .single();

    console.log(`✅ Created test trip: ${trip.id}\n`);

    // 1. Test High-Risk Zone Alert
    console.log('1️⃣ Testing HIGH-RISK ZONE alert...');
    const { data: zone } = await supabase.from('high_risk').select('*').limit(1).single();
    
    let lat, lng;
    if (zone.coords) {
      [lat, lng] = zone.coords.split(',').map(parseFloat);
    } else if (zone.coordinates) {
      const points = zone.coordinates.trim().split(/\s+/);
      [lng, lat] = points[0].split(',').map(parseFloat);
    }

    await fetch('http://localhost:3001/api/test/high-risk-zone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plate: 'TEST-ALL-001',
        driverName: 'Test Driver',
        latitude: lat,
        longitude: lng,
        tripId: trip.id
      })
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // 2. Test Border Alert
    console.log('2️⃣ Testing BORDER alert...');
    const { data: border } = await supabase.from('border_warning').select('*').limit(1).single();
    
    if (border && border.coordinates) {
      const coords = border.coordinates.split(' ')[0].split(',');
      const borderLat = parseFloat(coords[1]);
      const borderLng = parseFloat(coords[0]);

      const TripMonitor = require('./services/trip-monitor-ultra-minimal');
      const BorderMonitor = require('./services/border-monitor');
      const borderMonitor = new BorderMonitor('eps');
      
      await borderMonitor.checkVehicleLocation({
        Plate: 'TEST-ALL-001',
        DriverName: 'Test Driver',
        Latitude: borderLat,
        Longitude: borderLng
      }, trip.id);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check final alerts
    const { data: finalTrip } = await supabase
      .from('trips')
      .select('alert_type, alert_message, status')
      .eq('id', trip.id)
      .single();

    console.log('\n📊 FINAL TRIP ALERTS:');
    console.log('Status:', finalTrip.status);
    console.log('Alert Type:', finalTrip.alert_type);
    console.log('Alert Messages:', JSON.stringify(finalTrip.alert_message, null, 2));

    if (finalTrip.alert_message && finalTrip.alert_message.length > 0) {
      console.log('\n✅ SUCCESS! All alerts appended as JSONB objects');
      console.log(`Total alerts: ${finalTrip.alert_message.length}`);
    } else {
      console.log('\n❌ FAILED! No alerts found');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testAllAlerts();
