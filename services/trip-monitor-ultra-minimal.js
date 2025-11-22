const { createClient } = require('@supabase/supabase-js');
const distance = require('@turf/distance').default;
const { point } = require('@turf/helpers');
const Database = require('better-sqlite3');
const path = require('path');

class TripMonitorUltraMinimal {
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
    this.geocodeCache = new Map();
    this.destinationAlerts = new Map();
    this.tripLocationsCache = new Map();
    
    // Debounce tracking for Supabase writes
    this.lastSupabaseWrite = new Map();
    this.SUPABASE_WRITE_COOLDOWN = 5 * 60 * 1000; // 5 minutes between writes per trip
    
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
        company TEXT NOT NULL DEFAULT 'eps',
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
      
      CREATE TABLE IF NOT EXISTS unauthorized_stops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id INTEGER NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        reason TEXT,
        detected_at TEXT NOT NULL,
        synced_to_supabase INTEGER DEFAULT 0
      );
    `);
    console.log('📦 Ultra-minimal trip monitor initialized');
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
    console.log('👂 Listening for new trips only...');
  }

  async loadActiveTripsOnce() {
    try {
      const { data: trips } = await this.supabase
        .from('trips')
        .select('id, vehicleassignments, status, selectedstoppoints, destination_coordinates')
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
      
      await this.cacheTripLocations(trips);
      
      console.log(`✅ Loaded ${trips.length} trips (one-time Supabase query)`);
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
    console.log(`📍 Cached ${stopPoints.length} stop points`);
  }

  async cacheTripLocations(trips) {
    for (const trip of trips) {
      const { data: tripData } = await this.supabase
        .from('trips')
        .select('pickuplocations, dropofflocations')
        .eq('id', trip.id)
        .single();
      
      if (tripData) {
        this.tripLocationsCache.set(trip.id, {
          pickuplocations: tripData.pickuplocations,
          dropofflocations: tripData.dropofflocations
        });
      }
    }
    console.log(`📍 Cached locations for ${trips.length} trips`);
  }

  async processVehicleData(vehicleData) {
    try {
      const { DriverName: driverName, Plate: plate, Latitude: lat, Longitude: lon, Speed: speed } = vehicleData;
      
      if (!driverName || !lat || !lon || (lat === 0 && lon === 0)) return;

      const activeTrip = this.findActiveTrip(driverName, plate);
      if (!activeTrip) return;

      this.updateTripLocationLocal(activeTrip.id, lat, lon, speed);
      await this.checkDestinationProximity(activeTrip, lat, lon);
      await this.checkHighRiskZone(activeTrip, vehicleData);
      await this.checkTollGate(activeTrip, vehicleData);
      await this.checkForStops(activeTrip, lat, lon, speed, vehicleData);
      
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
        this.db.prepare('INSERT INTO trip_routes (trip_id, company, route_points, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
          .run(tripId, this.company, JSON.stringify([newPoint]), new Date().toISOString(), new Date().toISOString());
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

  async checkForStops(trip, latitude, longitude, speed, vehicleData) {
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
          await this.flagUnauthorizedStopDebounced(trip.id, latitude, longitude, authCheck.reason, vehicleData);
        }
        
        this.stationaryDrivers.delete(driverKey);
      }
    } catch (error) {
      console.error('❌ Error checking for stops:', error.message);
    }
  }

  async isAuthorizedStopLocal(tripId, latitude, longitude, selectedStopPoints) {
    try {
      const trip = this.activeTrips.get(tripId);
      
      // Check loading location from cache
      if (trip) {
        const cachedLocations = this.tripLocationsCache.get(tripId);
        
        if (cachedLocations?.pickuplocations && cachedLocations.pickuplocations.length > 0) {
          const pickups = Array.isArray(cachedLocations.pickuplocations) 
            ? cachedLocations.pickuplocations 
            : JSON.parse(cachedLocations.pickuplocations);
          
          for (const pickup of pickups) {
            const address = pickup.location || pickup.address;
            if (!address) continue;
            
            const coords = await this.geocodeAddress(address);
            if (!coords) continue;
            
            const distToLoading = this.calculateDistance(latitude, longitude, coords.lat, coords.lng);
            if (distToLoading <= 700) {
              return { authorized: true, stopName: 'At loading location' };
            }
          }
        }
      }
      
      // Check destination
      if (trip && trip.destination_coordinates) {
        const destCoords = trip.destination_coordinates.split(',');
        const destLat = parseFloat(destCoords[0]);
        const destLon = parseFloat(destCoords[1]);
        const distToDest = this.calculateDistance(latitude, longitude, destLat, destLon);
        
        if (distToDest <= 700) {
          return { authorized: true, stopName: 'At destination' };
        }
      }
      
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

  async flagUnauthorizedStopDebounced(tripId, latitude, longitude, reason, vehicleData) {
    try {
      const now = Date.now();
      const lastWrite = this.lastSupabaseWrite.get(tripId) || 0;
      
      // Get trip info for vehicle plate
      const trip = this.activeTrips.get(tripId);
      const plate = trip ? this.getVehiclePlateFromAssignments(trip) : null;
      const geozone = vehicleData?.Geozone || '';
      
      // Store in local SQLite always
      this.db.prepare('INSERT INTO unauthorized_stops (trip_id, latitude, longitude, reason, detected_at, synced_to_supabase) VALUES (?, ?, ?, ?, ?, ?)')
        .run(tripId, latitude, longitude, reason, new Date().toISOString(), 0);
      
      console.log(`🚨 UNAUTHORIZED STOP (local): Trip ${tripId} - ${reason}`);
      
      // Only write to Supabase if cooldown period has passed
      if (now - lastWrite >= this.SUPABASE_WRITE_COOLDOWN) {
        const vehicleInfo = plate ? `Vehicle ${plate} - ` : '';
        const geozoneInfo = geozone ? ` | Geozone: ${geozone}` : '';
        await this.supabase
          .from('trips')
          .update({
            alert_type: 'unauthorized_stop',
            alert_message: `${vehicleInfo}Unauthorized stop: ${reason}${geozoneInfo}`,
            alert_timestamp: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', tripId);
        
        // Mark as synced
        this.db.prepare('UPDATE unauthorized_stops SET synced_to_supabase = 1 WHERE trip_id = ? AND synced_to_supabase = 0')
          .run(tripId);
        
        this.lastSupabaseWrite.set(tripId, now);
        console.log(`☁️ Synced to Supabase (cooldown: 5min)`);
      } else {
        const timeUntilNext = Math.ceil((this.SUPABASE_WRITE_COOLDOWN - (now - lastWrite)) / 1000);
        console.log(`⏳ Supabase write skipped (cooldown: ${timeUntilNext}s remaining)`);
      }
      
    } catch (error) {
      console.error('❌ Error flagging unauthorized stop:', error.message);
    }
  }

  async checkDestinationProximity(trip, lat, lon) {
    try {
      const destinationKey = `destination:${trip.id}`;
      if (this.destinationAlerts.has(destinationKey)) return;
      
      const cachedLocations = this.tripLocationsCache.get(trip.id);
      if (!cachedLocations?.dropofflocations || cachedLocations.dropofflocations.length === 0) return;
      
      const dropoffs = Array.isArray(cachedLocations.dropofflocations) 
        ? cachedLocations.dropofflocations 
        : JSON.parse(cachedLocations.dropofflocations);
      
      for (const dropoff of dropoffs) {
        const address = dropoff.location || dropoff.address;
        if (!address) continue;
        
        const coords = await this.geocodeAddress(address);
        if (!coords) continue;
        
        const dist = this.calculateDistance(lat, lon, coords.lat, coords.lng);
        
        if (dist <= 700) {
          await this.supabase
            .from('trips')
            .update({
              alert_type: 'at_destination',
              alert_message: `🎯 Driver arrived at destination: ${address} (${Math.round(dist)}m away)`,
              alert_timestamp: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', trip.id);
          
          console.log(`🎯 AT DESTINATION: Trip ${trip.id} - ${Math.round(dist)}m from ${address}`);
          this.destinationAlerts.set(destinationKey, Date.now());
          break;
        }
      }
    } catch (error) {
      console.error('❌ Error checking destination proximity:', error.message);
    }
  }
  
  async geocodeAddress(address) {
    try {
      const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (!mapboxToken) return null;
      
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${mapboxToken}&limit=1`
      );
      
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        return { lat, lng };
      }
      
      return null;
    } catch (error) {
      console.error('❌ Geocoding error:', error.message);
      return null;
    }
  }

  async checkHighRiskZone(trip, vehicleData) {
    try {
      const { Plate: plate, Latitude: lat, Longitude: lng, Geozone: geozone } = vehicleData;
      if (!lat || !lng) return;
      
      const HighRiskMonitor = require('./high-risk-monitor');
      if (!this.highRiskMonitor) {
        this.highRiskMonitor = new HighRiskMonitor(this.company);
      }
      
      for (const zone of this.highRiskMonitor.highRiskZones) {
        const isInZone = this.highRiskMonitor.isVehicleInZone(lat, lng, zone);
        
        if (isInZone) {
          const alertKey = `highrisk:${trip.id}:${zone.id}`;
          if (this.destinationAlerts.has(alertKey)) continue;
          
          const geozoneInfo = geozone ? ` | Geozone: ${geozone}` : '';
          await this.supabase
            .from('trips')
            .update({
              alert_type: 'high_risk_zone',
              alert_message: `Vehicle ${plate} entered high-risk zone: ${zone.name}${geozoneInfo}`,
              alert_timestamp: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', trip.id);
          
          console.log(`⚠️ HIGH RISK: Trip ${trip.id} - ${plate} entered ${zone.name}`);
          this.destinationAlerts.set(alertKey, Date.now());
          break;
        }
      }
    } catch (error) {
      console.error('❌ Error checking high-risk zone:', error.message);
    }
  }

  async checkTollGate(trip, vehicleData) {
    try {
      const { Plate: plate, Latitude: lat, Longitude: lon, Geozone: geozone } = vehicleData;
      if (!lat || !lon) return;
      
      const TollGateMonitor = require('./toll-gate-monitor');
      if (!this.tollGateMonitor) {
        this.tollGateMonitor = new TollGateMonitor(this.company);
      }
      
      const tollGates = this.tollGateMonitor.db.prepare('SELECT * FROM toll_gates').all();
      
      for (const gate of tollGates) {
        const polygonCoords = this.tollGateMonitor.parsePolygonCoordinates(gate.coordinates);
        if (!polygonCoords) continue;
        
        const centroid = this.tollGateMonitor.getCentroid(polygonCoords);
        const dist = this.tollGateMonitor.calculateDistance(lat, lon, centroid.lat, centroid.lon);
        const radius = gate.radius || 100;
        
        if (dist <= radius) {
          const alertKey = `tollgate:${trip.id}:${gate.id}`;
          if (this.destinationAlerts.has(alertKey)) continue;
          
          const geozoneInfo = geozone ? ` | Geozone: ${geozone}` : '';
          await this.supabase
            .from('trips')
            .update({
              alert_type: 'toll_gate',
              alert_message: `Vehicle ${plate} at toll gate: ${gate.name}${geozoneInfo}`,
              alert_timestamp: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', trip.id);
          
          console.log(`🚧 TOLL GATE: Trip ${trip.id} - ${plate} at ${gate.name}`);
          this.destinationAlerts.set(alertKey, Date.now());
          break;
        }
      }
    } catch (error) {
      console.error('❌ Error checking toll gate:', error.message);
    }
  }

  // Get all unauthorized stops for a trip (from local DB)
  getUnauthorizedStops(tripId) {
    return this.db.prepare('SELECT * FROM unauthorized_stops WHERE trip_id = ? ORDER BY detected_at DESC').all(tripId);
  }

  destroy() {
    this.db.close();
  }
}

module.exports = TripMonitorUltraMinimal;
