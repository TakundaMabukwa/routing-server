const { createClient } = require('@supabase/supabase-js');

// Supabase client for all database operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_EPS_SUPABASE_URL,
  process.env.NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY
);

class EPSTripMonitor {
  constructor() {
    this.STOP_DETECTION_TIME = 5 * 60 * 1000; // 5 minutes stationary = stop
    this.BREAK_REMINDER_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours
    this.STOP_RADIUS = 100; // 100 meters radius for authorized stops
    this.ACCEPTANCE_TIMEOUT = 5 * 60 * 1000; // 5 minutes to accept
    this.LOADING_TIMEOUT = 30 * 60 * 1000; // 30 minutes to reach loading location
    this.activeTrips = new Map(); // Cache active trips
    this.driverTripCache = new Map(); // Cache driver->trip matches
    
    // Start monitoring timer
    this.startTripMonitoring();
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

  // Check if coordinates are within authorized stop points using selectedstoppoints
  async isAuthorizedStop(tripId, latitude, longitude, geozone) {
    try {
      const { data: trip } = await supabase
        .from('trips')
        .select('selectedstoppoints')
        .eq('id', tripId)
        .single();
      
      if (!trip) return { authorized: false };
      
      const selectedStopPoints = trip.selectedstoppoints || [];
      
      if (selectedStopPoints.length === 0) return { authorized: false };
      
      const { data: stops } = await supabase
        .from('stop_points')
        .select('coordinates, radius, name')
        .in('id', selectedStopPoints);
      
      if (!stops) return { authorized: false };
      
      for (const stop of stops) {
        // Check geozone match first
        if (geozone && stop.name && geozone.includes(stop.name)) {
          return { authorized: true, stopName: stop.name, method: 'geozone' };
        }
        
        // Check coordinate distance
        if (stop.coordinates) {
          const coords = stop.coordinates.split(',');
          const stopLat = parseFloat(coords[0]);
          const stopLon = parseFloat(coords[1]);
          const radius = stop.radius || this.STOP_RADIUS;
          
          const distance = this.calculateDistance(latitude, longitude, stopLat, stopLon);
          
          if (distance <= radius) {
            return { authorized: true, stopName: stop.name, distance, method: 'coordinates' };
          }
        }
      }
      
      return { authorized: false };
    } catch (error) {
      console.error('Error checking authorized stops:', error);
      return { authorized: false };
    }
  }

  // Process EPS vehicle data for trip monitoring
  async processVehicleData(vehicleData) {
    try {
      console.log(`🚀 TRIP MONITOR CALLED with:`, vehicleData);
      
      const { DriverName: driverName, Latitude: lat, Longitude: lon, Speed: speed, Mileage: mileage } = vehicleData;
      
      if (!driverName || !lat || !lon || (lat === 0 && lon === 0)) {
        console.log(`❌ Invalid data: driver=${driverName}, lat=${lat}, lon=${lon}`);
        return;
      }
      
      console.log(`🔄 Processing: ${driverName} at ${lat},${lon} (${speed}km/h)`);

      const activeTrip = await this.getActiveTrip(driverName);
      if (!activeTrip) return;

      // Capture start mileage if not already set
      if (!activeTrip.start_mileage && mileage) {
        await this.captureStartMileage(activeTrip.id, mileage);
        activeTrip.start_mileage = mileage; // Update local copy
      }

      // Update trip with current location
      await this.updateTripLocation(activeTrip.id, lat, lon, speed, mileage);

      // Check if driver reached loading location
      if (activeTrip.loading_location_lat && activeTrip.loading_location_lng) {
        await this.checkLoadingLocationArrival(activeTrip, lat, lon);
      }

      // Check for stops (speed < 5 km/h for 5+ minutes)
      if (speed < 5) {
        await this.checkForStop(activeTrip, lat, lon, vehicleData.Geozone);
      }

      // Check break reminder (every 2 hours)
      await this.checkBreakReminder(activeTrip);

      console.log(`📍 Trip ${activeTrip.id}: ${driverName} at ${lat}, ${lon} (${speed} km/h) - Status: ${activeTrip.status}`);
      
    } catch (error) {
      console.error('Error processing vehicle data for trip monitoring:', error);
    }
  }

  // Get active trip for driver
  async getActiveTrip(driverName) {
    try {
      // Check cache first
      if (this.driverTripCache && this.driverTripCache.has(driverName)) {
        const cachedTripId = this.driverTripCache.get(driverName);
        const cachedTrip = this.activeTrips.get(cachedTripId);
        if (cachedTrip) {
          return cachedTrip;
        }
      }
      
      console.log(`🔍 GETACTIVETRIP CALLED for driver: ${driverName}`);
      
      // Initialize cache if not exists
      if (!this.driverTripCache) {
        this.driverTripCache = new Map();
      }
      
      // Search through cached active trips
      for (const [tripId, trip] of this.activeTrips) {
        if (!trip.vehicleassignments) continue;
        
        const assignments = Array.isArray(trip.vehicleassignments) 
          ? trip.vehicleassignments 
          : [trip.vehicleassignments];
        
        for (const assignment of assignments) {
          if (!assignment.drivers) continue;
          
          const drivers = Array.isArray(assignment.drivers) 
            ? assignment.drivers 
            : [assignment.drivers];
          
          for (const driver of drivers) {
            // Get driver surname from database (only if not cached)
            const { data: dbDriver } = await supabase
              .from('drivers')
              .select('surname')
              .eq('id', driver.id)
              .single();
            
            if (!dbDriver) continue;
            
            // Match names
            const tcpName = driverName.toLowerCase();
            const dbName = dbDriver.surname.toLowerCase();
            
            if (tcpName.includes(dbName) || dbName.includes(tcpName)) {
              console.log(`✅ MATCH! Trip ${trip.id} for ${driverName} <-> ${dbDriver.surname}`);
              // Cache the match
              this.driverTripCache.set(driverName, trip.id);
              return trip;
            }
          }
        }
      }
      
      console.log(`❌ No matching trip found for driver: ${driverName}`);
      return null;
      
    } catch (error) {
      console.error('Error in getActiveTrip:', error);
      return null;
    }
  }

  // Capture start mileage when trip monitoring begins
  async captureStartMileage(tripId, mileage) {
    try {
      await supabase
        .from('trips')
        .update({
          start_mileage: mileage,
          updated_at: new Date().toISOString()
        })
        .eq('id', tripId);
      
      console.log(`📏 Trip ${tripId}: Start mileage captured - ${mileage} km`);
    } catch (error) {
      console.error('Error capturing start mileage:', error);
    }
  }

  // Update trip location and append to route points array (no mobile notification)
  async updateTripLocation(tripId, latitude, longitude, speed, mileage = null) {
    try {
      // Calculate driving hours
      const drivingHours = await this.calculateDrivingHours(tripId);
      
      // Get current route points
      const { data: trip } = await supabase
        .from('trips')
        .select('route_points')
        .eq('id', tripId)
        .single();
      
      const currentPoints = trip?.route_points || [];
      const newPoint = {
        lat: latitude,
        lng: longitude,
        speed: speed,
        timestamp: Math.floor(Date.now() / 1000),
        datetime: new Date().toISOString()
      };
      
      const updateData = {
        current_latitude: latitude,
        current_longitude: longitude,
        current_speed: speed,
        last_location_update: new Date().toISOString(),
        driving_hours: drivingHours,
        route_points: [...currentPoints, newPoint]
      };
      
      // Update current mileage if available
      if (mileage) {
        updateData.end_mileage = mileage;
        
        // Calculate total distance if we have start mileage
        if (trip?.start_mileage) {
          updateData.total_distance = mileage - trip.start_mileage;
        }
      }
      
      await supabase
        .from('trips')
        .update(updateData)
        .eq('id', tripId);
      
    } catch (error) {
      console.error('Error updating trip location:', error);
    }
  }

  // Calculate driving hours for trip
  async calculateDrivingHours(tripId) {
    try {
      const { data: trip } = await supabase
        .from('trips')
        .select('created_at, last_break_time')
        .eq('id', tripId)
        .single();
      
      if (!trip) return 0;
      
      const startTime = trip.last_break_time ? new Date(trip.last_break_time) : new Date(trip.created_at);
      const now = new Date();
      
      return Math.round(((now - startTime) / (1000 * 60 * 60)) * 100) / 100; // Hours with 2 decimals
    } catch (error) {
      console.error('Error calculating driving hours:', error);
      return 0;
    }
  }

  // Check for unauthorized stops (5+ minutes stationary)
  async checkForStop(trip, latitude, longitude, geozone) {
    try {
      if (trip.current_speed >= 5) return; // Not stationary
      
      // Check if stationary for 5+ minutes by looking at recent route points
      const recentPoints = await this.getRecentRoutePoints(trip.id, 5); // Last 5 minutes
      
      if (recentPoints.length < 10) return; // Need enough points to confirm stationary
      
      // Check if all recent points are within 50 meters (stationary)
      const isStationary = recentPoints.every(point => {
        const distance = this.calculateDistance(latitude, longitude, point.lat, point.lng);
        return distance <= 50;
      });
      
      if (!isStationary) return;
      
      // Vehicle has been stationary for 5+ minutes, check if authorized
      const stopCheck = await this.isAuthorizedStop(trip.id, latitude, longitude, geozone);
      
      if (!stopCheck.authorized) {
        // Unauthorized stop - trigger mobile notification
        await this.updateTripStatus(trip.id, 'unauthorized_stop', 
          `Unauthorized stop detected at ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
        
        // Increment unauthorized stops count
        const { data: currentTrip } = await supabase
          .from('trips')
          .select('unauthorized_stops_count')
          .eq('id', trip.id)
          .single();
        
        await supabase
          .from('trips')
          .update({
            unauthorized_stops_count: (currentTrip?.unauthorized_stops_count || 0) + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', trip.id);
      }
      
    } catch (error) {
      console.error('Error checking for stops:', error);
    }
  }

  // Get recent route points for stationary detection
  async getRecentRoutePoints(tripId, minutes) {
    try {
      const { data: trip } = await supabase
        .from('trips')
        .select('route_points')
        .eq('id', tripId)
        .single();
      
      if (!trip?.route_points) return [];
      
      const now = Date.now() / 1000;
      const cutoff = now - (minutes * 60);
      
      return trip.route_points
        .filter(point => point.timestamp >= cutoff)
        .slice(-20); // Last 20 points max
        
    } catch (error) {
      console.error('Error getting recent route points:', error);
      return [];
    }
  }

  // Check break reminder
  async checkBreakReminder(trip) {
    try {
      const now = new Date();
      const lastBreak = trip.last_break_time ? new Date(trip.last_break_time) : new Date(trip.created_at);
      const timeSinceBreak = now - lastBreak;
      
      if (timeSinceBreak >= this.BREAK_REMINDER_INTERVAL && !trip.break_reminder_due) {
        await this.updateTripStatus(trip.id, 'break_reminder',
          `Break reminder: Driver has been driving for 2+ hours. 15-minute break recommended.`);
        
        // Update trip to mark reminder due
        await supabase
          .from('trips')
          .update({
            break_reminder_due: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', trip.id);
      }
      
    } catch (error) {
      console.error('Error checking break reminder:', error);
    }
  }

  // Update trip status (triggers mobile notification)
  async updateTripStatus(tripId, alertType, message) {
    try {
      // Map alert types to status values
      const statusMap = {
        'unauthorized_stop': 'alert',
        'break_reminder': 'break_due',
        'late_acceptance': 'late',
        'late_arrival': 'late',
        'arrived_loading': 'loading'
      };
      
      const newStatus = statusMap[alertType] || 'alert';
      const statusNote = `${alertType}: ${message} (${new Date().toISOString()})`;
      
      // Get current data
      const { data: currentTrip } = await supabase
        .from('trips')
        .select('status_history, notes')
        .eq('id', tripId)
        .single();
      
      const currentHistory = currentTrip?.status_history || [];
      const currentNotes = currentTrip?.notes || '';
      
      await supabase
        .from('trips')
        .update({
          status: newStatus,
          alert_type: alertType,
          alert_message: message,
          alert_timestamp: new Date().toISOString(),
          status_history: [...currentHistory, statusNote],
          notes: currentNotes ? `${currentNotes}\n${statusNote}` : statusNote,
          updated_at: new Date().toISOString()
        })
        .eq('id', tripId);
      console.log(`🚨 Trip status update: ${newStatus} (${alertType}) - ${message}`);
      
    } catch (error) {
      console.error('Error updating trip status:', error);
    }
  }

  // Start trip monitoring timer
  startTripMonitoring() {
    setInterval(async () => {
      await this.checkPendingTrips();
    }, 60000); // Check every minute
  }

  // Check for pending trips that need acceptance or loading location monitoring
  async checkPendingTrips() {
    try {
      const { data: trips } = await supabase
        .from('trips')
        .select('*')
        .not('status', 'in', '(Completed,Delivered)')
        .or('accepted_at.is.null,and(loading_location_lat.not.is.null,accepted_at.not.is.null)');
      
      if (!trips) return;
      
      for (const trip of trips) {
        const now = new Date();
        const createdAt = new Date(trip.created_at);
        const timeSinceCreated = now - createdAt;
        
        // Debug logging
        console.log(`Trip ${trip.id}: created ${Math.round(timeSinceCreated/60000)}min ago, accepted_at: ${trip.accepted_at}, late_acceptance: ${trip.late_acceptance}`);
        
        // Check acceptance timeout (5 minutes) - only flag once
        if (!trip.accepted_at && timeSinceCreated >= this.ACCEPTANCE_TIMEOUT && !trip.late_acceptance) {
          await this.markLateAcceptance(trip.id);
        }
        
        // Check loading location timeout (30 minutes after acceptance)
        if (trip.accepted_at && trip.loading_location_lat && !trip.late_arrival) {
          const acceptedAt = new Date(trip.accepted_at);
          const timeSinceAccepted = now - acceptedAt;
          
          if (timeSinceAccepted >= this.LOADING_TIMEOUT) {
            await this.markLateArrival(trip.id);
          }
        }
      }
      
    } catch (error) {
      console.error('Error checking pending trips:', error);
    }
  }

  // Mark trip as late acceptance
  async markLateAcceptance(tripId) {
    try {
      // First update the late_acceptance flag
      await supabase
        .from('trips')
        .update({
          late_acceptance: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', tripId);
      
      // Then update status (this triggers mobile notification)
      await this.updateTripStatus(tripId, 'late_acceptance', 'Driver failed to accept trip within 5 minutes');
      
      console.log(`⏰ Trip ${tripId}: Late acceptance flagged`);
    } catch (error) {
      console.error('Error marking late acceptance:', error);
    }
  }

  // Mark trip as late arrival
  async markLateArrival(tripId) {
    try {
      await this.updateTripStatus(tripId, 'late_arrival', 'Driver failed to reach loading location within 30 minutes');
      
      await supabase
        .from('trips')
        .update({
          late_arrival: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', tripId);
      
      console.log(`⏰ Trip ${tripId}: Late arrival flagged`);
    } catch (error) {
      console.error('Error marking late arrival:', error);
    }
  }

  // Check if driver reached loading location
  async checkLoadingLocationArrival(trip, latitude, longitude) {
    try {
      if (!trip.loading_location_lat || !trip.loading_location_lng || trip.late_arrival) return;
      
      const distance = this.calculateDistance(
        latitude, longitude,
        trip.loading_location_lat, trip.loading_location_lng
      );
      
      const radius = trip.loading_location_radius || 100;
      
      if (distance <= radius) {
        await this.updateTripStatus(trip.id, 'arrived_loading', 'Driver arrived at loading location');
        console.log(`📍 Trip ${trip.id}: Driver arrived at loading location`);
      }
      
    } catch (error) {
      console.error('Error checking loading location arrival:', error);
    }
  }



  // Reset break reminder (when driver takes break)
  async resetBreakReminder(tripId) {
    try {
      const { data: trip } = await supabase
        .from('trips')
        .update({
          last_break_time: new Date().toISOString(),
          break_reminder_due: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', tripId)
        .select()
        .single();
      
      if (trip) {
        console.log(`⏰ Break reminder reset for trip ${tripId}`);
      }
      
      return trip;
    } catch (error) {
      console.error('Error resetting break reminder:', error);
      throw error;
    }
  }

  // Finalize trip distance when trip is completed
  async finalizeTripDistance(tripId, finalMileage) {
    try {
      const { data: trip } = await supabase
        .from('trips')
        .select('start_mileage')
        .eq('id', tripId)
        .single();
      
      if (!trip?.start_mileage) {
        console.log(`⚠️ Trip ${tripId}: No start mileage recorded`);
        return;
      }
      
      const totalDistance = finalMileage - trip.start_mileage;
      
      await supabase
        .from('trips')
        .update({
          end_mileage: finalMileage,
          total_distance: totalDistance,
          updated_at: new Date().toISOString()
        })
        .eq('id', tripId);
      
      console.log(`🏁 Trip ${tripId}: Distance finalized - ${totalDistance} km (${trip.start_mileage} to ${finalMileage})`);
      
      return totalDistance;
    } catch (error) {
      console.error('Error finalizing trip distance:', error);
      return null;
    }
  }
}

module.exports = EPSTripMonitor;