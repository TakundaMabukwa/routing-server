const { parseWithNames } = require('./fuel-parsing/canbus-parser-v2');

// Test fuel data conversion
console.log('Testing fuel data converter...\n');

// Test sample CAN bus data with fuel code 96
const testData = "19,96,48,70,0,54,0";
console.log('Input:', testData);

const parsed = parseWithNames(testData);
console.log('Parsed output:', JSON.stringify(parsed, null, 2));

// Find fuel level
const fuelData = parsed.find(item => item.code === '96');
if (fuelData) {
  console.log('\n✅ Fuel Level Found:');
  console.log(`- Code: ${fuelData.code}`);
  console.log(`- Name: ${fuelData.name}`);
  console.log(`- Raw Value: ${fuelData.rawValue}`);
  console.log(`- Converted Value: ${fuelData.value} liters`);
} else {
  console.log('\n❌ No fuel data found');
}

// Test with hex values
const testDataHex = "19,96,30,70,0";
console.log('\n\nTesting with hex values...');
console.log('Input:', testDataHex);
const parsedHex = parseWithNames(testDataHex);
console.log('Parsed output:', JSON.stringify(parsedHex, null, 2));