# Data Format & Parameter Guide

## Overview
This document explains how to parse the two different data formats used in the routing server.

---

## Format 1: Telemetry Data (Sequential CSV)

**Example:**
```
173,07/11/2025 09:43:52,2,8,-26.259761,28.310776,1677.70,0,265,901850.7,423,0,1,44344,8075,
```

**Structure:**
| Position | Field Name | Value | Type | Description |
|----------|------------|-------|------|-------------|
| 0 | Device ID | 173 | Integer | Unique device identifier |
| 1 | Timestamp | 07/11/2025 09:43:52 | DateTime | Date and time of message |
| 2 | Field 2 | 2 | Integer | TBD |
| 3 | Field 3 | 8 | Integer | TBD |
| 4 | Latitude | -26.259761 | Float | GPS latitude coordinate |
| 5 | Longitude | 28.310776 | Float | GPS longitude coordinate |
| 6 | Field 6 | 1677.70 | Float | TBD (possibly altitude or distance) |
| 7 | Field 7 | 0 | Integer | TBD |
| 8 | Field 8 | 265 | Integer | TBD |
| 9 | Field 9 | 901850.7 | Float | TBD (possibly odometer) |
| 10 | Field 10 | 423 | Integer | TBD |
| 11 | Field 11 | 0 | Integer | TBD |
| 12 | Field 12 | 1 | Integer | TBD |
| 13 | Field 13 | 44344 | Integer | TBD |
| 14 | Field 14 | 8075 | Integer | TBD |

---

## Format 2: Parameter-Value Pairs (Hex)

**Example:**
```
19,407,2001,5B,00,100,00,255,00,122,00,2329,00E0,175C,46,BE,0258,6E,3F,96,60,522,00,3D0,00,1087,0470,1088,0470,247,2F8E,395,3B9CCF53,54,00,70,01,1675,00,928,02,582,0F3C,1086,0330,576,00
```

**Header:**
| Position | Field | Value | Description |
|----------|-------|-------|-------------|
| 0 | Device ID | 19 | Unique device identifier |
| 1 | Message Type | 407 | Message type code (405, 407, etc.) |

**Parameter-Value Pairs (starting from position 2):**

The remaining data comes in pairs:
- **Even positions (2, 4, 6, ...):** Parameter ID (decimal)
- **Odd positions (3, 5, 7, ...):** Value (hexadecimal)

### Example Parsing:

| Param ID | Hex Value | Decimal Value | Description |
|----------|-----------|---------------|-------------|
| 2001 | 5B | 91 | TBD |
| 0 | 100 | 256 | TBD |
| 0 | 255 | 597 | TBD |
| 0 | 122 | 290 | TBD |
| 0 | 2329 | 9001 | TBD |
| 0 | 00E0 | 224 | TBD |
| 175C | 46 | 70 | TBD |
| BE | 0258 | 600 | TBD |
| 6E | 3F | 63 | TBD |
| 96 | 60 | 96 | TBD |
| 522 | 00 | 0 | TBD |
| 3D0 | 00 | 0 | TBD |
| 1087 | 0470 | 1136 | TBD |
| 1088 | 0470 | 1136 | TBD |
| 247 | 2F8E | 12174 | TBD |
| 395 | 3B9CCF53 | 999999315 | TBD |
| 54 | 00 | 0 | TBD |
| 70 | 01 | 1 | TBD |
| 1675 | 00 | 0 | TBD |
| 928 | 02 | 2 | TBD |
| 582 | 0F3C | 3900 | TBD |
| 1086 | 0330 | 816 | TBD |
| 576 | 00 | 0 | TBD |

---

## Common Fuel Parameter IDs

Based on the image attachment showing fuel probe data, here are typical parameter IDs to look for:

| Parameter ID | Name | Unit | Scaling | Description |
|--------------|------|------|---------|-------------|
| 2020 | Fuel Level | mm | ÷ 10 | Fuel probe level in tank |
| 2021 | Fuel Volume | L | ÷ 10 | Fuel volume in tank |
| 2022 | Fuel Temperature | °C | none | Fuel temperature |
| 2023 | Fuel Percentage | % | none | Fuel level percentage |

**Note:** These parameter IDs need to be verified with your actual data. The parser will output all parameter IDs found in each message to help you identify them.

---

## Using the Parser

### Test Endpoints

1. **Test with sample data:**
   ```bash
   GET http://localhost:3001/test/samples
   ```

2. **Test with custom payload:**
   ```bash
   POST http://localhost:3001/test/parse
   Content-Type: application/json

   {
     "payload": "19,407,2001,5B,00,100,..."
   }
   ```

### Console Output

When processing messages, the parser will log:
- Device ID and Message Type
- Total number of parameters found
- List of all parameter IDs
- First 10 parameter ID/value pairs with both hex and decimal values
- Parsed fuel data (if fuel parameter IDs are found)

Example console output:
```
[TCP-RAW] Device ID: 19, Message Type: 407
[TCP-RAW] Found 23 parameters
[TCP-RAW] Parameter IDs: 2001, 0, 175C, BE, 6E, 96, 522, 3D0, 1087, 1088, ...
[TCP-RAW] First 10 params: 2001=91 (0x5B), 0=256 (0x100), 175C=70 (0x46), ...
```

---

## Next Steps

1. **Identify Parameter IDs:** Run your server and watch the console logs to identify which parameter IDs correspond to which values in your system.

2. **Update Fuel Parameters:** Once you identify the correct parameter IDs for fuel data, update the parser in `server.js`:
   ```javascript
   const fuelLevelRaw = params[YOUR_PARAM_ID] || 0;
   const fuelVolumeRaw = params[YOUR_PARAM_ID] || 0;
   const fuelTempRaw = params[YOUR_PARAM_ID] || 0;
   const fuelPercentageRaw = params[YOUR_PARAM_ID] || 0;
   ```

3. **Verify Scaling:** Check if your values need scaling (division by 10, 100, etc.) by comparing with known values.

4. **Document Additional Fields:** As you identify what each field represents, update this guide with the proper field names and descriptions.
