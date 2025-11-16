const axios = require('axios');

const BASE_URL = 'http://localhost:3001/api/maysene-rewards';

const endpoints = [
  'health',
  'rewards',
  'performance',
  'violations',
  'daily-stats',
  'latest',
  'leaderboard',
  'driver-risk-assessment',
  'monthly-incident-criteria',
  'top-worst-drivers',
  'all-driver-profiles',
  'executive-dashboard'
];

async function testEndpoint(endpoint) {
  try {
    const response = await axios.get(`${BASE_URL}/${endpoint}`);
    console.log(`✅ ${endpoint}: ${response.status} - ${JSON.stringify(response.data).substring(0, 100)}...`);
    return true;
  } catch (error) {
    console.error(`❌ ${endpoint}: ${error.response?.status || error.message}`);
    return false;
  }
}

async function testAll() {
  console.log('Testing Maysene Rewards Endpoints...\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const endpoint of endpoints) {
    const result = await testEndpoint(endpoint);
    if (result) passed++;
    else failed++;
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between requests
  }
  
  console.log(`\n========================================`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`========================================`);
}

testAll();
