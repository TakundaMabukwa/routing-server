const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const distance = require('@turf/distance').default;
const { point } = require('@turf/helpers');
const Database = require('better-sqlite3');
const path = require('path');
const ETAMonitor = require('./eta-monitor');

class TripMonitorUltraMinimal {
  constructor(company = 'eps') {
    this.company = company;
    const isMaysene = company === 'maysene';
    const isWaterford = company === 'waterford';
    const supabaseUrl = isMaysene
      ? process.env.NEXT_PUBLIC_MAYSENE_SUPABASE_URL
      : isWaterford
        ? process.env.NEXT_PUBLIC_WATERFORD_SUPABASE_URL || process.env.NEXT_PUBLIC_EPS_SUPABASE_URL
        : process.env.NEXT_PUBLIC_EPS_SUPABASE_URL;
    const supabaseKey = isMaysene
      ? process.env.NEXT_PUBLIC_MAYSENE_SUPABASE_ANON_KEY
      : isWaterford
        ? process.env.NEXT_PUBLIC_WATERFORD_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY
        : process.env.NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY;
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.fuelSupabase = createClient(
      process.env.WATERFORD_FUEL_SUPABASE_URL || process.env.SUPABASE_URL || supabaseUrl,
      process.env.WATERFORD_FUEL_SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || supabaseKey
    );
    this.activeTrips = new Map();
    this.stationaryDrivers = new Map();
    this.matchedDrivers = new Map();
    this.matchedVehicles = new Map();
    this.stopPointsCache = new Map();
    this.geocodeCache = new Map();
    this.destinationAlerts = new Map();
    this.tripLocationsCache = new Map();
    this.etaMonitor = new ETAMonitor();
    this.etaCheckInterval = 30 * 60 * 1000; // Check ETA every 30 minutes
    this.lastETACheck = new Map();
    this.lastETAUpdate = new Map(); // Track last Supabase update
    this.tripFuelCache = new Map();
    this.tripFuelSyncTimes = new Map();
    this.unsupportedTripColumns = new Set();
    
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
        handed_vehicleassignments TEXT,
        selectedstoppoints TEXT,
        status TEXT,
        accepted_at TEXT,
        actual_start_time TEXT,
        actual_end_time TEXT,
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

    const tripsCacheColumns = this.db.prepare("PRAGMA table_info(trips_cache)").all();
    const existingTripsCacheColumns = new Set(tripsCacheColumns.map((column) => column.name));
    const ensureTripsCacheColumn = (name, definition) => {
      if (!existingTripsCacheColumns.has(name)) {
        this.db.exec(`ALTER TABLE trips_cache ADD COLUMN ${name} ${definition}`);
      }
    };

    ensureTripsCacheColumn('handed_vehicleassignments', 'TEXT');
    ensureTripsCacheColumn('accepted_at', 'TEXT');
    ensureTripsCacheColumn('actual_start_time', 'TEXT');
    ensureTripsCacheColumn('actual_end_time', 'TEXT');
    console.log('?? Ultra-minimal trip monitor initialized');
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
        .select('id, created_at, vehicleassignments, handed_vehicleassignments, status, selectedstoppoints, destination_coordinates, enddate, accepted_at, actual_start_time, actual_end_time, start_mileage, end_mileage, total_distance, late_acceptance, late_arrival, alert_message, current_latitude, current_longitude, current_speed, last_location_update')
        .not('status', 'in', '(Completed,Delivered,Cancelled,completed,delivered,cancelled)');
      
      if (!trips) return;
      
      const stmt = this.db.prepare('INSERT OR REPLACE INTO trips_cache (id, vehicleassignments, handed_vehicleassignments, selectedstoppoints, status, accepted_at, actual_start_time, actual_end_time, loaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const now = new Date().toISOString();
      
      for (const trip of trips) {
        stmt.run(
          trip.id,
          JSON.stringify(trip.vehicleassignments),
          JSON.stringify(trip.handed_vehicleassignments),
          JSON.stringify(trip.selectedstoppoints),
          trip.status,
          trip.accepted_at || null,
          trip.actual_start_time || null,
          trip.actual_end_time || null,
          now
        );
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

  async processVehicleData(vehicleData, borderMonitor = null) {
    try {
      const { DriverName: driverName, Plate: plate, Latitude: lat, Longitude: lon, Speed: speed } = vehicleData;
      
      if (!plate || !lat || !lon || (lat === 0 && lon === 0)) return;

      const activeTrip = this.findActiveTrip(driverName, plate);
      if (!activeTrip) return;
      console.log(`[${this.company.toUpperCase()}] Matched ${plate} to trip ${activeTrip.id}`);

      await this.updateTripMonitoringData(activeTrip, vehicleData);
      await this.checkETAStatus(activeTrip, lat, lon, plate);
      await this.checkDestinationProximity(activeTrip, lat, lon);
      await this.checkHighRiskZone(activeTrip, vehicleData);
      await this.checkTollGate(activeTrip, vehicleData);
      
      let isAtBorder = false;
      if (borderMonitor) {
        isAtBorder = await borderMonitor.checkVehicleLocation(vehicleData, activeTrip.id);
      }
      
      if (!isAtBorder) {
        await this.checkForStops(activeTrip, lat, lon, speed, vehicleData);
      }
      
      return activeTrip.id;
      
    } catch (error) {
      console.error('❌ Error processing vehicle data:', error.message);
    }

    return null;
  }

  getAllAssignments(trip) {
    const parseAssignments = (value) => {
      if (!value) return [];
      let assignments = value;
      if (typeof assignments === 'string') assignments = JSON.parse(assignments);
      if (!Array.isArray(assignments)) assignments = [assignments];
      return assignments.filter(Boolean);
    };

    return [
      ...parseAssignments(trip.vehicleassignments),
      ...parseAssignments(trip.handed_vehicleassignments)
    ];
  }

  findActiveTrip(driverName, plate) {
    const normalizedDriverName = String(driverName || '').trim().toLowerCase();
    const normalizedPlate = this.normalizePlate(plate);
    
    if (normalizedPlate) {
      const cachedByVehicle = this.matchedVehicles.get(normalizedPlate);
      if (cachedByVehicle && this.activeTrips.has(cachedByVehicle)) {
        return this.activeTrips.get(cachedByVehicle);
      }
    }
    
    const cachedByDriver = this.isMeaningfulDriverName(driverName) ? this.matchedDrivers.get(normalizedDriverName) : null;
    if (cachedByDriver && this.activeTrips.has(cachedByDriver)) {
      return this.activeTrips.get(cachedByDriver);
    }
    
    for (const [tripId, trip] of this.activeTrips) {
      const tripPlates = this.getVehiclePlatesFromAssignments(trip);
      const matchedTripPlate = tripPlates.find((tripPlate) => this.normalizePlate(tripPlate) === normalizedPlate);
      if (normalizedPlate && matchedTripPlate) {
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

  normalizePlate(value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase();
  }

  isMeaningfulDriverName(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return false;
    return !['engine on', 'engine off', 'unknown', 'null'].includes(normalized);
  }

  getDriverNameFromAssignments(trip) {
    try {
      for (const assignment of this.getAllAssignments(trip)) {
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

  getVehiclePlatesFromAssignments(trip) {
    const plates = [];

    try {
      for (const assignment of this.getAllAssignments(trip)) {
        const plateValue =
          assignment?.vehicle?.registration_number ||
          assignment?.vehicle?.plate ||
          assignment?.vehicle?.name;
        if (plateValue) {
          plates.push(String(plateValue).trim());
        }
      }
    } catch (error) {
      console.error('âŒ Error parsing vehicleassignments for plate:', error.message);
    }

    return [...new Set(plates)];
  }

  getVehiclePlateFromAssignments(trip) {
    return this.getVehiclePlatesFromAssignments(trip)[0] || null;
  }

  namesMatch(epsDriverName, tripDriverName) {
    if (!this.isMeaningfulDriverName(epsDriverName) || !this.isMeaningfulDriverName(tripDriverName)) {
      return false;
    }
    const eps = epsDriverName.toLowerCase();
    const trip = tripDriverName.toLowerCase();
    return eps.includes(trip) || trip.includes(eps);
  }

  getTripFuelState(tripId) {
    if (!this.tripFuelCache.has(tripId)) {
      this.tripFuelCache.set(tripId, { entries: {} });
    }
    return this.tripFuelCache.get(tripId);
  }

  toNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const normalized = typeof value === 'string' ? value.replace(/,/g, '.') : value;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
  }

  getEventTimestamp(vehicleData) {
    return vehicleData?.LocTime || vehicleData?.updated_at || new Date().toISOString();
  }

  mergeTripState(tripId, updates) {
    const existing = this.activeTrips.get(tripId);
    if (!existing) return;
    this.activeTrips.set(tripId, { ...existing, ...updates });
  }

  buildFuelBreakdown(tripId) {
    const state = this.getTripFuelState(tripId);
    return Object.values(state.entries)
      .sort((a, b) => String(a.plate || '').localeCompare(String(b.plate || '')))
      .map((entry) => ({
        plate: entry.plate,
        driver: entry.driver,
        current_fuel_liters: entry.current_fuel_liters,
        fuel_level_percentage: entry.fuel_level_percentage,
        start_fuel_liters: entry.start_fuel_liters ?? null,
        fuel_used_liters: entry.fuel_used_liters ?? 0,
        mileage: entry.current_mileage ?? null,
        start_mileage: entry.start_mileage ?? null,
        last_loc_time: entry.last_loc_time || null,
        engine_status: entry.engine_status || null,
        geozone: entry.geozone || null,
        latitude: entry.latitude ?? null,
        longitude: entry.longitude ?? null
      }));
  }

  getTripWindow(trip) {
    const startValue = trip?.accepted_at;
    if (!startValue) return null;

    const statusValue = String(trip?.status || '').toLowerCase();
    const tripFinished = ['delivered', 'completed'].includes(statusValue);
    const endValue = tripFinished && trip?.actual_end_time ? trip.actual_end_time : new Date().toISOString();
    if (!endValue) return null;

    const startAt = new Date(startValue);
    const endAt = new Date(endValue);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return null;
    if (endAt.getTime() < startAt.getTime()) return null;

    return {
      startAt,
      endAt,
      startIso: startAt.toISOString(),
      endIso: endAt.toISOString()
    };
  }

  calculateOverlapHours(windowStart, windowEnd, sessionStart, sessionEnd) {
    const overlapStart = Math.max(windowStart.getTime(), sessionStart.getTime());
    const overlapEnd = Math.min(windowEnd.getTime(), sessionEnd.getTime());
    const overlapMs = overlapEnd - overlapStart;
    return overlapMs > 0 ? overlapMs / (1000 * 60 * 60) : 0;
  }

  async syncTripFuelMetrics(trip, { force = false } = {}) {
    try {
      const tripId = trip?.id;
      if (!tripId) return null;

      const window = this.getTripWindow(trip);
      if (!window) return null;

      const lastSync = this.tripFuelSyncTimes.get(tripId);
      if (!force && lastSync && Date.now() - lastSync < 5 * 60 * 1000) {
        return null;
      }

      const plates = this.getVehiclePlatesFromAssignments(trip);
      if (!plates.length) return null;

      const { data: sessions, error } = await this.fuelSupabase
        .from('energy_rite_operating_sessions')
        .select('id, branch, session_start_time, session_end_time, session_status, operating_hours, total_usage, total_fill, cost_for_usage')
        .in('branch', plates)
        .lte('session_start_time', window.endIso)
        .order('session_start_time', { ascending: true });

      if (error) {
        console.error('Fuel sync query failed:', error.message);
        return null;
      }

      const liveBreakdown = this.buildFuelBreakdown(tripId);
      const relevantSessions = (sessions || []).filter((session) => {
        const sessionStart = new Date(session.session_start_time);
        const sessionEnd = session.session_end_time ? new Date(session.session_end_time) : window.endAt;
        if (Number.isNaN(sessionStart.getTime()) || Number.isNaN(sessionEnd.getTime())) {
          return false;
        }
        return sessionEnd.getTime() >= window.startAt.getTime();
      });

      const breakdown = [];
      let totalFuelUsed = 0;
      let totalFuelFilled = 0;
      let totalOperatingHours = 0;
      let totalFuelCost = 0;

      for (const plate of plates) {
        const plateKey = this.normalizePlate(plate);
        const plateSessions = relevantSessions.filter((session) => this.normalizePlate(session.branch) === plateKey);
        const operatingSessions = plateSessions.filter((session) =>
          ['COMPLETED', 'ONGOING'].includes(String(session.session_status || '').toUpperCase())
        );
        const fillSessions = plateSessions.filter((session) =>
          String(session.session_status || '').toUpperCase() === 'FUEL_FILL_COMPLETED'
        );

        let plateFuelUsed = 0;
        let plateOperatingHours = 0;
        let plateFuelCost = 0;

        for (const session of operatingSessions) {
          const sessionStart = new Date(session.session_start_time);
          const sessionEnd = session.session_end_time ? new Date(session.session_end_time) : window.endAt;
          const overlapHours = this.calculateOverlapHours(window.startAt, window.endAt, sessionStart, sessionEnd);
          if (overlapHours <= 0) continue;

          const sessionHours = this.toNumber(session.operating_hours) || this.calculateOverlapHours(sessionStart, sessionEnd, sessionStart, sessionEnd);
          const ratio = sessionHours > 0 ? Math.min(1, overlapHours / sessionHours) : 1;
          const sessionUsage = Math.max(0, this.toNumber(session.total_usage) || 0);
          const sessionCost = Math.max(0, this.toNumber(session.cost_for_usage) || 0);

          plateFuelUsed += sessionUsage * ratio;
          plateOperatingHours += overlapHours;
          plateFuelCost += sessionCost * ratio;
        }

        const plateFuelFilled = fillSessions.reduce((sum, session) => sum + Math.max(0, this.toNumber(session.total_fill) || 0), 0);
        const liveEntry = liveBreakdown.find((entry) => this.normalizePlate(entry.plate) === plateKey);
        const plateDistanceKm = Math.max(
          0,
          (this.toNumber(liveEntry?.mileage) || 0) - (this.toNumber(liveEntry?.start_mileage) || 0)
        );
        const plateLitersPerHour = plateOperatingHours > 0 ? plateFuelUsed / plateOperatingHours : 0;
        const plateLitersPerKm = plateDistanceKm > 0 ? plateFuelUsed / plateDistanceKm : 0;

        totalFuelUsed += plateFuelUsed;
        totalFuelFilled += plateFuelFilled;
        totalOperatingHours += plateOperatingHours;
        totalFuelCost += plateFuelCost;

        breakdown.push({
          plate,
          session_count: operatingSessions.length,
          fill_count: fillSessions.length,
          fuel_used_liters: Number(plateFuelUsed.toFixed(2)),
          fuel_filled_liters: Number(plateFuelFilled.toFixed(2)),
          operating_hours: Number(plateOperatingHours.toFixed(2)),
          distance_km: Number(plateDistanceKm.toFixed(2)),
          liters_per_hour: Number(plateLitersPerHour.toFixed(4)),
          liters_per_km: Number(plateLitersPerKm.toFixed(4))
        });
      }

      const totalDistanceKm =
        breakdown.reduce((sum, entry) => sum + (this.toNumber(entry.distance_km) || 0), 0) ||
        Math.max(0, this.toNumber(trip.total_distance) || 0);

      const payload = {
        fuel_used_liters: Number(totalFuelUsed.toFixed(2)),
        fuel_filled_liters: Number(totalFuelFilled.toFixed(2)),
        fuel_operating_hours: Number(totalOperatingHours.toFixed(2)),
        fuel_liters_per_hour: totalOperatingHours > 0 ? Number((totalFuelUsed / totalOperatingHours).toFixed(4)) : 0,
        fuel_liters_per_km: totalDistanceKm > 0 ? Number((totalFuelUsed / totalDistanceKm).toFixed(4)) : 0,
        fuel_cost_total: Number(totalFuelCost.toFixed(2)),
        fuel_window_start_at: window.startIso,
        fuel_window_end_at: window.endIso,
        fuel_source: 'energy_rite_operating_sessions',
        fuel_last_updated_at: new Date().toISOString(),
        fuel_breakdown: breakdown
      };

      const result = await this.safeUpdateTrip(tripId, payload);
      if (!result.error) {
        this.mergeTripState(tripId, payload);
        this.tripFuelSyncTimes.set(tripId, Date.now());
        return payload;
      }

      console.error('Fuel sync write failed:', result.error.message);
    } catch (error) {
      console.error('Error syncing trip fuel metrics:', error.message);
    }

    return null;
  }

  async safeUpdateTrip(tripId, payload) {
    let filteredPayload = Object.fromEntries(
      Object.entries(payload).filter(([key, value]) => value !== undefined && !this.unsupportedTripColumns.has(key))
    );

    while (Object.keys(filteredPayload).length > 0) {
      const result = await this.supabase
        .from('trips')
        .update(filteredPayload)
        .eq('id', tripId);

      if (!result.error) {
        return result;
      }

      const message = `${result.error.message || ''} ${result.error.details || ''} ${result.error.hint || ''}`;
      const missingColumns = [];
      const matchPatterns = [
        /column\s+"?([a-zA-Z0-9_]+)"?\s+does not exist/g,
        /Could not find the '([a-zA-Z0-9_]+)' column/g,
        /'([a-zA-Z0-9_]+)' column/g
      ];

      for (const pattern of matchPatterns) {
        let match;
        while ((match = pattern.exec(message)) !== null) {
          missingColumns.push(match[1]);
        }
      }

      const uniqueMissing = [...new Set(missingColumns)];
      if (uniqueMissing.length === 0) {
        return result;
      }

      uniqueMissing.forEach((column) => this.unsupportedTripColumns.add(column));
      console.warn(`Skipping unsupported trip columns: ${uniqueMissing.join(', ')}`);

      filteredPayload = Object.fromEntries(
        Object.entries(filteredPayload).filter(([key]) => !this.unsupportedTripColumns.has(key))
      );
    }

    return { error: null };
  }

  async updateTripMonitoringData(trip, vehicleData) {
    const tripId = trip?.id;
    if (!tripId) return;

    const latitude = this.toNumber(vehicleData?.Latitude);
    const longitude = this.toNumber(vehicleData?.Longitude);
    const speed = this.toNumber(vehicleData?.Speed) ?? 0;
    const mileage = this.toNumber(vehicleData?.Mileage);
    const currentFuelLiters = this.toNumber(vehicleData?.fuel_probe_1_volume_in_tank);
    const fuelLevelPercentage = this.toNumber(vehicleData?.fuel_probe_1_level_percentage);
    const plate = String(vehicleData?.Plate || '').trim();
    const eventTimestamp = this.getEventTimestamp(vehicleData);
    const nowIso = new Date().toISOString();

    this.updateTripLocationLocal(tripId, latitude, longitude, speed, plate, eventTimestamp);

    const state = this.getTripFuelState(tripId);
    const plateKey = this.normalizePlate(plate) || `trip-${tripId}`;
    const existingEntry = state.entries[plateKey] || {};
    const nextEntry = {
      ...existingEntry,
      plate: plate || existingEntry.plate || null,
      driver: vehicleData?.DriverName || existingEntry.driver || null,
      current_fuel_liters: currentFuelLiters ?? existingEntry.current_fuel_liters ?? null,
      fuel_level_percentage: fuelLevelPercentage ?? existingEntry.fuel_level_percentage ?? null,
      current_mileage: mileage ?? existingEntry.current_mileage ?? null,
      latitude: latitude ?? existingEntry.latitude ?? null,
      longitude: longitude ?? existingEntry.longitude ?? null,
      engine_status: vehicleData?.DriverName || existingEntry.engine_status || null,
      geozone: vehicleData?.Geozone || existingEntry.geozone || null,
      last_loc_time: eventTimestamp
    };

    const statusValue = String(trip.status || '').toLowerCase();
    const tripAccepted = statusValue === 'accepted' || Boolean(trip.accepted_at);
    if (tripAccepted) {
      if (nextEntry.start_fuel_liters === undefined && currentFuelLiters !== null) {
        nextEntry.start_fuel_liters = currentFuelLiters;
      }
      if (nextEntry.start_mileage === undefined && mileage !== null) {
        nextEntry.start_mileage = mileage;
      }
    }

    if (nextEntry.start_fuel_liters !== undefined && nextEntry.current_fuel_liters !== null) {
      nextEntry.fuel_used_liters = Math.max(nextEntry.start_fuel_liters - nextEntry.current_fuel_liters, 0);
    }

    state.entries[plateKey] = nextEntry;

    const breakdown = this.buildFuelBreakdown(tripId);
    const totalCurrentFuel = breakdown.reduce((sum, entry) => sum + (this.toNumber(entry.current_fuel_liters) ?? 0), 0);
    const totalStartFuel = breakdown.reduce((sum, entry) => sum + (this.toNumber(entry.start_fuel_liters) ?? 0), 0);
    const totalFuelUsed = breakdown.reduce((sum, entry) => sum + (this.toNumber(entry.fuel_used_liters) ?? 0), 0);
    const percentageEntries = breakdown.map((entry) => this.toNumber(entry.fuel_level_percentage)).filter((value) => value !== null);
    const averageFuelPct = percentageEntries.length > 0
      ? percentageEntries.reduce((sum, value) => sum + value, 0) / percentageEntries.length
      : null;

    const updateData = {
      current_latitude: latitude,
      current_longitude: longitude,
      current_speed: speed,
      last_location_update: eventTimestamp,
      updated_at: nowIso,
      current_fuel_liters: totalCurrentFuel,
      fuel_level_percentage: averageFuelPct !== null ? Number(averageFuelPct.toFixed(2)) : null,
      fuel_used_liters: totalFuelUsed,
      fuel_last_updated_at: eventTimestamp,
      fuel_breakdown: breakdown
    };

    if (!tripAccepted) {
      updateData.start_fuel_liters = null;
      updateData.fuel_used_liters = 0;
      updateData.fuel_window_start_at = null;
      updateData.fuel_window_end_at = null;
      updateData.fuel_liters_per_hour = 0;
      updateData.fuel_liters_per_km = 0;
      updateData.fuel_filled_liters = 0;
      updateData.fuel_cost_total = 0;
    }

    if (tripAccepted) {
      if (!trip.accepted_at) {
        updateData.accepted_at = eventTimestamp;
      }
      if (!trip.actual_start_time) {
        updateData.actual_start_time = eventTimestamp;
      }
      if (trip.start_mileage === null || trip.start_mileage === undefined) {
        updateData.start_mileage = mileage;
      }
      if (totalStartFuel > 0) {
        updateData.start_fuel_liters = totalStartFuel;
      }
    }

    if (mileage !== null) {
      updateData.end_mileage = mileage;
      const baseMileage = this.toNumber(trip.start_mileage) ?? this.toNumber(nextEntry.start_mileage);
      if (baseMileage !== null) {
        updateData.total_distance = Math.max(mileage - baseMileage, 0);
      }
    }

    const result = await this.safeUpdateTrip(tripId, updateData);
    if (!result.error) {
      this.mergeTripState(tripId, updateData);
      await this.syncTripFuelMetrics(this.activeTrips.get(tripId) || trip);
    } else {
      console.error('âŒ Error writing trip monitoring data:', result.error.message);
    }
  }

  updateTripLocationLocal(tripId, latitude, longitude, speed, plate = null, datetime = null) {
    try {
      const newPoint = {
        lat: latitude,
        lng: longitude,
        speed: speed,
        timestamp: Math.floor(Date.now() / 1000),
        datetime: datetime || new Date().toISOString(),
        plate
      };
      
      const existing = this.db.prepare('SELECT route_points FROM trip_routes WHERE trip_id = ?').get(tripId);
      
      if (existing) {
        const points = JSON.parse(existing.route_points);
        points.push(newPoint);
        this.db.prepare('UPDATE trip_routes SET route_points = ?, updated_at = ? WHERE trip_id = ?')
          .run(JSON.stringify(points), new Date().toISOString(), tripId);
        console.log(`[${this.company.toUpperCase()}] Stored route point for trip ${tripId} (${plate || 'no-plate'}) -> ${latitude}, ${longitude} | total ${points.length}`);
      } else {
        this.db.prepare('INSERT INTO trip_routes (trip_id, company, route_points, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
          .run(tripId, this.company, JSON.stringify([newPoint]), new Date().toISOString(), new Date().toISOString());
        console.log(`[${this.company.toUpperCase()}] Created route history for trip ${tripId} (${plate || 'no-plate'}) -> ${latitude}, ${longitude}`);
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
              await this.checkLoadingLocationDuration(tripId, address, latitude, longitude);
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
        const timestamp = new Date().toISOString();
        
        const { data: trip } = await this.supabase
          .from('trips')
          .select('alert_message')
          .eq('id', tripId)
          .single();
        
        let alerts = trip?.alert_message || [];
        // Ensure alerts is always an array
        if (!Array.isArray(alerts)) {
          alerts = [];
        }
        alerts.push({
          type: 'unauthorized_stop',
          message: `Unauthorized stop: ${reason}`,
          plate: plate || null,
          geozone: geozone || null,
          latitude,
          longitude,
          timestamp
        });
        
        await this.supabase
          .from('trips')
          .update({
            alert_type: 'unauthorized_stop',
            alert_message: alerts,
            alert_timestamp: timestamp,
            updated_at: timestamp
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

  async checkETAStatus(trip, lat, lon, plate) {
    try {
      const now = Date.now();
      const lastCheck = this.lastETACheck.get(trip.id) || 0;
      
      if (now - lastCheck < this.etaCheckInterval) return;
      
      const cachedLocations = this.tripLocationsCache.get(trip.id);
      if (!cachedLocations?.dropofflocations || cachedLocations.dropofflocations.length === 0) return;
      
      const dropoffs = Array.isArray(cachedLocations.dropofflocations) 
        ? cachedLocations.dropofflocations 
        : JSON.parse(cachedLocations.dropofflocations);
      
      for (const dropoff of dropoffs) {
        const address = dropoff.location || dropoff.address;
        if (!address) continue;
        
        const coords = await this.etaMonitor.geocode(address);
        if (!coords) continue;
        
        const deadline = trip.enddate || dropoff.scheduled_time;
        if (!deadline) continue;
        
        const etaStatus = await this.etaMonitor.checkETA(lat, lon, coords.lat, coords.lng, deadline);
        
        if (etaStatus) {
          this.lastETACheck.set(trip.id, now);
          
          const timestamp = new Date().toISOString();
          const { data: tripData } = await this.supabase.from('trips').select('alert_message').eq('id', trip.id).single();
          let alerts = tripData?.alert_message || [];
          
          // Ensure alerts is always an array
          if (!Array.isArray(alerts)) {
            alerts = [];
          }
          
          const etaAlert = {
            type: etaStatus.status === 'delayed' ? 'eta_delayed' : 'eta_update',
            message: etaStatus.status === 'delayed' 
              ? `Vehicle ${plate || 'unknown'} will arrive late by ${Math.abs(etaStatus.buffer_minutes)} minutes`
              : `Vehicle ${plate || 'unknown'} on track - ${etaStatus.buffer_minutes} min buffer`,
            reason: etaStatus.status === 'delayed' 
              ? `Traffic conditions indicate arrival will be ${Math.abs(etaStatus.buffer_minutes)} minutes late`
              : 'Vehicle is on schedule based on current road conditions',
            eta: etaStatus.eta,
            possible_eta: etaStatus.eta,
            deadline: etaStatus.deadline,
            duration_minutes: etaStatus.duration_minutes,
            distance_km: etaStatus.distance_km,
            buffer_minutes: etaStatus.buffer_minutes,
            destination: address,
            latitude: lat,
            longitude: lon,
            road_conditions: 'current',
            timestamp
          };
          
          alerts.push(etaAlert);
          
          await this.supabase.from('trips').update({
            alert_type: etaStatus.status === 'delayed' ? 'eta_delayed' : 'eta_update',
            alert_message: alerts,
            alert_timestamp: timestamp,
            updated_at: timestamp
          }).eq('id', trip.id);
          
          this.lastETAUpdate.set(trip.id, now);
          
          if (etaStatus.status === 'delayed') {
            console.log(`⏰ ETA DELAYED: Trip ${trip.id} - Late by ${Math.abs(etaStatus.buffer_minutes)} min | Possible ETA: ${etaStatus.eta} (${etaStatus.distance_km}km, ${etaStatus.duration_minutes}min drive)`);
          } else {
            console.log(`✅ ETA UPDATE: Trip ${trip.id} - ${etaStatus.buffer_minutes} min buffer | ETA: ${etaStatus.eta} (${etaStatus.distance_km}km, ${etaStatus.duration_minutes}min drive)`);
          }
        }
        break;
      }
    } catch (error) {
      console.error('❌ Error checking ETA status:', error.message);
    }
  }

  async checkDestinationProximity(trip, lat, lon) {
    try {
      const destinationKey = `destination:${trip.id}`;
      const arrivalTime = this.destinationAlerts.get(destinationKey);
      
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
          if (!arrivalTime) {
            this.destinationAlerts.set(destinationKey, Date.now());
            const breakdown = this.buildFuelBreakdown(trip.id);
            const totalCurrentFuel = breakdown.reduce((sum, entry) => sum + (this.toNumber(entry.current_fuel_liters) ?? 0), 0);
            const timestamp = new Date().toISOString();
            const updateData = {
              actual_end_time: trip.actual_end_time || timestamp,
              end_fuel_liters: totalCurrentFuel > 0 ? totalCurrentFuel : undefined,
              fuel_used_liters: breakdown.reduce((sum, entry) => sum + (this.toNumber(entry.fuel_used_liters) ?? 0), 0),
              updated_at: timestamp
            };
            const result = await this.safeUpdateTrip(trip.id, updateData);
            if (!result.error) {
              this.mergeTripState(trip.id, updateData);
              await this.syncTripFuelMetrics(this.activeTrips.get(trip.id) || trip, { force: true });
            }
            console.log(`🎯 AT DESTINATION: Trip ${trip.id} - ${Math.round(dist)}m from ${address}`);
          } else {
            const duration = Date.now() - arrivalTime;
            if (duration > 30 * 60 * 1000 && !this.destinationAlerts.has(`late_dropoff:${trip.id}`)) {
              const timestamp = new Date().toISOString();
              const { data: tripData } = await this.supabase.from('trips').select('alert_message').eq('id', trip.id).single();
              const alerts = tripData?.alert_message || [];
              alerts.push({
                type: 'late_at_dropoff',
                message: `Vehicle late - over 30 minutes at drop-off location`,
                location: address,
                duration_minutes: Math.round(duration / 60000),
                latitude: lat,
                longitude: lon,
                timestamp
              });
              await this.supabase.from('trips').update({ alert_type: 'late_at_dropoff', alert_message: alerts, alert_timestamp: timestamp, updated_at: timestamp }).eq('id', trip.id);
              this.destinationAlerts.set(`late_dropoff:${trip.id}`, Date.now());
              console.log(`⏰ LATE AT DROPOFF: Trip ${trip.id} - ${Math.round(duration / 60000)} minutes`);
            }
          }
          break;
        }
      }
    } catch (error) {
      console.error('❌ Error checking destination proximity:', error.message);
    }
  }
  
  async checkLoadingLocationDuration(tripId, address, lat, lon) {
    try {
      const loadingKey = `loading:${tripId}`;
      const arrivalTime = this.destinationAlerts.get(loadingKey);
      
      if (!arrivalTime) {
        this.destinationAlerts.set(loadingKey, Date.now());
        console.log(`📦 AT LOADING: Trip ${tripId}`);
      } else {
        const duration = Date.now() - arrivalTime;
        if (duration > 30 * 60 * 1000 && !this.destinationAlerts.has(`late_loading:${tripId}`)) {
          const timestamp = new Date().toISOString();
          const { data: tripData } = await this.supabase.from('trips').select('alert_message').eq('id', tripId).single();
          const alerts = tripData?.alert_message || [];
          alerts.push({
            type: 'late_at_loading',
            message: `Vehicle late - over 30 minutes at loading location`,
            location: address,
            duration_minutes: Math.round(duration / 60000),
            latitude: lat,
            longitude: lon,
            timestamp
          });
          await this.supabase.from('trips').update({ alert_type: 'late_at_loading', alert_message: alerts, alert_timestamp: timestamp, updated_at: timestamp }).eq('id', tripId);
          this.destinationAlerts.set(`late_loading:${tripId}`, Date.now());
          console.log(`⏰ LATE AT LOADING: Trip ${tripId} - ${Math.round(duration / 60000)} minutes`);
        }
      }
    } catch (error) {
      console.error('❌ Error checking loading duration:', error.message);
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
