const { createClient } = require('@supabase/supabase-js');

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
);

class EPSRewardSystem {
  constructor() {
    this.serverTimeOffset = -1; // Server is 1 hour behind
    
    // New 100-point deduction system with thresholds
    this.STARTING_POINTS = 100;
    this.POINTS_PER_VIOLATION = 1;
    this.VIOLATION_THRESHOLDS = {
      SPEED: 4,           // 4 speed violations before deduction
      HARSH_BRAKING: 4,   // 4 harsh braking before deduction
      NIGHT_DRIVING: 4,   // 4 night driving before deduction
      ROUTE: 4,           // 4 route violations before deduction
      OTHER: 4            // 4 other violations before deduction
    };
    
    // Batch update system
    this.pendingUpdates = new Map();
    this.batchTimer = null;
    this.BATCH_INTERVAL = 60000; // 60 seconds
    
    // Fuel data tracking - store once per hour per vehicle
    this.lastFuelStorage = new Map(); // plate -> timestamp
    this.FUEL_STORAGE_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds
    
    // Daily snapshot timer
    this.setupDailySnapshot()
  }
  
  // Setup daily snapshot at midnight
  setupDailySnapshot() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    setTimeout(() => {
      this.createDailySnapshot();
      // Set up recurring daily snapshots
      setInterval(() => this.createDailySnapshot(), 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
  }

  // Calculate the 2nd last day of the month
  getSecondLastDayOfMonth(year, month) {
    const lastDay = new Date(year, month, 0).getDate();
    return lastDay - 1;
  }

  // Get current server time adjusted for offset
  getServerTime() {
    const now = new Date();
    return new Date(now.getTime() + (this.serverTimeOffset * 60 * 60 * 1000));
  }

  // Process violation and deduct points after threshold
  async processViolation(driverName, plate, violationType) {
    try {
      // Skip UNKNOWN or null drivers
      if (!driverName || driverName.toUpperCase() === 'UNKNOWN' || driverName.toUpperCase() === 'NULL') {
        return null;
      }
      
      // Get or create driver record
      let driver = await this.getDriverRewards(driverName);
      
      if (!driver) return null;
      
      // Map violation types to database fields
      const violationFields = {
        'SPEED': 'speed_violations_count',
        'HARSH_BRAKING': 'harsh_braking_count', 
        'NIGHT_DRIVING': 'night_driving_count',
        'ROUTE': 'route_violations_count',
        'OTHER': 'other_violations_count'
      };
      
      const thresholdFields = {
        'SPEED': 'speed_threshold_exceeded',
        'HARSH_BRAKING': 'braking_threshold_exceeded',
        'NIGHT_DRIVING': 'night_threshold_exceeded', 
        'ROUTE': 'route_threshold_exceeded',
        'OTHER': 'other_threshold_exceeded'
      };
      
      const violationField = violationFields[violationType];
      const thresholdField = thresholdFields[violationType];
      
      if (!violationField) {
        console.error(`Unknown violation type: ${violationType}`);
        return driver;
      }
      
      // Increment violation count
      const currentCount = (driver[violationField] || 0) + 1;
      const threshold = this.VIOLATION_THRESHOLDS[violationType];
      
      let pointsDeducted = 0;
      let thresholdExceeded = driver[thresholdField] || false;
      
      // Deduct point only after threshold exceeded
      if (currentCount > threshold) {
        pointsDeducted = this.POINTS_PER_VIOLATION;
        thresholdExceeded = true;
        
        console.log(`🚨 ${driverName} (${plate}): ${violationType} violation #${currentCount} - DEDUCTING ${pointsDeducted} point (threshold: ${threshold})`);
      } else {
        console.log(`⚠️ ${driverName} (${plate}): ${violationType} violation #${currentCount} - FREE PASS (${threshold - currentCount} remaining)`);
      }
      
      // Update driver record using batch system
      const newPoints = Math.max(0, (driver.current_points || this.STARTING_POINTS) - pointsDeducted);
      const newPointsDeducted = (driver.points_deducted || 0) + pointsDeducted;
      const newLevel = this.calculateLevel(newPoints);
      
      const updateData = {
        [violationField]: currentCount,
        [thresholdField]: thresholdExceeded,
        current_points: newPoints,
        points_deducted: newPointsDeducted,
        current_level: newLevel
      };
      
      // IMMEDIATE update for violations, batch for regular updates
      await this.updateDriverRewards(driverName, updateData);
      
      return {
        ...driver,
        ...updateData
      };
      
    } catch (error) {
      console.error('Error processing violation:', error);
      throw error;
    }
  }

  // Calculate performance level based on remaining points
  calculateLevel(points) {
    if (points >= 80) return 'Gold';      // 80-100 points
    if (points >= 60) return 'Silver';    // 60-79 points  
    if (points >= 40) return 'Bronze';    // 40-59 points
    return 'Critical';                    // 0-39 points
  }

  // Get or create driver rewards record
  async getDriverRewards(driverName) {
    try {
      // Skip UNKNOWN or null drivers
      if (!driverName || driverName.toUpperCase() === 'UNKNOWN' || driverName.toUpperCase() === 'NULL') {
        return null;
      }
      
      const { data, error } = await supabase
        .from('eps_driver_rewards')
        .upsert({
          driver_name: driverName,
          current_points: this.STARTING_POINTS,
          points_deducted: 0,
          current_level: 'Gold',
          speed_violations_count: 0,
          harsh_braking_count: 0,
          night_driving_count: 0,
          route_violations_count: 0,
          other_violations_count: 0
        }, {
          onConflict: 'driver_name',
          ignoreDuplicates: true
        })
        .select();
      
      if (error) throw error;
      
      const driver = data?.[0];
      if (driver) {

      }
      return driver;
      
    } catch (error) {
      console.error('Error getting driver rewards:', error);
      throw error;
    }
  }

  // Add to batch updates instead of immediate update
  addToBatch(driverName, updates) {
    if (!this.pendingUpdates.has(driverName)) {
      this.pendingUpdates.set(driverName, { ...updates });
    } else {
      // Merge updates
      const existing = this.pendingUpdates.get(driverName);
      this.pendingUpdates.set(driverName, { ...existing, ...updates });
    }
    
    // Start batch timer if not running
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.processBatch(), this.BATCH_INTERVAL);
    }
  }
  
