const { createClient } = require('@supabase/supabase-js');
const distance = require('@turf/distance').default;
const { point } = require('@turf/helpers');
const Database = require('better-sqlite3');
const path = require('path');

class TollGateMonitor {
  constructor(company = 'eps') {
    this.company = company;
    const supabaseUrl = company === 'maysene' 
      ? process.env.NEXT_PUBLIC_MAYSENE_SUPABASE_URL
      : process.env.NEXT_PUBLIC_EPS_SUPABASE_URL;
    const supabaseKey = company === 'maysene'
      ? process.env.NEXT_PUBLIC_MAYSENE_SUPABASE_ANON_KEY
      : process.env.NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY;
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.vehicleAlerts = new Map();
    this.ALERT_COOLDOWN = 30 * 60 * 1000;
    
    this.initLocalDB();
    this.loadFromLocalDB();
    this.startCooldownCleanup();
    this.startDailySync();
  }

  initLocalDB() {
    const dbPath = path.join(__dirname, '..', `toll-gates-${this.company}.db`);
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS toll_gates (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        coordinates TEXT,
        radius REAL DEFAULT 100,
        type TEXT,
        created_at TEXT,
        updated_at TEXT
      )
    `);
  }

  loadFromLocalDB() {
    const count = this.db.prepare('SELECT COUNT(*) as count FROM toll_gates').get();
    console.log(`🚧 Loaded ${count.count} toll gates from local DB`);
    if (count.count === 0) {
      console.log('⚠️  Run: node sync-toll-gates.js');
    }
  }

  async syncFromSupabase() {
    try {
      const { data: tollGates } = await this.supabase
        .from('toll_gates')
        .select('id, name, coordinates, radius, type');
      
      if (tollGates && tollGates.length > 0) {
        this.db.prepare('DELETE FROM toll_gates').run();
        
        const insert = this.db.prepare(`
          INSERT INTO toll_gates (id, name, coordinates, radius, type, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        
        tollGates.forEach(gate => {
          insert.run(
            gate.id,
            gate.name,
            gate.coordinates,
            gate.radius || 100,
            gate.type,
            new Date().toISOString(),
            new Date().toISOString()
          );
        });
        
        console.log(`🚧 Synced ${tollGates.length} toll gates from Supabase`);
      }
    } catch (error) {
      console.error('❌ Error syncing toll gates:', error.message);
    }
  }

  startDailySync() {
    setInterval(() => this.syncFromSupabase(), 24 * 60 * 60 * 1000);
  }

  startCooldownCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, timestamp] of this.vehicleAlerts.entries()) {
        if (now - timestamp > this.ALERT_COOLDOWN) {
          this.vehicleAlerts.delete(key);
        }
      }
    }, 60 * 1000);
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const from = point([lon1, lat1]);
    const to = point([lon2, lat2]);
    return distance(from, to, { units: 'meters' });
  }

  parsePolygonCoordinates(coordString) {
    if (!coordString) return null;
    try {
      const coords = coordString.split(' ').map(coord => {
        const parts = coord.split(',').map(parseFloat);
        // Format is: lon,lat,elevation
        return { lat: parts[1], lon: parts[0] };
      });
      return coords.length > 0 ? coords : null;
    } catch {
      return null;
    }
  }

  getCentroid(coords) {
    const sumLat = coords.reduce((sum, c) => sum + c.lat, 0);
    const sumLon = coords.reduce((sum, c) => sum + c.lon, 0);
    return {
      lat: sumLat / coords.length,
      lon: sumLon / coords.length
    };
  }

  async checkVehicleLocation(vehicleData, hasActiveTrip = false) {
    try {
      const { Plate: plate, DriverName: driverName, Latitude: lat, Longitude: lon } = vehicleData;
      
      if (!lat || !lon || (lat === 0 && lon === 0)) return;
      if (!hasActiveTrip) return;

      const alertKey = `tollgate:${plate}`;
      if (this.vehicleAlerts.has(alertKey)) return;

      const tollGates = this.db.prepare('SELECT * FROM toll_gates').all();
      
      for (const gate of tollGates) {
        const polygonCoords = this.parsePolygonCoordinates(gate.coordinates);
        
        if (!polygonCoords) continue;

        const centroid = this.getCentroid(polygonCoords);
        const dist = this.calculateDistance(lat, lon, centroid.lat, centroid.lon);
        const radius = gate.radius || 100;

        if (dist <= radius) {
          await this.sendTollGateAlert(plate, driverName, gate.name, dist);
          this.vehicleAlerts.set(alertKey, Date.now());
          console.log(`🚧 TOLL GATE: ${plate} (${driverName}) at ${gate.name} - ${(dist).toFixed(0)}m away`);
          break;
        }
      }
    } catch (error) {
      console.error('❌ Error checking toll gate location:', error.message);
    }
  }

  async sendTollGateAlert(plate, driverName, gateName, distance) {
    try {
      await this.supabase
        .from('toll_gate_alerts')
        .insert({
          plate,
          driver_name: driverName,
          toll_gate_name: gateName,
          distance_meters: Math.round(distance),
          alert_timestamp: new Date().toISOString(),
          company: this.company
        });
    } catch (error) {
      console.error('❌ Error sending toll gate alert:', error.message);
    }
  }
}

module.exports = TollGateMonitor;
