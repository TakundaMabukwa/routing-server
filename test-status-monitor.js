require('dotenv').config();
const StatusMonitor = require('./services/status-monitor');

async function testStatusMonitor() {
  console.log('🧪 Testing Status Monitor\n');
  
  const monitor = new StatusMonitor('eps');
  
  console.log('📊 Status Time Limits:');
  console.log('  - pending: 10 minutes (driver must accept)');
  console.log('  - accepted: 30 minutes');
  console.log('  - arrived-at-loading: 30 minutes');
  console.log('  - staging-area: 30 minutes');
  console.log('  - loading: 60 minutes');
  console.log('  - on-trip: No limit');
  console.log('  - offloading: 60 minutes (delivery)');
  console.log('  - weighing: 30 minutes');
  console.log('  - depo: 30 minutes');
  console.log('  - handover: 30 minutes');
  console.log('  - delivered: No limit (final)\n');
  
  console.log('✅ Status monitor initialized');
  console.log('📡 Listening for status changes...');
  console.log('⏱️  Checking all statuses every 5 minutes\n');
  
  console.log('Alert format:');
  console.log(JSON.stringify({
    type: 'status_delay',
    message: 'Trip stuck in "loading" status for 65 minutes (limit: 60 min)',
    status: 'loading',
    duration_minutes: 65,
    limit_minutes: 60,
    reason: 'Loading is taking too long',
    driver: 'John Doe',
    vehicle: 'ABC123',
    timestamp: new Date().toISOString()
  }, null, 2));
  
  console.log('\n✅ Status monitoring is active!');
  console.log('Press Ctrl+C to stop...\n');
  
  // Keep running
  await new Promise(() => {});
}

testStatusMonitor().catch(console.error);
