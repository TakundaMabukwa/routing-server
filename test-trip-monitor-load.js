require('dotenv').config();

// Mock request counter
let supabaseRequestCount = 0;
let driverQueryCount = 0;
let tripQueryCount = 0;

// Intercept Supabase client
const originalCreateClient = require('@supabase/supabase-js').createClient;
require('@supabase/supabase-js').createClient = function(...args) {
  const client = originalCreateClient(...args);
  
  // Wrap the from method to count queries
  const originalFrom = client.from.bind(client);
  client.from = function(table) {
    const query = originalFrom(table);
    
    // Wrap select to count
    const originalSelect = query.select.bind(query);
    query.select = function(...selectArgs) {
      supabaseRequestCount++;
      if (table === 'drivers') driverQueryCount++;
      if (table === 'trips') tripQueryCount++;
      console.log(`📊 Query #${supabaseRequestCount}: ${table}.select()`);
      return originalSelect(...selectArgs);
    };
    
    return query;
  };
  
  return client;
};

const TripMonitor = require('./services/trip-monitor');

async function testTripMonitorLoad() {
  console.log('🧪 Testing Trip Monitor Database Load\n');
  console.log('=' .repeat(60));
  
  // Reset counters
  supabaseRequestCount = 0;
  driverQueryCount = 0;
  tripQueryCount = 0;
  
  // Initialize trip monitor
  console.log('\n1️⃣ Initializing TripMonitor...');
  const tripMonitor = new TripMonitor('eps');
  
  // Wait for initial load
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log(`\n📈 After initialization:`);
  console.log(`   Total queries: ${supabaseRequestCount}`);
  console.log(`   Trip queries: ${tripQueryCount}`);
  console.log(`   Driver queries: ${driverQueryCount}`);
  
  // Reset for vehicle data test
  const initQueries = supabaseRequestCount;
  supabaseRequestCount = 0;
  driverQueryCount = 0;
  tripQueryCount = 0;
  
  // Simulate 10 vehicle data updates (typical 30-second window)
  console.log('\n2️⃣ Simulating 10 vehicle updates (30 seconds of data)...');
  
  const testVehicleData = {
    DriverName: 'SICELIMPILO WILFRED KHANYILE',
    Plate: 'JY54WJGP M',
    Latitude: -26.1439,
    Longitude: 28.0434,
    Speed: 60,
    Mileage: 12345
  };
  
  const startTime = Date.now();
  
  for (let i = 0; i < 10; i++) {
    await tripMonitor.processVehicleData({
      ...testVehicleData,
      Speed: 60 + i,
      Mileage: 12345 + i
    });
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
  }
  
  const duration = Date.now() - startTime;
  
  console.log(`\n📈 After 10 vehicle updates:`);
  console.log(`   Total queries: ${supabaseRequestCount}`);
  console.log(`   Trip queries: ${tripQueryCount}`);
  console.log(`   Driver queries: ${driverQueryCount}`);
  console.log(`   Duration: ${duration}ms`);
  console.log(`   Avg per update: ${(supabaseRequestCount / 10).toFixed(1)} queries`);
  
  // Extrapolate to real-world scenario
  console.log('\n3️⃣ Real-world projections:');
  const vehiclesCount = 50; // Typical fleet size
  const updatesPerMinute = 2; // GPS updates every 30 seconds
  const queriesPerUpdate = supabaseRequestCount / 10;
  
  const queriesPerMinute = vehiclesCount * updatesPerMinute * queriesPerUpdate;
  const queriesPerHour = queriesPerMinute * 60;
  const queriesPerDay = queriesPerHour * 24;
  
  console.log(`   With ${vehiclesCount} vehicles @ ${updatesPerMinute} updates/min:`);
  console.log(`   📊 ${queriesPerMinute.toFixed(0)} queries/minute`);
  console.log(`   📊 ${queriesPerHour.toFixed(0)} queries/hour`);
  console.log(`   📊 ${queriesPerDay.toFixed(0)} queries/day`);
  
  // Identify bottlenecks
  console.log('\n4️⃣ Bottleneck Analysis:');
  console.log(`   Driver table queries: ${driverQueryCount} (${((driverQueryCount/supabaseRequestCount)*100).toFixed(1)}%)`);
  console.log(`   Trip table queries: ${tripQueryCount} (${((tripQueryCount/supabaseRequestCount)*100).toFixed(1)}%)`);
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Test complete\n');
  
  process.exit(0);
}

testTripMonitorLoad().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
