const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

class EPSTripTracker {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_EPS_SUPABASE_URL,
      process.env.NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY
    );
    this.isRunning = false;
    this.trackInterval = null;
    this.activeTripsCache = new Map();
    this.driverNameCache = new Map();
    this.stationaryDrivers = new Map(); // Track stationary drivers
    this.driverBreakTracking = new Map(); // Track driver break times
    this.STOP_DETECTION_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds
    this.STATIONARY_RADIUS = 50; // 50 meters radius for stationary detection
    this.BREAK_REQUIRED_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
    this.MIN_BREAK_DURATION = 15 * 60 * 1000; // 15 minutes minimum break
    this.DEPARTURE_RADIUS = 500; // 500m radius for departure detection
    this.MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('🚀 EPS Trip Tracker Started - real-time subscriptions + 30s GPS tracking');
    
    // Initialize asynchronously
    this.initialize();
  }

  async initialize() {
    try {
      // Load initial active trips first
      await this.loadActiveTrips();
      
      // Setup real-time subscriptions
      this.setupTripSubscriptions();
      
      // Start GPS tracking after cache is ready - every 5 minutes
      this.trackDrivers();
      this.trackInterval = setInterval(() => {
        this.trackDrivers();
        // Reload cache every 5 minutes to catch missed trips
        this.loadActiveTrips();
      }, 5 * 60 * 1000);
      
      console.log('✅ EPS Trip Tracker fully initialized');
    } catch (error) {
      console.error('❌ Failed to initialize trip tracker:', error.message);
      // Fallback to original polling method
      this.fallbackToPolling();
    }
  }

  fallbackToPolling() {
    console.log('🔄 Falling back to polling method');
    this.trackDrivers();
    this.trackInterval = setInterval(() => {
      this.trackDrivers();
    }, 5 * 60 * 1000);
  }

  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.trackInterval) {
      clearInterval(this.trackInterval);
    }
    
    // Unsubscribe from real-time channels
    this.supabase.removeAllChannels();
    
    console.log('⏹️ EPS Trip Tracker Stopped');
    

  }

  async loadActiveTrips() {
    try {
      const { data: trips, error } = await this.supabase
        .from('trips')
        .select('id, vehicleassignments, status, route_points, selectedstoppoints')
        .neq('status', 'Completed')
        .neq('status', 'Delivered');
      
      if (error) throw error;
      
      if (trips) {
        this.activeTripsCache.clear();
        trips.forEach(trip => {
          this.activeTripsCache.set(trip.id, trip);
        });
        console.log(`📋 Loaded ${trips.length} active trips into cache`);
        
        // Log all trips with their status and driver info
        trips.forEach(trip => {
          const pointCount = trip.route_points ? trip.route_points.length : 0;
          const stopPointsCount = trip.selectedstoppoints ? trip.selectedstoppoints.length : 0;
          const driverName = this.getDriverNameFromAssignments(trip);
          
          // Debug pending trips with bad driver names
          if (trip.status === 'Pending' && (!driverName || driverName.includes('null') || /^\d+/.test(driverName))) {
            console.log(`🔍 DEBUG Trip ${trip.id} vehicleassignments:`, JSON.stringify(trip.vehicleassignments, null, 2));
          }
          
          console.log(`📍 Trip ${trip.id} (${trip.status}): Driver=${driverName}, ${pointCount} route points, ${stopPointsCount} authorized stops`);
        });
      }
    } catch (error) {
      console.error('❌ Error loading active trips:', error.message);
      throw error;
    }
  }

  setupTripSubscriptions() {
    try {
      // Listen for new trips
      this.supabase
        .channel('new-trips')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'trips'
        }, (payload) => {
          console.log(`🔔 NEW TRIP DETECTED: ID=${payload.new.id}, Status=${payload.new.status}`);
          
          if (!['completed', 'delivered'].includes(payload.new.status.toLowerCase())) {
            this.activeTripsCache.set(payload.new.id, {
              id: payload.new.id,
              vehicleassignments: payload.new.vehicleassignments,
              status: payload.new.status,
              route_points: payload.new.route_points || [],
              selectedstoppoints: payload.new.selectedstoppoints || []
            });
            
            const driverName = this.getDriverNameFromAssignments({
              vehicleassignments: payload.new.vehicleassignments
            });
            
            console.log(`🆕 New active trip added to cache: ${payload.new.id} (${payload.new.status}) - Driver: ${driverName}`);
          } else {
            console.log(`⚠️ Skipping completed/delivered trip: ${payload.new.id}`);
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('📡 Subscribed to new trips');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ New trips subscription error');
          }
        });

      // Listen for trip status updates
      this.supabase
        .channel('trip-updates')
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'trips'
        }, (payload) => {
          const newStatus = payload.new.status;
          const tripId = payload.new.id;
          
          if (['completed', 'delivered'].includes(newStatus.toLowerCase())) {
            // Remove completed trips and flush any pending points
            const trip = this.activeTripsCache.get(tripId);
            this.activeTripsCache.delete(tripId);
            
            // Clean up memory
            this.stationaryDrivers.forEach((value, key) => {
              if (key.startsWith(`${tripId}-`)) {
                this.stationaryDrivers.delete(key);
              }
            });
            this.driverBreakTracking.forEach((value, key) => {
              if (key.startsWith(`${tripId}-`)) {
                this.driverBreakTracking.delete(key);
              }
            });
            
            console.log(`✅ Trip completed, cleaned up cache: ${tripId}`);
          } else if (!this.activeTripsCache.has(tripId)) {
            // Add reactivated trips
            this.activeTripsCache.set(tripId, {
              id: payload.new.id,
              vehicleassignments: payload.new.vehicleassignments,
              status: payload.new.status,
              route_points: payload.new.route_points || []
            });
            console.log(`🔄 Trip reactivated, added to cache: ${tripId}`);
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('📡 Subscribed to trip updates');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ Trip updates subscription error');
          }
        });
        
    } catch (error) {
      console.error('❌ Error setting up subscriptions:', error.message);
      throw error;
    }
  }

  async trackDrivers() {
    try {
      // Get all drivers from eps_vehicles with coordinates
      const { pgPool } = require('./eps-reward-system');
      
      const result = await pgPool.query(
        'SELECT driver_name, latitude, longitude, speed, mileage FROM eps_vehicles WHERE driver_name IS NOT NULL AND latitude IS NOT NULL'
      );
      
      if (result.rows.length === 0) return;
      
      console.log(`📊 Found ${result.rows.length} drivers with GPS data, ${this.activeTripsCache.size} active trips`);
      
      // Use cache if available, otherwise fallback to database query
      if (this.activeTripsCache.size > 0) {
        // For each driver, find matching trip from cache
        for (const vehicle of result.rows) {
          await this.matchDriverToTripFromCache(vehicle);
        }
      } else {
        // Fallback to original method if cache is empty
        console.log('⚠️ Cache empty, falling back to database query');
        for (const vehicle of result.rows) {
          await this.matchDriverToTripFallback(vehicle);
        }
      }
      
    } catch (error) {
      console.error('❌ Tracking error:', error.message);
    }
  }

  async matchDriverToTripFromCache(vehicle) {
    try {
      const driverName = vehicle.driver_name;
      
      // Debug specific driver
      if (driverName === 'MTHUTHUZELI SAMUEL LEISA') {
        console.log(`🔍 DEBUG: Matching driver ${driverName} against ${this.activeTripsCache.size} trips`);
      }
      
      // Search through cached active trips only
      for (const [tripId, trip] of this.activeTripsCache) {
        const tripDriverName = this.getDriverNameFromAssignments(trip);
        
        // Debug specific driver
        if (driverName === 'MTHUTHUZELI SAMUEL LEISA') {
          console.log(`🔍 Trip ${tripId}: tripDriver="${tripDriverName}" vs gpsDriver="${driverName}" match=${this.namesMatch(driverName, tripDriverName)}`);
        }
        
        if (tripDriverName && this.namesMatch(driverName, tripDriverName)) {
          await this.storeCoordinates(tripId, driverName, {
            latitude: parseFloat(vehicle.latitude),
            longitude: parseFloat(vehicle.longitude),
            speed: parseFloat(vehicle.speed || 0),
            mileage: vehicle.mileage ? parseFloat(vehicle.mileage) : null
          });
          break; // Found match, stop looking
        }
      }
      
    } catch (error) {
      console.error(`❌ Driver ${vehicle.driver_name} matching error:`, error.message);
    }
  }

  getDriverNameFromAssignments(trip) {
    if (!trip.vehicleassignments) return null;
    
    const assignments = Array.isArray(trip.vehicleassignments) 
      ? trip.vehicleassignments 
      : [trip.vehicleassignments];
    
    for (const assignment of assignments) {
      if (!assignment.drivers) continue;
      
      const drivers = Array.isArray(assignment.drivers) 
        ? assignment.drivers 
        : [assignment.drivers];
      
      for (const driver of drivers) {
        // Use the name field directly from vehicleassignments
        if (driver.name && driver.name.trim() && !driver.name.includes('null')) {
          return driver.name.trim();
        }
      }
    }
    
    return null;
  }

  // Fallback method for when cache is not available
  async matchDriverToTripFallback(vehicle) {
    try {
      const driverName = vehicle.driver_name;
      
      // Find trip with matching driver (original method)
      const { data: trips } = await this.supabase
        .from('trips')
        .select('id, vehicleassignments')
        .neq('status', 'Completed')
        .neq('status', 'Delivered');
      
      if (!trips) return;
      
      for (const trip of trips) {
        const tripDriverName = this.getDriverNameFromAssignments(trip);
        
        if (tripDriverName && this.namesMatch(driverName, tripDriverName)) {
          await this.storeCoordinates(trip.id, driverName, {
            latitude: parseFloat(vehicle.latitude),
            longitude: parseFloat(vehicle.longitude),
            speed: parseFloat(vehicle.speed || 0),
            mileage: vehicle.mileage ? parseFloat(vehicle.mileage) : null
          });
          break;
        }
      }
      
    } catch (error) {
      console.error(`❌ Driver ${vehicle.driver_name} fallback matching error:`, error.message);
    }
  }

  namesMatch(epsDriverName, tripDriverName) {
    const eps = epsDriverName.toLowerCase();
    const trip = tripDriverName.toLowerCase();
    
    return eps.includes(trip) || trip.includes(eps);
  }

  // Calculate distance between two coordinates (Haversine formula)
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
  }

  // Check if coordinates are within authorized stop points using polygon geofencing
  async isWithinAuthorizedZone(tripId, latitude, longitude, selectedStopPoints) {
    try {
      if (!selectedStopPoints || selectedStopPoints.length === 0) {
        return { authorized: false, reason: 'No authorized stop points defined' };
      }
      
      // Get stop points data
      const { data: stopPoints } = await this.supabase
        .from('stop_points')
        .select('id, name, coordinates')
        .in('id', selectedStopPoints);
      
      if (!stopPoints || stopPoints.length === 0) {
        return { authorized: false, reason: 'Stop points not found' };
      }
      
      // Check each authorized stop point using polygon detection
      for (const stopPoint of stopPoints) {
        if (!stopPoint.coordinates) continue;
        
        const isInside = this.checkPointInPolygon(
          latitude, 
          longitude, 
          stopPoint.coordinates, 
          stopPoint.name
        );
        
        if (isInside) {
          return { 
            authorized: true, 
            stopPoint: stopPoint.name
          };
        }
      }
      
      return { authorized: false, reason: 'Outside all authorized zones' };
      
    } catch (error) {
      console.error('Error checking authorized zones:', error.message);
      return { authorized: false, reason: 'Error checking zones' };
    }
  }

  // Check if point is inside polygon using ray casting algorithm
  checkPointInPolygon(latitude, longitude, coordinatesString, zoneName) {
    try {
      if (!coordinatesString || coordinatesString.trim() === '') {
        console.log(`⚠️ No coordinates for zone ${zoneName}`);
        return false;
      }

      // Parse coordinates string: "28.141508,-26.232723,0 28.140979,-26.232172,0 ..."
      const coordPairs = coordinatesString.trim().split(/\s+/); // Handle multiple spaces
      const polygon = [];
      
      for (const coordPair of coordPairs) {
        if (!coordPair.trim()) continue;
        
        const coords = coordPair.split(',');
        if (coords.length >= 2) {
          const lng = parseFloat(coords[0]);
          const lat = parseFloat(coords[1]);
          
          // Validate coordinate ranges
          if (!isNaN(lat) && !isNaN(lng) && 
              lat >= -90 && lat <= 90 && 
              lng >= -180 && lng <= 180) {
            polygon.push([lng, lat]); // [longitude, latitude] format
          } else {
            console.log(`⚠️ Invalid coordinates in ${zoneName}: ${lng}, ${lat}`);
          }
        }
      }
      
      if (polygon.length < 3) {
        console.log(`⚠️ Invalid polygon for ${zoneName}: need at least 3 valid points, got ${polygon.length}`);
        return false;
      }
      
      // Ensure polygon is closed (first point = last point)
      const firstPoint = polygon[0];
      const lastPoint = polygon[polygon.length - 1];
      if (firstPoint[0] !== lastPoint[0] || firstPoint[1] !== lastPoint[1]) {
        polygon.push([firstPoint[0], firstPoint[1]]); // Close the polygon
      }
      
      // Validate input point
      if (isNaN(latitude) || isNaN(longitude) || 
          latitude < -90 || latitude > 90 || 
          longitude < -180 || longitude > 180) {
        console.log(`⚠️ Invalid input coordinates: ${longitude}, ${latitude}`);
        return false;
      }
      
      // Use point-in-polygon algorithm (ray casting)
      const result = this.pointInPolygon([longitude, latitude], polygon);
      
      if (result) {
        console.log(`✅ Point ${latitude}, ${longitude} is INSIDE zone ${zoneName}`);
      }
      
      return result;
      
    } catch (error) {
      console.error(`❌ Error checking point in polygon for ${zoneName}:`, error.message);
      return false;
    }
  }

  // Point-in-polygon algorithm (ray casting) - more robust implementation
  pointInPolygon(point, polygon) {
    const [x, y] = point;
    let inside = false;
    
    // Ray casting algorithm
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      
      // Check if point is on the boundary (optional - for edge cases)
      if (this.isPointOnEdge(x, y, xi, yi, xj, yj)) {
        return true; // Consider boundary as inside
      }
      
      // Ray casting check
      if (((yi > y) !== (yj > y)) && 
          (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    
    return inside;
  }


  // Check if point is on polygon edge (for boundary cases)
  isPointOnEdge(px, py, x1, y1, x2, y2) {
    const tolerance = 0.0001; // ~11 meters at equator
    
    // Check if point is collinear with edge
    const crossProduct = (py - y1) * (x2 - x1) - (px - x1) * (y2 - y1);
    if (Math.abs(crossProduct) > tolerance) {
      return false; // Not collinear
    }
    
    // Check if point is within edge bounds
    const dotProduct = (px - x1) * (x2 - x1) + (py - y1) * (y2 - y1);
    const squaredLength = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    
    return dotProduct >= 0 && dotProduct <= squaredLength;
  }

  // Check for unauthorized stops (stationary for 5+ minutes outside authorized zones)
  async checkUnauthorizedStop(tripId, driverName, coords, trip, updateData) {
    try {
      const driverKey = `${tripId}-${driverName}`;
      const now = Date.now();
      
      // Check if driver is stationary (speed < 5 km/h)
      if (coords.speed >= 5) {
        // Driver is moving, clear stationary tracking
        this.stationaryDrivers.delete(driverKey);
        return;
      }
      
      // Safe zone check - General Location: 55.005°N, 1.620°W (1km radius)
      const safeZoneDistance = this.calculateDistance(
        coords.latitude, coords.longitude,
        55.005, -1.620
      );
      if (safeZoneDistance <= 1000) {
        // Within safe zone, clear tracking and don't flag
        this.stationaryDrivers.delete(driverKey);
        return;
      }
      
      // Driver is stationary, check if this is a new stationary event
      const existingStationary = this.stationaryDrivers.get(driverKey);
      
      if (!existingStationary) {
        // New stationary event
        this.stationaryDrivers.set(driverKey, {
          startTime: now,
          latitude: coords.latitude,
          longitude: coords.longitude,
          tripId: tripId
        });
        return;
      }
      
      // Check if driver moved significantly from original stationary position
      const distance = this.calculateDistance(
        coords.latitude, coords.longitude,
        existingStationary.latitude, existingStationary.longitude
      );
      
      if (distance > this.STATIONARY_RADIUS) {
        // Driver moved, reset stationary tracking
        this.stationaryDrivers.set(driverKey, {
          startTime: now,
          latitude: coords.latitude,
          longitude: coords.longitude,
          tripId: tripId
        });
        return;
      }
      
      // Check if driver has been stationary for 5+ minutes
      const stationaryDuration = now - existingStationary.startTime;
      if (stationaryDuration >= this.STOP_DETECTION_TIME) {
        // Check if location is authorized
        const authCheck = await this.isWithinAuthorizedZone(
          tripId, 
          coords.latitude, 
          coords.longitude, 
          trip.selectedstoppoints
        );
        
        if (!authCheck.authorized) {
          // Double-check safe zone before flagging
          const safeZoneDistance = this.calculateDistance(
            coords.latitude, coords.longitude,
            55.005, -1.620
          );
          
          if (safeZoneDistance <= 1000) {
            console.log(`✅ Safe zone: Trip ${tripId} within 1km of General Location (${Math.round(safeZoneDistance)}m away)`);
            this.stationaryDrivers.delete(driverKey);
            return;
          }
          
          // Unauthorized stop detected
          const currentCount = trip.unauthorized_stops_count || 0;
          updateData.unauthorized_stops_count = currentCount + 1;
          updateData.alert_type = 'unauthorized_stop';
          updateData.alert_message = `Unauthorized stop detected: ${authCheck.reason}`;
          updateData.alert_timestamp = new Date().toISOString();
          
          console.log(`🚨 UNAUTHORIZED STOP: Trip ${tripId} (${driverName}) - ${authCheck.reason} - Duration: ${Math.round(stationaryDuration/60000)} minutes`);
          
          // Clear stationary tracking to avoid repeated alerts
          this.stationaryDrivers.delete(driverKey);
        } else {
          console.log(`✅ Authorized stop: Trip ${tripId} at ${authCheck.stopPoint}`);
          // Clear tracking for authorized stops
          this.stationaryDrivers.delete(driverKey);
        }
      }
      
    } catch (error) {
      console.error(`❌ Error checking unauthorized stop for trip ${tripId}:`, error.message);
    }
  }

  async storeCoordinates(tripId, driverName, coords) {
    try {
      // Get current trip data including route_points, mileage, status, selectedstoppoints, breaks, and location data
      const { data: trip } = await this.supabase
        .from('trips')
        .select('route_points, start_mileage, end_mileage, status, selectedstoppoints, unauthorized_stops_count, breaks, origin, destination, actual_start_time, actual_end_time, origin_coordinates, destination_coordinates')
        .eq('id', tripId)
        .single();
      
      const currentPoints = trip?.route_points || [];
      
      // Create new route point
      const newPoint = {
        lat: coords.latitude,
        lng: coords.longitude,
        speed: coords.speed,
        timestamp: Math.floor(Date.now() / 1000),
        datetime: new Date().toISOString()
      };
      
      // Prepare update data
      const updateData = {
        current_latitude: coords.latitude,
        current_longitude: coords.longitude,
        current_speed: coords.speed,
        last_location_update: new Date().toISOString()
      };
      
      // Handle mileage tracking
      if (coords.mileage) {
        // Set start_mileage if not already set (trip start)
        if (!trip?.start_mileage) {
          updateData.start_mileage = coords.mileage;
          console.log(`🏁 Trip ${tripId} started - Start mileage: ${coords.mileage} km`);
        }
        
        // Only capture end_mileage when trip is Complete or Delivered (case insensitive)
        const status = trip?.status?.toLowerCase() || '';
        if (status === 'completed' || status === 'delivered') {
          updateData.end_mileage = coords.mileage;
          
          // Calculate total_distance if we have start mileage
          if (trip?.start_mileage) {
            updateData.total_distance = coords.mileage - trip.start_mileage;
            console.log(`🏁 Trip ${tripId} completed - End mileage: ${coords.mileage} km, Total distance: ${updateData.total_distance} km`);
          }
        }
      }
      
      // Add route point directly (only for active trips)
      const status = trip?.status?.toLowerCase() || '';
      if (status !== 'completed' && status !== 'delivered') {
        const currentPoints = trip?.route_points || [];
        const newPoint = {
          lat: coords.latitude,
          lng: coords.longitude,
          speed: coords.speed,
          timestamp: Math.floor(Date.now() / 1000),
          datetime: new Date().toISOString(),
          distance: updateData.total_distance || null
        };
        
        updateData.route_points = [...currentPoints, newPoint];
      }
      
      // Check for unauthorized stops
      await this.checkUnauthorizedStop(tripId, driverName, coords, trip, updateData);
      
      // Check for required breaks
      await this.checkDriverBreaks(tripId, driverName, coords, trip, updateData);
      
      // Check for actual start/end times
      await this.checkActualTripTimes(tripId, driverName, coords, trip, updateData);
      
      // Update trip with all data
      await this.supabase
        .from('trips')
        .update(updateData)
        .eq('id', tripId);
      
      const mileageInfo = coords.mileage ? ` | ${coords.mileage}km` : '';
      const distanceInfo = updateData.total_distance ? ` | Distance: ${updateData.total_distance}km` : '';
      const totalPoints = updateData.route_points ? updateData.route_points.length : (trip?.route_points?.length || 0);
      console.log(`📍 Trip ${tripId} (${driverName}): ${coords.latitude}, ${coords.longitude} [${totalPoints} points]${mileageInfo}${distanceInfo}`);
      
    } catch (error) {
      console.error(`❌ Error storing coordinates for trip ${tripId}:`, error.message);
    }
  }

  // Check if driver needs a break (every 2 hours)
  async checkDriverBreaks(tripId, driverName, coords, trip, updateData) {
    try {
      const driverKey = `${tripId}-${driverName}`;
      const now = Date.now();
      
      // Initialize break tracking for new drivers using trip start time
      if (!this.driverBreakTracking.has(driverKey)) {
        // Use trip accepted_at or created_at as start time
        const tripStartTime = trip.accepted_at ? new Date(trip.accepted_at).getTime() : 
                             trip.created_at ? new Date(trip.created_at).getTime() : now;
        
        this.driverBreakTracking.set(driverKey, {
          lastBreakTime: tripStartTime, // Use actual trip start time
          currentBreakStart: null,
          drivingTime: 0
        });
        
        // Check if already overdue from trip start
        const timeSinceStart = now - tripStartTime;
        if (timeSinceStart >= this.BREAK_REQUIRED_INTERVAL) {
          console.log(`⚠️ Trip ${tripId} (${driverName}) started ${Math.round(timeSinceStart/60000/60)} hours ago - break may be overdue`);
        }
        return;
      }
      
      const breakData = this.driverBreakTracking.get(driverKey);
      
      // Check if driver is stationary (potential break)
      if (coords.speed < 5) {
        // Driver stopped - start break if not already started
        if (!breakData.currentBreakStart) {
          breakData.currentBreakStart = now;
        }
      } else {
        // Driver is moving
        if (breakData.currentBreakStart) {
          // Just finished a stop - check if it was a valid break
          const breakDuration = now - breakData.currentBreakStart;
          
          if (breakDuration >= this.MIN_BREAK_DURATION) {
            // Valid break taken - log to database
            const breakLog = {
              driver: driverName,
              start_time: new Date(breakData.currentBreakStart).toISOString(),
              end_time: new Date(now).toISOString(),
              duration_minutes: Math.round(breakDuration / 60000),
              location: {
                lat: coords.latitude,
                lng: coords.longitude
              }
            };
            
            // Add to breaks array
            const currentBreaks = trip?.breaks || [];
            updateData.breaks = [...currentBreaks, breakLog];
            
            breakData.lastBreakTime = now;
            console.log(`✅ Break taken: Trip ${tripId} (${driverName}) - ${Math.round(breakDuration/60000)} minutes`);
          }
          
          breakData.currentBreakStart = null;
        }
        
        // Check if break is overdue
        const timeSinceLastBreak = now - breakData.lastBreakTime;
        if (timeSinceLastBreak >= this.BREAK_REQUIRED_INTERVAL) {
          // Break overdue - flag alert
          const currentCount = trip.break_violations_count || 0;
          updateData.break_violations_count = currentCount + 1;
          updateData.alert_type = 'break_required';
          updateData.alert_message = `Driver break overdue: ${Math.round(timeSinceLastBreak/60000/60)} hours without break`;
          updateData.alert_timestamp = new Date().toISOString();
          
          console.log(`🚨 BREAK REQUIRED: Trip ${tripId} (${driverName}) - ${Math.round(timeSinceLastBreak/60000/60)} hours without break`);
          
          // Reset timer to avoid repeated alerts
          breakData.lastBreakTime = now;
        }
      }
      
    } catch (error) {
      console.error(`❌ Error checking driver breaks for trip ${tripId}:`, error.message);
    }
  }

  // Geocode address using Mapbox
  async geocodeAddress(address) {
    try {
      if (!this.MAPBOX_TOKEN || !address) return null;
      
      const response = await axios.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`, {
        params: {
          access_token: this.MAPBOX_TOKEN,
          limit: 1
        }
      });
      
      if (response.data.features && response.data.features.length > 0) {
        const [lng, lat] = response.data.features[0].center;
        return { lat, lng };
      }
      
      return null;
    } catch (error) {
      console.error(`❌ Geocoding error for ${address}:`, error.message);
      return null;
    }
  }

  // Check and update actual trip start/end times
  async checkActualTripTimes(tripId, driverName, coords, trip, updateData) {
    try {
      const now = new Date().toISOString();
      
      // Handle actual start time
      if (!trip.actual_start_time && trip.origin) {
        // Get origin coordinates if not cached
        let originCoords = trip.origin_coordinates;
        if (!originCoords) {
          originCoords = await this.geocodeAddress(trip.origin);
          if (originCoords) {
            updateData.origin_coordinates = originCoords;
          }
        }
        
        if (originCoords) {
          const distanceFromOrigin = this.calculateDistance(
            coords.latitude, coords.longitude,
            originCoords.lat, originCoords.lng
          );
          
          // If driver is 500m+ away from origin, mark as started
          if (distanceFromOrigin >= this.DEPARTURE_RADIUS) {
            updateData.actual_start_time = now;
            console.log(`🚀 TRIP STARTED: ${tripId} (${driverName}) departed from origin - ${Math.round(distanceFromOrigin)}m away`);
          }
        }
      }
      
      // Handle actual end time
      if (!trip.actual_end_time && trip.destination && trip.actual_start_time) {
        // Get destination coordinates if not cached
        let destCoords = trip.destination_coordinates;
        if (!destCoords) {
          destCoords = await this.geocodeAddress(trip.destination);
          if (destCoords) {
            updateData.destination_coordinates = destCoords;
          }
        }
        
        if (destCoords) {
          const distanceFromDestination = this.calculateDistance(
            coords.latitude, coords.longitude,
            destCoords.lat, destCoords.lng
          );
          
          // If driver is within 500m of destination, mark as arrived
          if (distanceFromDestination <= this.DEPARTURE_RADIUS) {
            updateData.actual_end_time = now;
            console.log(`🏁 TRIP COMPLETED: ${tripId} (${driverName}) arrived at destination - ${Math.round(distanceFromDestination)}m away`);
          }
        }
      }
      
    } catch (error) {
      console.error(`❌ Error checking actual trip times for trip ${tripId}:`, error.message);
    }
  }
}

module.exports = EPSTripTracker;