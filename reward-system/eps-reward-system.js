require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const Database = require('better-sqlite3');
const path = require('path');

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_EPS_SUPABASE_URL,
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
    
    // Local driver state (in-memory only)
    this.driverStates = new Map();
    
    // SQLite local database
    this.initLocalDB();
    
    // Hourly Supabase sync
    this.lastSupabaseSync = 0;
    this.SUPABASE_SYNC_INTERVAL = 60 * 60 * 1000; // 1 hour
    
    // Daily snapshot timer
    this.setupDailySnapshot()
    this.setupHourlySync()
  }
  
  // Initialize local SQLite database
  initLocalDB() {
    const dbPath = path.join(__dirname, '..', 'eps-rewards.db');
    this.db = new Database(dbPath);
    
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS driver_rewards (
        driver_name TEXT PRIMARY KEY,
        current_points INTEGER,
        points_deducted INTEGER,
        current_level TEXT,
        speed_violations_count INTEGER,
        harsh_braking_count INTEGER,
        night_driving_count INTEGER,
        route_violations_count INTEGER,
        other_violations_count INTEGER,
        last_updated TEXT,
        synced_to_supabase INTEGER DEFAULT 0
      )
    `);
    
    console.log('📦 EPS Rewards local database initialized');
  }

  // Setup hourly Supabase sync
  setupHourlySync() {
    setInterval(() => this.syncToSupabase(), this.SUPABASE_SYNC_INTERVAL);
    console.log('⏰ Hourly Supabase sync enabled');
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

  // Calculate performance level based on remaining points
  calculateLevel(points) {
    if (points >= 80) return 'Gold';      // 80-100 points
    if (points >= 60) return 'Silver';    // 60-79 points  
    if (points >= 40) return 'Bronze';    // 40-59 points
    return 'Critical';                    // 0-39 points
  }

  // Validate if string is a real name (not address)
  isValidDriverName(name) {
    if (!name) return false;
    const upper = name.toUpperCase();
    
    // Skip invalid names
    if (upper === 'UNKNOWN' || upper === 'NULL') return false;
    
    // Skip if it looks like an address
    if (name.includes('Street') || name.includes('Road') || name.includes('Avenue') ||
        name.includes('Drive') || name.includes('South Africa') || name.includes(',')) {
      return false;
    }
    
    return true;
  }

  // Get local driver state (no database calls)
  getLocalDriverState(driverName) {
    const key = driverName.toLowerCase();
    if (!this.driverStates.has(key)) {
      this.driverStates.set(key, {
        driver_name: driverName,
        current_points: this.STARTING_POINTS,
        points_deducted: 0,
        current_level: 'Gold',
        speed_violations_count: 0,
        harsh_braking_count: 0,
        night_driving_count: 0,
        route_violations_count: 0,
        other_violations_count: 0,
        last_updated: new Date().toISOString()
      });
    }
    return this.driverStates.get(key);
  }

  // Process EPS data and calculate rewards
  async processEPSData(epsData) {
    try {
      const { Plate: plate, DriverName: driverName } = epsData;
      
      if (!driverName || !this.isValidDriverName(driverName)) {
        return null;
      }

      // Check if vehicle is actually driving
      if (!this.isVehicleDriving(epsData)) {
        return null;
      }

      // Process violations in memory only
      const violations = this.processViolationsLocal(epsData);
      
      // Only write to local database if there are violations
      if (violations.length > 0) {
        this.writeViolationsToLocalDB(driverName, violations);
      }

      return { violations, isDriving: true };
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

  // Process violations locally (no database calls)
  processViolationsLocal(epsData) {
    const violations = [];
    const driverName = epsData.DriverName;
    
    // Get or create local driver state
    const driverState = this.getLocalDriverState(driverName);
    
    // Speed violations
    if (epsData.Speed > 120) {
      driverState.speed_violations_count++;
      if (driverState.speed_violations_count > this.VIOLATION_THRESHOLDS.SPEED) {
        driverState.current_points = Math.max(0, driverState.current_points - this.POINTS_PER_VIOLATION);
        driverState.points_deducted++;
      }
      violations.push({
        type: 'speed_violation',
        category: 'SPEED',
        value: epsData.Speed,
        violation_count: driverState.speed_violations_count,
        points_remaining: driverState.current_points
      });
    }

    // Harsh braking violations
    if (epsData.NameEvent && epsData.NameEvent.toUpperCase().includes('HARSH BRAKING')) {
      driverState.harsh_braking_count++;
      if (driverState.harsh_braking_count > this.VIOLATION_THRESHOLDS.HARSH_BRAKING) {
        driverState.current_points = Math.max(0, driverState.current_points - this.POINTS_PER_VIOLATION);
        driverState.points_deducted++;
      }
      violations.push({
        type: 'harsh_braking_violation',
        category: 'HARSH_BRAKING',
        violation_count: driverState.harsh_braking_count,
        points_remaining: driverState.current_points
      });
    }

    // Night driving violations
    const locTimeAdjusted = new Date(new Date(epsData.LocTime).getTime() + (this.serverTimeOffset * 60 * 60 * 1000));
    const hour = locTimeAdjusted.getHours();
    
    if (hour >= 22 || hour <= 5) {
      driverState.night_driving_count++;
      if (driverState.night_driving_count > this.VIOLATION_THRESHOLDS.NIGHT_DRIVING) {
        driverState.current_points = Math.max(0, driverState.current_points - this.POINTS_PER_VIOLATION);
        driverState.points_deducted++;
      }
      violations.push({
        type: 'night_driving_violation',
        category: 'NIGHT_DRIVING',
        violation_count: driverState.night_driving_count,
        points_remaining: driverState.current_points
      });
    }

    // Update driver level
    driverState.current_level = this.calculateLevel(driverState.current_points);
    
    return violations;
  }

  // Write violations to local SQLite only
  writeViolationsToLocalDB(driverName, violations) {
    try {
      const driverState = this.getLocalDriverState(driverName);
      
      // Store in local SQLite database
      this.db.prepare(`
        INSERT OR REPLACE INTO driver_rewards (
          driver_name, current_points, points_deducted, current_level,
          speed_violations_count, harsh_braking_count, night_driving_count,
          route_violations_count, other_violations_count, last_updated, synced_to_supabase
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(
        driverName,
        driverState.current_points,
        driverState.points_deducted,
        driverState.current_level,
        driverState.speed_violations_count,
        driverState.harsh_braking_count,
        driverState.night_driving_count,
        driverState.route_violations_count,
        driverState.other_violations_count,
        new Date().toISOString()
      );
      
      console.log(`📝 ${driverName}: ${violations.length} violations - Points: ${driverState.current_points} (local)`);
      
    } catch (error) {
      console.error('Error writing to local database:', error);
    }
  }

  // Sync all unsynced data to Supabase (hourly)
  async syncToSupabase() {
    try {
      const unsyncedDrivers = this.db.prepare('SELECT * FROM driver_rewards WHERE synced_to_supabase = 0').all();
      
      if (unsyncedDrivers.length === 0) {
        console.log('✅ No unsynced driver data');
        return;
      }
      
      console.log(`☁️ Syncing ${unsyncedDrivers.length} drivers to Supabase...`);
      
      // Batch upsert to Supabase
      const { error } = await supabase
        .from('eps_driver_rewards')
        .upsert(unsyncedDrivers.map(driver => ({
          driver_name: driver.driver_name,
          current_points: driver.current_points,
          points_deducted: driver.points_deducted,
          current_level: driver.current_level,
          speed_violations_count: driver.speed_violations_count,
          harsh_braking_count: driver.harsh_braking_count,
          night_driving_count: driver.night_driving_count,
          route_violations_count: driver.route_violations_count,
          other_violations_count: driver.other_violations_count,
          last_updated: driver.last_updated
        })), {
          onConflict: 'driver_name'
        });
      
      if (error) throw error;
      
      // Mark as synced
      this.db.prepare('UPDATE driver_rewards SET synced_to_supabase = 1 WHERE synced_to_supabase = 0').run();
      
      console.log(`✅ Synced ${unsyncedDrivers.length} drivers to Supabase`);
      this.lastSupabaseSync = Date.now();
      
    } catch (error) {
      console.error('Error syncing to Supabase:', error);
    }
  }

  // Get driver rewards (for API compatibility)
  async getDriverRewards(driverName) {
    // First check local state
    const localState = this.driverStates.get(driverName.toLowerCase());
    if (localState) {
      return localState;
    }
    
    // Check local SQLite database
    const localDriver = this.db.prepare('SELECT * FROM driver_rewards WHERE driver_name = ?').get(driverName);
    if (localDriver) {
      this.driverStates.set(driverName.toLowerCase(), localDriver);
      return localDriver;
    }
    
    // If not in local storage, fetch from Supabase
    try {
      const { data, error } = await supabase
        .from('eps_driver_rewards')
        .select('*')
        .ilike('driver_name', driverName)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        // Cache in local state and SQLite
        this.driverStates.set(driverName.toLowerCase(), data);
        return data;
      }
      
      // Create new driver if not exists
      return this.getLocalDriverState(driverName);
    } catch (error) {
      console.error('Error getting driver rewards:', error);
      return this.getLocalDriverState(driverName);
    }
  }

  // Process batch (for API compatibility)
  async processBatch() {
    // In the new system, violations are written immediately to local DB
    // This method exists for compatibility but does nothing
    return Promise.resolve();
  }

  // Create daily snapshot of all driver data
  async createDailySnapshot() {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Force sync to Supabase before snapshot
      await this.syncToSupabase();
      
      // Get all current driver rewards from local DB
      const drivers = this.db.prepare('SELECT * FROM driver_rewards').all();
      
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
      console.log(`📸 Daily snapshot created for ${snapshots.length} drivers`);
    } catch (error) {
      console.error('Error creating daily snapshot:', error);
    }
  }
}

module.exports = EPSRewardSystem;
module.exports.supabase = supabase;