const Database = require('better-sqlite3');
const path = require('path');

class CTrackVehicleDB {
  constructor() {
    this.db = new Database(path.join(__dirname, '..', 'ctrack-vehicles.db'));
    this.init();
  }

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vehicles (
        vehicle_id TEXT PRIMARY KEY,
        registration_number TEXT,
        display_name TEXT,
        make TEXT,
        model TEXT,
        driver_id TEXT,
        last_updated INTEGER
      );
      
      CREATE TABLE IF NOT EXISTS eps_ctrack_vehicles (
        vehicle_id TEXT PRIMARY KEY,
        plate TEXT,
        speed REAL,
        latitude REAL,
        longitude REAL,
        loc_time TEXT,
        mileage INTEGER,
        heading REAL,
        geozone TEXT,
        driver_name TEXT,
        name_event TEXT,
        address TEXT,
        parse_method TEXT,
        timestamp TEXT,
        device_id TEXT,
        driver_id TEXT
      )
    `);
  }

  saveVehicles(vehicles) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO vehicles 
      (vehicle_id, registration_number, display_name, make, model, driver_id, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Date.now();
    for (const vehicle of vehicles) {
      stmt.run(
        vehicle.id,
        vehicle.registrationNumber || null,
        vehicle.displayName || null,
        vehicle.make || null,
        vehicle.model || null,
        vehicle.driverId || null,
        now
      );
    }
    console.log(`💾 Saved ${vehicles.length} vehicles to database`);
  }

  getVehicle(vehicleId) {
    const stmt = this.db.prepare('SELECT * FROM vehicles WHERE vehicle_id = ?');
    return stmt.get(vehicleId);
  }

  getAllVehicles() {
    const stmt = this.db.prepare('SELECT * FROM vehicles');
    return stmt.all();
  }

  saveFormattedVehicle(data) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO eps_ctrack_vehicles 
      (vehicle_id, plate, speed, latitude, longitude, loc_time, mileage, heading, 
       geozone, driver_name, name_event, address, parse_method, timestamp, device_id, driver_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      data.VehicleId,
      data.Plate,
      data.Speed,
      data.Latitude,
      data.Longitude,
      data.LocTime,
      data.Mileage,
      data.Head,
      data.Geozone,
      data.DriverName,
      data.NameEvent,
      data.Address,
      data.parseMethod,
      data.timestamp,
      data.DeviceId,
      data.DriverId
    );
  }
}

module.exports = CTrackVehicleDB;
