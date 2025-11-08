# Parameter Extraction Results

## Summary
This document shows the extracted parameters from your sample data strings.

---

## Sample 1: Telemetry Format (GPS/Location Data)

**Raw Data:**
```
173,07/11/2025 09:43:52,2,8,-26.259761,28.310776,1677.70,0,265,901850.7,423,0,1,44344,8075,
```

**Extracted Parameters:**

| Position | Field Name | Value | Type | Description |
|----------|------------|-------|------|-------------|
| 0 | Device ID | 173 | Integer | Device identifier |
| 1 | Timestamp | 07/11/2025 09:43:52 | DateTime | Message timestamp |
| 2 | Field 2 | 2 | Integer | Unknown |
| 3 | Field 3 | 8 | Integer | Unknown |
| 4 | **Latitude** | -26.259761 | Float | GPS latitude |
| 5 | **Longitude** | 28.310776 | Float | GPS longitude |
| 6 | Field 6 | 1677.70 | Float | Possibly altitude or distance |
| 7 | Field 7 | 0 | Integer | Unknown |
| 8 | Field 8 | 265 | Integer | Unknown |
| 9 | Field 9 | 901850.7 | Float | Possibly odometer reading |
| 10 | Field 10 | 423 | Integer | Unknown |
| 11 | Field 11 | 0 | Integer | Unknown |
| 12 | Field 12 | 1 | Integer | Unknown |
| 13 | Field 13 | 44344 | Integer | Unknown |
| 14 | Field 14 | 8075 | Integer | Unknown |

**Format:** Sequential CSV with fixed field positions
**Use Case:** GPS tracking, telemetry data

---

## Sample 2: Parameter-Value Pairs (Fuel/Sensor Data)

**Raw Data:**
```
19,407,2001,5B,00,100,00,255,00,122,00,2329,00E0,175C,46,BE,0258,6E,3F,96,60,522,00,3D0,00,1087,0470,1088,0470,247,2F8E,395,3B9CCF53,54,00,70,01,1675,00,928,02,582,0F3C,1086,0330,576,00
```

**Header:**
- **Device ID:** 19
- **Message Type:** 407

**All Extracted Parameter-Value Pairs:**

| Param ID | Hex Value | Decimal Value | Possible Meanings |
|----------|-----------|---------------|-------------------|
| 2001 | 5B | 91 | Temperature (91°C) or Level (9.1mm) |
| 0 | 100 | 256 | Unknown |
| 0 | 255 | 597 | Unknown |
| 0 | 122 | 290 | Unknown |
| 0 | 2329 | 9001 | Unknown |
| 0 | 00E0 | 224 | Temperature (22.4°C) or Level (22.4mm) |
| 175C | 46 | 70 | Temperature (70°C) or Percentage (70%) |
| BE | 0258 | 600 | Level (60.0mm) or Volume (60.0L) |
| 6E | 3F | 63 | Temperature (63°C) or Percentage (63%) |
| 96 | 60 | 96 | Temperature (96°C) or Percentage (96%) |
| 60 | 522 | 1314 | Level (131.4mm) |
| 0 | 3D0 | 976 | Level (97.6mm) |
| 0 | 1087 | 4231 | Volume (423.1L) |
| 1087 | 0470 | 1136 | Volume (113.6L) |
| 470 | 1088 | 4232 | Volume (423.2L) |
| 1088 | 0470 | 1136 | Volume (113.6L) |
| 470 | 247 | 583 | Level (58.3mm) or Volume (58.3L) |
| 2 | 2F8E | 12174 | Volume (1217.4L) |
| F8E | 395 | 917 | Level (91.7mm) |
| 3 | 3B9CCF53 | 999999315 | Timestamp or large counter |
| B9CCF53 | 54 | 84 | Temperature (84°C) |
| 0 | 70 | 112 | Temperature (11.2°C) or Level (11.2mm) |
| 1 | 1675 | 5749 | Volume (574.9L) |
| 0 | 928 | 2344 | Level (234.4mm) |
| 2 | 582 | 1410 | Volume (141.0L) |
| 0 | 0F3C | 3900 | Level (390.0mm) or Volume (390.0L) |
| F3C | 1086 | 4230 | Volume (423.0L) |
| 0 | 0330 | 816 | Level (81.6mm) |
| 1086 | 0330 | 816 | Level (81.6mm) |
| 330 | 576 | 1398 | Volume (139.8L) |
| 0 | 00 | 0 | Empty/Zero |

**Format:** Parameter ID (decimal), Value (hex) pairs
**Use Case:** Sensor data, fuel monitoring, detailed telemetry

---

## Key Observations

### Sample 2 Analysis:

1. **Multiple Zero Parameter IDs (0):**
   - This suggests the parser might be misinterpreting the parameter structure
   - Alternative interpretation: Some values might be standalone (not parameter-value pairs)

2. **High-Confidence Fuel Parameters to Look For:**
   - Parameter ID **2020** or **0x07E4**: Fuel level (mm × 10)
   - Parameter ID **2021** or **0x07E5**: Fuel volume (L × 10)
   - Parameter ID **2022** or **0x07E6**: Fuel temperature (°C)
   - Parameter ID **2023** or **0x07E7**: Fuel percentage (%)

3. **Values that Look Like Fuel Data:**
   - **91** (could be 91°C or 9.1mm)
   - **70** (could be 70°C or 70%)
   - **63** (could be 63°C or 63%)
   - **96** (could be 96°C or 96%)

4. **Large Values:**
   - **999999315** - Likely a timestamp or unique identifier
   - **12174** - Could be volume in 0.1L units = 1217.4L
   - **9001** - Possibly odometer or large sensor value

---

## Expected Fuel Data Structure (from image)

Based on the image attachment showing fuel probe data:

| Field | Example Value | Unit |
|-------|---------------|------|
| Fuel probe 1 level | 180.8 | mm |
| Fuel Probe 1 volume in tank | 417.4 | liter |
| Fuel Probe 1 Temperature | 22 | °C |
| Fuel probe 1 level percentage | 67 | % |
| Fuel probe average level | 67 | % |

**These values should appear in your parameter data with IDs like 2020-2023.**

---

## Recommendations

1. **Capture Real Data:**
   - Monitor your WebSocket connection for actual messages
   - Log the `rawMessage` field to see real parameter-value pairs
   - Cross-reference with known vehicle fuel levels

2. **Identify Correct Parameter IDs:**
   - Check your device manufacturer's documentation
   - Contact your GPS/telematics provider for parameter ID mapping
   - Use the `/test/analyze/` endpoint to examine different messages

3. **Update Parser:**
   - Once you identify the correct parameter IDs, update the fuel extraction logic
   - Add scaling factors (÷10, ÷100) based on your device specification

4. **Test Endpoints:**
   ```bash
   # View parsed samples
   GET http://localhost:3001/test/samples
   
   # Analyze specific payload
   POST http://localhost:3001/test/parse
   Body: { "payload": "your,data,here" }
   
   # Detailed analysis
   GET http://localhost:3001/test/analyze/[URL-encoded-payload]
   ```

---

## Next Steps

✅ Parser successfully extracts both formats
✅ Parameter-value pairs are being decoded
✅ Helper functions suggest possible interpretations

⏭️ **TODO:**
1. Identify correct fuel parameter IDs from real data
2. Update fuel extraction with correct IDs and scaling
3. Test with live WebSocket messages
4. Validate against known fuel levels
