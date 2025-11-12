const { Pool } = require('pg');

// PostgreSQL connection for eps_vehicles table
const pgPool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: process.env.PG_PORT || 5432,
  database: process.env.PG_DATABASE || 'vehicles',
  user: process.env.PG_USER || 'app_user',
  password: process.env.PG_PASSWORD || 'your_password',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection
pgPool.connect((err, client, release) => {
  if (err) {
    console.error('❌ PostgreSQL connection error:', err.message);
  } else {
    console.log('✅ PostgreSQL connected for trip monitoring');
    release();
  }
});

module.exports = { pgPool };