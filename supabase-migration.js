const { createClient } = require('@supabase/supabase-js');

// Supabase client configuration
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
);

class SupabaseEPSRewardSystem {
  constructor() {
    this.supabase = supabase;
    this.serverTimeOffset = -2;
    
    // 100-point deduction system with thresholds
    this.STARTING_POINTS = 100;
    this.POINTS_PER_VIOLATION = 1;
    this.VIOLATION_THRESHOLDS = {
      SPEED: 4,
      HARSH_BRAKING: 4,
      NIGHT_DRIVING: 4,
      ROUTE: 4,
      OTHER: 4
    };
  }

  // Process violation and deduct points after threshold
  async processViolation(driverName, plate, violationType) {
    try {
      // Get or create driver record
      let driver = await this.getDriverRewards(driverName);
      
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
      
      const currentCount = (driver[violationField] || 0) + 1;
      const threshold = this.VIOLATION_THRESHOLDS[violationType];
      
      let pointsDeducted = 0;
      let thresholdExceeded = driver[thresholdField] || false;
      
      if (currentCount > threshold) {
        pointsDeducted = this.POINTS_PER_VIOLATION;
        thresholdExceeded = true;
        console.log(`🚨 ${driverName} (${plate}): ${violationType} violation #${currentCount} - DEDUCTING ${pointsDeducted} point`);
      } else {
        console.log(`⚠️ ${driverName} (${plate}): ${violationType} violation #${currentCount} - FREE PASS`);
      }
      
      const newPoints = Math.max(0, (driver.current_points || this.STARTING_POINTS) - pointsDeducted);
      const newLevel = this.calculateLevel(newPoints);
      
      await this.updateDriverRewards(driverName, {
        [violationField]: currentCount,
        [thresholdField]: thresholdExceeded,
        current_points: newPoints,
        points_deducted: (driver.points_deducted || 0) + pointsDeducted,
        current_level: newLevel
      });
      
      return {
        ...driver,
        [violationField]: currentCount,
        current_points: newPoints,
        current_level: newLevel
      };
      
    } catch (error) {
      console.error('Error processing violation:', error);
      throw error;
    }
  }

  // Get or create driver rewards record
  async getDriverRewards(driverName) {
    try {
      const { data, error } = await this.supabase
        .from('eps_driver_rewards')
        .select('*')
        .eq('driver_name', driverName)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      if (data) {
        return data;
      }
      
      // Create new driver with 100 points
      const { data: newDriver, error: insertError } = await this.supabase
        .from('eps_driver_rewards')
        .insert({
          driver_name: driverName,
          current_points: this.STARTING_POINTS,
          points_deducted: 0,
          current_level: 'Gold',
          speed_violations_count: 0,
          harsh_braking_count: 0,
          night_driving_count: 0,
          route_violations_count: 0,
          other_violations_count: 0
        })
        .select()
        .single();
      
      if (insertError) throw insertError;
      
      console.log(`✅ Created new driver: ${driverName} with ${this.STARTING_POINTS} points`);
      return newDriver;
      
    } catch (error) {
      console.error('Error getting driver rewards:', error);
      throw error;
    }
  }