  // Process all pending updates in batch
  async processBatch() {
    if (this.pendingUpdates.size === 0) {
      this.batchTimer = null;
      return;
    }
    
    const updates = Array.from(this.pendingUpdates.entries());
    this.pendingUpdates.clear();
    this.batchTimer = null;
    
    try {
      // Process all updates in parallel
      await Promise.all(updates.map(([driverName, updateData]) => 
        this.updateDriverRewards(driverName, updateData)
      ));
      

    } catch (error) {
      console.error('Error processing batch updates:', error);
    }
  }
  
  // Update driver rewards record (now used by batch processor)
  async updateDriverRewards(driverName, updates) {
    try {
      const { data, error } = await supabase
        .from('eps_driver_rewards')
        .update({
          ...updates,
          last_updated: new Date().toISOString()
        })
        .eq('driver_name', driverName)
        .select()
        .single();
      
      if (error) throw error;
      return data;
      
    } catch (error) {
      console.error('Error updating driver rewards:', error);
      throw error;
    }
  }



  // Reset all drivers to 100 points (monthly reset)
  async resetAllDriverPoints() {
    try {

      
      const { error } = await supabase
        .from('eps_driver_rewards')
        .update({
          current_points: this.STARTING_POINTS,
          points_deducted: 0,
          speed_violations_count: 0,
          harsh_braking_count: 0,
          night_driving_count: 0,
          route_violations_count: 0,
          other_violations_count: 0,
          speed_threshold_exceeded: false,
          braking_threshold_exceeded: false,
          night_threshold_exceeded: false,
          route_threshold_exceeded: false,
          other_threshold_exceeded: false,
          current_level: 'Gold',
          last_updated: new Date().toISOString()
        })
        .neq('id', 0); // Update all records

      if (error) throw error;
      

      return true;
    } catch (error) {
      console.error('Error resetting driver points:', error);
      return false;
    }
  }

  // Process EPS data and calculate rewards
  async processEPSData(epsData) {
    try {
      const {
        Plate: plate,
        Speed: speed,
        Latitude: latitude,
        Longitude: longitude,
        LocTime: locTime,
        Mileage: mileage,
        Geozone: geozone,
        DriverName: driverName,
        Address: address
      } = epsData;

      // Check if vehicle is actually driving
      const isDriving = this.isVehicleDriving(epsData);
      
      if (!isDriving) {

        return null;
      }

      // Store EPS vehicle data first (UPSERT - insert once, then update)
      await this.storeEPSVehicleData(epsData);

      // Process violations and deduct points (new system)
      const violations = await this.processViolations(epsData);
      
      // Calculate performance metrics
      const performance = this.calculatePerformance(epsData);
      
      // Calculate driver score based on remaining points
      const driverScore = await this.calculateDriverScore(epsData, violations, performance);

      // Calculate daily distance
      const currentDate = new Date(locTime).toISOString().split('T')[0];
      const dailyDistance = await this.calculateDailyDistance(plate, currentDate);

      // Calculate daily driving hours
      const drivingHours = await this.calculateDailyDrivingHours(plate, currentDate);

      // Store in Supabase
      await this.storeInSupabase(epsData, violations, performance, driverScore, dailyDistance, drivingHours);

      return { violations, performance, driverScore, dailyDistance, drivingHours, isDriving };
    } catch (error) {
      console.error('Error processing EPS data:', error);
      throw error;
    }
  }

  // Check if vehicle is actually driving based on NameEvent and Statuses fields
  isVehicleDriving(epsData) {
    const nameEvent = epsData.NameEvent ? epsData.NameEvent.toUpperCase() : '';
    const statuses = epsData.Statuses ? epsData.Statuses.toUpperCase() : '';
    
    // Check for explicit stationary indicators first (these override everything)
    if (nameEvent.includes('IGNITION OFF') || 
        nameEvent.includes('ENGINE OFF') || 
        nameEvent.includes('STATIONARY') ||
        nameEvent.includes('PARKED') ||
        nameEvent.includes('IDLE') ||
        nameEvent.includes('STOPPED') ||
        statuses.includes('ENGINE OFF') || 
        statuses.includes('STATIONARY') ||
        statuses.includes('PARKED') ||
        statuses.includes('IDLE') ||
        statuses.includes('STOPPED') ||
        statuses.includes('OFF')) {
      return false;
    }
    
    // Check for driving indicators OR speed > 5 (either condition makes it driving)
    const hasDrivingNameEvent = nameEvent.includes('IGNITION ON') ||
        nameEvent.includes('VEHICLE IN MOTION') || 
        nameEvent.includes('ENGINE ON') ||
        nameEvent.includes('DRIVING') ||
        nameEvent.includes('MOVING');
    
    const hasDrivingStatuses = statuses.includes('VEHICLE IN MOTION') || 
        statuses.includes('ENGINE ON') ||
        statuses.includes('DRIVING') ||
        statuses.includes('MOVING') ||
        statuses.includes('IN MOTION') ||
        statuses.includes('RUNNING');
    
    const hasSpeed = epsData.Speed > 5;
    
    // Vehicle is driving if ANY of these conditions are true
    return hasDrivingNameEvent || hasDrivingStatuses || hasSpeed;
  }

