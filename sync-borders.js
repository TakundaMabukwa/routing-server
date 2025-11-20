require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const Database = require('better-sqlite3');
const path = require('path');

async function syncBorders() {
  console.log('🚨 Syncing border warnings...\n');
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_EPS_SUPABASE_URL,
    process.env.NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY
  );
  
  const dbPath = path.join(__dirname, 'border-warnings.db');
  const db = new Database(dbPath);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS border_warnings (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      coordinates TEXT,
      radius REAL DEFAULT 100,
      created_at TEXT,
      updated_at TEXT
    )
  `);
  
  const { data: borders, error } = await supabase
    .from('border_warning')
    .select('id, name, coordinates, radius');
  
  if (error) {
    console.error('❌ Error fetching borders:', error.message);
    process.exit(1);
  }
  
  if (!borders || borders.length === 0) {
    console.log('⚠️  No border warnings found in Supabase');
    process.exit(0);
  }
  
  db.prepare('DELETE FROM border_warnings').run();
  
  const insert = db.prepare(`
    INSERT INTO border_warnings (id, name, coordinates, radius, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  borders.forEach(border => {
    insert.run(
      border.id,
      border.name,
      border.coordinates,
      border.radius || 100,
      new Date().toISOString(),
      new Date().toISOString()
    );
    console.log(`  ✅ ${border.name} (radius: ${border.radius || 100}m)`);
  });
  
  console.log(`\n✅ Synced ${borders.length} border warnings to local database`);
  db.close();
}

syncBorders().catch(error => {
  console.error('❌ Sync failed:', error);
  process.exit(1);
});
