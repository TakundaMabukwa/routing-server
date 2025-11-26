require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_EPS_SUPABASE_URL,
  process.env.NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY
);

async function testHighRiskTripAlert() {
  try {
    console.log('🧪 Testing high-risk zone alert for vehicle on trip...\n');

    // 1. Get a high-risk zone first
    const { data: zones } = await supabase
      .from('high_risk')
      .select('*')
      .limit(1);

    if (!zones || zones.length === 0) {
      console.log('❌ No high-risk zones found.');
      return;
    }

    const zone = zones[0];
    console.log(`✅ Found high-risk zone: ${zone.name}`);

    // 2. Get coordinates from zone
    let lat, lng;
    if (zone.coords) {
      [lat, lng] = zone.coords.split(',').map(parseFloat);
    } else if (zone.coordinates) {
      const points = zone.coordinates.trim().split(/\s+/);
      [lng, lat] = points[0].split(',').map(parseFloat);
    }

    console.log(`📍 Testing at: ${lat}, ${lng}`);

    // 3. Create a test trip
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .insert({
        vehicleassignments: [{
          vehicle: { plate: 'TEST-HR-001' },
          driver: { name: 'Test Driver' }
        }],
        status: 'in_progress',
        alert_message: []
      })
      .select()
      .single();

    if (tripError) throw tripError;
    console.log(`✅ Created test trip: ${trip.id}\n`);

    // 4. Send test request
    const response = await fetch('http://localhost:3001/api/test/high-risk-zone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plate: 'TEST-HR-001',
        driverName: 'Test Driver',
        latitude: lat,
        longitude: lng,
        tripId: trip.id
      })
    });

    const result = await response.json();
    console.log('📤 Test request sent:', result);

    // 5. Wait and check trip alerts
    await new Promise(resolve => setTimeout(resolve, 2000));

    const { data: updatedTrip } = await supabase
      .from('trips')
      .select('alert_type, alert_message, status')
      .eq('id', trip.id)
      .single();

    console.log('\n📊 Trip after alert:');
    console.log('Status:', updatedTrip.status);
    console.log('Alert Type:', updatedTrip.alert_type);
    console.log('Alert Messages:', JSON.stringify(updatedTrip.alert_message, null, 2));

    if (updatedTrip.alert_message && updatedTrip.alert_message.length > 0) {
      console.log('\n✅ SUCCESS! Alert appended as JSONB object');
    } else {
      console.log('\n❌ FAILED! No alerts found');
    }

    // 6. Check high_risk_alerts table
    const { data: alerts } = await supabase
      .from('high_risk_alerts')
      .select('*')
      .eq('plate', 'TEST-HR-001')
      .order('timestamp', { ascending: false })
      .limit(1);

    if (alerts && alerts.length > 0) {
      console.log('\n🚨 Latest high-risk alert:');
      console.log(JSON.stringify(alerts[0], null, 2));
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testHighRiskTripAlert();
