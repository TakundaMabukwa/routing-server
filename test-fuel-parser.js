/**
 * Fuel Data Parser Test Suite
 * Tests the JavaScript implementation against sample data
 */

const FuelDataParser = require('./fuel-data-parser');

// Test data from C# documentation
const testData = {
  // Valid fuel data from documentation
  validFuelData: "19,405,1904,5B,00,100,00,255,00,122,00,2329,00,175C,45,BE,00,6E,46,60,22,522,00,3D0,00,1087,0438,1088,0438,247,476A,395,379D6E71,54,00,70,01,183,0004E1C4,1675,00,FA,00068FCC,1086,0318,321,00,3955,00,524,00,576,00,1439,00,163,7F,1,01",
  
  // Telemetry data (GPS format)
  telemetryData: "173,07/11/2025 09:43:52,2,8,-26.259761,28.310776,1677.70,0,265,901850.7,423,0,1,44344,8075,",
  
  // Parameter-value pairs (fuel sensor format)
  parameterData: "19,407,2001,5B,00,100,00,255,00,122,00,2329,00,175C,46,BE,0258,6E,3F,96,60,522,00,3D0,00,1087,0470,1088,0470,247,2F8E,395,3B9CCF53,54,00,70,01,1675,00,928,02,582,0F3C,1086,0330,576,00",
  
  // Invalid data for error testing
  invalidData: [
    "",
    "invalid,data",
    "19,999,invalid",  // Invalid message type
    "19,405,1904,INVALID_HEX",  // Invalid hex values
  ],
  
  // Fuel theft scenario data
  normalReading: "19,405,1904,5B,00,100,00,255,00,122,00,2329,00,175C,45,BE,00,6E,46,60,22,522,00,3D0,00,1087,1F40,1088,1F40,247,476A,395,379D6E71,54,00,70,01,183,0004E1C4,1675,00,FA,00068FCC,1086,0318,321,00,3955,00,524,00,576,00,1439,00,163,7F,1,01",
  
  theftReading: "19,405,1904,5B,00,100,00,255,00,122,00,2329,00,175C,45,BE,00,6E,46,60,22,522,00,3D0,00,1087,1900,1088,1900,247,476A,395,379D6E71,54,00,70,01,183,0004E1C4,1675,00,FA,00068FCC,1086,0318,321,00,3955,00,524,00,576,00,1439,00,163,7F,1,01"
};

class FuelDataParserTester {
  constructor() {
    this.parser = new FuelDataParser({
      theftThreshold: -5.0,
      fillThreshold: 5.0,
      validDeviceIds: ['405', '407']
    });
    this.testResults = [];
  }

  runAllTests() {
    console.log('🧪 Starting Fuel Data Parser Test Suite\n');
    
    this.testBasicParsing();
    this.testFieldExtraction();
    this.testErrorHandling();
    this.testFuelTheftDetection();
    this.testDatabaseFormat();
    this.testValidation();
    
    this.printSummary();
  }

  testBasicParsing() {
    console.log('📋 Test 1: Basic Parsing');
    
    try {
      const result = this.parser.parseRawFuelData(testData.validFuelData);
      
      this.assert('Basic parsing succeeds', !!result);
      this.assert('Device ID extracted', result.deviceId === '19');
      this.assert('Message type extracted', result.messageType === 405);
      this.assert('Has fuel probe data', result.fuelProbe1Level !== null || result.fuelProbe1VolumeInTank !== null);
      
      console.log(`   ✅ Device ID: ${result.deviceId}`);
      console.log(`   ✅ Message Type: ${result.messageType}`);
      console.log(`   ✅ Total Volume: ${result.totalVolume}L`);
      console.log(`   ✅ Status: ${result.status}`);
      
    } catch (error) {
      this.assert('Basic parsing succeeds', false, error.message);
    }
    
    console.log('');
  }

  testFieldExtraction() {
    console.log('📊 Test 2: Field Extraction');
    
    try {
      const result = this.parser.parseRawFuelData(testData.validFuelData);
      
      // Test that we get numeric values
      this.assert('Primary volume is number', typeof result.primaryVolume === 'number');
      this.assert('Primary level is number', typeof result.primaryLevel === 'number');
      this.assert('Total volume calculated', result.totalVolume >= 0);
      
      // Test derived metrics
      this.assert('Has derived metrics', result.averageTemperature !== undefined);
      this.assert('Has validation status', ['Normal', 'Warning', 'Error'].includes(result.status));
      
      console.log(`   ✅ Primary Volume: ${result.primaryVolume}L`);
      console.log(`   ✅ Primary Level: ${result.primaryLevel}mm`);
      console.log(`   ✅ Average Temperature: ${result.averageTemperature}°C`);
      console.log(`   ✅ Validation Status: ${result.status}`);
      
      // Show all positions found
      console.log(`   ✅ Positions found: ${result.allPositions.length}`);
      console.log(`   ✅ First 5 positions: ${result.allPositions.slice(0, 5).map(p => `${p.position}=${p.decimal}`).join(', ')}`);
      
    } catch (error) {
      this.assert('Field extraction succeeds', false, error.message);
    }
    
    console.log('');
  }

