require('dotenv').config();
const path = require('path');
const Database = require('better-sqlite3');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_EPS_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
);

function normalizeDriverName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function isValidDriverName(name) {
  if (!name) return false;
  const upper = name.toUpperCase();
  if (upper === 'UNKNOWN' || upper === 'NULL') return false;
  if (
    name.includes('Street') ||
    name.includes('Road') ||
    name.includes('Avenue') ||
    name.includes('Drive') ||
    name.includes('South Africa') ||
    name.includes(',')
  ) return false;
  return true;
}

async function resetSupabaseAndSQLite() {
  const nowIso = new Date().toISOString();

  const { data: vehicles, error: vehiclesError } = await supabase
    .from('eps_vehicles')
    .select('driver_name, plate, mileage')
    .not('driver_name', 'is', null);
  if (vehiclesError) throw vehiclesError;

  const drivers = new Map();
  for (const vehicle of vehicles || []) {
    const driverName = normalizeDriverName(vehicle.driver_name);
    if (!isValidDriverName(driverName)) continue;

    const key = driverName.toLowerCase();
    const mileageRaw = Number(vehicle.mileage);
    const mileage = Number.isFinite(mileageRaw) ? Math.round(mileageRaw) : 0;

    if (!drivers.has(key)) {
      drivers.set(key, {
        driver_name: driverName,
        plate: vehicle.plate || null,
        mileage
      });
      continue;
    }

    const current = drivers.get(key);
    if (!current.plate && vehicle.plate) current.plate = vehicle.plate;
    if (mileage > current.mileage) current.mileage = mileage;
  }

  const seedDrivers = Array.from(drivers.values());

  let { error } = await supabase
    .from('eps_engine_sessions')
    .delete()
    .gte('id', 0);
  if (error) throw error;

  ({ error } = await supabase
    .from('eps_driver_rewards')
    .delete()
    .neq('driver_name', ''));
  if (error) throw error;

  ({ error } = await supabase
    .from('eps_biweekly_category_points')
    .delete()
    .gte('id', 0));
  if (error && error.code !== '42P01' && error.code !== 'PGRST205') {
    throw error;
  }

  if (seedDrivers.length > 0) {
    const payload = seedDrivers.map(driver => ({
      driver_name: driver.driver_name,
      plate: driver.plate,
      current_points: 100,
      points_deducted: 0,
      current_level: 'Gold',
      speed_violations_count: 0,
      harsh_braking_count: 0,
      night_driving_count: 0,
      route_violations_count: 0,
      other_violations_count: 0,
      starting_mileage: driver.mileage,
      current_mileage: driver.mileage,
      biweek_start_date: nowIso,
      last_updated: nowIso
    }));

    ({ error } = await supabase
      .from('eps_driver_rewards')
      .upsert(payload, { onConflict: 'driver_name' }));
    if (error) throw error;
  }

  const db = new Database(path.join(__dirname, '..', 'eps-rewards.db'));
  db.exec(`
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
  db.prepare('DELETE FROM driver_rewards').run();

  const insertLocal = db.prepare(`
    INSERT INTO driver_rewards (
      driver_name, current_points, points_deducted, current_level,
      speed_violations_count, harsh_braking_count, night_driving_count,
      route_violations_count, other_violations_count, last_updated, synced_to_supabase,
      starting_mileage, current_mileage, biweek_start_date
    ) VALUES (?, 100, 0, 'Gold', 0, 0, 0, 0, 0, ?, 1, ?, ?, ?)
  `);

  const tx = db.transaction((rows) => {
    for (const row of rows) {
      insertLocal.run(row.driver_name, nowIso, row.mileage, row.mileage, nowIso);
    }
  });
  tx(seedDrivers);

  const localCount = db.prepare('SELECT COUNT(*) AS c FROM driver_rewards').get().c;
  db.close();

  return {
    reset_at: nowIso,
    drivers_seeded: seedDrivers.length,
    local_sqlite_rows: localCount,
    engine_sessions_cleared: true,
    biweekly_points_cleared: true
  };
}

resetSupabaseAndSQLite()
  .then(result => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error('Failed to reset EPS baseline:', error.message);
    process.exit(1);
  });
