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

    // In-memory cache for active engine sessions (persisted in Supabase)
    this.engineSessions = new Map();
    this.SESSION_UPDATE_MILEAGE_STEP = 1; // persist when mileage changed by >= 1 km
    this.SESSION_UPDATE_MAX_INTERVAL_MS = 5 * 60 * 1000; // or every 5 minutes
    this.engineSessionTrackingEnabled = true;
    
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

    // Seed initial defaults for Supabase and SQLite on startup
    this.seedInitialDriverDefaults()
      .catch(error => console.error('Error during startup seeding:', error.message));
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

    this.ensureLocalDBSchema();
    
    // Store last reset date
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS system_config (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
    
    console.log('📦 EPS Rewards local database initialized');
  }

  ensureLocalDBSchema() {
    const columns = this.db.prepare('PRAGMA table_info(driver_rewards)').all().map(col => col.name);

    const addColumnIfMissing = (columnName, columnType) => {
      if (!columns.includes(columnName)) {
        this.db.exec(`ALTER TABLE driver_rewards ADD COLUMN ${columnName} ${columnType}`);
      }
    };

    addColumnIfMissing('starting_mileage', 'INTEGER');
    addColumnIfMissing('current_mileage', 'INTEGER');
    addColumnIfMissing('biweek_start_date', 'TEXT');
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

  normalizeDriverName(name) {
    return String(name || '').trim().replace(/\s+/g, ' ');
  }

  hydrateLocalStateFromRow(row) {
    const driverName = this.normalizeDriverName(row.driver_name);
    if (!driverName || !this.isValidDriverName(driverName)) {
      return;
    }

    const currentPoints = this.parseNumericValue(row.current_points);
    const points = currentPoints !== null ? currentPoints : this.STARTING_POINTS;
    const today = new Date().toISOString().split('T')[0];

    this.driverStates.set(driverName.toLowerCase(), {
      driver_name: driverName,
      current_points: points,
      points_deducted: this.parseNumericValue(row.points_deducted) ?? 0,
      current_level: row.current_level || this.calculateLevel(points),
      speed_violations_count: this.parseNumericValue(row.speed_violations_count) ?? 0,
      harsh_braking_count: this.parseNumericValue(row.harsh_braking_count) ?? 0,
      night_driving_count: this.parseNumericValue(row.night_driving_count) ?? 0,
      route_violations_count: this.parseNumericValue(row.route_violations_count) ?? 0,
      other_violations_count: this.parseNumericValue(row.other_violations_count) ?? 0,
      last_updated: row.last_updated || new Date().toISOString(),
      starting_mileage: this.parseNumericValue(row.starting_mileage),
      current_mileage: this.parseNumericValue(row.current_mileage),
      biweek_start_date: row.biweek_start_date || null,
      daily_speed_count: 0,
      daily_braking_count: 0,
      daily_night_count: 0,
      last_daily_reset: today
    });
  }

  buildSeedDrivers(rewardRows, vehicleRows, nowIso) {
    const drivers = new Map();

    const ensureDriver = (driverName) => {
      const normalizedName = this.normalizeDriverName(driverName);
      if (!normalizedName || !this.isValidDriverName(normalizedName)) {
        return null;
      }

      const key = normalizedName.toLowerCase();
      if (!drivers.has(key)) {
        drivers.set(key, {
          driver_name: normalizedName,
          plate: null,
          current_points: this.STARTING_POINTS,
          points_deducted: 0,
          current_level: 'Gold',
          speed_violations_count: 0,
          harsh_braking_count: 0,
          night_driving_count: 0,
          route_violations_count: 0,
          other_violations_count: 0,
          starting_mileage: null,
          current_mileage: null,
          biweek_start_date: null
        });
      }

      return drivers.get(key);
    };

    for (const row of rewardRows || []) {
      const seed = ensureDriver(row.driver_name);
      if (!seed) continue;

      const points = this.parseNumericValue(row.current_points);
      const startingMileage = this.parseNumericValue(row.starting_mileage);
      const currentMileage = this.parseNumericValue(row.current_mileage);

      seed.plate = row.plate || seed.plate || null;
      seed.current_points = points !== null ? points : seed.current_points;
      seed.points_deducted = this.parseNumericValue(row.points_deducted) ?? seed.points_deducted;
      seed.current_level = row.current_level || this.calculateLevel(seed.current_points);
      seed.speed_violations_count = this.parseNumericValue(row.speed_violations_count) ?? seed.speed_violations_count;
      seed.harsh_braking_count = this.parseNumericValue(row.harsh_braking_count) ?? seed.harsh_braking_count;
      seed.night_driving_count = this.parseNumericValue(row.night_driving_count) ?? seed.night_driving_count;
      seed.route_violations_count = this.parseNumericValue(row.route_violations_count) ?? seed.route_violations_count;
      seed.other_violations_count = this.parseNumericValue(row.other_violations_count) ?? seed.other_violations_count;
      seed.starting_mileage = startingMileage !== null ? startingMileage : seed.starting_mileage;
      seed.current_mileage = currentMileage !== null ? currentMileage : seed.current_mileage;
      seed.biweek_start_date = row.biweek_start_date || seed.biweek_start_date;
    }

    for (const row of vehicleRows || []) {
      const seed = ensureDriver(row.driver_name);
      if (!seed) continue;

      const vehicleMileage = this.parseNumericValue(row.mileage);
      seed.plate = seed.plate || row.plate || null;

      if (vehicleMileage !== null) {
        if (seed.current_mileage === null || vehicleMileage > seed.current_mileage) {
          seed.current_mileage = vehicleMileage;
        }

        if (seed.starting_mileage === null) {
          seed.starting_mileage = vehicleMileage;
        }
      }
    }

    return Array.from(drivers.values()).map(seed => {
      const baselineMileage = seed.current_mileage ?? seed.starting_mileage ?? 0;
      const points = this.parseNumericValue(seed.current_points) ?? this.STARTING_POINTS;

      return {
        ...seed,
        current_points: points,
        current_level: seed.current_level || this.calculateLevel(points),
        starting_mileage: seed.starting_mileage ?? baselineMileage,
        current_mileage: seed.current_mileage ?? baselineMileage,
        biweek_start_date: seed.biweek_start_date || nowIso
      };
    });
  }

  async seedSupabaseDriverRewards(seedDrivers, nowIso) {
    if (!seedDrivers || seedDrivers.length === 0) {
      return;
    }

    const payload = seedDrivers.map(driver => ({
      driver_name: driver.driver_name,
      plate: driver.plate,
      current_points: driver.current_points,
      points_deducted: driver.points_deducted,
      current_level: driver.current_level,
      speed_violations_count: driver.speed_violations_count,
      harsh_braking_count: driver.harsh_braking_count,
      night_driving_count: driver.night_driving_count,
      route_violations_count: driver.route_violations_count,
      other_violations_count: driver.other_violations_count,
      starting_mileage: driver.starting_mileage,
      current_mileage: driver.current_mileage,
      biweek_start_date: driver.biweek_start_date,
      last_updated: nowIso
    }));

    const { error } = await supabase
      .from('eps_driver_rewards')
      .upsert(payload, { onConflict: 'driver_name' });

    if (error) throw error;
  }

  async seedSupabaseDailyDefaults(seedDrivers, today, nowIso) {
    if (!seedDrivers || seedDrivers.length === 0) {
      return;
    }

    const statsPayload = seedDrivers.map(driver => ({
      plate: driver.plate || 'UNASSIGNED',
      driver_name: driver.driver_name,
      date: today,
      total_distance: 0,
      total_violations: 0,
      total_points: driver.current_points,
      speed_violations: 0,
      route_violations: 0,
      night_driving_violations: 0,
      daily_distance: 0,
      total_driving_hours: 0,
      day_driving_hours: 0,
      night_driving_hours: 0,
      total_risk_score: 0
    }));

    const performancePayload = seedDrivers.map(driver => ({
      plate: driver.plate || 'UNASSIGNED',
      driver_name: driver.driver_name,
      date: today,
      latest_speed: 0,
      latest_latitude: null,
      latest_longitude: null,
      latest_loc_time: nowIso,
      latest_mileage: driver.current_mileage || 0,
      latest_geozone: null,
      latest_address: null,
      speed_compliance: true,
      route_compliance: true,
      time_compliance: true,
      efficiency: 0,
      safety_score: 1,
      total_points: driver.current_points,
      reward_level: driver.current_level,
      total_updates_count: 0,
      last_update_time: nowIso,
      total_risk_score: 0,
      risk_level: driver.current_level
    }));

    const violationsPayload = seedDrivers.map(driver => ({
      plate: driver.plate || 'UNASSIGNED',
      driver_name: driver.driver_name,
      date: today,
      speeding_count: 0,
      harsh_braking_count: 0,
      excessive_day_count: 0,
      excessive_night_count: 0,
      route_deviation_count: 0,
      total_violations: 0,
      total_penalty_points: 0
    }));

    const { error: statsError } = await supabase
      .from('eps_daily_stats')
      .upsert(statsPayload, { onConflict: 'driver_name,date', ignoreDuplicates: true });
    if (statsError) throw statsError;

    const { error: performanceError } = await supabase
      .from('eps_daily_performance')
      .upsert(performancePayload, { onConflict: 'driver_name,date', ignoreDuplicates: true });
    if (performanceError) throw performanceError;

    const { error: violationsError } = await supabase
      .from('eps_daily_violations')
      .upsert(violationsPayload, { onConflict: 'driver_name,date', ignoreDuplicates: true });
    if (violationsError) throw violationsError;
  }

  seedSQLiteDefaults(seedDrivers, nowIso) {
    if (!seedDrivers || seedDrivers.length === 0) {
      return;
    }

    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO driver_rewards (
        driver_name, current_points, points_deducted, current_level,
        speed_violations_count, harsh_braking_count, night_driving_count,
        route_violations_count, other_violations_count, last_updated, synced_to_supabase,
        starting_mileage, current_mileage, biweek_start_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `);

    const fillMileageStmt = this.db.prepare(`
      UPDATE driver_rewards
      SET
        starting_mileage = COALESCE(starting_mileage, ?),
        current_mileage = COALESCE(current_mileage, ?),
        biweek_start_date = COALESCE(biweek_start_date, ?)
      WHERE driver_name = ?
    `);

    const transaction = this.db.transaction((rows) => {
      for (const driver of rows) {
        insertStmt.run(
          driver.driver_name,
          driver.current_points,
          driver.points_deducted,
          driver.current_level,
          driver.speed_violations_count,
          driver.harsh_braking_count,
          driver.night_driving_count,
          driver.route_violations_count,
          driver.other_violations_count,
          nowIso,
          driver.starting_mileage,
          driver.current_mileage,
          driver.biweek_start_date
        );

        fillMileageStmt.run(
          driver.starting_mileage,
          driver.current_mileage,
          driver.biweek_start_date || nowIso,
          driver.driver_name
        );
      }
    });

    transaction(seedDrivers);

    const localRows = this.db.prepare('SELECT * FROM driver_rewards').all();
    for (const row of localRows) {
      this.hydrateLocalStateFromRow(row);
    }
  }

  async seedInitialDriverDefaults() {
    try {
      const nowIso = new Date().toISOString();
      const today = nowIso.split('T')[0];

      let rewardsResult = await supabase
        .from('eps_driver_rewards')
        .select(`
          driver_name, plate, current_points, points_deducted, current_level,
          speed_violations_count, harsh_braking_count, night_driving_count,
          route_violations_count, other_violations_count,
          starting_mileage, current_mileage, biweek_start_date
        `);

      // Fallback for databases where bi-weekly mileage columns have not been added yet
      if (rewardsResult.error && rewardsResult.error.code === '42703') {
        rewardsResult = await supabase
          .from('eps_driver_rewards')
          .select(`
            driver_name, plate, current_points, points_deducted, current_level,
            speed_violations_count, harsh_braking_count, night_driving_count,
            route_violations_count, other_violations_count
          `);
      }

      const vehiclesResult = await supabase
        .from('eps_vehicles')
        .select('driver_name, plate, mileage')
        .not('driver_name', 'is', null);

      if (rewardsResult.error) throw rewardsResult.error;
      if (vehiclesResult.error) throw vehiclesResult.error;

      const seedDrivers = this.buildSeedDrivers(
        rewardsResult.data || [],
        vehiclesResult.data || [],
        nowIso
      );

      if (seedDrivers.length === 0) {
        console.log('No valid drivers found for startup seeding');
        return;
      }

      await this.seedSupabaseDriverRewards(seedDrivers, nowIso);
      this.seedSQLiteDefaults(seedDrivers, nowIso);

      try {
        await this.seedSupabaseDailyDefaults(seedDrivers, today, nowIso);
      } catch (dailyError) {
        console.error('Error seeding daily Supabase defaults:', dailyError.message);
      }

      console.log(`Seeded startup defaults for ${seedDrivers.length} drivers (Supabase + SQLite)`);
    } catch (error) {
      console.error('Error seeding initial driver defaults:', error.message);
    }
  }

  // Process EPS data and calculate rewards (auto-creates drivers)
  async processEPSData(epsData) {
    try {
      const { Plate: plate, DriverName: driverName } = epsData;
      
      if (!plate || !driverName || !this.isValidDriverName(driverName)) {
        return null;
      }

      const isDriving = this.isVehicleDriving(epsData);

      // Track engine on/off sessions for monthly kilometer reporting
      try {
        if (this.engineSessionTrackingEnabled) {
          await this.trackEngineSession(epsData);
        }
      } catch (sessionError) {
        const missingTable = sessionError && (sessionError.code === '42P01' || sessionError.code === 'PGRST205');
        if (missingTable) {
          this.engineSessionTrackingEnabled = false;
          console.error('eps_engine_sessions table missing. Session tracking disabled until migration is applied.');
        } else {
          console.error(`Error tracking engine session for ${driverName}:`, sessionError.message);
        }
      }

      // Keep EPS vehicle table fresh for dashboards/trackers even while stationary
      await this.upsertVehicleData(epsData, isDriving);

      // Only process rewards while actively driving
      if (!isDriving) {
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

  parseNumericValue(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  normalizeTimestamp(value) {
    if (!value) return new Date().toISOString();

    const normalized = typeof value === 'string' ? value.replace(' ', 'T') : value;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  }

  getEngineState(epsData) {
    const nameEvent = epsData.NameEvent ? epsData.NameEvent.toUpperCase() : '';
    const statuses = epsData.Statuses ? epsData.Statuses.toUpperCase() : '';
    const status = epsData.Status ? epsData.Status.toUpperCase() : '';
    const combined = `${nameEvent} ${statuses} ${status}`;

    const offIndicators = ['IGNITION OFF', 'ENGINE OFF', 'POWER OFF', 'VEHICLE OFF'];
    if (offIndicators.some(indicator => combined.includes(indicator))) {
      return 'OFF';
    }

    const onIndicators = [
      'IGNITION ON',
      'ENGINE ON',
      'RUNNING',
      'VEHICLE IN MOTION',
      'IN MOTION',
      'MOVING',
      'DRIVING'
    ];
    if (onIndicators.some(indicator => combined.includes(indicator))) {
      return 'ON';
    }

    const speed = this.parseNumericValue(epsData.Speed) || 0;
    if (speed > 0) return 'ON';

    return null;
  }

  toSessionCache(session) {
    const startMileage = this.parseNumericValue(session.start_mileage);
    const currentMileage = this.parseNumericValue(session.current_mileage);
    const fallbackMileage = startMileage ?? currentMileage ?? 0;
    const updatedAt = session.updated_at ? new Date(session.updated_at).getTime() : Date.now();

    return {
      id: session.id,
      driverName: session.driver_name,
      plate: session.plate,
      startMileage: startMileage ?? fallbackMileage,
      currentMileage: currentMileage ?? fallbackMileage,
      lastPersistedMileage: currentMileage ?? fallbackMileage,
      lastPersistedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now()
    };
  }

  async fetchOpenEngineSession(driverName, plate) {
    let query = supabase
      .from('eps_engine_sessions')
      .select('id, driver_name, plate, session_start_time, start_mileage, current_mileage, updated_at')
      .eq('driver_name', driverName)
      .eq('plate', plate)
      .is('session_end_time', null)
      .order('session_start_time', { ascending: false })
      .limit(1);

    let { data, error } = await query;
    if (error) throw error;

    if (data && data.length > 0) {
      return data[0];
    }

    // Fallback for cases where driver changed plates without closing previous session
    query = supabase
      .from('eps_engine_sessions')
      .select('id, driver_name, plate, session_start_time, start_mileage, current_mileage, updated_at')
      .eq('driver_name', driverName)
      .is('session_end_time', null)
      .order('session_start_time', { ascending: false })
      .limit(1);

    ({ data, error } = await query);
    if (error) throw error;

    return data && data.length > 0 ? data[0] : null;
  }

  async handleEngineOn(sessionKey, driverName, plate, mileage, locTime) {
    let cached = this.engineSessions.get(sessionKey);

    if (!cached) {
      const existingOpen = await this.fetchOpenEngineSession(driverName, plate);
      if (existingOpen) {
        cached = this.toSessionCache(existingOpen);
      }
    }

    if (!cached) {
      const { data, error } = await supabase
        .from('eps_engine_sessions')
        .insert({
          plate,
          driver_name: driverName,
          session_start_time: locTime,
          start_mileage: mileage,
          current_mileage: mileage,
          distance_km: 0,
          created_at: locTime,
          updated_at: locTime
        })
        .select('id, driver_name, plate, session_start_time, start_mileage, current_mileage, updated_at')
        .single();

      if (error) throw error;

      this.engineSessions.set(sessionKey, this.toSessionCache(data));
      return;
    }

    // Handle odometer reset/noise by resetting session baseline forward
    if (mileage < cached.startMileage) {
      const { data, error } = await supabase
        .from('eps_engine_sessions')
        .update({
          plate,
          driver_name: driverName,
          start_mileage: mileage,
          current_mileage: mileage,
          distance_km: 0,
          updated_at: locTime
        })
        .eq('id', cached.id)
        .select('id, driver_name, plate, session_start_time, start_mileage, current_mileage, updated_at')
        .single();

      if (error) throw error;

      this.engineSessions.set(sessionKey, this.toSessionCache(data));
      return;
    }

    cached.driverName = driverName;
    cached.plate = plate;
    cached.currentMileage = mileage;

    const mileageDelta = Math.abs(mileage - (cached.lastPersistedMileage ?? cached.startMileage));
    const elapsedMs = Date.now() - (cached.lastPersistedAt || 0);
    const shouldPersist = mileageDelta >= this.SESSION_UPDATE_MILEAGE_STEP ||
      elapsedMs >= this.SESSION_UPDATE_MAX_INTERVAL_MS;

    if (!shouldPersist) {
      this.engineSessions.set(sessionKey, cached);
      return;
    }

    const distanceKm = Math.max(0, mileage - cached.startMileage);
    const { error } = await supabase
      .from('eps_engine_sessions')
      .update({
        plate,
        driver_name: driverName,
        current_mileage: mileage,
        distance_km: distanceKm,
        updated_at: locTime
      })
      .eq('id', cached.id);

    if (error) throw error;

    cached.lastPersistedMileage = mileage;
    cached.lastPersistedAt = Date.now();
    this.engineSessions.set(sessionKey, cached);
  }

  async handleEngineOff(sessionKey, driverName, plate, mileage, locTime) {
    let cached = this.engineSessions.get(sessionKey);

    if (!cached) {
      const existingOpen = await this.fetchOpenEngineSession(driverName, plate);
      if (!existingOpen) return;
      cached = this.toSessionCache(existingOpen);
    }

    const distanceKm = Math.max(0, mileage - cached.startMileage);
    const { error } = await supabase
      .from('eps_engine_sessions')
      .update({
        plate,
        driver_name: driverName,
        session_end_time: locTime,
        end_mileage: mileage,
        current_mileage: mileage,
        distance_km: distanceKm,
        updated_at: locTime
      })
      .eq('id', cached.id);

    if (error) throw error;

    this.engineSessions.delete(sessionKey);
  }

  async trackEngineSession(epsData) {
    const driverName = epsData.DriverName;
    const plate = epsData.Plate;
    const mileage = this.parseNumericValue(epsData.Mileage);

    if (!driverName || !plate || mileage === null) {
      return;
    }

    const engineState = this.getEngineState(epsData);
    if (!engineState) {
      return;
    }

    const locTime = this.normalizeTimestamp(epsData.LocTime);
    const sessionKey = driverName.toLowerCase();

    if (engineState === 'ON') {
      await this.handleEngineOn(sessionKey, driverName, plate, mileage, locTime);
      return;
    }

    if (engineState === 'OFF') {
      await this.handleEngineOff(sessionKey, driverName, plate, mileage, locTime);
    }
  }

  // Upsert current vehicle state in Supabase for dashboards/tracking consumers
  async upsertVehicleData(epsData, isDriving) {
    const locTime = epsData.LocTime || new Date().toISOString();
    const engineState = this.getEngineState(epsData);
    const engineStatus = engineState === 'ON' ? 'ON' : (engineState === 'OFF' ? 'OFF' : (isDriving ? 'ON' : 'OFF'));

    const payload = {
      plate: epsData.Plate,
      driver_name: epsData.DriverName,
      speed: Number(epsData.Speed) || 0,
      latitude: epsData.Latitude ?? null,
      longitude: epsData.Longitude ?? null,
      loc_time: locTime,
      mileage: Number(epsData.Mileage) || 0,
      geozone: epsData.Geozone || null,
      address: epsData.Address || null,
      name_event: epsData.NameEvent || null,
      statuses: epsData.Statuses || epsData.Status || null,
      fuel_level: epsData.fuel_level ?? null,
      fuel_volume: epsData.fuel_volume ?? null,
      fuel_temperature: epsData.fuel_temperature ?? null,
      fuel_percentage: epsData.fuel_percentage ?? null,
      engine_status: engineStatus,
      last_activity_time: locTime,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('eps_vehicles')
      .upsert(payload, { onConflict: 'driver_name' });

    if (error) {
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