  testErrorHandling() {
    console.log('❌ Test 3: Error Handling');
    
    testData.invalidData.forEach((invalidInput, index) => {
      try {
        const result = this.parser.parseRawFuelData(invalidInput);
        this.assert(`Invalid data ${index + 1} rejected`, false, 'Should have thrown error');
      } catch (error) {
        this.assert(`Invalid data ${index + 1} rejected`, true);
        console.log(`   ✅ Correctly rejected: "${invalidInput}" - ${error.message}`);
      }
    });
    
    console.log('');
  }

  testFuelTheftDetection() {
    console.log('🚨 Test 4: Fuel Theft Detection');
    
    try {
      const normalReading = this.parser.parseRawFuelData(testData.normalReading);
      const theftReading = this.parser.parseRawFuelData(testData.theftReading);
      
      const theftData = this.parser.detectFuelTheft(theftReading, normalReading);
      
      this.assert('Theft detection runs', !!theftData);
      this.assert('Volume change calculated', typeof theftData.volumeChange === 'number');
      
      console.log(`   ✅ Normal reading volume: ${normalReading.primaryVolume}L`);
      console.log(`   ✅ Theft reading volume: ${theftReading.primaryVolume}L`);
      console.log(`   ✅ Volume change: ${theftData.volumeChange}L`);
      console.log(`   ✅ Is theft: ${theftData.isTheft}`);
      console.log(`   ✅ Is fill: ${theftData.isFill}`);
      
      if (theftData.isTheft || theftData.isFill) {
        const alert = this.parser.createFuelAlert(theftReading, theftData, 'TEST_VEHICLE');
        this.assert('Alert created', !!alert);
        console.log(`   ✅ Alert created: ${alert.alert_type} - ${alert.message}`);
      }
      
    } catch (error) {
      this.assert('Fuel theft detection succeeds', false, error.message);
    }
    
    console.log('');
  }

  testDatabaseFormat() {
    console.log('🗄️ Test 5: Database Format Conversion');
    
    try {
      const result = this.parser.parseRawFuelData(testData.validFuelData);
      const dbFormat = this.parser.toDatabaseFormat(result, 'TEST123');
      
      this.assert('Database format created', !!dbFormat);
      this.assert('Has plate', dbFormat.plate === 'TEST123');
      this.assert('Has message date', !!dbFormat.message_date);
      this.assert('Has fuel probe 1 volume', typeof dbFormat.fuel_probe_volume_in_tank_1 === 'number');
      
      console.log(`   ✅ Plate: ${dbFormat.plate}`);
      console.log(`   ✅ Probe 1 Volume: ${dbFormat.fuel_probe_volume_in_tank_1}L`);
      console.log(`   ✅ Total Volume: ${dbFormat.total_volume}L`);
      console.log(`   ✅ Status: ${dbFormat.status}`);
      
    } catch (error) {
      this.assert('Database format conversion succeeds', false, error.message);
    }
    
    console.log('');
  }

  testValidation() {
    console.log('✅ Test 6: Data Validation');
    
    try {
      const result = this.parser.parseRawFuelData(testData.validFuelData);
      
      // Test validation rules
      this.assert('Valid flag set', typeof result.isValid === 'boolean');
      this.assert('Status is string', typeof result.status === 'string');
      this.assert('Alerts is array', Array.isArray(result.alerts));
      
      // Test reasonable value ranges
      if (result.primaryTemperature !== null) {
        this.assert('Temperature in range', result.primaryTemperature >= -50 && result.primaryTemperature <= 150);
      }
      
      if (result.primaryPercentage !== null) {
        this.assert('Percentage in range', result.primaryPercentage >= 0 && result.primaryPercentage <= 100);
      }
      
      console.log(`   ✅ Is valid: ${result.isValid}`);
      console.log(`   ✅ Status: ${result.status}`);
      console.log(`   ✅ Alerts: ${result.alerts.length > 0 ? result.alerts.join(', ') : 'None'}`);
      
    } catch (error) {
      this.assert('Data validation succeeds', false, error.message);
    }
    
    console.log('');
  }

  assert(testName, condition, errorMessage = '') {
    const result = {
      name: testName,
      passed: condition,
      error: errorMessage
    };
    
    this.testResults.push(result);
    
    if (!condition) {
      console.log(`   ❌ FAIL: ${testName} ${errorMessage ? '- ' + errorMessage : ''}`);
    }
  }

  printSummary() {
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    
    console.log('📊 Test Summary');
    console.log('='.repeat(50));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} ✅`);
    console.log(`Failed: ${failedTests} ❌`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (failedTests > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults.filter(r => !r.passed).forEach(result => {
        console.log(`   - ${result.name} ${result.error ? '(' + result.error + ')' : ''}`);
      });
    }
    
    console.log('\n🎉 Testing Complete!');
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new FuelDataParserTester();
  tester.runAllTests();
}

module.exports = FuelDataParserTester;