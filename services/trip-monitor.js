const { createClient } = require('@supabase/supabase-js');
const distance = require('@turf/distance').default;
const { point } = require('@turf/helpers');
const Database = require('better-sqlite3');
const path = require('path');

class TripMonitor {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_EPS_SUPABASE_URL,
      process.env.NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY
    );
    this.activeTrips = new Map();
    this.stationaryDrivers = new Map();
    this.matchedDrivers = new Map();
    this.matchedVehicles = new Map();
    this.noMatchLogged = new Set();
    this.STOP_DETECTION_TIME = 5 * 60 * 1000;
    this.STATIONARY_RADIUS = 50;
    this.BREAK_REQUIRED_INTERVAL = 2 * 60 * 60 * 1000;
    this.SYNC_INTERVAL = 30 * 60 * 1000;
    
    this.initLocalDB();
    this.loadActiveTrips();
    this.setupRealtimeSubscription();
    this.startPeriodicSync();
  }

  initLocalDB() {
    const dbPath = path.join(__dirname, '..', 'trip-routes.db');
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trip_routes (
        trip_id INTEGER PRIMARY KEY,
        company TEXT NOT NULL,
        route_points TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    console.log('📦 Trip routes database initialized');
  }

  startPeriodicSync() {
    setInterval(() => this.syncRoutePoints(), this.SYNC_INTERVAL);
  }

  setupRealtimeSubscription() {
    this.supabase
      .channel('trips-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'trips' },
        (payload) => {
          console.log(`🔔 Trip change detected: ${payload.eventType}`);
          this.loadActiveTrips();
        }
      )
      .subscribe();
  }

  async loadActiveTrips() {
    try {
      const { data: trips } = await this.supabase
        .from('trips')
        .select('id, vehicleassignments, status, selectedstoppoints')
        .not('status', 'in', '(Completed,Delivered)');
      
      console.log(`🔍 DEBUG: Query returned ${trips ? trips.length : 0} trips`);
      
      if (trips) {
        const currentTripIds = new Set(this.activeTrips.keys());
        const newTripIds = new Set(trips.map(t => t.id));
        
        const hasNewTrips = trips.some(trip => !currentTripIds.has(trip.id));
        const hasChangedTrips = trips.some(trip => {
          const existing = this.activeTrips.get(trip.id);
          return existing && JSON.stringify(existing.vehicleassignments) !== JSON.stringify(trip.vehicleassignments);
        });
        
        if (hasNewTrips || hasChangedTrips) {
          console.log(`🆕 Trip changes detected - clearing cache`);
          this.matchedDrivers.clear();
          this.matchedVehicles.clear();
          this.noMatchLogged.clear();
        }
        
        for (const tripId of currentTripIds) {
          if (!newTripIds.has(tripId)) {
            this.activeTrips.delete(tripId);
          }
        }
        
        this.activeTrips.clear();
        trips.forEach(trip => {
          this.activeTrips.set(trip.id, trip);
          console.log(`🔍 Trip ${trip.id} status: ${trip.status}`);
        });
        
        console.log(`📋 Loaded ${trips.length} active trips for monitoring`);
      } else {
        console.log(`⚠️ No trips returned from database`);
      }
    } catch (error) {
      console.error('❌ Error loading active trips:', error.message);
    }
  }

  async processVehicleData(vehicleData) {
    try {
      const { DriverName: driverName, Plate: plate, Latitude: lat, Longitude: lon, Speed: speed, Mileage: mileage } = vehicleData;
      
      if (!driverName || !lat || !lon || (lat === 0 && lon === 0)) {
        return;
      }

      const activeTrip = await this.findActiveTrip(driverName, plate);
      if (!activeTrip) return;

      console.log(`🚛 TRACKING: ${driverName} (${plate}) - Trip ${activeTrip.id} at ${lat},${lon} (${speed}km/h)`);
      
      await this.updateTripLocation(activeTrip.id, lat, lon, speed, mileage);
      await this.checkForStops(activeTrip, lat, lon, speed);
      
    } catch (error) {
      console.error('❌ Error processing vehicle data for trip monitoring:', error.message);
    }
  }

  async findActiveTrip(driverName, plate) {
    const normalizedDriverName = driverName.toLowerCase();
    const normalizedPlate = plate ? plate.toLowerCase() : null;
    
    // Check cache - prioritize plate
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
    
    // Search - prioritize plate match
    for (const [tripId, trip] of this.activeTrips) {
      const tripPlate = this.getVehiclePlateFromAssignments(trip);
      const plateMatch = tripPlate && plate && tripPlate.toLowerCase() === plate.toLowerCase();
      
      if (plateMatch) {
        this.matchedVehicles.set(normalizedPlate, tripId);
        console.log(`✅ VEHICLE MATCH: Trip ${tripId} - ${plate} <-> ${tripPlate}`);
        return trip;
      }
    }
    
    // Fallback to driver match
    for (const [tripId, trip] of this.activeTrips) {
      const tripDriverName = this.getDriverNameFromAssignments(trip);
      const driverMatch = tripDriverName && this.namesMatch(driverName, tripDriverName);
      
      if (driverMatch) {
        this.matchedDrivers.set(normalizedDriverName, tripId);
        console.log(`✅ DRIVER MATCH: Trip ${tripId} - ${driverName} <-> ${tripDriverName}`);
        return trip;
      }
    }
    
    // Log no match found (only once per driver/vehicle)
    const noMatchKey = `${normalizedDriverName}:${normalizedPlate || 'none'}`;
    if (this.activeTrips.size > 0 && !this.noMatchLogged.has(noMatchKey)) {
      this.noMatchLogged.add(noMatchKey);
      console.log(`❌ NO MATCH: Driver "${driverName}" OR Plate "${plate || 'N/A'}" (either can match):`);
      for (const [tripId, trip] of this.activeTrips) {
        const tripDriver = this.getDriverNameFromAssignments(trip);
        const tripPlate = this.getVehiclePlateFromAssignments(trip);
        console.log(`   Trip ${tripId}: Driver="${tripDriver || 'N/A'}" Plate="${tripPlate || 'N/A'}"`);
      }
    }
    
    return null;
  }

  getDriverNameFromAssignments(trip) {
    if (!trip.vehicleassignments) return null;
    
    try {
      let assignments = trip.vehicleassignments;
      if (typeof assignments === 'string') {
        assignments = JSON.parse(assignments);
      }
      
      if (!Array.isArray(assignments)) {
        assignments = [assignments];
      }
      
      for (const assignment of assignments) {
        if (!assignment.drivers) continue;
        
        const drivers = Array.isArray(assignment.drivers) 
          ? assignment.drivers 
          : [assignment.drivers];
        
        for (const driver of drivers) {
          const nameOptions = [driver.surname, driver.name, driver.first_name].filter(Boolean);
          
          for (const nameOption of nameOptions) {
            if (nameOption && nameOption.trim()) {
              let cleanName = nameOption.trim()
                .replace(/^null\s+/i, '')
                .replace(/\s+/g, ' ')
                .trim();
              
              if (cleanName && cleanName.toLowerCase() !== 'null') {
                return cleanName;
              }
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
      if (typeof assignments === 'string') {
        assignments = JSON.parse(assignments);
      }
      
      if (!Array.isArray(assignments)) {
        assignments = [assignments];
      }
      
      for (const assignment of assignments) {
        if (assignment.vehicle && (assignment.vehicle.plate || assignment.vehicle.name)) {
          const plateValue = assignment.vehicle.plate || assignment.vehicle.name;
          return plateValue.trim();
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

  async updateTripLocation(tripId, latitude, longitude, speed, mileage) {
    try {
      const now = Date.now();
      const newPoint = {
        lat: latitude,
        lng: longitude,
        speed: speed,
        timestamp: Math.floor(now / 1000),
        datetime: new Date().toISOString()
      };
      
      const existing = this.db.prepare('SELECT route_points FROM trip_routes WHERE trip_id = ?').get(tripId);
      
      if (existing) {
        const points = JSON.parse(existing.route_points);
        points.push(newPoint);
        this.db.prepare('UPDATE trip_routes SET route_points = ?, updated_at = ? WHERE trip_id = ?')
          .run(JSON.stringify(points), new Date().toISOString(), tripId);
      } else {
        this.db.prepare('INSERT INTO trip_routes (trip_id, company, route_points, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
          .run(tripId, 'eps', JSON.stringify([newPoint]), new Date().toISOString(), new Date().toISOString());
      }
      
      if (mileage) {
        const { data: trip } = await this.supabase
          .from('trips')
          .select('start_mileage')
          .eq('id', tripId)
          .single();
        
        const updateData = {};
        
        if (!trip?.start_mileage) {
          updateData.start_mileage = mileage;
        }
        updateData.end_mileage = mileage;
        
        if (trip?.start_mileage) {
          updateData.total_distance = mileage - trip.start_mileage;
        }
        
        await this.supabase
          .from('trips')
          .update(updateData)
          .eq('id', tripId);
      }
      
    } catch (error) {
      console.error('❌ Error updating trip location:', error.message);
    }
  }

  getRoutePoints(tripId) {
    const result = this.db.prepare('SELECT company, route_points, created_at, updated_at FROM trip_routes WHERE trip_id = ?').get(tripId);
    if (!result) return null;
    return {
      trip_id: tripId,
      company: result.company,
      route_points: JSON.parse(result.route_points),
      created_at: result.created_at,
      updated_at: result.updated_at
    };
  }

  async syncRoutePoints() {
    // No periodic sync - only sync on trip completion or unauthorized stop
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
        this.stationaryDrivers.set(driverKey, {
          startTime: now,
          latitude: latitude,
          longitude: longitude,
          tripId: trip.id
        });
        return;
      }
      
      const distance = this.calculateDistance(
        latitude, longitude,
        existingStationary.latitude, existingStationary.longitude
      );
      
      if (distance > this.STATIONARY_RADIUS) {
        this.stationaryDrivers.set(driverKey, {
          startTime: now,
          latitude: latitude,
          longitude: longitude,
          tripId: trip.id
        });
        return;
      }
      
      const stationaryDuration = now - existingStationary.startTime;
      if (stationaryDuration >= this.STOP_DETECTION_TIME) {
        const authCheck = await this.isAuthorizedStop(trip.id, latitude, longitude, trip.selectedstoppoints);
        
        if (!authCheck.authorized) {
          await this.flagUnauthorizedStop(trip.id, latitude, longitude, authCheck.reason);
          console.log(`🚨 UNAUTHORIZED STOP: Trip ${trip.id} - ${authCheck.reason}`);
        } else {
          console.log(`✅ Authorized stop: Trip ${trip.id} at ${authCheck.stopName}`);
        }
        
        this.stationaryDrivers.delete(driverKey);
      }
      
    } catch (error) {
      console.error('❌ Error checking for stops:', error.message);
    }
  }

  async isAuthorizedStop(tripId, latitude, longitude, selectedStopPoints) {
    try {
      if (!selectedStopPoints || selectedStopPoints.length === 0) {
        return { authorized: false, reason: 'No authorized stop points defined' };
      }
      
      const { data: stopPoints } = await this.supabase
        .from('stop_points')
        .select('name, coordinates, radius')
        .in('id', selectedStopPoints);
      
      if (!stopPoints || stopPoints.length === 0) {
        return { authorized: false, reason: 'Stop points not found' };
      }
      
      for (const stopPoint of stopPoints) {
        if (!stopPoint.coordinates) continue;
        
        const coords = stopPoint.coordinates.split(',');
        const stopLat = parseFloat(coords[0]);
        const stopLon = parseFloat(coords[1]);
        const radius = stopPoint.radius || 100;
        
        const distance = this.calculateDistance(latitude, longitude, stopLat, stopLon);
        
        if (distance <= radius) {
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
      const { data: currentTrip } = await this.supabase
        .from('trips')
        .select('unauthorized_stops_count')
        .eq('id', tripId)
        .single();
      
      await this.supabase
        .from('trips')
        .update({
          unauthorized_stops_count: (currentTrip?.unauthorized_stops_count || 0) + 1,
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
}

module.exports = TripMonitor;
