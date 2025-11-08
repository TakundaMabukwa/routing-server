/**
 * CAN Bus Data Parser v2.0
 * Uses external JSON lookup file for code mappings
 */

const fs = require('fs');
const path = require('path');

// Load codes from JSON file
let CODE_LOOKUP = {};

function loadCodes() {
  try {
    const codesPath = path.join(__dirname, 'canbus-codes.json');
    const codesData = fs.readFileSync(codesPath, 'utf8');
    CODE_LOOKUP = JSON.parse(codesData);
    return true;
  } catch (error) {
    console.error('Error loading canbus-codes.json:', error.message);
    return false;
  }
}

// Load codes on module initialization
loadCodes();

/**
 * Parse CAN bus data string
 * @param {string} canBusData - Format: "19,code1,value1,code2,value2,..."
 * @returns {Object} Object with code keys and decimal values
 */
function parse(canBusData) {
  const result = {};
  
  if (!canBusData) return result;
  
  const parts = canBusData.split(',');
  
  if (parts.length < 3 || parts[0] !== '19') return result;
  
  for (let i = 1; i < parts.length - 1; i += 2) {
    const key = parts[i];
    const valueStr = parts[i + 1];
    
    // Try parsing as hex first, then decimal
    const value = parseInt(valueStr, 16) || parseInt(valueStr, 10) || 0;
    result[key] = value;
  }
  
  return result;
}

/**
 * Parse CAN bus data and map to field names with division
 * @param {string} canBusData - Format: "19,code1,value1,code2,value2,..."
 * @returns {Array} Array of objects with code, name, value, and divided value
 */
function parseWithNames(canBusData) {
  const parsed = parse(canBusData);
  const result = [];
  
  for (const [code, rawValue] of Object.entries(parsed)) {
    const codeInfo = CODE_LOOKUP[code];
    
    if (codeInfo) {
      const dividedValue = codeInfo.divideBy > 1 
        ? rawValue / codeInfo.divideBy 
        : rawValue;
      
      result.push({
        code: code,
        name: codeInfo.name,
        rawValue: rawValue,
        value: dividedValue,
        divideBy: codeInfo.divideBy
      });
    } else {
      result.push({
        code: code,
        name: `Unknown_${code}`,
        rawValue: rawValue,
        value: rawValue,
        divideBy: 1
      });
    }
  }
  
  return result;
}

/**
 * Parse and return as simple key-value object
 * @param {string} canBusData - Format: "19,code1,value1,code2,value2,..."
 * @returns {Object} Object with field names and values
 */
function parseToObject(canBusData) {
  const parsed = parseWithNames(canBusData);
  const result = {};
  
  for (const item of parsed) {
    result[item.name] = item.value;
  }
  
  return result;
}

/**
 * Parse and format for database storage
 * @param {string} canBusData - Format: "19,code1,value1,code2,value2,..."
 * @param {Object} metadata - Additional metadata (plate, pocsagstr, messageDate, etc.)
 * @returns {Array} Array of objects ready for database insertion
 */
function parseForDatabase(canBusData, metadata = {}) {
  const parsed = parseWithNames(canBusData);
  const records = [];
  
  for (const item of parsed) {
    records.push({
      code_key: item.code,
      code_name: item.name,
      code_value_raw: item.rawValue,
      code_value: item.value,
      divide_by: item.divideBy,
      ...metadata
    });
  }
  
  return records;
}

/**
 * Get code information
 * @param {string} code - The code to look up
 * @returns {Object|null} Code information or null if not found
 */
function getCodeInfo(code) {
  return CODE_LOOKUP[code] || null;
}

/**
 * Reload codes from JSON file
 * @returns {boolean} Success status
 */
function reloadCodes() {
  return loadCodes();
}

/**
 * Get all available codes
 * @returns {Object} All code mappings
 */
function getAllCodes() {
  return { ...CODE_LOOKUP };
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parse,
    parseWithNames,
    parseToObject,
    parseForDatabase,
    getCodeInfo,
    reloadCodes,
    getAllCodes
  };
}

// Export for browser
if (typeof window !== 'undefined') {
  window.CanBusParser = {
    parse,
    parseWithNames,
    parseToObject,
    parseForDatabase,
    getCodeInfo,
    reloadCodes,
    getAllCodes
  };
}
