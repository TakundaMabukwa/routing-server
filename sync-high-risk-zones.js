require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const Database = require('better-sqlite3');
const path = require('path');

async function syncZones() {
  console.log('🔄 Syncing high-risk zones from Supabase...\n');
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_EPS_SUPABASE_URL,
    process.env.NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY
  );
  
  const dbPath = path.join(__dirname, 'high-risk-zones.db');
  const db = new Database(dbPath);
  
  try {
    // Fetch ALL zones from Supabase
    const { data, error } = await supabase
      .from('high_risk')
      .select('id, name, coordinates, coords, radius, type');
    
    if (error) throw error;
    
    console.log(`📥 Fetched ${data.length} zones from Supabase\n`);
    
    // Clear existing zones
    db.prepare('DELETE FROM high_risk_zones').run();
    console.log('🗑️  Cleared existing zones\n');
    
    // Insert all zones
    const insert = db.prepare(`
      INSERT INTO high_risk_zones (id, name, coordinates, coords, radius, type, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    for (const zone of data) {
      insert.run(
        zone.id,
        zone.name,
        zone.coordinates,
        zone.coords,
        zone.radius,
        zone.type,
        new Date().toISOString()
      );
      console.log(`✅ ${zone.name}`);
    }
    
    console.log(`\n✅ Successfully synced ${data.length} high-risk zones to SQLite`);
    
    // Verify
    const count = db.prepare('SELECT COUNT(*) as count FROM high_risk_zones').get();
    console.log(`📊 Total zones in SQLite: ${count.count}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    db.close();
  }
}

syncZones();