  // Calculate daily distance moved
  async calculateDailyDistance(plate, date) {
    try {
      // Get first status after midnight (initial mileage)
      const { data: firstStatus, error: firstError } = await supabase
        .from('eps_daily_performance')
        .select('latest_mileage')
        .eq('plate', plate)
        .gte('latest_loc_time', `${date}T00:00:00`)
        .lt('latest_loc_time', `${date}T23:59:59`)
        .order('latest_loc_time', { ascending: true })
        .limit(1);
      
      if (firstError) throw firstError;
      
      // Get last status before 11 PM (closing mileage)
      const { data: lastStatus, error: lastError } = await supabase
        .from('eps_daily_performance')
        .select('latest_mileage')
        .eq('plate', plate)
        .gte('latest_loc_time', `${date}T00:00:00`)
        .lt('latest_loc_time', `${date}T23:00:00`)
        .order('latest_loc_time', { ascending: false })
        .limit(1);
      
      if (lastError) throw lastError;
      
      if (firstStatus.length > 0 && lastStatus.length > 0) {
        const initialMileage = firstStatus[0].latest_mileage;
        const closingMileage = lastStatus[0].latest_mileage;
        const distance = Math.max(0, closingMileage - initialMileage);
        return isNaN(distance) ? 0 : distance;
      }
      
      return 0;
    } catch (error) {
      console.error('Error calculating daily distance:', error);
      return 0;
    }
  }

  // Calculate daily driving hours and times
  async calculateDailyDrivingHours(plate, date) {
    try {
      // Get first driving time (when vehicle started moving)
      const { data: firstDriveData, error: firstError } = await supabase
        .from('eps_daily_performance')
        .select('latest_loc_time')
        .eq('plate', plate)
        .gte('latest_loc_time', `${date}T00:00:00`)
        .lt('latest_loc_time', `${date}T23:59:59`)
        .gt('latest_speed', 5)
        .order('latest_loc_time', { ascending: true })
        .limit(1);
      
      if (firstError) throw firstError;
      
      // Get last driving time (when vehicle stopped moving)
      const { data: lastDriveData, error: lastError } = await supabase
        .from('eps_daily_performance')
        .select('latest_loc_time')
        .eq('plate', plate)
        .gte('latest_loc_time', `${date}T00:00:00`)
        .lt('latest_loc_time', `${date}T23:59:59`)
        .gt('latest_speed', 5)
        .order('latest_loc_time', { ascending: false })
        .limit(1);
      
      if (lastError) throw lastError;

      let firstTime = null;
      let lastTime = null;
      let totalHours = 0;
      let dayHours = 0;
      let nightHours = 0;

      if (firstDriveData.length > 0 && lastDriveData.length > 0) {
        firstTime = firstDriveData[0].latest_loc_time;
        lastTime = lastDriveData[0].latest_loc_time;
        
        // Calculate total driving hours
        const timeDiff = new Date(lastTime) - new Date(firstTime);
        totalHours = Math.round((timeDiff / (1000 * 60 * 60)) * 100) / 100; // Round to 2 decimal places
        
        // Calculate day vs night driving hours
        const startHour = new Date(firstTime).getHours();
        const endHour = new Date(lastTime).getHours();
        
        // Day hours (6 AM to 10 PM)
        if (startHour >= 6 && endHour <= 22) {
          dayHours = totalHours;
        } else if (startHour < 6 || endHour > 22) {
          // Night hours (10 PM to 6 AM)
          nightHours = totalHours;
        } else {
          // Mixed day/night - approximate split
          dayHours = totalHours * 0.7; // Assume 70% day driving
          nightHours = totalHours * 0.3; // Assume 30% night driving
        }
      }

      return {
        firstDriveTime: firstTime,
        lastDriveTime: lastTime,
        totalDrivingHours: isNaN(totalHours) ? 0 : totalHours,
        dayDrivingHours: isNaN(dayHours) ? 0 : dayHours,
        nightDrivingHours: isNaN(nightHours) ? 0 : nightHours
      };
    } catch (error) {
      console.error('Error calculating daily driving hours:', error);
      return {
        firstDriveTime: null,
        lastDriveTime: null,
        totalDrivingHours: 0,
        dayDrivingHours: 0,
        nightDrivingHours: 0
      };
    }
  }



