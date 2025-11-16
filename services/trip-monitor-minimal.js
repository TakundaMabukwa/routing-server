const { createClient } = require('@supabase/supabase-js');
const distance = require('@turf/distance').default;
const { point } = require('@turf/helpers');
const Database = require('better-sqlite3');
const path = require('path');

class TripMonitorMinimal {
  constructor(company = 'eps') {
    this.company = company;
    const supabaseUrl = company === 'maysene' 
      ? process.env.NEXT_PUBLIC_MAYSENE_SUPABASE_URL
      : process.env.NEXT_PUBLIC_EPS_SUPABASE_URL;
    const supabaseKey = company === 'maysene'
      ? process.env.NEXT_PUBLIC_MAYSENE_SUPABASE_ANON_KEY
      : process.env.NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY;
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.activeTrips = new Map();
    this.stationaryDrivers = new Map();
    this.matchedDrivers = new Map();
    this.matchedVehicles = new Map();
    this.stopPointsCache = new Map();
    
    this.STOP_DETECTION_TIME = 5 * 60 * 1000;
    this.STATIONARY_RADIUS = 50;
    
    this.initLocalDB();
    this.loadActiveTripsOnce();
    this.setupRealtimeForNewTrips();
  }

  initLocalDB() {
    const dbPath = path.join(__dirname, '..', `trip-routes-${this.company}.db`);
    this.db = new Database(dbPath);
    
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trip_routes (
        trip_id INTEGER PRIMARY KEY,
        route_points TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS trips_cache (
        id INTEGER PRIMARY KEY,
        vehicleassignments TEXT,
        selectedstoppoints TEXT,
        status TEXT,
        loaded_at TEXT
      );
      
      CREATE TABLE IF NOT EXISTS stop_points_cache (
        id INTEGER PRIMARY KEY,
        name TEXT,
        coordinates TEXT,
        radius INTEGER
      );
    `);
  }

  setupRealtimeForNewTrips() {
    this.supabase
      .channel('new-trips-only')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'trips' },
        (payload) => {
          console.log(`🆕 New trip detected: ${payload.new.id}`);
          this.loadActiveTripsOnce();
        }
      )
      .subscribe();
    console.log('👂 Listening for new trips...');
  }

  async loadActiveTripsOnce() {
    try {
      const { data: trips } = await this.supabase
        .from('trips')
        .select('id, vehicleassignments, status, selectedstoppoints')
        .not('status', 'in', '(Completed,Delivered)');
      
      if (!trips) return;
      
      const stmt = this.db.prepare('INSERT OR REPLACE INTO trips_cache (id, vehicleassignments, selectedstoppoints, status, loaded_at) VALUES (?, ?, ?, ?, ?)');
      const now = new Date().toISOString();
      
      for (const trip of trips) {
        stmt.run(trip.id, JSON.stringify(trip.vehicleassignments), JSON.stringify(trip.selectedstoppoints), trip.status, now);
        this.activeTrips.set(trip.id, trip);
        
        if (trip.selectedstoppoints?.length > 0) {
          await this.cacheStopPoints(trip.selectedstoppoints);
        }
      }
      
      console.log(`✅ Loaded ${trips.length} trips into SQLite cache (one-time load)`);
    } catch (error) {
      console.error('❌ Error loading trips:', error.message);
    }
  }

  async cacheStopPoints(stopPointIds) {
    const uncached = stopPointIds.filter(id => !this.stopPointsCache.has(id));
    if (uncached.length === 0) return;
    
    const { data: stopPoints } = await this.supabase
      .from('stop_points')
      .select('id, name, coordinates, radius')
      .in('id', uncached);
    
    if (!stopPoints) return;
    
    const stmt = this.db.prepare('INSERT OR REPLACE INTO stop_points_cache (id, name, coordinates, radius) VALUES (?, ?, ?, ?)');
    
    for (const sp of stopPoints) {
      stmt.run(sp.id, sp.name, sp.coordinates, sp.radius || 100);
      this.stopPointsCache.set(sp.id, sp);
    }
  }

  async processVehicleData(vehicleData) {
    try {
      const { DriverName: driverName, Plate: plate, Latitude: lat, Longitude: lon, Speed: speed } = vehicleData;
      
      if (!driverName || !lat || !lon || (lat === 0 && lon === 0)) return;

      const activeTrip = this.findActiveTrip(driverName, plate);
      if (!activeTrip) return;

      this.updateTripLocationLocal(activeTrip.id, lat, lon, speed);
      await this.checkForStops(activeTrip, lat, lon, speed);
      
    } catch (error) {
      console.error('❌ Error processing vehicle data:', error.message);
    }
  }

  findActiveTrip(driverName, plate) {
    const normalizedDriverName = driverName.toLowerCase();
    const normalizedPlate = plate ? plate.toLowerCase() : null;
    
    if (normalizedPlate) {
      const cachedByVehicle = this.matchedVehicles.get(normalizedPlate);
      if (cachedByVehicle && this.activeTrips.has(cachedByVehicle)) {
        return this.activeTrips.get(cachedByVehicle);
      }
    }
    
    const cachedByDriver = this.matchedDrivers.get(normalizedDriverName);
    if (cachedByDriver && this.activeTrips.has(cachedByDriver)) {
      return this.activeTrips.get(cachedByDriver);
    }
    
    for (const [tripId, trip] of this.activeTrips) {
      const tripPlate = this.getVehiclePlateFromAssignments(trip);
      if (tripPlate && plate && tripPlate.toLowerCase() === plate.toLowerCase()) {
        this.matchedVehicles.set(normalizedPlate, tripId);
        return trip;
      }
    }
    
    for (const [tripId, trip] of this.activeTrips) {
      const tripDriverName = this.getDriverNameFromAssignments(trip);
      if (tripDriverName && this.namesMatch(driverName, tripDriverName)) {
        this.matchedDrivers.set(normalizedDriverName, tripId);
        return trip;
      }
    }
    
    return null;
  }

  getDriverNameFromAssignments(trip) {
    if (!trip.vehicleassignments) return null;
    
    try {
      let assignments = trip.vehicleassignments;
      if (typeof assignments === 'string') assignments = JSON.parse(assignments);
      if (!Array.isArray(assignments)) assignments = [assignments];
      
      for (const assignment of assignments) {
        if (!assignment.drivers) continue;
        const drivers = Array.isArray(assignment.drivers) ? assignment.drivers : [assignment.drivers];
        
        for (const driver of drivers) {
          const nameOptions = [driver.surname, driver.name, driver.first_name].filter(Boolean);
          for (const nameOption of nameOptions) {
            if (nameOption && nameOption.trim()) {
              let cleanName = nameOption.trim().replace(/^null\s+/i, '').replace(/\s+/g, ' ').trim();
              if (cleanName && cleanName.toLowerCase() !== 'null') return cleanName;
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Error parsing vehicleassignments:', error.message);
    }
    
    return null;
  }

  getVehiclePlateFromAssignments(trip) {
    if (!trip.vehicleassignments) return null;
    
    try {
      let assignments = trip.vehicleassignments;
      if (typeof assignments === 'string') assignments = JSON.parse(assignments);
      if (!Array.isArray(assignments)) assignments = [assignments];
      
      for (const assignment of assignments) {
        if (assignment.vehicle && (assignment.vehicle.plate || assignment.vehicle.name)) {
          return (assignment.vehicle.plate || assignment.vehicle.name).trim();
        }
      }
    } catch (error) {
      console.error('❌ Error parsing vehicleassignments for plate:', error.message);
    }
    
    return null;
  }

  namesMatch(epsDriverName, tripDriverName) {
    const eps = epsDriverName.toLowerCase();
    const trip = tripDriverName.toLowerCase();
    return eps.includes(trip) || trip.includes(eps);
  }

  updateTripLocationLocal(tripId, latitude, longitude, speed) {
    try {
      const newPoint = {
        lat: latitude,
        lng: longitude,
        speed: speed,
        timestamp: Math.floor(Date.now() / 1000),
        datetime: new Date().toISOString()
      };
      
      const existing = this.db.prepare('SELECT route_points FROM trip_routes WHERE trip_id = ?').get(tripId);
      
      if (existing) {
        const points = JSON.parse(existing.route_points);
        points.push(newPoint);
        this.db.prepare('UPDATE trip_routes SET route_points = ?, updated_at = ? WHERE trip_id = ?')
          .run(JSON.stringify(points), new Date().toISOString(), tripId);
      } else {
        this.db.prepare('INSERT INTO trip_routes (trip_id, route_points, created_at, updated_at) VALUES (?, ?, ?, ?)')
          .run(tripId, JSON.stringify([newPoint]), new Date().toISOString(), new Date().toISOString());
      }
    } catch (error) {
      console.error('❌ Error updating trip location:', error.message);
    }
  }

  getRoutePoints(tripId) {
    const result = this.db.prepare('SELECT route_points, created_at, updated_at FROM trip_routes WHERE trip_id = ?').get(tripId);
    if (!result) return null;
    return {
      trip_id: tripId,
      route_points: JSON.parse(result.route_points),
      created_at: result.created_at,
      updated_at: result.updated_at
    };
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const from = point([lon1, lat1]);
    const to = point([lon2, lat2]);
    return distance(from, to, { units: 'meters' });
  }

  async checkForStops(trip, latitude, longitude, speed) {
    try {
      const driverKey = `${trip.id}`;
      const now = Date.now();
      
      if (speed >= 5) {
        this.stationaryDrivers.delete(driverKey);
        return;
      }
      
      const existingStationary = this.stationaryDrivers.get(driverKey);
      
      if (!existingStationary) {
        this.stationaryDrivers.set(driverKey, { startTime: now, latitude, longitude, tripId: trip.id });
        return;
      }
      
      const dist = this.calculateDistance(latitude, longitude, existingStationary.latitude, existingStationary.longitude);
      
      if (dist > this.STATIONARY_RADIUS) {
        this.stationaryDrivers.set(driverKey, { startTime: now, latitude, longitude, tripId: trip.id });
        return;
      }
      
      const stationaryDuration = now - existingStationary.startTime;
      if (stationaryDuration >= this.STOP_DETECTION_TIME) {
        const authCheck = await this.isAuthorizedStopLocal(trip.id, latitude, longitude, trip.selectedstoppoints);
        
        if (!authCheck.authorized) {
          await this.flagUnauthorizedStop(trip.id, latitude, longitude, authCheck.reason);
          console.log(`🚨 UNAUTHORIZED STOP: Trip ${trip.id} - ${authCheck.reason}`);
        }
        
        this.stationaryDrivers.delete(driverKey);
      }
    } catch (error) {
      console.error('❌ Error checking for stops:', error.message);
    }
  }

  async isAuthorizedStopLocal(tripId, latitude, longitude, selectedStopPoints) {
    try {
      if (!selectedStopPoints || selectedStopPoints.length === 0) {
        return { authorized: false, reason: 'No authorized stop points defined' };
      }
      
      const stopPoints = this.db.prepare('SELECT name, coordinates, radius FROM stop_points_cache WHERE id IN (' + selectedStopPoints.map(() => '?').join(',') + ')').all(...selectedStopPoints);
      
      if (stopPoints.length === 0) {
        return { authorized: false, reason: 'Stop points not found' };
      }
      
      for (const stopPoint of stopPoints) {
        if (!stopPoint.coordinates) continue;
        
        const coords = stopPoint.coordinates.split(',');
        const stopLat = parseFloat(coords[0]);
        const stopLon = parseFloat(coords[1]);
        const radius = stopPoint.radius || 100;
        
        const dist = this.calculateDistance(latitude, longitude, stopLat, stopLon);
        
        if (dist <= radius) {
          return { authorized: true, stopName: stopPoint.name };
        }
      }
      
      return { authorized: false, reason: 'Outside all authorized zones' };
    } catch (error) {
      console.error('❌ Error checking authorized stops:', error.message);
      return { authorized: false, reason: 'Error checking zones' };
    }
  }

  async flagUnauthorizedStop(tripId, latitude, longitude, reason) {
    try {
      await this.supabase
        .from('trips')
        .update({
          alert_type: 'unauthorized_stop',
          alert_message: `Unauthorized stop: ${reason}`,
          alert_timestamp: new Date().toISOString(),
          status: 'alert',
          updated_at: new Date().toISOString()
        })
        .eq('id', tripId);
    } catch (error) {
      console.error('❌ Error flagging unauthorized stop:', error.message);
    }
  }

  destroy() {
    this.db.close();
  }
}

module.exports = TripMonitorMinimal;
