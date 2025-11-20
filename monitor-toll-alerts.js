require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_EPS_SUPABASE_URL,
  process.env.NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY
);

let lastAlertId = 0;

async function checkNewAlerts() {
  const { data: alerts } = await supabase
    .from('toll_gate_alerts')
    .select('*')
    .gt('id', lastAlertId)
    .order('id', { ascending: true });
  
  if (alerts && alerts.length > 0) {
    alerts.forEach(alert => {
      console.log(`🚧 ${alert.plate} (${alert.driver_name || 'N/A'}) → ${alert.toll_gate_name} (${alert.distance_meters}m)`);
      lastAlertId = alert.id;
    });
  }
}

async function start() {
  const { data } = await supabase
    .from('toll_gate_alerts')
    .select('id')
    .order('id', { ascending: false })
    .limit(1);
  
  if (data && data.length > 0) {
    lastAlertId = data[0].id;
  }
  
  console.log('🚧 Monitoring toll gate alerts (Ctrl+C to stop)...\n');
  setInterval(checkNewAlerts, 5000);
}

start();
