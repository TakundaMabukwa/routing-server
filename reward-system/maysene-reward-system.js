const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_MAYSENE_SUPABASE_URL,
  process.env.NEXT_PUBLIC_MAYSENE_SUPABASE_ANON_KEY
);

class MayseneRewardSystem {
  constructor() {
    this.serverTimeOffset = -1;
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

  // Use driver name as-is, just like EPS
  cleanDriverName(driverName) {
    if (!driverName) return null;
    return driverName.trim();
  }

  // Get or create driver rewards record (case-insensitive)
  async getDriverRewards(driverName) {
    try {
      const cleanedName = this.cleanDriverName(driverName);
      
      if (!cleanedName) {
        return null;
      }
      
      const { data, error } = await supabase
        .from('eps_driver_rewards')
        .upsert({
          driver_name: cleanedName,
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
        .select()
        .ilike('driver_name', cleanedName);
      
      if (error) throw error;
      return data?.[0];
    } catch (error) {
      console.error('Error getting Maysene driver rewards:', error);
      throw error;
    }
  }

  // Process violation
  async processViolation(driverName, plate, violationType) {
    try {
      const cleanedName = this.cleanDriverName(driverName);
      if (!cleanedName) return null;
      
      let driver = await this.getDriverRewards(cleanedName);
      if (!driver) return null;
      
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
      
      if (!violationField) return driver;
      
      const currentCount = (driver[violationField] || 0) + 1;
      const threshold = this.VIOLATION_THRESHOLDS[violationType];
      
      let pointsDeducted = 0;
      let thresholdExceeded = driver[thresholdField] || false;
      
      if (currentCount > threshold) {
        pointsDeducted = this.POINTS_PER_VIOLATION;
        thresholdExceeded = true;
        console.log(`🚨 [MAYSENE] ${cleanedName} (${plate}): ${violationType} #${currentCount} - DEDUCTING ${pointsDeducted} point`);
      } else {
        console.log(`⚠️ [MAYSENE] ${cleanedName} (${plate}): ${violationType} #${currentCount} - FREE PASS (${threshold - currentCount} remaining)`);
      }
      
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
      
      await this.updateDriverRewards(cleanedName, updateData);
      
      return { ...driver, ...updateData };
    } catch (error) {
      console.error('Error processing Maysene violation:', error);
      throw error;
    }
  }

  calculateLevel(points) {
    if (points >= 80) return 'Gold';
    if (points >= 60) return 'Silver';
    if (points >= 40) return 'Bronze';
    return 'Critical';
  }

  async updateDriverRewards(driverName, updates) {
    try {
      const { data, error } = await supabase
        .from('eps_driver_rewards')
        .update({
          ...updates,
          last_updated: new Date().toISOString()
        })
        .ilike('driver_name', driverName)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating Maysene driver rewards:', error);
      throw error;
    }
  }

  async processViolations(vehicleData) {
    const violations = [];
    const plate = vehicleData.Plate;
    const cleanedName = this.cleanDriverName(vehicleData.DriverName);
    
    if (!plate || !cleanedName) return violations;
    
    // Speed violations
    if (vehicleData.Speed > 120) {
      const driver = await this.processViolation(cleanedName, plate, 'SPEED');
      if (driver) {
        violations.push({
          type: 'speed_violation',
          category: 'SPEED',
          value: vehicleData.Speed,
          threshold: 120,
          violation_count: driver.speed_violations_count,
          points_remaining: driver.current_points
        });
      }
    }

    // Night driving (10 PM to 5 AM)
    const locTimeAdjusted = new Date(new Date(vehicleData.LocTime).getTime() + (this.serverTimeOffset * 60 * 60 * 1000));
    const hour = locTimeAdjusted.getHours();
    
    if (hour >= 22 || hour <= 5) {
      const driver = await this.processViolation(cleanedName, plate, 'NIGHT_DRIVING');
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

    return violations;
  }

  async processMayseneData(vehicleData) {
    try {
      const cleanedName = this.cleanDriverName(vehicleData.DriverName);
      
      if (!cleanedName || !vehicleData.Plate) {
        return null;
      }

      const violations = await this.processViolations(vehicleData);
      
      return { violations, driverName: cleanedName };
    } catch (error) {
      console.error('Error processing Maysene data:', error);
      throw error;
    }
  }
}

module.exports = MayseneRewardSystem;