  // Process violations and deduct points (new system)
  async processViolations(epsData) {
    const violations = [];
    const plate = epsData.Plate;
    
    if (!plate) {
      console.log('⚠️ Warning: Plate is null or empty, skipping reward processing');
      return violations;
    }
    
    // Only process violations if vehicle is actually driving
    if (!this.isVehicleDriving(epsData)) {
      return violations;
    }
    
    // Speed violations - deduct points for speeding
    if (epsData.Speed > 120) {
      const driver = await this.processViolation(epsData.DriverName, plate, 'SPEED');
      if (driver) {
        violations.push({
          type: 'speed_violation',
          category: 'SPEED',
          value: epsData.Speed,
          threshold: 120,
          violation_count: driver.speed_violations_count,
          points_remaining: driver.current_points
        });
      }
    }

    // Harsh braking violations
    if (epsData.NameEvent && epsData.NameEvent.toUpperCase().includes('HARSH BRAKING')) {
      const driver = await this.processViolation(epsData.DriverName, plate, 'HARSH_BRAKING');
      if (driver) {
        violations.push({
          type: 'harsh_braking_violation',
          category: 'HARSH_BRAKING', 
          value: 'harsh_braking_detected',
          threshold: 'smooth_driving',
          violation_count: driver.harsh_braking_count,
          points_remaining: driver.current_points
        });
      }
    }

    // Night driving violations (10 PM to 5 AM) - with timezone adjustment
    const locTimeAdjusted = new Date(new Date(epsData.LocTime).getTime() + (this.serverTimeOffset * 60 * 60 * 1000));
    const hour = locTimeAdjusted.getHours();
    
    // Debug logging for night driving detection
    if (hour >= 22 || hour <= 5) {
      const driver = await this.processViolation(epsData.DriverName, plate, 'NIGHT_DRIVING');
      if (driver) {
        violations.push({
          type: 'night_driving_violation',
          category: 'NIGHT_DRIVING',
          value: hour,
          threshold: 'night_hours',
          violation_count: driver.night_driving_count,
          points_remaining: driver.current_points
        });
      }
    }

    // Route violations - DISABLED
    // if (!this.isOnAssignedRoute(epsData.Plate, epsData.Geozone)) {
    //   const driver = await this.processViolation(epsData.DriverName, plate, 'ROUTE');
    //   if (driver) {
    //     violations.push({
    //       type: 'route_violation',
    //       category: 'ROUTE',
    //       value: 'off_route',
    //       threshold: 'assigned_route',
    //       violation_count: driver.route_violations_count,
    //       points_remaining: driver.current_points
    //     });
    //   }
    // }

    return violations;
  }

  // Calculate performance metrics
  calculatePerformance(epsData) {
    const serverTime = this.getServerTime();
    const isWeekend = serverTime.getDay() === 0 || serverTime.getDay() === 6;
    
    return {
      speedCompliance: Boolean(epsData.Speed <= 80),
      routeCompliance: true, // Always true - route violations disabled
      timeCompliance: Boolean(this.isWithinWorkingHours(epsData.LocTime)),
      weekendDriving: Boolean(isWeekend),
      efficiency: this.calculateEfficiency(epsData),
      safetyScore: this.calculateSafetyScore(epsData)
    };
  }

  // Calculate driver score based on remaining points (new system)
  async calculateDriverScore(epsData, violations, performance) {
    const driverName = epsData.DriverName;
    
    if (!driverName) {
      return {
        currentPoints: this.STARTING_POINTS,
        violationCount: 0,
        breakdown: [],
        level: 'Gold'
      };
    }
    
    // Get current driver status
    const driver = await this.getDriverRewards(driverName);
    
    // Handle case where driver is null (UNKNOWN drivers)
    if (!driver) {
      return {
        currentPoints: this.STARTING_POINTS,
        pointsDeducted: 0,
        violationCount: 0,
        breakdown: [{
          type: 'unknown_driver',
          points: this.STARTING_POINTS,
          description: 'Unknown driver - no score tracking'
        }],
        level: 'Gold',
        violations: {
          speed: 0,
          harsh_braking: 0,
          night_driving: 0,
          route: 0,
          other: 0
        }
      };
    }
    
    const scoreBreakdown = [];
    
    // Show violation breakdown
    violations.forEach(violation => {
      scoreBreakdown.push({
        type: `violation_${violation.type}`,
        points: violation.points_remaining,
        description: `${violation.type} (Count: ${violation.violation_count})`
      });
    });
    
    // If no violations this update, show current status
    if (violations.length === 0) {
      scoreBreakdown.push({
        type: 'no_violations_this_update',
        points: driver.current_points,
        description: 'No violations in this update'
      });
    }
    
    return {
      currentPoints: driver.current_points,
      pointsDeducted: driver.points_deducted,
      violationCount: violations.length,
      breakdown: scoreBreakdown,
      level: driver.current_level,
      violations: {
        speed: driver.speed_violations_count,
        harsh_braking: driver.harsh_braking_count,
        night_driving: driver.night_driving_count,
        route: driver.route_violations_count,
        other: driver.other_violations_count
      }
    };
  }

  // Helper methods
  isOnAssignedRoute(plate, currentGeozone) {
    // This would check against assigned routes for the plate
    // For now, return true if geozone contains "EPS depot"
    return currentGeozone && currentGeozone.includes('EPS depot');
  }

  isWithinWorkingHours(locTime) {
    const locTimeAdjusted = new Date(new Date(locTime).getTime() + (this.serverTimeOffset * 60 * 60 * 1000));
    const hour = locTimeAdjusted.getHours();
    return hour >= 6 && hour <= 21;
  }

  calculateEfficiency(epsData) {
    // Calculate efficiency based on speed vs distance
    // Higher efficiency = better fuel economy
    const optimalSpeed = 60; // km/h
    const speedEfficiency = Math.max(0, 1 - Math.abs(epsData.Speed - optimalSpeed) / optimalSpeed);
    return speedEfficiency;
  }

  calculateSafetyScore(epsData) {
    let score = 1.0;
    
    // Deduct for speeding
    if (epsData.Speed > 80) {
      score -= 0.2;
    }
    if (epsData.Speed > 100) {
      score -= 0.3;
    }
    
    // Deduct for night driving
    const locTimeAdjusted = new Date(new Date(epsData.LocTime).getTime() + (this.serverTimeOffset * 60 * 60 * 1000));
    const hour = locTimeAdjusted.getHours();
    if (hour >= 22 || hour <= 5) {
      score -= 0.1;
    }
    
    return Math.max(0, score);
  }

  // Get performance level based on remaining points
  getPerformanceLevel(points) {
    if (points >= 80) return 'Gold';      // 80-100 points
    if (points >= 60) return 'Silver';    // 60-79 points
    if (points >= 40) return 'Bronze';    // 40-59 points
    return 'Critical';                    // 0-39 points
  }


