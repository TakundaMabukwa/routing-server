const { createClient } = require('@supabase/supabase-js');
const distance = require('@turf/distance').default;
const { point } = require('@turf/helpers');
const Database = require('better-sqlite3');
const path = require('path');

class BorderMonitor {
  constructor(company = 'eps') {
    this.company = company;
    const supabaseUrl = process.env.NEXT_PUBLIC_EPS_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY;
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.vehicleAlerts = new Map();
    this.ALERT_COOLDOWN = 60 * 60 * 1000; // 1 hour
    
    this.initLocalDB();
    this.loadFromLocalDB();
    this.startCooldownCleanup();
    this.startDailySync();
  }

  initLocalDB() {
    const dbPath = path.join(__dirname, '..', 'border-warnings.db');
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS border_warnings (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        coordinates TEXT,
        radius REAL DEFAULT 100,
        created_at TEXT,
        updated_at TEXT
      )
    `);
  }

  loadFromLocalDB() {
    const count = this.db.prepare('SELECT COUNT(*) as count FROM border_warnings').get();
    console.log(`🚨 Loaded ${count.count} border warnings from local DB`);
    if (count.count === 0) {
      console.log('⚠️  Run: node sync-borders.js');
    }
  }

  async syncFromSupabase() {
    try {
      const { data: borders } = await this.supabase
        .from('border_warning')
        .select('id, name, coordinates, radius');
      
      if (borders && borders.length > 0) {
        this.db.prepare('DELETE FROM border_warnings').run();
        
        const insert = this.db.prepare(`
          INSERT INTO border_warnings (id, name, coordinates, radius, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        borders.forEach(border => {
          insert.run(
            border.id,
            border.name,
            border.coordinates,
            border.radius || 100,
            new Date().toISOString(),
            new Date().toISOString()
          );
        });
        
        console.log(`🚨 Synced ${borders.length} border warnings from Supabase`);
      }
    } catch (error) {
      console.error('❌ Error syncing borders:', error.message);
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

  async checkVehicleLocation(vehicleData, tripId) {
    try {
      const { Plate: plate, DriverName: driverName, Latitude: lat, Longitude: lon } = vehicleData;
      
      if (!tripId || !lat || !lon || (lat === 0 && lon === 0)) return false;

      const alertKey = `border:${tripId}`;
      if (this.vehicleAlerts.has(alertKey)) return true;

      const borders = this.db.prepare('SELECT * FROM border_warnings').all();
      
      for (const border of borders) {
        const polygonCoords = this.parsePolygonCoordinates(border.coordinates);
        
        if (!polygonCoords) continue;

        const centroid = this.getCentroid(polygonCoords);
        const dist = this.calculateDistance(lat, lon, centroid.lat, centroid.lon);
        const radius = 1000; // 1km radius

        if (dist <= radius) {
          await this.flagTripAtBorder(tripId, plate, driverName, border.name, dist);
          this.vehicleAlerts.set(alertKey, Date.now());
          console.log(`🚨 BORDER: Trip ${tripId} (${plate}) at ${border.name} - ${(dist / 1000).toFixed(2)}km away`);
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('❌ Error checking border location:', error.message);
      return false;
    }
  }

  async flagTripAtBorder(tripId, plate, driverName, borderName, distance) {
    try {
      await this.supabase
        .from('trips')
        .update({
          alert_type: 'at_border',
          alert_message: `Vehicle at border stop: ${borderName}`,
          alert_timestamp: new Date().toISOString(),
          status: 'at-border',
          updated_at: new Date().toISOString()
        })
        .eq('id', tripId);
    } catch (error) {
      console.error('❌ Error flagging trip at border:', error.message);
    }
  }
}

module.exports = BorderMonitor;
