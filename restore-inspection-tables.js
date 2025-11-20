require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const readline = require('readline');

const supabase = createClient(
  process.env.NEXT_PUBLIC_EPS_SUPABASE_URL,
  process.env.NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY
);

async function findInspectionTables() {
  console.log('🔍 Finding tables with "inspection" in the name...\n');
  
  // Query to find all tables with 'inspection' in name
  const { data, error } = await supabase.rpc('exec_sql', {
    query: `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE '%inspection%'
      ORDER BY table_name
    `
  });
  
  if (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Manual check: Go to Supabase SQL Editor and run:');
    console.log(`
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE '%inspection%';
    `);
    return;
  }
  
  console.log('Found tables:');
  data.forEach(row => console.log(`  - ${row.table_name}`));
}

console.log('📋 Inspection Tables Restore Guide\n');
console.log('Steps to restore inspection tables from backup:\n');
console.log('1. Download the backup (20 Nov 2025 02:31:22)');
console.log('2. Extract the SQL file');
console.log('3. Search for tables containing "inspection"');
console.log('4. Copy those table definitions and data');
console.log('5. Rename them (e.g., inspection_table → inspection_table_backup)');
console.log('6. Run the SQL in Supabase SQL Editor\n');

findInspectionTables();