  // Store EPS vehicle data in eps_vehicles table (UPSERT)
  async storeEPSVehicleData(epsData) {
    try {
      const { Plate } = epsData;
      
      if (!Plate) {
        throw new Error('Plate is required for EPS vehicle operations');
      }
      
      // Get current vehicle data to check for engine status changes
      const { data: currentVehicle, error: selectError } = await supabase
        .from('eps_vehicles')
        .select('name_event, engine_status')
        .eq('plate', Plate)
        .maybeSingle();
      
      const previousNameEvent = currentVehicle?.name_event;
      const previousEngineStatus = currentVehicle?.engine_status;
      
      // Determine engine status from NameEvent
      let engineStatus = null;
      const nameEvent = epsData.NameEvent ? epsData.NameEvent.toUpperCase() : '';
      
      if (nameEvent.includes('ENGINE ON') || nameEvent.includes('IGNITION ON')) {
        engineStatus = 'ON';
      } else if (nameEvent.includes('ENGINE OFF') || nameEvent.includes('IGNITION OFF')) {
        engineStatus = 'OFF';
      } else if (nameEvent.includes('VEHICLE IN MOTION')) {
        engineStatus = 'MOVING';
      }
      
      // Log new name events

      
      // Update existing driver record by driver_name
      const { data, error } = await supabase
        .from('eps_vehicles')
        .upsert({
          plate: Plate,
          driver_name: epsData.DriverName,
          speed: epsData.Speed || 0,
          latitude: epsData.Latitude,
          longitude: epsData.Longitude,
          loc_time: epsData.LocTime,
          mileage: epsData.Mileage || 0,
          geozone: epsData.Geozone,
          address: epsData.Address,
          name_event: epsData.NameEvent,
          statuses: epsData.Statuses,
          fuel_level: epsData.fuel_level,
          fuel_volume: epsData.fuel_volume,
          fuel_temperature: epsData.fuel_temperature,
          fuel_percentage: epsData.fuel_percentage,
          engine_status: engineStatus || epsData.engine_status,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'driver_name'
        })
        .select('id');
      
      if (error) {
        console.error('Error updating vehicle:', error);
        return null;
      }
      

      
      // Log and store fuel data if available (hourly)
      if (epsData.fuel_level || epsData.fuel_volume) {
        console.log(`⛽ EPS Fuel Data - ${epsData.DriverName}: Level=${epsData.fuel_level}L, Volume=${epsData.fuel_volume}L`);
        await this.storeFuelDataHourly(epsData);
      }
      
      return data?.[0]?.id;
    } catch (error) {
      console.error('Error storing EPS vehicle data:', error);
      throw error;
    }
  }

  // Store data in Supabase (reduced frequency)
  async storeInSupabase(epsData, violations, performance, driverScore, dailyDistance = 0, drivingHours = {}) {
    try {
      const currentDate = new Date(epsData.LocTime).toISOString().split('T')[0];
      
      // Only update daily performance if there are violations or every 60 seconds
      if (violations.length > 0 || Math.random() < 0.017) { // ~1.7% chance = 60 second average
        await supabase
          .from('eps_daily_performance')
          .upsert({
            plate: epsData.Plate,
            driver_name: epsData.DriverName,
            date: currentDate,
            latest_speed: epsData.Speed,
            latest_latitude: epsData.Latitude,
            latest_longitude: epsData.Longitude,
            latest_loc_time: epsData.LocTime,
            latest_mileage: epsData.Mileage,
            latest_geozone: epsData.Geozone,
            latest_address: epsData.Address,
            speed_compliance: performance.speedCompliance,
            route_compliance: performance.routeCompliance,
            time_compliance: performance.timeCompliance,
            efficiency: performance.efficiency,
            safety_score: performance.safetyScore,
            total_risk_score: driverScore.currentPoints,
            risk_level: driverScore.level,
            last_update_time: new Date().toISOString()
          }, {
            onConflict: 'driver_name,date'
          });
      }

      // Only update violations if there are actual violations
      if (violations.length > 0) {
        await supabase
          .from('eps_daily_violations')
          .upsert({
            plate: epsData.Plate,
            driver_name: epsData.DriverName,
            date: currentDate,
            speeding_count: violations.filter(v => v.type === 'speed_violation').length,
            harsh_braking_count: violations.filter(v => v.type === 'harsh_braking_violation').length,
            excessive_night_count: violations.filter(v => v.type === 'night_driving_violation').length,
            route_deviation_count: violations.filter(v => v.type === 'route_violation').length,
            total_violations: violations.length,
            last_violation_time: new Date().toISOString()
          }, {
            onConflict: 'driver_name,date'
          });
      }

      // Store daily fuel summary
      await this.storeDailyFuelSummary(epsData, currentDate);
      
      // Skip daily stats updates to reduce database calls
      // Stats can be calculated from daily performance data when needed

    } catch (error) {
      console.error('Supabase storage error:', error);
      throw error;
    }
  }

  // Get engine ON/OFF times for the day
  async getEngineOnOffTimes(plate, date) {
    try {
      // Get first engine ON time of the day
      const { data: engineOnData, error: onError } = await supabase
        .from('eps_vehicles')
        .select('loc_time')
        .eq('plate', plate)
        .gte('loc_time', `${date}T00:00:00`)
        .lt('loc_time', `${date}T23:59:59`)
        .or('name_event.ilike.%ENGINE ON%,name_event.ilike.%IGNITION ON%')
        .order('loc_time', { ascending: true })
        .limit(1);
      
      if (onError) throw onError;
      
      // Get last engine OFF time of the day
      const { data: engineOffData, error: offError } = await supabase
        .from('eps_vehicles')
        .select('loc_time')
        .eq('plate', plate)
        .gte('loc_time', `${date}T00:00:00`)
        .lt('loc_time', `${date}T23:59:59`)
        .or('name_event.ilike.%ENGINE OFF%,name_event.ilike.%IGNITION OFF%')
        .order('loc_time', { ascending: false })
        .limit(1);
      
      if (offError) throw offError;
      
      return {
        engineOnTime: engineOnData.length > 0 ? engineOnData[0].loc_time : null,
        engineOffTime: engineOffData.length > 0 ? engineOffData[0].loc_time : null
      };
    } catch (error) {
      console.error('Error getting engine ON/OFF times:', error);
      return {
        engineOnTime: null,
        engineOffTime: null
      };
    }
  }

