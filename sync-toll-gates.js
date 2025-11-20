require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const Database = require('better-sqlite3');
const path = require('path');

async function syncTollGates(company = 'eps') {
  console.log(`🚧 Syncing toll gates for ${company.toUpperCase()}...\n`);
  
  const supabaseUrl = company === 'maysene' 
    ? process.env.NEXT_PUBLIC_MAYSENE_SUPABASE_URL
    : process.env.NEXT_PUBLIC_EPS_SUPABASE_URL;
  const supabaseKey = company === 'maysene'
    ? process.env.NEXT_PUBLIC_MAYSENE_SUPABASE_ANON_KEY
    : process.env.NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY;
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  const dbPath = path.join(__dirname, `toll-gates-${company}.db`);
  const db = new Database(dbPath);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS toll_gates (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      coordinates TEXT,
      radius REAL DEFAULT 100,
      type TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `);
  
  const { data: tollGates, error } = await supabase
    .from('toll_gates')
    .select('id, name, coordinates, radius, type');
  
  if (error) {
    console.error('❌ Error fetching toll gates:', error.message);
    process.exit(1);
  }
  
  if (!tollGates || tollGates.length === 0) {
    console.log('⚠️  No toll gates found in Supabase');
    process.exit(0);
  }
  
  db.prepare('DELETE FROM toll_gates').run();
  
  const insert = db.prepare(`
    INSERT INTO toll_gates (id, name, coordinates, radius, type, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  tollGates.forEach(gate => {
    insert.run(
      gate.id,
      gate.name,
      gate.coordinates,
      gate.radius || 100,
      gate.type,
      new Date().toISOString(),
      new Date().toISOString()
    );
    console.log(`  ✅ ${gate.name} (radius: ${gate.radius || 100}m)`);
  });
  
  console.log(`\n✅ Synced ${tollGates.length} toll gates to local database`);
  db.close();
}

const company = process.argv[2] || 'eps';
syncTollGates(company).catch(error => {
  console.error('❌ Sync failed:', error);
  process.exit(1);
});
