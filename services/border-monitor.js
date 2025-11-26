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
    this.ALERT_COOLDOWN = 3 * 60 * 60 * 1000; // 3 hours
    
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
      );
      
      CREATE TABLE IF NOT EXISTS border_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id INTEGER NOT NULL,
        border_name TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_border_alerts ON border_alerts(trip_id, border_name, timestamp);
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
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      this.db.prepare('DELETE FROM border_alerts WHERE timestamp < ?').run(sevenDaysAgo);
    }, 24 * 60 * 60 * 1000);
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

      const borders = this.db.prepare('SELECT * FROM border_warnings').all();
      
      for (const border of borders) {
        const polygonCoords = this.parsePolygonCoordinates(border.coordinates);
        
        if (!polygonCoords) continue;

        const centroid = this.getCentroid(polygonCoords);
        const dist = this.calculateDistance(lat, lon, centroid.lat, centroid.lon);
        const radius = 1000; // 1km radius

        if (dist <= radius) {
          if (this.shouldSendAlert(tripId, border.name)) {
            await this.flagTripAtBorder(tripId, plate, driverName, border.name, dist);
            console.log(`🚨 BORDER: Trip ${tripId} (${plate}) at ${border.name} - ${(dist / 1000).toFixed(2)}km away`);
          }
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('❌ Error checking border location:', error.message);
      return false;
    }
  }

  shouldSendAlert(tripId, borderName) {
    const threeHoursAgo = new Date(Date.now() - this.ALERT_COOLDOWN).toISOString();
    const recent = this.db.prepare('SELECT id FROM border_alerts WHERE trip_id = ? AND border_name = ? AND timestamp > ? LIMIT 1').get(tripId, borderName, threeHoursAgo);
    return !recent;
  }

  async flagTripAtBorder(tripId, plate, driverName, borderName, distance) {
    try {
      const timestamp = new Date().toISOString();
      
      this.db.prepare('INSERT INTO border_alerts (trip_id, border_name, timestamp) VALUES (?, ?, ?)').run(tripId, borderName, timestamp);
      
      const { data: trip } = await this.supabase
        .from('trips')
        .select('alert_message')
        .eq('id', tripId)
        .single();
      
      const alerts = trip?.alert_message || [];
      alerts.push({
        type: 'at_border',
        message: `Vehicle at border stop: ${borderName}`,
        border_name: borderName,
        distance_km: (distance / 1000).toFixed(2),
        timestamp
      });
      
      await this.supabase
        .from('trips')
        .update({
          alert_type: 'at_border',
          alert_message: alerts,
          alert_timestamp: timestamp,
          status: 'at-border',
          updated_at: timestamp
        })
        .eq('id', tripId);
    } catch (error) {
      console.error('❌ Error flagging trip at border:', error.message);
    }
  }
}

module.exports = BorderMonitor;