  // Parse fuel data from last hex segment in rawMessage
  parseEPSFuelData(hexMessage) {
    if (!hexMessage || hexMessage.trim() === '') return null;
    
    const parts = hexMessage.split(',');
    if (parts.length < 11) return null;
    
    try {
      // Use EnergyRite structure: positions 4,6,8,10 for hex fuel data
      const levelHex = parts[4];      
      const volumeHex = parts[6];     
      const tempHex = parts[8];       
      const percentHex = parts[10];   
      
      console.log(`🔍 Fuel Hex - Level=${levelHex}, Volume=${volumeHex}, Temp=${tempHex}, Percent=${percentHex}`);
      
      return {
        fuel_level: (parseInt(levelHex, 16) / 10),
        fuel_volume: (parseInt(volumeHex, 16) / 10), 
        fuel_temperature: parseInt(tempHex, 16),
        fuel_percentage: Math.min(parseInt(percentHex, 16), 100)
      };
    } catch (error) {
      return null;
    }
  }

  // Core fuel calculations
  calculateFuelMetrics(epsData, previousFuelData = null) {
    // Parse fuel data ONLY from rawMessage hex data
    let parsedFuel = null;
    if (epsData.rawMessage) {
      const parts = epsData.rawMessage.split('|');
      const hexData = parts[parts.length - 1];
      if (hexData && hexData.includes(',')) {
        parsedFuel = this.parseEPSFuelData(hexData);
      }
    }
    
    // Use ONLY parsed hex data, ignore pre-parsed fields
    let fuelLevel = parsedFuel?.fuel_level || 0;
    let fuelVolume = parsedFuel?.fuel_volume || 0;
    let fuelPercentage = parsedFuel?.fuel_percentage || 0;
    let fuelTemp = parsedFuel?.fuel_temperature || 0;
    
    const metrics = {
      fuel_level: fuelLevel,
      fuel_volume: fuelVolume,
      fuel_percentage: fuelPercentage,
      fuel_temperature: fuelTemp,
      consumption_rate: 0,
      efficiency_kmpl: 0,
      fuel_cost: 0,
      theft_detected: false
    };

    if (previousFuelData) {
      const fuelUsed = (previousFuelData.fuel_level || 0) - (epsData.fuel_level || 0);
      const distanceTraveled = (epsData.Mileage || 0) - (previousFuelData.mileage || 0);
      const timeElapsed = new Date(epsData.LocTime) - new Date(previousFuelData.loc_time);
      
      // Fuel consumption rate (L/hour)
      if (timeElapsed > 0) {
        metrics.consumption_rate = (fuelUsed / (timeElapsed / 3600000)).toFixed(2);
      }
      
      // Fuel efficiency (km/L)
      if (fuelUsed > 0 && distanceTraveled > 0) {
        metrics.efficiency_kmpl = (distanceTraveled / fuelUsed).toFixed(2);
      }
      
      // Fuel theft detection (sudden drop > 20L)
      if (fuelUsed > 20 && distanceTraveled < 5) {
        metrics.theft_detected = true;
      }
      
      // Fuel cost (assuming R20/L)
      metrics.fuel_cost = (fuelUsed * 20).toFixed(2);
    }

    return metrics;
  }

  // Store fuel data hourly
  async storeFuelDataHourly(epsData) {
    try {
      // Only store if we have rawMessage with hex data
      if (!epsData.rawMessage || !epsData.rawMessage.includes(',')) {
        return;
      }
      
      const plate = epsData.Plate;
      const now = Date.now();
      const lastStored = this.lastFuelStorage.get(plate) || 0;
      
      // Only store once per hour
      if (now - lastStored < this.FUEL_STORAGE_INTERVAL) {
        return;
      }
      
      // Get previous fuel data for calculations
      const { data: previousData } = await supabase
        .from('eps_fuel_data')
        .select('*')
        .eq('plate', plate)
        .order('loc_time', { ascending: false })
        .limit(1);
      
      const fuelMetrics = this.calculateFuelMetrics(epsData, previousData?.[0]);
      
      // Don't update if no fuel data was parsed
      if (!fuelMetrics.fuel_level && !fuelMetrics.fuel_volume) {
        return;
      }
      
      const { error } = await supabase
        .from('eps_fuel_data')
        .upsert({
          plate: epsData.Plate,
          driver_name: epsData.DriverName,
          fuel_level: fuelMetrics.fuel_level,
          fuel_volume: fuelMetrics.fuel_volume,
          fuel_temperature: fuelMetrics.fuel_temperature,
          fuel_percentage: fuelMetrics.fuel_percentage,
          engine_status: epsData.engine_status,
          loc_time: epsData.LocTime || new Date().toISOString(),
          latitude: epsData.Latitude,
          longitude: epsData.Longitude
        }, {
          onConflict: 'plate'
        });
      
      if (error) throw error;
      
      // Update last storage time
      this.lastFuelStorage.set(plate, now);
      
      console.log(`✅ Stored fuel data for ${epsData.Plate}: Level=${fuelMetrics.fuel_level}L, Volume=${fuelMetrics.fuel_volume}L`);
    } catch (error) {
      console.error('Error storing EPS fuel data:', error);
    }
  }

