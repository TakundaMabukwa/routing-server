# Parameter Extraction Summary

## ✅ What Was Built

I've created a comprehensive parameter extraction system for your two data formats:

### 1️⃣ **Format 1: Telemetry Data (Sequential CSV)**
```
173,07/11/2025 09:43:52,2,8,-26.259761,28.310776,1677.70,0,265,901850.7,423,0,1,44344,8075,
```

**Extracts:**
- Device ID: `173`
- Timestamp: `07/11/2025 09:43:52`
- GPS Coordinates: Latitude `-26.259761`, Longitude `28.310776`
- 11 additional fields for analysis

### 2️⃣ **Format 2: Parameter-Value Pairs (Hex)**
```
19,407,2001,5B,00,100,00,255,...
```

**Extracts:**
- Device ID: `19` (position 0)
- Message Type: `407` (position 1)
- **22 parameter-value pairs** where:
  - Even positions = Parameter ID (decimal)
  - Odd positions = Value (hexadecimal)

**Example extracted pairs:**
- Param 2001 = 91 (0x5B)
- Param 0 = 256 (0x100)
- Param 175C = 70 (0x46)
- etc.

---

## 🔧 New API Endpoints

### Test with Sample Data
```bash
GET http://localhost:3001/test/samples
```
Returns parsed results for both sample formats.

### Parse Custom Payload
```bash
POST http://localhost:3001/test/parse
Content-Type: application/json

{
  "payload": "19,407,2001,5B,00,100,..."
}
```

### Detailed Analysis
```bash
GET http://localhost:3001/test/analyze/[url-encoded-payload]
```
Returns detailed parameter analysis with possible interpretations for each value.

---

## 📊 Parser Features

### Automatic Format Detection
- Detects telemetry format (has timestamp with `/`)
- Detects parameter-value format (message types 405, 407)
- Falls back gracefully if format doesn't match

### Parameter Interpretation
For each parameter, the parser suggests possible meanings:
- **Temperature**: If value 0-100 → "XX°C"
- **Percentage**: If value 0-100 → "XX%"
- **Fuel Level**: If value 100-3000 → "XX.X mm" (÷10)
- **Fuel Volume**: If value 1000-100000 → "XX.X L" (÷10)

### Smart Fuel Data Extraction
Looks for common fuel parameter IDs:
- **2020** (0x07E4) → Fuel level (mm)
- **2021** (0x07E5) → Fuel volume (L)
- **2022** (0x07E6) → Fuel temperature (°C)
- **2023** (0x07E7) → Fuel percentage (%)

---

## 📝 Documentation Created

1. **`PARAMETER_GUIDE.md`**
   - Complete data format specifications
   - Field-by-field breakdown
   - Usage instructions
   - Next steps for customization

2. **`PARAMETER_EXTRACTION_RESULTS.md`**
   - Actual extraction results from your samples
   - Full parameter tables
   - Analysis and observations
   - Recommendations for identifying correct parameter IDs

---

## 🎯 Key Results from Your Data

### Sample 1 (Telemetry):
- ✅ Device ID: 173
- ✅ Timestamp: 07/11/2025 09:43:52
- ✅ GPS: -26.259761, 28.310776
- ✅ 15 total fields extracted

### Sample 2 (Parameter-Value Pairs):
- ✅ Device ID: 19
- ✅ Message Type: 407
- ✅ 22 parameter-value pairs extracted
- ✅ All parameters decoded from hex to decimal
- ✅ Possible interpretations suggested for each

---

## 🔍 Notable Findings

### Interesting Values in Sample 2:
- **91** → Could be temperature (91°C) or fuel level (9.1mm)
- **70** → Could be temperature (70°C) or percentage (70%)
- **63** → Could be temperature (63°C) or percentage (63%)
- **96** → Could be temperature (96°C) or percentage (96%)
- **4231** → Could be fuel volume (423.1L) ÷ 10
- **999999315** → Likely timestamp or unique ID

### Parameter IDs Found:
`2001, 0, 175C, BE, 6E, 96, 60, 522, 3D0, 1087, 1088, 470, 2, F8E, 3, B9CCF53, 54, 1, 928, 582, F3C, 1086, 330`

---

## 🚀 Next Steps

1. **Monitor Real Data:**
   - Let your server run and capture real WebSocket messages
   - Watch console logs for parameter IDs
   - Cross-reference with known vehicle fuel levels

2. **Identify Your Parameter IDs:**
   - The parser will log all parameter IDs found
   - Compare with your device documentation
   - Update the fuel extraction logic with correct IDs

3. **Test Live:**
   ```bash
   # Watch server logs
   bun run dev
   
   # Test endpoints
   curl http://localhost:3001/test/samples
   ```

4. **Customize:**
   - Update parameter ID mappings in `parseFuelDataFromPayload()`
   - Adjust scaling factors based on your device specs
   - Add additional parameter types as needed

---

## 💡 Usage Example

```javascript
// In your code:
const payload = "19,407,2001,5B,00,100,00,255,...";
const parsed = parseFuelDataFromPayload(payload);

console.log(parsed.device_id);        // "19"
console.log(parsed.message_type);     // 407
console.log(parsed.parameters_list);  // Array of all param-value pairs
console.log(parsed.parameters[2001]); // 91
```

---

## ✨ Summary

Your parser now:
- ✅ Handles both data formats automatically
- ✅ Extracts all parameters with proper hex-to-decimal conversion
- ✅ Provides detailed logging for debugging
- ✅ Suggests possible interpretations for each value
- ✅ Includes test endpoints for easy validation
- ✅ Generates comprehensive documentation

**All parameters are being extracted and decoded successfully!** 🎉
