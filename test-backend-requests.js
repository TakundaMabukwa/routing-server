// Test to count backend Supabase requests
const { createClient } = require('@supabase/supabase-js');

let requestCount = 0;
const originalFetch = global.fetch;

// Intercept all fetch calls
global.fetch = function(...args) {
  const url = args[0];
  if (typeof url === 'string' && url.includes('supabase.co')) {
    requestCount++;
    console.log(`[${requestCount}] Supabase request: ${url}`);
  }
  return originalFetch.apply(this, args);
};

// Load your server
require('./server.js');

// Report after 60 seconds
setTimeout(() => {
  console.log(`\n========================================`);
  console.log(`Total backend Supabase requests: ${requestCount}`);
  console.log(`========================================\n`);
}, 60000);
