require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'http://localhost:3001/api/ctrack/api/raw';

async function testEndpoints() {
  console.log('🧪 Testing C-Track Raw API Endpoints\n');

  let csvOutput = 'Endpoint,Field Name,Data Type,Sample Value\n';

  try {
    // 1. Test GetVehicles
    console.log('📦 Testing /Vehicle/GetVehicles...');
    const vehiclesRes = await axios.get(`${BASE_URL}/Vehicle/GetVehicles`);
    const vehicle = vehiclesRes.data.vehicles?.[0];
    
    if (vehicle) {
      Object.keys(vehicle).forEach(key => {
        const value = vehicle[key];
        const type = typeof value;
        const sample = JSON.stringify(value).replace(/,/g, ';').substring(0, 50);
        csvOutput += `Vehicle/GetVehicles,${key},${type},"${sample}"\n`;
      });
    }

    // 2. Test LastDevicePosition
    console.log('📍 Testing /Vehicle/LastDevicePosition...');
    const positionsRes = await axios.get(`${BASE_URL}/Vehicle/LastDevicePosition`);
    const position = positionsRes.data[0];
    
    if (position) {
      Object.keys(position).forEach(key => {
        const value = position[key];
        const type = typeof value;
        const sample = JSON.stringify(value).replace(/,/g, ';').substring(0, 50);
        csvOutput += `Vehicle/LastDevicePosition,${key},${type},"${sample}"\n`;
      });
    }

    // 3. Test Drivers
    console.log('👤 Testing /Drivers...');
    const driversRes = await axios.get(`${BASE_URL}/Drivers`);
    const driver = driversRes.data[0];
    
    if (driver) {
      Object.keys(driver).forEach(key => {
        const value = driver[key];
        const type = typeof value;
        const sample = JSON.stringify(value).replace(/,/g, ';').substring(0, 50);
        csvOutput += `Drivers,${key},${type},"${sample}"\n`;
      });
    }

    // Save to CSV
    fs.writeFileSync('ctrack-api-fields.csv', csvOutput);
    console.log('\n✅ CSV saved to: ctrack-api-fields.csv');
    console.log(csvOutput);

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testEndpoints();
