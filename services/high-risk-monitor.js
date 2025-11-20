const { createClient } = require('@supabase/supabase-js');
const distance = require('@turf/distance').default;
const { point } = require('@turf/helpers');
const Database = require('better-sqlite3');
const path = require('path');

class HighRiskMonitor {
  constructor(company = 'eps') {
    this.company = company;
    const supabaseUrl = company === 'maysene' 
      ? process.env.NEXT_PUBLIC_MAYSENE_SUPABASE_URL
      : process.env.NEXT_PUBLIC_EPS_SUPABASE_URL;
    const supabaseKey = company === 'maysene'
      ? process.env.NEXT_PUBLIC_MAYSENE_SUPABASE_ANON_KEY
      : process.env.NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY;
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.highRiskZones = [];
    this.vehicleAlerts = new Map();
    this.ALERT_COOLDOWN = 5 * 60 * 1000;
    
    this.initLocalDB();
    this.loadHighRiskZones();
    this.startPeriodicRefresh();
  }

  initLocalDB() {
    const dbPath = path.join(__dirname, '..', 'high-risk-zones.db');
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS high_risk_zones (
        id INTEGER PRIMARY KEY,
        name TEXT,
        coordinates TEXT,
        coords TEXT,
        radius REAL,
        type TEXT,
        updated_at TEXT
      )
    `);
    console.log('📦 High-risk zones database initialized');
  }

  async loadHighRiskZones() {
    try {
      // Load from local SQLite database
      const localZones = this.db.prepare('SELECT * FROM high_risk_zones').all();
      
      if (localZones.length > 0) {
        this.highRiskZones = localZones;
        console.log(`🚨 Loaded ${this.highRiskZones.length} high-risk zones from SQLite`);
      } else {
        console.log('⚠️ No zones in SQLite, syncing from Supabase...');
        await this.syncFromSupabase();
      }
    } catch (error) {
      console.error('Error loading high-risk zones:', error.message);
    }
  }

  async syncFromSupabase() {
    try {
      const { data, error } = await this.supabase
        .from('high_risk')
        .select('id, name, coordinates, coords, radius, type');
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        // Clear and repopulate SQLite
        this.db.prepare('DELETE FROM high_risk_zones').run();
        
        const insert = this.db.prepare(`
          INSERT INTO high_risk_zones (id, name, coordinates, coords, radius, type, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        
        for (const zone of data) {
          insert.run(
            zone.id,
            zone.name,
            zone.coordinates,
            zone.coords,
            zone.radius,
            zone.type,
            new Date().toISOString()
          );
        }
        
        this.highRiskZones = data;
        console.log(`✅ Synced ${this.highRiskZones.length} high-risk zones to SQLite`);
      }
    } catch (error) {
      console.error('Error syncing from Supabase:', error.message);
    }
  }

  startPeriodicRefresh() {
    // Sync from Supabase every 24 hours (once per day)
    setInterval(() => this.syncFromSupabase(), 24 * 60 * 60 * 1000);
  }

  parseCoordinates(coordinatesStr) {
    if (!coordinatesStr) return [];
    
    // Parse "lng,lat,alt lng,lat,alt" format
    const points = coordinatesStr.trim().split(/\s+/);
    return points.map(point => {
      const [lng, lat] = point.split(',').map(parseFloat);
      return { lat, lng };
    }).filter(p => !isNaN(p.lat) && !isNaN(p.lng));
  }

  isPointInPolygon(lat, lng, polygonPoints) {
    if (polygonPoints.length < 3) return false;
    
    let inside = false;
    for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
      const xi = polygonPoints[i].lng, yi = polygonPoints[i].lat;
      const xj = polygonPoints[j].lng, yj = polygonPoints[j].lat;
      
      const intersect = ((yi > lat) !== (yj > lat))
        && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  calculateDistance(lat1, lng1, lat2, lng2) {
    const from = point([lng1, lat1]);
    const to = point([lng2, lat2]);
    return distance(from, to, { units: 'meters' });
  }

  async checkVehicleLocation(vehicleData) {
    try {
      const { Plate: plate, DriverName: driverName, Latitude: lat, Longitude: lng } = vehicleData;
      
      if (!plate || !lat || !lng || (lat === 0 && lng === 0)) {
        return null;
      }

      for (const zone of this.highRiskZones) {
        const isInZone = this.isVehicleInZone(lat, lng, zone);
        
        if (isInZone) {
          const alertKey = `${plate}:${zone.id}`;
          const lastAlert = this.vehicleAlerts.get(alertKey);
          
          // Check cooldown
          if (lastAlert && (Date.now() - lastAlert) < this.ALERT_COOLDOWN) {
            continue; // Skip if alert was sent recently
          }
          
          // Send alert
          await this.sendHighRiskAlert(plate, driverName, lat, lng, zone);
          this.vehicleAlerts.set(alertKey, Date.now());
          
          console.log(`🚨 HIGH RISK ALERT: ${plate} (${driverName}) entered ${zone.name}`);
        } else {
          // Vehicle left zone, clear alert
          const alertKey = `${plate}:${zone.id}`;
          this.vehicleAlerts.delete(alertKey);
        }
      }
    } catch (error) {
      console.error('Error checking high-risk zones:', error.message);
    }
  }

  isVehicleInZone(lat, lng, zone) {
    if (zone.coordinates) {
      // Polygon zone
      const polygonPoints = this.parseCoordinates(zone.coordinates);
      if (polygonPoints.length >= 3) {
        return this.isPointInPolygon(lat, lng, polygonPoints);
      }
    }
    
    if (zone.coords) {
      // Single point with radius
      const [zoneLat, zoneLng] = zone.coords.split(',').map(parseFloat);
      if (!isNaN(zoneLat) && !isNaN(zoneLng)) {
        const dist = this.calculateDistance(lat, lng, zoneLat, zoneLng);
        const radius = zone.radius || 100;
        return dist <= radius;
      }
    }
    
    return false;
  }

  async sendHighRiskAlert(plate, driverName, lat, lng, zone) {
    try {
      const alert = {
        company: this.company,
        plate: plate,
        driver_name: driverName,
        zone_id: zone.id,
        zone_name: zone.name,
        latitude: lat,
        longitude: lng,
        alert_type: 'high_risk_zone_entry',
        alert_message: `Vehicle ${plate} entered high-risk zone: ${zone.name}`,
        severity: 'high',
        timestamp: new Date().toISOString()
      };

      const { error } = await this.supabase
        .from('high_risk_alerts')
        .insert(alert);
      
      if (error) throw error;
      
      console.log(`✅ Alert sent: ${plate} in ${zone.name}`);
    } catch (error) {
      console.error('Error sending high-risk alert:', error.message);
    }
  }
}

module.exports = HighRiskMonitor;