  // Store daily fuel summary
  async storeDailyFuelSummary(epsData, date) {
    try {
      const { data: dailyFuel } = await supabase
        .from('eps_fuel_data')
        .select('*')
        .eq('plate', epsData.Plate)
        .gte('loc_time', `${date}T00:00:00`)
        .lt('loc_time', `${date}T23:59:59`)
        .order('loc_time');
      
      if (dailyFuel.length < 2) return;
      
      const startFuel = dailyFuel[0].fuel_level || 0;
      const endFuel = dailyFuel[dailyFuel.length - 1].fuel_level || 0;
      const totalConsumption = startFuel - endFuel;
      const avgEfficiency = dailyFuel.reduce((sum, d) => sum + (parseFloat(d.efficiency_kmpl) || 0), 0) / dailyFuel.length;
      const totalCost = dailyFuel.reduce((sum, d) => sum + (parseFloat(d.fuel_cost) || 0), 0);
      const theftIncidents = dailyFuel.filter(d => d.theft_detected).length;
      
      await supabase
        .from('eps_daily_fuel_summary')
        .upsert({
          plate: epsData.Plate,
          driver_name: epsData.DriverName,
          date: date,
          start_fuel_level: startFuel,
          end_fuel_level: endFuel,
          total_consumption: totalConsumption,
          average_efficiency: avgEfficiency.toFixed(2),
          total_fuel_cost: totalCost.toFixed(2),
          theft_incidents: theftIncidents,
          last_update: new Date().toISOString()
        }, {
          onConflict: 'plate,date'
        });
    } catch (error) {
      console.error('Error storing daily fuel summary:', error);
    }
  }

  // Get driver performance data for reports
  async getDriverPerformanceReport(driverName, startDate, endDate) {
    try {
      const { data, error } = await supabase
        .from('eps_daily_performance')
        .select('*')
        .eq('driver_name', driverName)
        .gte('latest_loc_time', startDate)
        .lte('latest_loc_time', endDate);
      
      if (error) throw error;
      
      if (data.length === 0) return null;
      
      // Aggregate the data
      const report = {
        plate: data[0].plate,
        driver_name: driverName,
        total_kilometers: data.reduce((sum, d) => sum + (d.latest_mileage || 0), 0),
        total_trips: data.length,
        average_speed: data.reduce((sum, d) => sum + (d.latest_speed || 0), 0) / data.length,
        speeding_incidents: data.filter(d => d.latest_speed > 80).length,
        high_speed_incidents: data.filter(d => d.latest_speed > 100).length,
        route_violations: data.filter(d => !d.route_compliance).length,
        time_violations: data.filter(d => !d.time_compliance).length,
        total_points: data.reduce((sum, d) => sum + (d.total_risk_score || 0), 0),
        average_efficiency: data.reduce((sum, d) => sum + (d.efficiency || 0), 0) / data.length,
        average_safety_score: data.reduce((sum, d) => sum + (d.safety_score || 0), 0) / data.length
      };
      
      return report;
    } catch (error) {
      console.error('Error getting driver performance report:', error);
      throw error;
    }
  }

  // Get fleet performance data for reports
  async getFleetPerformanceReport(startDate, endDate) {
    try {
      const { data, error } = await supabase
        .from('eps_daily_performance')
        .select('*')
        .gte('latest_loc_time', startDate)
        .lte('latest_loc_time', endDate);
      
      if (error) throw error;
      
      // Group by driver and aggregate
      const driverMap = new Map();
      
      data.forEach(record => {
        const driverName = record.driver_name;
        if (!driverMap.has(driverName)) {
          driverMap.set(driverName, {
            driver_name: driverName,
            total_kilometers: 0,
            total_trips: 0,
            total_speed: 0,
            speeding_incidents: 0,
            high_speed_incidents: 0,
            route_violations: 0,
            time_violations: 0,
            total_points: 0,
            total_efficiency: 0,
            total_safety_score: 0
          });
        }
        
        const driver = driverMap.get(driverName);
        driver.total_kilometers += record.latest_mileage || 0;
        driver.total_trips += 1;
        driver.total_speed += record.latest_speed || 0;
        driver.speeding_incidents += record.latest_speed > 80 ? 1 : 0;
        driver.high_speed_incidents += record.latest_speed > 100 ? 1 : 0;
        driver.route_violations += !record.route_compliance ? 1 : 0;
        driver.time_violations += !record.time_compliance ? 1 : 0;
        driver.total_points += record.total_risk_score || 0;
        driver.total_efficiency += record.efficiency || 0;
        driver.total_safety_score += record.safety_score || 0;
      });
      
      // Convert to array and calculate averages
      const reports = Array.from(driverMap.values()).map(driver => ({
        ...driver,
        average_speed: driver.total_trips > 0 ? driver.total_speed / driver.total_trips : 0,
        average_efficiency: driver.total_trips > 0 ? driver.total_efficiency / driver.total_trips : 0,
        average_safety_score: driver.total_trips > 0 ? driver.total_safety_score / driver.total_trips : 0
      }));
      
      // Sort by total points descending
      return reports.sort((a, b) => b.total_points - a.total_points);
    } catch (error) {
      console.error('Error getting fleet performance report:', error);
      throw error;
    }
  }