  // Update driver rewards record
  async updateDriverRewards(driverName, updates) {
    try {
      const { data, error } = await this.supabase
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

  // Calculate performance level
  calculateLevel(points) {
    if (points >= 80) return 'Gold';
    if (points >= 60) return 'Silver';
    if (points >= 40) return 'Bronze';
    return 'Critical';
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

      const isDriving = this.isVehicleDriving(epsData);
      
      if (!isDriving) {
        console.log(`Vehicle ${plate} is not driving, skipping processing`);
        return null;
      }

      // Store vehicle data
      await this.storeVehicleData(epsData);

      // Process violations
      const violations = await this.processViolations(epsData);
      
      // Calculate performance
      const performance = this.calculatePerformance(epsData);
      
      // Calculate driver score
      const driverScore = await this.calculateDriverScore(epsData, violations, performance);

      // Store daily summaries
      await this.storeDailySummaries(epsData, violations, performance, driverScore);

      return { violations, performance, driverScore, isDriving };
    } catch (error) {
      console.error('Error processing EPS data:', error);
      throw error;
    }
  }

  // Store vehicle data in Supabase
  async storeVehicleData(epsData) {
    try {
      const { error } = await this.supabase
        .from('eps_vehicles')
        .upsert({
          plate: epsData.Plate,
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
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'driver_name'
        });
      
      if (error) throw error;
      
    } catch (error) {
      console.error('Error storing vehicle data:', error);
      throw error;
    }
  }

  // Process violations
  async processViolations(epsData) {
    const violations = [];
    
    if (!this.isVehicleDriving(epsData)) {
      return violations;
    }
    
    // Speed violations
    if (epsData.Speed > 120) {
      const driver = await this.processViolation(epsData.DriverName, epsData.Plate, 'SPEED');
      violations.push({
        type: 'speed_violation',
        category: 'SPEED',
        value: epsData.Speed,
        threshold: 120,
        points_remaining: driver.current_points
      });
    }

    // Night driving violations
    const hour = new Date(epsData.LocTime).getHours();
    if (hour >= 22 || hour <= 6) {
      const driver = await this.processViolation(epsData.DriverName, epsData.Plate, 'NIGHT_DRIVING');
      violations.push({
        type: 'night_driving_violation',
        category: 'NIGHT_DRIVING',
        value: hour,
        points_remaining: driver.current_points
      });
    }

    return violations;
  }

  // Store daily summaries
  async storeDailySummaries(epsData, violations, performance, driverScore) {
    try {
      const currentDate = new Date(epsData.LocTime).toISOString().split('T')[0];
      
      // Store daily performance
      await this.supabase
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

      // Store daily violations
      await this.supabase
        .from('eps_daily_violations')
        .upsert({
          plate: epsData.Plate,
          driver_name: epsData.DriverName,
          date: currentDate,
          speeding_count: violations.filter(v => v.type === 'speed_violation').length,
          excessive_night_count: violations.filter(v => v.type === 'night_driving_violation').length,
          total_violations: violations.length,
          last_violation_time: violations.length > 0 ? new Date().toISOString() : null
        }, {
          onConflict: 'driver_name,date'
        });
      
    } catch (error) {
      console.error('Error storing daily summaries:', error);
      throw error;
    }
  }

  // Helper methods
  isVehicleDriving(epsData) {
    const nameEvent = epsData.NameEvent ? epsData.NameEvent.toUpperCase() : '';
    const statuses = epsData.Statuses ? epsData.Statuses.toUpperCase() : '';
    
    if (nameEvent.includes('IGNITION OFF') || 
        nameEvent.includes('ENGINE OFF') || 
        nameEvent.includes('STATIONARY')) {
      return false;
    }
    
    const hasDrivingEvent = nameEvent.includes('VEHICLE IN MOTION') || 
                           nameEvent.includes('ENGINE ON') ||
                           statuses.includes('ENGINE ON');
    
    return epsData.Speed > 5 || hasDrivingEvent;
  }

  calculatePerformance(epsData) {
    return {
      speedCompliance: epsData.Speed <= 80,
      routeCompliance: true, // Simplified for now
      timeCompliance: this.isWithinWorkingHours(epsData.LocTime),
      efficiency: this.calculateEfficiency(epsData),
      safetyScore: this.calculateSafetyScore(epsData)
    };
  }

  async calculateDriverScore(epsData, violations, performance) {
    const driver = await this.getDriverRewards(epsData.DriverName);
    
    return {
      currentPoints: driver.current_points,
      pointsDeducted: driver.points_deducted,
      violationCount: violations.length,
      level: driver.current_level,
      violations: {
        speed: driver.speed_violations_count,
        night_driving: driver.night_driving_count
      }
    };
  }

  isWithinWorkingHours(locTime) {
    const hour = new Date(locTime).getHours();
    return hour >= 6 && hour <= 22;
  }

  calculateEfficiency(epsData) {
    const optimalSpeed = 60;
    return Math.max(0, 1 - Math.abs(epsData.Speed - optimalSpeed) / optimalSpeed);
  }

  calculateSafetyScore(epsData) {
    let score = 1.0;
    if (epsData.Speed > 80) score -= 0.2;
    if (epsData.Speed > 100) score -= 0.3;
    
    const hour = new Date(epsData.LocTime).getHours();
    if (hour >= 22 || hour <= 6) score -= 0.1;
    
    return Math.max(0, score);
  }
}

module.exports = SupabaseEPSRewardSystem;