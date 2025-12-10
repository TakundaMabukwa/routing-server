const ExcelJS = require('exceljs');
const fs = require('fs');

async function generateExcel() {
  const workbook = new ExcelJS.Workbook();
  
  // Read CSV data
  const csvData = fs.readFileSync('ctrack-api-fields.csv', 'utf-8');
  const lines = csvData.split('\n').filter(line => line.trim());
  
  // Create worksheets for each endpoint
  const vehiclesSheet = workbook.addWorksheet('Vehicle GetVehicles');
  const positionsSheet = workbook.addWorksheet('Vehicle LastDevicePosition');
  const driversSheet = workbook.addWorksheet('Drivers');
  const sensorsSheet = workbook.addWorksheet('Temperature Sensors');
  
  // Header style
  const headerStyle = {
    font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } },
    alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
    border: {
      top: { style: 'thin' }, left: { style: 'thin' },
      bottom: { style: 'thin' }, right: { style: 'thin' }
    }
  };
  
  // Category colors
  const categoryColors = {
    'Identification': 'FFE7E6F7',
    'Vehicle Details': 'FFDEEAF6',
    'Driver Assignment': 'FFFCE4D6',
    'Metrics': 'FFE2EFD9',
    'Timestamps': 'FFFFF2CC',
    'Device Info': 'FFF4B084',
    'System': 'FFD9E1F2',
    'GPS Data': 'FFC6E0B4',
    'Vehicle Status': 'FFFFD966',
    'Driver Info': 'FFFCE4D6',
    'Edge Computing': 'FFB4C7E7',
    'Location Details': 'FFA9D08E',
    'Address': 'FFF8CBAD',
    'Personal Info': 'FFE7E6F7',
    'Contact Info': 'FFDEEAF6',
    'Employment': 'FFE2EFD9',
    'Account': 'FFFFF2CC',
    'Security': 'FFFFC7CE',
    'Driver Specific': 'FFFCE4D6',
    'Assignments': 'FFC6E0B4',
    'Permissions': 'FFFFD966',
    'Firebase': 'FFF4B084',
    'Terms': 'FFB4C7E7',
    'Profile': 'FFE7E6F7',
    'System Flags': 'FFD9E1F2',
    'Internal': 'FFC9C9C9',
    'Summary': 'FFE2EFD9',
    'Temperature Data': 'FFFCE4D6'
  };
  
  function setupSheet(sheet, data, title) {
    // Add title
    sheet.mergeCells('A1:E1');
    sheet.getCell('A1').value = `C-Track API Documentation - ${title}`;
    sheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1F4E78' } };
    sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(1).height = 25;
    
    // Add headers
    sheet.getRow(2).values = ['Category', 'Field Name', 'Sample Value', 'Description'];
    sheet.getRow(2).eachCell((cell) => {
      cell.style = headerStyle;
    });
    sheet.getRow(2).height = 20;
    
    // Add data
    let rowNum = 3;
    data.forEach(row => {
      const excelRow = sheet.getRow(rowNum);
      excelRow.values = [row.category, row.field, row.sample, row.description];
      
      // Apply category color
      const bgColor = categoryColors[row.category] || 'FFFFFFFF';
      excelRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
        };
        cell.alignment = { vertical: 'top', wrapText: true };
      });
      
      rowNum++;
    });
    
    // Set column widths
    sheet.getColumn(1).width = 20;
    sheet.getColumn(2).width = 30;
    sheet.getColumn(3).width = 35;
    sheet.getColumn(4).width = 50;
    
    // Freeze header rows
    sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];
  }
  
  // Parse CSV and organize by endpoint
  const vehiclesData = [];
  const positionsData = [];
  const driversData = [];
  const sensorsData = [];
  
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 5) continue;
    
    const endpoint = parts[0];
    const category = parts[1];
    const field = parts[2];
    const sample = parts[3];
    const description = parts.slice(4).join(',');
    
    const row = { category, field, sample, description };
    
    if (endpoint.includes('Vehicle/GetVehicles')) {
      vehiclesData.push(row);
    } else if (endpoint.includes('Vehicle/LastDevicePosition')) {
      positionsData.push(row);
    } else if (endpoint.includes('Drivers')) {
      driversData.push(row);
    } else if (endpoint.includes('Sensors')) {
      sensorsData.push(row);
    }
  }
  
  // Setup all sheets
  setupSheet(vehiclesSheet, vehiclesData, 'Vehicle/GetVehicles');
  setupSheet(positionsSheet, positionsData, 'Vehicle/LastDevicePosition');
  setupSheet(driversSheet, driversData, 'Drivers');
  setupSheet(sensorsSheet, sensorsData, 'Sensors/TemperatureProbeReport');
  
  // Save file
  await workbook.xlsx.writeFile('CTrack_API_Documentation.xlsx');
  console.log('✅ Excel file created: CTrack_API_Documentation.xlsx');
}

generateExcel().catch(console.error);