  // Get daily performance data for MTD reports
  async getDailyPerformanceReport(startDate, endDate) {
    try {
      const { data, error } = await supabase
        .from('eps_daily_performance')
        .select('*')
        .gte('date', startDate.split('T')[0])
        .lte('date', endDate.split('T')[0]);
      
      if (error) throw error;
      
      // Group by date and aggregate
      const dateMap = new Map();
      
      data.forEach(record => {
        const date = record.date;
        if (!dateMap.has(date)) {
          dateMap.set(date, {
            date: date,
            total_kilometers: 0,
            speeding_incidents: 0,
            route_violations: 0,
            time_violations: 0,
            total_points: 0
          });
        }
        
        const dayData = dateMap.get(date);
        dayData.total_kilometers += record.latest_mileage || 0;
        dayData.speeding_incidents += record.latest_speed > 80 ? 1 : 0;
        dayData.route_violations += !record.route_compliance ? 1 : 0;
        dayData.time_violations += !record.time_compliance ? 1 : 0;
        dayData.total_points += record.total_risk_score || 0;
      });
      
      // Convert to array and sort by date
      return Array.from(dateMap.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
    } catch (error) {
      console.error('Error getting daily performance report:', error);
      throw error;
    }
  }
  
  // Create daily snapshot of all driver data
  async createDailySnapshot() {
    try {
      const today = new Date().toISOString().split('T')[0];
      // Get all current driver rewards
      const { data: drivers, error } = await supabase
        .from('eps_driver_rewards')
        .select('*');
      
      if (error) throw error;
      
      // Create snapshot for each driver
      const snapshots = drivers.map(driver => ({
        driver_name: driver.driver_name,
        snapshot_date: today,
        current_points: driver.current_points,
        points_deducted: driver.points_deducted,
        current_level: driver.current_level,
        speed_violations: driver.speed_violations_count,
        harsh_braking_violations: driver.harsh_braking_count,
        night_driving_violations: driver.night_driving_count,
        route_violations: driver.route_violations_count,
        other_violations: driver.other_violations_count,
        total_violations: (driver.speed_violations_count || 0) + 
                         (driver.harsh_braking_count || 0) + 
                         (driver.night_driving_count || 0) + 
                         (driver.route_violations_count || 0) + 
                         (driver.other_violations_count || 0)
      }));
      
      // Store snapshots
      const { error: insertError } = await supabase
        .from('eps_daily_snapshots')
        .insert(snapshots);
      
      if (insertError) throw insertError;
    } catch (error) {
      console.error('Error creating daily snapshot:', error);
    }
  }
  
  // Get monthly driver statistics
  async getMonthlyDriverStats(driverName, year, month) {
    try {
      const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('eps_daily_snapshots')
        .select('*')
        .eq('driver_name', driverName)
        .gte('snapshot_date', startDate)
        .lte('snapshot_date', endDate)
        .order('snapshot_date');
      
      if (error) throw error;
      
      if (data.length === 0) return null;
      
      const latest = data[data.length - 1];
      const earliest = data[0];
      
      return {
        driver_name: driverName,
        month: `${year}-${month.toString().padStart(2, '0')}`,
        current_points: latest.current_points,
        current_level: latest.current_level,
        monthly_violations: {
          speed: latest.speed_violations - (earliest.speed_violations || 0),
          harsh_braking: latest.harsh_braking_violations - (earliest.harsh_braking_violations || 0),
          night_driving: latest.night_driving_violations - (earliest.night_driving_violations || 0),
          route: latest.route_violations - (earliest.route_violations || 0),
          other: latest.other_violations - (earliest.other_violations || 0)
        },
        points_deducted_this_month: latest.points_deducted - (earliest.points_deducted || 0),
        risk_trend: this.calculateRiskTrend(data)
      };
    } catch (error) {
      console.error('Error getting monthly driver stats:', error);
      throw error;
    }
  }
  
  // Get fleet monthly risk score
  async getFleetMonthlyRiskScore(year, month) {
    try {
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('eps_daily_snapshots')
        .select('*')
        .eq('snapshot_date', endDate);
      
      if (error) throw error;
      
      const totalDrivers = data.length;
      const avgPoints = data.reduce((sum, d) => sum + d.current_points, 0) / totalDrivers;
      const totalViolations = data.reduce((sum, d) => sum + d.total_violations, 0);
      
      const riskLevels = {
        Gold: data.filter(d => d.current_points >= 80).length,
        Silver: data.filter(d => d.current_points >= 60 && d.current_points < 80).length,
        Bronze: data.filter(d => d.current_points >= 40 && d.current_points < 60).length,
        Critical: data.filter(d => d.current_points < 40).length
      };
      
      return {
        month: `${year}-${month.toString().padStart(2, '0')}`,
        total_drivers: totalDrivers,
        average_points: Math.round(avgPoints * 100) / 100,
        total_violations: totalViolations,
        risk_distribution: riskLevels,
        fleet_risk_score: this.calculateFleetRiskScore(avgPoints, totalViolations, totalDrivers)
      };
    } catch (error) {
      console.error('Error getting fleet monthly risk score:', error);
      throw error;
    }
  }
  
  // Calculate risk trend from daily snapshots
  calculateRiskTrend(snapshots) {
    if (snapshots.length < 2) return 'stable';
    
    const recent = snapshots.slice(-7); // Last 7 days
    const pointsChange = recent[recent.length - 1].current_points - recent[0].current_points;
    
    if (pointsChange <= -5) return 'deteriorating';
    if (pointsChange >= 5) return 'improving';
    return 'stable';
  }
  
  // Calculate fleet risk score
  calculateFleetRiskScore(avgPoints, totalViolations, totalDrivers) {
    const pointsScore = (avgPoints / 100) * 70; // 70% weight on points
    const violationScore = Math.max(0, 30 - (totalViolations / totalDrivers) * 5); // 30% weight on violations
    
    return Math.round((pointsScore + violationScore) * 100) / 100;
  }
}

module.exports = EPSRewardSystem;
module.exports.supabase = supabase;

