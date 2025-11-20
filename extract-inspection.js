const fs = require('fs');
const zlib = require('zlib');
const readline = require('readline');

const backupFile = 'db_cluster-20-11-2025@02-31-22.backup (1).gz';
const outputFile = 'inspection_tables_backup.sql';

console.log('🔍 Extracting inspection tables from backup...\n');

// Decompress and read
const gunzip = zlib.createGunzip();
const input = fs.createReadStream(backupFile);
const rl = readline.createInterface({
  input: input.pipe(gunzip),
  crlfDelay: Infinity
});

let inspectionTables = [];
let output = [];
let inCopy = false;
let currentCopyTable = null;

rl.on('line', (line) => {
  // Find CREATE TABLE with inspection
  if (line.match(/CREATE TABLE.*inspection/i)) {
    const match = line.match(/CREATE TABLE\s+(?:public\.)?(\S+)/i);
    if (match && match[1].toLowerCase().includes('inspection')) {
      const tableName = match[1];
      if (!inspectionTables.includes(tableName)) {
        inspectionTables.push(tableName);
        console.log(`Found table: ${tableName}`);
      }
    }
  }
  
  // Collect all lines for inspection tables
  const hasInspection = inspectionTables.some(t => line.includes(t));
  if (hasInspection) {
    // Replace table names with _backup suffix
    let modifiedLine = line;
    inspectionTables.forEach(table => {
      const regex = new RegExp(`\\b${table}\\b`, 'g');
      modifiedLine = modifiedLine.replace(regex, `${table}_backup`);
    });
    output.push(modifiedLine + '\n');
  }
  
  // Track COPY statements (PostgreSQL data format)
  if (line.match(/^COPY.*inspection/i)) {
    inCopy = true;
    const match = line.match(/COPY\s+(?:public\.)?(\S+)/i);
    if (match) currentCopyTable = match[1];
  } else if (inCopy && line === '\\.') {
    inCopy = false;
    currentCopyTable = null;
  }
});

rl.on('close', () => {
  const content = output.join('');
  fs.writeFileSync(outputFile, content);
  
  const dataLines = content.split('\n').filter(l => 
    l.startsWith('COPY') || l.startsWith('INSERT') || l.match(/^\d/)
  ).length;
  
  console.log(`\n✅ Extracted ${inspectionTables.length} inspection tables to ${outputFile}`);
  console.log(`   Data lines: ${dataLines}`);
  console.log('\nTables found:');
  inspectionTables.forEach(t => console.log(`  - ${t}`));
  console.log(`\nImport with: psql -h your-host -U postgres -d postgres -f ${outputFile}`);
});

rl.on('error', (err) => {
  console.error('❌ Error:', err.message);
});
