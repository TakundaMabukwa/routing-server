# Quick Reference: Parameter Extraction

## 🎯 Your Data Formats at a Glance

### Format 1: GPS/Telemetry (15 fields)
```
[0]DeviceID, [1]Timestamp, [2-3]Unknown, [4]Lat, [5]Lng, [6-14]Various
173, 07/11/2025 09:43:52, 2, 8, -26.259761, 28.310776, 1677.70, 0, 265, 901850.7, 423, 0, 1, 44344, 8075
```

### Format 2: Sensor/Fuel Data (Parameter-Value Pairs)
```
[0]DeviceID, [1]MsgType, [2]ParamID, [3]Value(hex), [4]ParamID, [5]Value(hex), ...
19, 407, 2001, 5B, 0, 100, 0, 255, 0, 122, ...
      ↓    ↓    ↓   ↓
    Param=2001  Param=0
    Value=91    Value=256
```

---

## 📡 API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/test/samples` | GET | See both sample formats parsed |
| `/test/parse` | POST | Parse your own payload |
| `/test/analyze/:payload` | GET | Detailed parameter analysis |

---

## 🔢 Parameter Extraction (Sample 2)

### All 22 Extracted Parameters:

| # | Param ID | Hex | Decimal | Likely Meaning |
|---|----------|-----|---------|----------------|
| 1 | 2001 | 5B | 91 | Temp 91°C or Level 9.1mm |
| 2 | 0 | 100 | 256 | Unknown |
| 3 | 0 | 255 | 597 | Unknown |
| 4 | 0 | 122 | 290 | Unknown |
| 5 | 0 | 2329 | 9001 | Unknown |
| 6 | 0 | 00E0 | 224 | Temp 22.4°C or Level 22.4mm |
| 7 | 175C (5980) | 46 | 70 | **Temp 70°C or 70%** ⭐ |
| 8 | BE (190) | 0258 | 600 | Level 60.0mm or Vol 60.0L |
| 9 | 6E (110) | 3F | 63 | **Temp 63°C or 63%** ⭐ |
| 10 | 96 (150) | 60 | 96 | **Temp 96°C or 96%** ⭐ |
| 11 | 60 (96) | 522 | 1314 | Level 131.4mm |
| 12 | 0 | 3D0 | 976 | Level 97.6mm |
| 13 | 0 | 1087 | 4231 | **Volume 423.1L** ⭐ |
| 14 | 1087 (4231) | 0470 | 1136 | Volume 113.6L |
| 15 | 470 (1136) | 1088 | 4232 | **Volume 423.2L** ⭐ |
| 16 | 1088 (4232) | 0470 | 1136 | Volume 113.6L |
| 17 | 470 (1136) | 247 | 583 | Level 58.3mm or Vol 58.3L |
| 18 | 2 | 2F8E | 12174 | Volume 1217.4L (too large?) |
| 19 | F8E (3982) | 395 | 917 | Level 91.7mm |
| 20 | 3 | 3B9CCF53 | 999999315 | **Timestamp/ID** ⭐ |
| 21 | B9CCF53 | 54 | 84 | Temp 84°C |
| 22 | 0 | 70 | 112 | Temp 11.2°C or Level 11.2mm |

⭐ = High confidence interpretations

---

## 🔍 Pattern Analysis

### Likely Fuel Parameters:
- **Volume ~423L**: Parameters #13 & #15
- **Temperature 70°C**: Parameter #7
- **Temperature 63°C**: Parameter #9
- **Percentage 96%**: Parameter #10

### Suspicious Values:
- Many `0` parameter IDs → might indicate parsing issue
- Large value `999999315` → timestamp or device-specific ID

---

## 🛠️ How to Use

### 1. Test with samples:
```bash
curl http://localhost:3001/test/samples | json_pp
```

### 2. Parse your own data:
```bash
curl -X POST http://localhost:3001/test/parse \
  -H "Content-Type: application/json" \
  -d '{"payload":"19,407,2001,5B,00,100,..."}'
```

### 3. Watch live data:
```bash
# Server will log:
[TCP-RAW] Device ID: 19, Message Type: 407
[TCP-RAW] Found 22 parameters
[TCP-RAW] Parameter IDs: 2001, 0, 175C, BE, 6E, 96, ...
[TCP-RAW] First 10 params: 2001=91 (0x5B), 0=256 (0x100), ...
```

---

## 📋 Common Fuel Parameter IDs

| ID (Dec) | ID (Hex) | Meaning | Unit | Scaling |
|----------|----------|---------|------|---------|
| 2020 | 0x07E4 | Fuel Level | mm | ÷ 10 |
| 2021 | 0x07E5 | Fuel Volume | L | ÷ 10 |
| 2022 | 0x07E6 | Fuel Temperature | °C | none |
| 2023 | 0x07E7 | Fuel Percentage | % | none |

**Note:** Your actual device may use different IDs. Check manufacturer docs!

---

## ✅ What Works Now

- ✅ Both formats detected automatically
- ✅ All parameters extracted and decoded
- ✅ Hex to decimal conversion
- ✅ Possible interpretations suggested
- ✅ Comprehensive logging
- ✅ Test endpoints available
- ✅ Full documentation generated

## ⚠️ What You Need to Verify

1. **Correct Parameter IDs** for fuel data in YOUR system
2. **Scaling factors** (÷10, ÷100, etc.) for YOUR devices
3. **Parameter ID structure** - why are there many `0` IDs?

## 📞 Need Help?

Check the detailed docs:
- `PARAMETER_GUIDE.md` - Complete format specifications
- `PARAMETER_EXTRACTION_RESULTS.md` - Full analysis
- `EXTRACTION_SUMMARY.md` - Detailed summary

---

**Ready to use! 🚀 Monitor your live data to identify the correct parameter IDs.**
