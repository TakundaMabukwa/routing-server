require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function checkAlerts() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_EPS_SUPABASE_URL,
    process.env.NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY
  );
  
  console.log('🚧 Checking toll gate alerts...\n');
  
  const { data: alerts, error } = await supabase
    .from('toll_gate_alerts')
    .select('*')
    .order('alert_timestamp', { ascending: false })
    .limit(10);
  
  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
  
  if (!alerts || alerts.length === 0) {
    console.log('⚠️  No alerts found yet. Waiting for vehicles to pass toll gates...\n');
    process.exit(0);
  }
  
  console.log(`✅ Found ${alerts.length} recent alerts:\n`);
  
  alerts.forEach((alert, i) => {
    console.log(`${i + 1}. ${alert.plate} (${alert.driver_name || 'N/A'})`);
    console.log(`   Toll Gate: ${alert.toll_gate_name}`);
    console.log(`   Distance: ${alert.distance_meters}m`);
    console.log(`   Time: ${new Date(alert.alert_timestamp).toLocaleString()}`);
    console.log();
  });
  
  process.exit(0);
}

checkAlerts();
