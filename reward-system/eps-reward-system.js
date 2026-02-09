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
    
    // Bi-weekly reset (14 days)
    this.BIWEEKLY_RESET_INTERVAL = 14 * 24 * 60 * 60 * 1000;
    this.lastBiweeklyReset = this.getLastResetDate();
    
    // Setup timers
    this.setupHourlySync();
    this.setupBiweeklyReset();
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
        synced_to_supabase INTEGER DEFAULT 0,
        starting_mileage INTEGER,
        current_mileage INTEGER,
        biweek_start_date TEXT
      )
    `);
    
    // Store last reset date
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS system_config (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
    
    console.log('📦 EPS Rewards local database initialized');
  }

  // Get last reset date from database
  getLastResetDate() {
    try {
      const row = this.db.prepare('SELECT value FROM system_config WHERE key = ?').get('last_biweekly_reset');
      return row ? new Date(row.value) : new Date();
    } catch (error) {
      return new Date();
    }
  }

  // Save last reset date
  saveLastResetDate(date) {
    this.db.prepare(`
      INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)
    `).run('last_biweekly_reset', date.toISOString());
  }

  // Setup hourly Supabase sync
  setupHourlySync() {
    setInterval(() => this.syncToSupabase(), this.SUPABASE_SYNC_INTERVAL);
    console.log('⏰ Hourly Supabase sync enabled');
  }

  // Setup bi-weekly reset
  setupBiweeklyReset() {
    // Check if reset is needed on startup
    const now = new Date();
    const timeSinceReset = now - this.lastBiweeklyReset;
    
    if (timeSinceReset >= this.BIWEEKLY_RESET_INTERVAL) {
      console.log('🔄 Bi-weekly reset needed, executing now...');
      this.performBiweeklyReset();
    }
    
    // Schedule next reset
    const msUntilNextReset = this.BIWEEKLY_RESET_INTERVAL - (timeSinceReset % this.BIWEEKLY_RESET_INTERVAL);
    
    setTimeout(() => {
      this.performBiweeklyReset();
      // Set up recurring resets
      setInterval(() => this.performBiweeklyReset(), this.BIWEEKLY_RESET_INTERVAL);
    }, msUntilNextReset);
    
    console.log(`⏰ Bi-weekly reset scheduled in ${Math.floor(msUntilNextReset / (24 * 60 * 60 * 1000))} days`);
  }

  // Perform bi-weekly reset
  async performBiweeklyReset() {
    try {
      console.log('🔄 Starting bi-weekly reset...');
      
      // Clear in-memory state
      this.driverStates.clear();
      
      // Clear local SQLite database
      this.db.prepare('DELETE FROM driver_rewards').run();
      
      // Clear Supabase database
      const { error } = await supabase
        .from('eps_driver_rewards')
        .delete()
        .neq('driver_name', ''); // Delete all records
      
      if (error) throw error;
      
      // Update last reset date
      const now = new Date();
      this.lastBiweeklyReset = now;
      this.saveLastResetDate(now);
      
      console.log('✅ Bi-weekly reset completed - all drivers reset to 100 points');
    } catch (error) {
      console.error('Error performing bi-weekly reset:', error);
    }
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

  // Get or create local driver state (no database calls)
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
        last_updated: new Date().toISOString(),
        starting_mileage: null,
        current_mileage: null,
        biweek_start_date: null,
        daily_speed_count: 0,
        daily_braking_count: 0,
        daily_night_count: 0,
        last_daily_reset: new Date().toISOString().split('T')[0]
      });
    }
    return this.driverStates.get(key);
  }

  // Process EPS data and calculate rewards (auto-creates drivers)
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

      // Auto-create driver if doesn't exist (upsert behavior)
      const driverState = this.getLocalDriverState(driverName);
      
      // Process violations in memory only
      const violations = this.processViolationsLocal(epsData);
      
      // Always write to local database (creates or updates)
      this.writeViolationsToLocalDB(driverName, violations);

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
    const status = epsData.Status ? epsData.Status.toUpperCase() : '';
    
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
        statuses.includes('OFF') ||
        status.includes('STOPPED') ||
        status.includes('PARKED')) {
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
    const status = epsData.Status ? epsData.Status.toUpperCase() : '';
    
    // Get or create local driver state
    const driverState = this.getLocalDriverState(driverName);
    
    // Check if we need to reset daily counts (new day)
    const today = new Date().toISOString().split('T')[0];
    if (driverState.last_daily_reset !== today) {
      driverState.daily_speed_count = 0;
      driverState.daily_braking_count = 0;
      driverState.daily_night_count = 0;
      driverState.last_daily_reset = today;
    }
    
    // Track mileage for bi-weekly calculations
    if (epsData.Mileage) {
      const currentDate = new Date();
      const biweekStart = driverState.biweek_start_date ? new Date(driverState.biweek_start_date) : null;
      
      // Initialize bi-week tracking if not set or if 2 weeks have passed
      if (!biweekStart || (currentDate - biweekStart) > (14 * 24 * 60 * 60 * 1000)) {
        driverState.starting_mileage = epsData.Mileage;
        driverState.biweek_start_date = currentDate.toISOString();
      }
      driverState.current_mileage = epsData.Mileage;
    }

    // Speed violations - 4 free per day
    if (status.includes('SAFETY - SPEEDING') || status.includes('SPEEDING') || epsData.Speed > 120) {
      driverState.speed_violations_count++;
      driverState.daily_speed_count++;
      
      if (driverState.daily_speed_count > this.VIOLATION_THRESHOLDS.SPEED) {
        driverState.current_points = Math.max(0, driverState.current_points - this.POINTS_PER_VIOLATION);
        driverState.points_deducted++;
      }
      
      violations.push({
        type: 'speed_violation',
        category: 'SPEED',
        value: epsData.Speed,
        status: epsData.Status,
        violation_count: driverState.speed_violations_count,
        daily_count: driverState.daily_speed_count,
        points_remaining: driverState.current_points,
        penalty_applied: driverState.daily_speed_count > this.VIOLATION_THRESHOLDS.SPEED
      });
    }

    // Harsh braking violations - 4 free per day
    if (status.includes('SAFETY - HARSH BRAKING') || status.includes('HARSH BRAKING')) {
      driverState.harsh_braking_count++;
      driverState.daily_braking_count++;
      
      if (driverState.daily_braking_count > this.VIOLATION_THRESHOLDS.HARSH_BRAKING) {
        driverState.current_points = Math.max(0, driverState.current_points - this.POINTS_PER_VIOLATION);
        driverState.points_deducted++;
      }
      
      violations.push({
        type: 'harsh_braking_violation',
        category: 'HARSH_BRAKING',
        status: epsData.Status,
        violation_count: driverState.harsh_braking_count,
        daily_count: driverState.daily_braking_count,
        points_remaining: driverState.current_points,
        penalty_applied: driverState.daily_braking_count > this.VIOLATION_THRESHOLDS.HARSH_BRAKING
      });
    }

    // Night driving violations - 4 free per day
    const locTimeAdjusted = new Date(new Date(epsData.LocTime).getTime() + (this.serverTimeOffset * 60 * 60 * 1000));
    const hour = locTimeAdjusted.getHours();
    
    if (hour >= 22 || hour <= 5) {
      driverState.night_driving_count++;
      driverState.daily_night_count++;
      
      if (driverState.daily_night_count > this.VIOLATION_THRESHOLDS.NIGHT_DRIVING) {
        driverState.current_points = Math.max(0, driverState.current_points - this.POINTS_PER_VIOLATION);
        driverState.points_deducted++;
      }
      
      violations.push({
        type: 'night_driving_violation',
        category: 'NIGHT_DRIVING',
        violation_count: driverState.night_driving_count,
        daily_count: driverState.daily_night_count,
        points_remaining: driverState.current_points,
        penalty_applied: driverState.daily_night_count > this.VIOLATION_THRESHOLDS.NIGHT_DRIVING
      });
    }

    // Update driver level
    driverState.current_level = this.calculateLevel(driverState.current_points);
    
    return violations;
  }

  // Write violations to local SQLite only (upsert - creates if not exists)
  writeViolationsToLocalDB(driverName, violations) {
    try {
      const driverState = this.getLocalDriverState(driverName);
      
      // Always write to database (upsert behavior)
      this.db.prepare(`
        INSERT OR REPLACE INTO driver_rewards (
          driver_name, current_points, points_deducted, current_level,
          speed_violations_count, harsh_braking_count, night_driving_count,
          route_violations_count, other_violations_count, last_updated, synced_to_supabase,
          starting_mileage, current_mileage, biweek_start_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
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
        new Date().toISOString(),
        driverState.starting_mileage,
        driverState.current_mileage,
        driverState.biweek_start_date
      );
      
      if (violations.length > 0) {
        console.log(`📝 ${driverName}: ${violations.length} violations - Points: ${driverState.current_points}`);
      }
      
    } catch (error) {
      console.error('Error writing to local database:', error);
    }
  }

  // Get bi-weekly distance for a driver
  getBiWeeklyDistance(driverName) {
    const driverState = this.getLocalDriverState(driverName);
    if (!driverState.starting_mileage || !driverState.current_mileage) {
      return null;
    }
    return {
      starting_mileage: driverState.starting_mileage,
      current_mileage: driverState.current_mileage,
      distance_covered: driverState.current_mileage - driverState.starting_mileage,
      biweek_start_date: driverState.biweek_start_date
    };
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
          last_updated: driver.last_updated,
          starting_mileage: driver.starting_mileage,
          current_mileage: driver.current_mileage,
          biweek_start_date: driver.biweek_start_date
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
}

module.exports = EPSRewardSystem;
module.exports.supabase = supabase;