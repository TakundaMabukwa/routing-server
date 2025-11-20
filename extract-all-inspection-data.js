const fs = require('fs');
const zlib = require('zlib');
const { pipeline } = require('stream');

const backupFile = 'db_cluster-20-11-2025@02-31-22.backup (1).gz';
const outputFile = 'inspection_complete.sql';

console.log('🔍 Extracting ALL inspection table data...\n');

const gunzip = zlib.createGunzip();
const input = fs.createReadStream(backupFile);
const output = fs.createWriteStream(outputFile);

let buffer = '';
let capturing = false;
let captureUntil = null;

gunzip.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop(); // Keep incomplete line in buffer
  
  for (const line of lines) {
    // Start capturing when we see inspection table
    if (line.match(/CREATE TABLE.*inspection/i) || 
        line.match(/ALTER TABLE.*inspection/i) ||
        line.match(/COPY.*inspection/i)) {
      capturing = true;
      output.write(line + '\n');
      
      if (line.startsWith('COPY')) {
        captureUntil = '\\.';
      }
    } else if (capturing) {
      output.write(line + '\n');
      
      // Stop capturing after end marker
      if (captureUntil && line === captureUntil) {
        capturing = false;
        captureUntil = null;
        output.write('\n');
      } else if (!captureUntil && line.trim() === '') {
        capturing = false;
      }
    }
  }
});

input.pipe(gunzip);

gunzip.on('end', () => {
  if (buffer) output.write(buffer);
  output.end();
  
  const stats = fs.statSync(outputFile);
  console.log(`✅ Extracted to ${outputFile}`);
  console.log(`   File size: ${(stats.size / 1024).toFixed(2)} KB`);
  console.log('\nTo import: Copy contents to Supabase SQL Editor');
});

gunzip.on('error', (err) => {
  console.error('❌ Error:', err.message);
});
