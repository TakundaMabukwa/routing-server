const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const EPSRewardSystem = require('./eps-reward-system');

const rewardSystem = new EPSRewardSystem();
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
);

// ===== BASIC DATA ENDPOINTS =====

// Test database connection
router.get('/test', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('eps_driver_rewards')
      .select('count')
      .limit(1);
    
    if (error) throw error;
    
    res.json({
      success: true,
      message: 'Supabase connection successful',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Supabase connection error:', error);
    res.status(500).json({ 
      error: 'Supabase connection failed',
      details: error.message 
    });
  }
});

// Get all driver performance records (daily summaries) - CACHED
const cache = require('../middleware/supabase-cache');

router.get('/performance', async (req, res) => {
  try {
    const data = await cache.getCached('eps-performance', async () => {
      const { data, error } = await supabase
        .from('eps_daily_performance')
        .select('*')
        .order('date', { ascending: false })
        .order('last_update_time', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return data;
    }, 30000); // 30s cache
    
    res.json(data);
  } catch (error) {
    console.error('Error getting performance data:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Get performance by driver name (daily summaries)
router.get('/performance/driver/:driverName', async (req, res) => {
  try {
    const { driverName } = req.params;
    
    const { data, error } = await supabase
      .from('eps_daily_performance')
      .select('*')
      .eq('driver_name', driverName)
      .order('date', { ascending: false })
      .order('last_update_time', { ascending: false })
      .limit(30);
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error getting driver performance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get performance by plate
router.get('/performance/plate/:plate', async (req, res) => {
  try {
    const { plate } = req.params;
    
    const { data, error } = await supabase
      .from('eps_daily_performance')
      .select('*')
      .eq('plate', plate)
      .order('latest_loc_time', { ascending: false })
      .limit(50);
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error getting plate performance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all violations (daily summaries)
router.get('/violations', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('eps_daily_violations')
      .select('*')
      .order('date', { ascending: false })
      .order('last_violation_time', { ascending: false })
      .limit(100);
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error getting violations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get violations by driver
router.get('/violations/driver/:driverName', async (req, res) => {
  try {
    const { driverName } = req.params;
    
    const { data, error } = await supabase
      .from('eps_daily_violations')
      .select('*')
      .eq('driver_name', driverName)
      .order('last_violation_time', { ascending: false })
      .limit(50);
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error getting driver violations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get violations by plate
router.get('/violations/plate/:plate', async (req, res) => {
  try {
    const { plate } = req.params;
    
    const { data, error } = await supabase
      .from('eps_daily_violations')
      .select('*')
      .eq('plate', plate)
      .order('last_violation_time', { ascending: false })
      .limit(50);
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error getting plate violations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all daily stats (with NEW driving hours)
router.get('/daily-stats', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('eps_daily_stats')
      .select('*')
      .order('date', { ascending: false })
      .limit(100);
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error getting daily stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get daily stats by driver
router.get('/daily-stats/driver/:driverName', async (req, res) => {
  try {
    const { driverName } = req.params;
    
    const { data, error } = await supabase
      .from('eps_daily_stats')
      .select('*')
      .eq('driver_name', driverName)
      .order('date', { ascending: false })
      .limit(30);
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error getting driver daily stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get daily stats by plate
router.get('/daily-stats/plate/:plate', async (req, res) => {
  try {
    const { plate } = req.params;
    
    const { data, error } = await supabase
      .from('eps_daily_stats')
      .select('*')
      .eq('plate', plate)
      .order('date', { ascending: false })
      .limit(30);
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error getting plate daily stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get daily stats by date
router.get('/daily-stats/date/:date', async (req, res) => {
  try {
    const { date } = req.params;
    
    const { data, error } = await supabase
      .from('eps_daily_stats')
      .select('*')
      .eq('date', date)
      .order('total_risk_score', { ascending: false });
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error getting daily stats by date:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all driver rewards
router.get('/rewards', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('eps_driver_rewards')
      .select('*')
      .order('current_points', { ascending: false });
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error getting rewards:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get rewards by driver
router.get('/rewards/driver/:driverName', async (req, res) => {
  try {
    const { driverName } = req.params;
    const { data, error } = await supabase
      .from('eps_driver_rewards')
      .select('*')
      .eq('driver_name', driverName)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Driver not found' });
      }
      throw error;
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error getting driver rewards:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get rewards by plate
router.get('/rewards/plate/:plate', async (req, res) => {
  try {
    const { plate } = req.params;
    
    const { data, error } = await supabase
      .from('eps_driver_rewards')
      .select('*')
      .eq('plate', plate)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Plate not found' });
      }
      throw error;
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error getting plate rewards:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get latest tracking data
router.get('/latest', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('eps_daily_performance')
      .select('*')
      .order('latest_loc_time', { ascending: false })
      .limit(1)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'No data available' });
      }
      throw error;
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error getting latest data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== REPORT ENDPOINTS =====

// Vehicle Behavior Report
router.get('/reports/vehicle-behavior', async (req, res) => {
  try {
    const { driver, days = 7 } = req.query;
    
    if (!driver) {
      return res.status(400).json({ error: 'Driver parameter is required' });
    }
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - parseInt(days));
    
    const report = await rewardSystem.getDriverPerformanceReport(driver, startDate.toISOString(), endDate.toISOString());
    
    if (!report) {
      return res.status(404).json({ error: 'Driver not found or no data available' });
    }
    
    res.json({
      driverName: driver,
      period: `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
      totalKilometers: report.total_kilometers || 0,
      totalViolations: report.speeding_incidents + report.route_violations + report.time_violations,
      speedingIncidents: report.speeding_incidents || 0,
      routeViolations: report.route_violations || 0,
      timeViolations: report.time_violations || 0,
      totalPoints: report.total_points || 0,
      rewardLevel: getRewardLevel(report.total_points || 0),
      averageEfficiency: report.average_efficiency || 0,
      averageSafetyScore: report.average_safety_score || 0
    });
  } catch (error) {
    console.error('Error getting vehicle behavior report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// MTD (Month-to-Date) Report
router.get('/reports/mtd', async (req, res) => {
  try {
    const { driver } = req.query;
    
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    let report;
    if (driver) {
      report = await rewardSystem.getDriverPerformanceReport(driver, startDate.toISOString(), endDate.toISOString());
    } else {
      report = await rewardSystem.getFleetPerformanceReport(startDate.toISOString(), endDate.toISOString());
    }
    
    res.json({
      period: `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
      driver: driver || 'All Drivers',
      data: report
    });
  } catch (error) {
    console.error('Error getting MTD report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Driver Performance Summary
router.get('/reports/summary', async (req, res) => {
  try {
    const { driver, days = 7 } = req.query;
    
    if (!driver) {
      return res.status(400).json({ error: 'Driver parameter is required' });
    }
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - parseInt(days));
    
    const report = await rewardSystem.getDriverPerformanceReport(driver, startDate.toISOString(), endDate.toISOString());
    
    if (!report) {
      return res.status(404).json({ error: 'Driver not found or no data available' });
    }
    
    res.json({
      driverName: driver,
      period: `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
      summary: {
        totalTrips: report.total_trips || 0,
        totalKilometers: report.total_kilometers || 0,
        totalViolations: (report.speeding_incidents || 0) + (report.route_violations || 0) + (report.time_violations || 0),
        totalPoints: report.total_points || 0,
        rewardLevel: getRewardLevel(report.total_points || 0),
        averageEfficiency: report.average_efficiency || 0,
        averageSafetyScore: report.average_safety_score || 0,
        averageSpeed: report.average_speed || 0
      }
    });
  } catch (error) {
    console.error('Error getting driver summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get driver performance report (Vehicle Behaviour Report format)
router.get('/driver-performance/:driverName', async (req, res) => {
  try {
    const { driverName } = req.params;
    const { startDate, endDate } = req.query;

    const now = new Date();
    const periodStart = startDate
      ? new Date(startDate)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const periodEnd = endDate
      ? new Date(endDate)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
      return res.status(400).json({ error: 'Invalid startDate or endDate' });
    }

    if (periodStart >= periodEnd) {
      return res.status(400).json({ error: 'startDate must be earlier than endDate' });
    }

    const periodStartIso = periodStart.toISOString();
    const periodEndIso = periodEnd.toISOString();

    // `/driver-performance/all` returns scorecards for all drivers
    if (driverName.toLowerCase() === 'all') {
      const [allDriversResult, allVehiclesResult, allSessionsResult, allBiWeeklyResult] = await Promise.all([
        supabase
          .from('eps_driver_rewards')
          .select('*')
          .order('driver_name', { ascending: true }),
        supabase
          .from('eps_vehicles')
          .select('plate, driver_name, speed, latitude, longitude, loc_time, mileage, geozone, address, name_event, statuses, engine_status, updated_at'),
        supabase
          .from('eps_engine_sessions')
          .select('id, plate, driver_name, session_start_time, session_end_time, start_mileage, current_mileage, end_mileage, distance_km')
          .gte('session_start_time', periodStartIso)
          .lt('session_start_time', periodEndIso),
        supabase
          .from('eps_biweekly_category_points')
          .select('*')
          .order('period_start', { ascending: false })
          .order('updated_at', { ascending: false })
      ]);

      if (allDriversResult.error) throw allDriversResult.error;
      if (allVehiclesResult.error) throw allVehiclesResult.error;
      if (allSessionsResult.error) {
        if (isMissingTableError(allSessionsResult.error)) {
          return handleMissingEngineSessionsTable(res);
        }
        throw allSessionsResult.error;
      }

      let biWeeklyRows = [];
      if (allBiWeeklyResult.error) {
        if (!isMissingTableError(allBiWeeklyResult.error)) {
          throw allBiWeeklyResult.error;
        }
      } else {
        biWeeklyRows = allBiWeeklyResult.data || [];
      }

      const latestVehicleByDriver = new Map();
      for (const row of allVehiclesResult.data || []) {
        const key = row.driver_name;
        if (!key) continue;

        const existing = latestVehicleByDriver.get(key);
        if (!existing) {
          latestVehicleByDriver.set(key, row);
          continue;
        }

        const existingTime = new Date(existing.updated_at || existing.loc_time || 0).getTime();
        const candidateTime = new Date(row.updated_at || row.loc_time || 0).getTime();
        if (candidateTime > existingTime) {
          latestVehicleByDriver.set(key, row);
        }
      }

      const sessionStatsByDriver = new Map();
      let fleetKilometers = 0;
      for (const session of allSessionsResult.data || []) {
        const key = session.driver_name;
        if (!key) continue;

        const km = roundKm(calculateSessionKilometers(session));
        fleetKilometers += km;

        if (!sessionStatsByDriver.has(key)) {
          sessionStatsByDriver.set(key, {
            kilometers: 0,
            sessions: 0,
            open_sessions: 0,
            closed_sessions: 0
          });
        }

        const stats = sessionStatsByDriver.get(key);
        stats.kilometers += km;
        stats.sessions += 1;
        if (session.session_end_time) stats.closed_sessions += 1;
        else stats.open_sessions += 1;
      }

      const latestBiWeeklyByDriver = new Map();
      for (const row of biWeeklyRows) {
        if (!latestBiWeeklyByDriver.has(row.driver_name)) {
          latestBiWeeklyByDriver.set(row.driver_name, row);
        }
      }

      const scorecards = (allDriversResult.data || []).map(driverData => {
        const key = driverData.driver_name;
        const latestVehicle = latestVehicleByDriver.get(key) || null;
        const stats = sessionStatsByDriver.get(key) || {
          kilometers: 0,
          sessions: 0,
          open_sessions: 0,
          closed_sessions: 0
        };
        const speedViolations = toFiniteNumber(driverData.speed_violations_count);
        const harshBraking = toFiniteNumber(driverData.harsh_braking_count);
        const nightDriving = toFiniteNumber(driverData.night_driving_count);
        const routeViolations = toFiniteNumber(driverData.route_violations_count);
        const otherViolations = toFiniteNumber(driverData.other_violations_count);
        const totalViolations = speedViolations + harshBraking + nightDriving + routeViolations + otherViolations;
        const currentPoints = toFiniteNumber(driverData.current_points, 100);
        const pointsRisk = 100 - currentPoints;
        const violationRisk = Math.min(totalViolations * 5, 50);
        const speedRisk = Math.min(speedViolations * 10, 30);
        const nightRisk = Math.min(nightDriving * 8, 20);
        const riskScore = Math.min(Math.round(pointsRisk + violationRisk + speedRisk + nightRisk), 200);
        const fleetSharePercent = fleetKilometers > 0 ? roundKm((stats.kilometers / fleetKilometers) * 100) : 0;

        return {
          driver_name: driverData.driver_name,
          plate: driverData.plate || latestVehicle?.plate || null,
          monthly_kilometers: {
            kilometers: roundKm(stats.kilometers),
            fleet_share_percent: fleetSharePercent,
            sessions: stats.sessions,
            open_sessions: stats.open_sessions,
            closed_sessions: stats.closed_sessions
          },
          points: {
            current_points: currentPoints,
            points_deducted: toFiniteNumber(driverData.points_deducted),
            reward_level: driverData.current_level || getRewardLevel(currentPoints)
          },
          violations: {
            total: totalViolations,
            speed: speedViolations,
            harsh_braking: harshBraking,
            night_driving: nightDriving,
            route: routeViolations,
            other: otherViolations
          },
          risk: {
            overall_score: riskScore,
            category: riskScore <= 30 ? 'Low Risk' : (riskScore <= 70 ? 'Medium Risk' : 'High Risk'),
            insurance_multiplier: riskScore <= 30 ? 1.0 : (riskScore <= 70 ? 1.3 : 1.8)
          },
          bi_weekly_category_points: formatBiWeeklyCategoryPoints(latestBiWeeklyByDriver.get(key)),
          latest_vehicle: latestVehicle ? {
            plate: latestVehicle.plate,
            engine_status: latestVehicle.engine_status,
            speed: latestVehicle.speed,
            mileage: latestVehicle.mileage,
            latitude: latestVehicle.latitude,
            longitude: latestVehicle.longitude,
            geozone: latestVehicle.geozone,
            address: latestVehicle.address,
            name_event: latestVehicle.name_event,
            statuses: latestVehicle.statuses,
            loc_time: latestVehicle.loc_time,
            updated_at: latestVehicle.updated_at
          } : null
        };
      }).sort((a, b) => b.points.current_points - a.points.current_points);

      return res.json({
        period: {
          start: periodStartIso,
          end: periodEndIso
        },
        total_drivers: scorecards.length,
        fleet_kilometers: roundKm(fleetKilometers),
        scorecards
      });
    }

    const [driverResult, latestVehicleResult, sessionResult, fleetSessionResult, biWeeklyResult] = await Promise.all([
      supabase
        .from('eps_driver_rewards')
        .select('*')
        .eq('driver_name', driverName)
        .single(),
      supabase
        .from('eps_vehicles')
        .select('plate, driver_name, speed, latitude, longitude, loc_time, mileage, geozone, address, name_event, statuses, engine_status, updated_at')
        .eq('driver_name', driverName)
        .order('updated_at', { ascending: false })
        .limit(1),
      supabase
        .from('eps_engine_sessions')
        .select('id, plate, session_start_time, session_end_time, start_mileage, current_mileage, end_mileage, distance_km')
        .eq('driver_name', driverName)
        .gte('session_start_time', periodStartIso)
        .lt('session_start_time', periodEndIso)
        .order('session_start_time', { ascending: true }),
      supabase
        .from('eps_engine_sessions')
        .select('start_mileage, current_mileage, end_mileage, distance_km')
        .gte('session_start_time', periodStartIso)
        .lt('session_start_time', periodEndIso),
      supabase
        .from('eps_biweekly_category_points')
        .select('*')
        .eq('driver_name', driverName)
        .order('period_start', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(1)
    ]);

    if (driverResult.error) {
      if (driverResult.error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Driver not found' });
      }
      throw driverResult.error;
    }

    if (latestVehicleResult.error) throw latestVehicleResult.error;
    if (sessionResult.error) {
      if (sessionResult.error.code === '42P01' || sessionResult.error.code === 'PGRST205') {
        return handleMissingEngineSessionsTable(res);
      }
      throw sessionResult.error;
    }
    if (fleetSessionResult.error) {
      if (fleetSessionResult.error.code === '42P01' || fleetSessionResult.error.code === 'PGRST205') {
        return handleMissingEngineSessionsTable(res);
      }
      throw fleetSessionResult.error;
    }

    let biWeeklyData = null;
    if (biWeeklyResult.error) {
      if (!isMissingTableError(biWeeklyResult.error)) {
        throw biWeeklyResult.error;
      }
    } else {
      biWeeklyData = (biWeeklyResult.data || [])[0] || null;
    }

    const driverData = driverResult.data;
    const latestVehicle = (latestVehicleResult.data || [])[0] || null;

    const sessions = (sessionResult.data || []).map(session => {
      const kilometers = roundKm(calculateSessionKilometers(session));
      return {
        id: session.id,
        plate: session.plate,
        session_start_time: session.session_start_time,
        session_end_time: session.session_end_time,
        start_mileage: session.start_mileage,
        end_mileage: session.end_mileage,
        current_mileage: session.current_mileage,
        kilometers,
        open: !session.session_end_time
      };
    });

    const monthlyKilometers = sessions.reduce((sum, session) => sum + session.kilometers, 0);
    const fleetKilometers = (fleetSessionResult.data || [])
      .reduce((sum, session) => sum + calculateSessionKilometers(session), 0);
    const fleetSharePercent = fleetKilometers > 0
      ? roundKm((monthlyKilometers / fleetKilometers) * 100)
      : 0;

    const speedViolations = toFiniteNumber(driverData.speed_violations_count);
    const harshBraking = toFiniteNumber(driverData.harsh_braking_count);
    const nightDriving = toFiniteNumber(driverData.night_driving_count);
    const routeViolations = toFiniteNumber(driverData.route_violations_count);
    const otherViolations = toFiniteNumber(driverData.other_violations_count);
    const totalViolations = speedViolations + harshBraking + nightDriving + routeViolations + otherViolations;

    const currentPoints = toFiniteNumber(driverData.current_points, 100);
    const pointsRisk = 100 - currentPoints;
    const violationRisk = Math.min(totalViolations * 5, 50);
    const speedRisk = Math.min(speedViolations * 10, 30);
    const nightRisk = Math.min(nightDriving * 8, 20);
    const riskScore = Math.min(Math.round(pointsRisk + violationRisk + speedRisk + nightRisk), 200);

    res.json({
      driver_name: driverData.driver_name,
      plate: driverData.plate || latestVehicle?.plate || null,
      period: {
        start: periodStartIso,
        end: periodEndIso
      },
      monthly_kilometers: {
        kilometers: roundKm(monthlyKilometers),
        fleet_share_percent: fleetSharePercent,
        sessions: sessions.length,
        open_sessions: sessions.filter(session => session.open).length,
        closed_sessions: sessions.filter(session => !session.open).length
      },
      points: {
        current_points: currentPoints,
        points_deducted: toFiniteNumber(driverData.points_deducted),
        reward_level: driverData.current_level || getRewardLevel(currentPoints)
      },
      violations: {
        total: totalViolations,
        speed: speedViolations,
        harsh_braking: harshBraking,
        night_driving: nightDriving,
        route: routeViolations,
        other: otherViolations
      },
      risk: {
        overall_score: riskScore,
        category: riskScore <= 30 ? 'Low Risk' : (riskScore <= 70 ? 'Medium Risk' : 'High Risk'),
        insurance_multiplier: riskScore <= 30 ? 1.0 : (riskScore <= 70 ? 1.3 : 1.8)
      },
      bi_weekly_category_points: formatBiWeeklyCategoryPoints(biWeeklyData),
      latest_vehicle: latestVehicle ? {
        plate: latestVehicle.plate,
        engine_status: latestVehicle.engine_status,
        speed: latestVehicle.speed,
        mileage: latestVehicle.mileage,
        latitude: latestVehicle.latitude,
        longitude: latestVehicle.longitude,
        geozone: latestVehicle.geozone,
        address: latestVehicle.address,
        name_event: latestVehicle.name_event,
        statuses: latestVehicle.statuses,
        loc_time: latestVehicle.loc_time,
        updated_at: latestVehicle.updated_at
      } : null,
      session_details: sessions
    });
  } catch (error) {
    console.error('Error getting driver performance report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get fleet performance report (all drivers)
router.get('/fleet-performance', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Default to current month if no dates provided
    const now = new Date();
    const defaultStartDate = startDate || new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const defaultEndDate = endDate || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();
    
    const reports = await rewardSystem.getFleetPerformanceReport(defaultStartDate, defaultEndDate);
    
    // Calculate total fleet kilometers
    const totalFleetKm = reports.reduce((sum, report) => sum + report.total_kilometers, 0);
    
    // Get bi-weekly category points for all drivers
    // TODO: Implement bi-weekly category points with Supabase
    const categoryPointsMap = new Map();

    const formattedReports = reports.map(report => {
      const fleetPercentage = totalFleetKm > 0 ? 
        (report.total_kilometers / totalFleetKm * 100).toFixed(2) : '0.00';
      
      const speedingPercentage = report.total_trips > 0 ? 
        (report.speeding_incidents / report.total_trips * 100).toFixed(2) : '0.00';
      
      const routeViolationPercentage = report.total_trips > 0 ? 
        (report.route_violations / report.total_trips * 100).toFixed(2) : '0.00';
      
      const timeViolationPercentage = report.total_trips > 0 ? 
        (report.time_violations / report.total_trips * 100).toFixed(2) : '0.00';
      
      const weightedAverage = (
        parseFloat(speedingPercentage) + 
        parseFloat(routeViolationPercentage) + 
        parseFloat(timeViolationPercentage)
      ) / 3;
      
      const biWeeklyData = categoryPointsMap.get(report.driver_name);
      
      return {
        driverName: report.driver_name,
        kilometers: report.total_kilometers || 0,
        fleetTotalPercentage: `${fleetPercentage}%`,
        overSpeedingPercentage: `${speedingPercentage}%`,
        harshBrakingPercentage: '0.00%',
        excessiveDayPercentage: `${timeViolationPercentage}%`,
        excessiveNightPercentage: '0.00%',
        weightedAverageExceptionPercentage: `${weightedAverage.toFixed(2)}%`,
        totalPoints: report.total_points || 0,
        rewardLevel: getRewardLevel(report.total_points || 0),
        averageEfficiency: ((report.average_efficiency || 0) * 100).toFixed(2),
        averageEfficiencyRaw: (report.average_efficiency || 0) * 100,
        averageSafetyScore: ((report.average_safety_score || 0) * 100).toFixed(2),
        averageSafetyScoreRaw: (report.average_safety_score || 0) * 100,
        performanceScore: Math.round(((report.average_efficiency || 0) * 100 + (report.average_safety_score || 0) * 100) / 2),
        biWeeklyCategoryPoints: biWeeklyData ? {
          haulType: biWeeklyData.haul_type,
          totalEarned: biWeeklyData.total_points_earned,
          caps: {
            speedCompliance: biWeeklyData.speed_compliance_cap,
            harshBraking: biWeeklyData.harsh_braking_cap,
            dayDriving: biWeeklyData.day_driving_cap,
            nightDriving: biWeeklyData.night_driving_cap
          },
          earned: {
            speedCompliance: biWeeklyData.speed_compliance_earned,
            harshBraking: biWeeklyData.harsh_braking_earned,
            dayDriving: biWeeklyData.day_driving_earned,
            nightDriving: biWeeklyData.night_driving_earned
          }
        } : null
      };
    });
    
    res.json(formattedReports);
  } catch (error) {
    console.error('Error getting fleet performance report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get MTD (Month To Date) report
router.get('/mtd-report', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Default to current month if no dates provided
    const now = new Date();
    const defaultStartDate = startDate || new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const defaultEndDate = endDate || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();
    
    const dailyReports = await rewardSystem.getDailyPerformanceReport(defaultStartDate, defaultEndDate);
    
    // Format for MTD report structure
    const mtdReport = {
      company: 'EPS Courier Services',
      period: `${new Date(defaultStartDate).toLocaleDateString()} - ${new Date(defaultEndDate).toLocaleDateString()}`,
      speeding: {
        incidents: dailyReports.map(day => day.speeding_incidents),
        kilometers: dailyReports.map(day => day.total_kilometers),
        percentages: dailyReports.map(day => 
          day.total_kilometers > 0 ? 
            (day.speeding_incidents / day.total_kilometers * 100).toFixed(2) : '0.00'
        )
      },
      harshBraking: {
        incidents: dailyReports.map(() => 0), // Not tracked in current system
        kilometers: dailyReports.map(day => day.total_kilometers),
        percentages: dailyReports.map(() => '0.00')
      },
      excessiveDrivingDay: {
        incidents: dailyReports.map(day => day.time_violations),
        kilometers: dailyReports.map(day => day.total_kilometers),
        percentages: dailyReports.map(day => 
          day.total_kilometers > 0 ? 
            (day.time_violations / day.total_kilometers * 100).toFixed(2) : '0.00'
        )
      },
      dates: dailyReports.map(day => new Date(day.date).toLocaleDateString('en-GB', { 
        day: 'numeric', 
        month: 'short', 
        year: '2-digit' 
      }))
    };
    
    res.json(mtdReport);
  } catch (error) {
    console.error('Error getting MTD report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get driver leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const { startDate, endDate, limit = 10 } = req.query;
    
    // Default to current month if no dates provided
    const now = new Date();
    const defaultStartDate = startDate || new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const defaultEndDate = endDate || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();
    
    const reports = await rewardSystem.getFleetPerformanceReport(defaultStartDate, defaultEndDate);
    
    // Sort by total points and limit results
    const leaderboard = reports
      .sort((a, b) => b.total_points - a.total_points)
      .slice(0, parseInt(limit))
      .map((report, index) => ({
        rank: index + 1,
        driverName: report.driver_name,
        totalPoints: report.total_points || 0,
        rewardLevel: getRewardLevel(report.total_points || 0),
        totalKilometers: report.total_kilometers || 0,
        averageEfficiency: ((report.average_efficiency || 0) * 100).toFixed(2),
        averageEfficiencyRaw: (report.average_efficiency || 0) * 100,
        averageSafetyScore: ((report.average_safety_score || 0) * 100).toFixed(2),
        averageSafetyScoreRaw: (report.average_safety_score || 0) * 100,
        performanceScore: Math.round(((report.average_efficiency || 0) * 100 + (report.average_safety_score || 0) * 100) / 2),
        speedingIncidents: report.speeding_incidents || 0,
        violations: (report.route_violations || 0) + (report.time_violations || 0)
      }));
    
    res.json(leaderboard);
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get driver rewards breakdown
router.get('/driver-rewards/:driverName', async (req, res) => {
  try {
    const { driverName } = req.params;
    const { startDate, endDate } = req.query;
    
    // Default to current month if no dates provided
    const now = new Date();
    const defaultStartDate = startDate || new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const defaultEndDate = endDate || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();
    
    const report = await rewardSystem.getDriverPerformanceReport(driverName, defaultStartDate, defaultEndDate);
    
    if (!report) {
      return res.status(404).json({ error: 'Driver not found or no data available' });
    }
    
    const rewardsBreakdown = {
      driverName: report.driver_name,
      totalPoints: report.total_points,
      rewardLevel: getRewardLevel(report.total_points),
      period: `${new Date(defaultStartDate).toLocaleDateString()} - ${new Date(defaultEndDate).toLocaleDateString()}`,
      breakdown: {
        baseDriving: Math.floor(report.total_trips * 1), // 1 point per trip
        speedCompliance: Math.floor(report.total_trips * 0.8 * 2), // 80% compliance rate * 2 points
        routeCompliance: Math.floor(report.total_trips * 0.9 * 3), // 90% compliance rate * 3 points
        timeCompliance: Math.floor(report.total_trips * 0.85 * 2), // 85% compliance rate * 2 points
        efficiencyBonus: Math.floor(report.average_efficiency * report.total_trips * 5),
        safetyBonus: Math.floor(report.average_safety_score * report.total_trips * 3),
        violationDeductions: -(report.speeding_incidents * 5 + report.route_violations * 3 + report.time_violations * 2)
      },
      statistics: {
        totalTrips: report.total_trips,
        totalKilometers: report.total_kilometers,
        averageSpeed: report.average_speed.toFixed(2),
        averageEfficiency: (report.average_efficiency * 100).toFixed(2),
        averageSafetyScore: (report.average_safety_score * 100).toFixed(2),
        speedingIncidents: report.speeding_incidents,
        routeViolations: report.route_violations,
        timeViolations: report.time_violations
      }
    };
    
    res.json(rewardsBreakdown);
  } catch (error) {
    console.error('Error getting driver rewards:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get real-time driver status
router.get('/driver-status/:driverName', async (req, res) => {
  try {
    const { driverName } = req.params;
    
    // Get latest performance data for the driver
    const { data: performanceData, error: perfError } = await supabase
      .from('eps_daily_performance')
      .select('*')
      .eq('driver_name', driverName)
      .order('latest_loc_time', { ascending: false })
      .limit(1)
      .single();
    
    // Get driver rewards data
    const { data: rewardsData, error: rewardError } = await supabase
      .from('eps_driver_rewards')
      .select('*')
      .eq('driver_name', driverName)
      .single();
    
    if (perfError && perfError.code === 'PGRST116') {
      return res.status(404).json({ error: 'Driver not found or no recent data' });
    }
    
    if (perfError) throw perfError;
    
    const status = {
      driverName: driverName,
      plate: performanceData?.plate || 'Unknown',
      currentLocation: {
        latitude: performanceData?.latest_latitude,
        longitude: performanceData?.latest_longitude,
        address: performanceData?.latest_address,
        geozone: performanceData?.latest_geozone
      },
      currentStatus: {
        speed: performanceData?.latest_speed || 0,
        speedStatus: (performanceData?.latest_speed || 0) > 80 ? 'Speeding' : 'Normal',
        routeStatus: performanceData?.route_compliance ? 'On Route' : 'Off Route',
        timeStatus: performanceData?.time_compliance ? 'Within Hours' : 'Outside Hours'
      },
      performance: {
        efficiency: ((performanceData?.efficiency || 0) * 100).toFixed(2),
        safetyScore: ((performanceData?.safety_score || 0) * 100).toFixed(2),
        totalPoints: rewardsData?.current_points || 100,
        rewardLevel: rewardsData?.current_level || 'Gold'
      },
      lastUpdate: performanceData?.latest_loc_time || new Date().toISOString()
    };
    
    res.json(status);
  } catch (error) {
    console.error('Error getting driver status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper functions
async function getTotalFleetKilometers(startDate, endDate) {
  try {
    const { data, error } = await supabase
      .from('eps_daily_performance')
      .select('latest_mileage')
      .gte('latest_loc_time', startDate)
      .lte('latest_loc_time', endDate);
    
    if (error) throw error;
    
    const totalKm = data.reduce((sum, record) => sum + (record.latest_mileage || 0), 0);
    return totalKm;
  } catch (error) {
    console.error('Error getting total fleet kilometers:', error);
    return 0;
  }
}

function getRewardLevel(points) {
  if (points >= 50) return 'Gold';
  if (points >= 30) return 'Silver';
  if (points >= 15) return 'Bronze';
  return 'Rookie';
}

function toFiniteNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundKm(value) {
  return Number(toFiniteNumber(value).toFixed(2));
}

function calculateSessionKilometers(session) {
  const startMileage = toFiniteNumber(session.start_mileage, null);
  const endMileage = toFiniteNumber(session.end_mileage, null);
  const currentMileage = toFiniteNumber(session.current_mileage, null);
  const storedDistance = toFiniteNumber(session.distance_km, null);

  if (startMileage !== null && endMileage !== null) {
    return Math.max(0, endMileage - startMileage);
  }

  if (startMileage !== null && currentMileage !== null) {
    return Math.max(0, currentMileage - startMileage);
  }

  return Math.max(0, storedDistance || 0);
}

function getMonthWindow(yearInput, monthInput) {
  const now = new Date();
  const parsedYear = parseInt(yearInput, 10);
  const parsedMonth = parseInt(monthInput, 10);

  const year = Number.isInteger(parsedYear) ? parsedYear : now.getFullYear();
  const month = Number.isInteger(parsedMonth) ? parsedMonth : (now.getMonth() + 1);

  if (month < 1 || month > 12) {
    throw new Error('Month must be between 1 and 12');
  }

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  return {
    year,
    month,
    label: `${year}-${String(month).padStart(2, '0')}`,
    startIso: start.toISOString(),
    endIso: end.toISOString()
  };
}

function handleMissingEngineSessionsTable(res) {
  return res.status(500).json({
    error: 'eps_engine_sessions table is missing',
    action: 'Run add-eps-engine-sessions-table.sql in Supabase SQL Editor'
  });
}

function handleMissingBiWeeklyTable(res) {
  return res.status(500).json({
    error: 'eps_biweekly_category_points table is missing',
    action: 'Run supabase-schema.sql (or create eps_biweekly_category_points) in Supabase SQL Editor'
  });
}

function isMissingTableError(error) {
  return !!(error && (error.code === '42P01' || error.code === 'PGRST205'));
}

function formatBiWeeklyCategoryPoints(row) {
  if (!row) return null;

  const caps = {
    speed_compliance: toFiniteNumber(row.speed_compliance_cap),
    harsh_braking: toFiniteNumber(row.harsh_braking_cap),
    day_driving: toFiniteNumber(row.day_driving_cap),
    night_driving: toFiniteNumber(row.night_driving_cap),
    kilometers: toFiniteNumber(row.kilometers_cap)
  };

  const earned = {
    speed_compliance: toFiniteNumber(row.speed_compliance_earned),
    harsh_braking: toFiniteNumber(row.harsh_braking_earned),
    day_driving: toFiniteNumber(row.day_driving_earned),
    night_driving: toFiniteNumber(row.night_driving_earned),
    kilometers: toFiniteNumber(row.kilometers_earned),
    total: toFiniteNumber(row.total_points_earned)
  };

  const violations = {
    speed_compliance: toFiniteNumber(row.speed_compliance_violations),
    harsh_braking: toFiniteNumber(row.harsh_braking_violations),
    day_driving: toFiniteNumber(row.day_driving_violations),
    night_driving: toFiniteNumber(row.night_driving_violations),
    kilometers: toFiniteNumber(row.kilometers_violations),
    total: toFiniteNumber(row.total_violations)
  };

  return {
    id: row.id,
    driver_name: row.driver_name,
    plate: row.plate,
    haul_type: row.haul_type,
    period: {
      start: row.period_start,
      end: row.period_end
    },
    caps,
    earned,
    remaining: {
      speed_compliance: Math.max(0, caps.speed_compliance - earned.speed_compliance),
      harsh_braking: Math.max(0, caps.harsh_braking - earned.harsh_braking),
      day_driving: Math.max(0, caps.day_driving - earned.day_driving),
      night_driving: Math.max(0, caps.night_driving - earned.night_driving),
      kilometers: Math.max(0, caps.kilometers - earned.kilometers)
    },
    violations,
    updated_at: row.updated_at || null,
    created_at: row.created_at || null
  };
}

function aggregateBiWeeklySummary(rows) {
  return rows.reduce((summary, row) => {
    const formatted = formatBiWeeklyCategoryPoints(row);
    if (!formatted) return summary;

    summary.total_records += 1;
    summary.total_points_earned += formatted.earned.total;
    summary.total_kilometers_earned += formatted.earned.kilometers;
    summary.total_violations += formatted.violations.total;
    summary.total_speed_violations += formatted.violations.speed_compliance;
    summary.total_harsh_braking_violations += formatted.violations.harsh_braking;
    summary.total_day_driving_violations += formatted.violations.day_driving;
    summary.total_night_driving_violations += formatted.violations.night_driving;
    summary.total_kilometer_violations += formatted.violations.kilometers;
    return summary;
  }, {
    total_records: 0,
    total_points_earned: 0,
    total_kilometers_earned: 0,
    total_violations: 0,
    total_speed_violations: 0,
    total_harsh_braking_violations: 0,
    total_day_driving_violations: 0,
    total_night_driving_violations: 0,
    total_kilometer_violations: 0
  });
}

// Monthly kilometers summary (fleet or filtered by driver/plate)
router.get('/monthly-kilometers', async (req, res) => {
  try {
    const { year, month, label, startIso, endIso } = getMonthWindow(req.query.year, req.query.month);
    const { driverName, plate } = req.query;

    let query = supabase
      .from('eps_engine_sessions')
      .select('id, plate, driver_name, session_start_time, session_end_time, start_mileage, current_mileage, end_mileage, distance_km')
      .gte('session_start_time', startIso)
      .lt('session_start_time', endIso)
      .order('session_start_time', { ascending: true });

    if (driverName) {
      query = query.eq('driver_name', driverName);
    }

    if (plate) {
      query = query.eq('plate', plate);
    }

    const { data, error } = await query;
    if (error) throw error;

    const sessions = (data || []).map(session => {
      const km = calculateSessionKilometers(session);
      return {
        ...session,
        calculated_kilometers: roundKm(km)
      };
    });

    const byDriverMap = new Map();
    const byPlateMap = new Map();

    for (const session of sessions) {
      const km = session.calculated_kilometers;
      const driverKey = session.driver_name || 'Unknown';
      const plateKey = session.plate || 'Unknown';

      if (!byDriverMap.has(driverKey)) {
        byDriverMap.set(driverKey, {
          driver_name: driverKey,
          kilometers: 0,
          sessions: 0,
          open_sessions: 0
        });
      }

      if (!byPlateMap.has(plateKey)) {
        byPlateMap.set(plateKey, {
          plate: plateKey,
          kilometers: 0,
          sessions: 0,
          open_sessions: 0
        });
      }

      const driverStats = byDriverMap.get(driverKey);
      driverStats.kilometers += km;
      driverStats.sessions += 1;
      if (!session.session_end_time) {
        driverStats.open_sessions += 1;
      }

      const plateStats = byPlateMap.get(plateKey);
      plateStats.kilometers += km;
      plateStats.sessions += 1;
      if (!session.session_end_time) {
        plateStats.open_sessions += 1;
      }
    }

    const totalKilometers = sessions.reduce((sum, session) => sum + session.calculated_kilometers, 0);
    const totalSessions = sessions.length;
    const openSessions = sessions.filter(session => !session.session_end_time).length;

    const byDriver = Array.from(byDriverMap.values())
      .map(item => ({ ...item, kilometers: roundKm(item.kilometers) }))
      .sort((a, b) => b.kilometers - a.kilometers);

    const byPlate = Array.from(byPlateMap.values())
      .map(item => ({ ...item, kilometers: roundKm(item.kilometers) }))
      .sort((a, b) => b.kilometers - a.kilometers);

    res.json({
      period: {
        year,
        month,
        label,
        start: startIso,
        end: endIso
      },
      filters: {
        driver_name: driverName || null,
        plate: plate || null
      },
      totals: {
        kilometers: roundKm(totalKilometers),
        sessions: totalSessions,
        closed_sessions: totalSessions - openSessions,
        open_sessions: openSessions
      },
      by_driver: byDriver,
      by_plate: byPlate
    });
  } catch (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') {
      return handleMissingEngineSessionsTable(res);
    }

    if (error.message && error.message.includes('Month must be between 1 and 12')) {
      return res.status(400).json({ error: error.message });
    }

    console.error('Error getting monthly kilometers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Monthly kilometers for a specific driver
router.get('/monthly-kilometers/driver/:driverName', async (req, res) => {
  try {
    const { driverName } = req.params;
    const { year, month, label, startIso, endIso } = getMonthWindow(req.query.year, req.query.month);

    const { data, error } = await supabase
      .from('eps_engine_sessions')
      .select('id, plate, driver_name, session_start_time, session_end_time, start_mileage, current_mileage, end_mileage, distance_km')
      .eq('driver_name', driverName)
      .gte('session_start_time', startIso)
      .lt('session_start_time', endIso)
      .order('session_start_time', { ascending: true });

    if (error) throw error;

    const sessions = (data || []).map(session => {
      const km = calculateSessionKilometers(session);
      return {
        id: session.id,
        plate: session.plate,
        session_start_time: session.session_start_time,
        session_end_time: session.session_end_time,
        start_mileage: session.start_mileage,
        end_mileage: session.end_mileage,
        current_mileage: session.current_mileage,
        kilometers: roundKm(km),
        open: !session.session_end_time
      };
    });

    const byPlateMap = new Map();
    for (const session of sessions) {
      const key = session.plate || 'Unknown';
      if (!byPlateMap.has(key)) {
        byPlateMap.set(key, {
          plate: key,
          kilometers: 0,
          sessions: 0,
          open_sessions: 0
        });
      }

      const stats = byPlateMap.get(key);
      stats.kilometers += session.kilometers;
      stats.sessions += 1;
      if (session.open) {
        stats.open_sessions += 1;
      }
    }

    const totalKilometers = sessions.reduce((sum, session) => sum + session.kilometers, 0);
    const openSessions = sessions.filter(session => session.open).length;

    res.json({
      driver_name: driverName,
      period: {
        year,
        month,
        label,
        start: startIso,
        end: endIso
      },
      totals: {
        kilometers: roundKm(totalKilometers),
        sessions: sessions.length,
        closed_sessions: sessions.length - openSessions,
        open_sessions: openSessions
      },
      by_plate: Array.from(byPlateMap.values())
        .map(item => ({ ...item, kilometers: roundKm(item.kilometers) }))
        .sort((a, b) => b.kilometers - a.kilometers),
      sessions
    });
  } catch (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') {
      return handleMissingEngineSessionsTable(res);
    }

    if (error.message && error.message.includes('Month must be between 1 and 12')) {
      return res.status(400).json({ error: error.message });
    }

    console.error('Error getting monthly driver kilometers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Monthly kilometer trend for the selected year
router.get('/monthly-kilometers/trend', async (req, res) => {
  try {
    const now = new Date();
    const requestedYear = parseInt(req.query.year, 10);
    const year = Number.isInteger(requestedYear) ? requestedYear : now.getFullYear();
    const { driverName, plate } = req.query;

    const startIso = new Date(Date.UTC(year, 0, 1)).toISOString();
    const endIso = new Date(Date.UTC(year + 1, 0, 1)).toISOString();

    let query = supabase
      .from('eps_engine_sessions')
      .select('session_start_time, start_mileage, current_mileage, end_mileage, distance_km')
      .gte('session_start_time', startIso)
      .lt('session_start_time', endIso);

    if (driverName) {
      query = query.eq('driver_name', driverName);
    }

    if (plate) {
      query = query.eq('plate', plate);
    }

    const { data, error } = await query;
    if (error) throw error;

    const monthBuckets = Array.from({ length: 12 }, (_, idx) => ({
      month: idx + 1,
      label: `${year}-${String(idx + 1).padStart(2, '0')}`,
      kilometers: 0,
      sessions: 0
    }));

    for (const session of data || []) {
      const start = new Date(session.session_start_time);
      if (Number.isNaN(start.getTime())) continue;

      const monthIndex = start.getUTCMonth();
      const km = calculateSessionKilometers(session);
      monthBuckets[monthIndex].kilometers += km;
      monthBuckets[monthIndex].sessions += 1;
    }

    for (const bucket of monthBuckets) {
      bucket.kilometers = roundKm(bucket.kilometers);
    }

    res.json({
      year,
      filters: {
        driver_name: driverName || null,
        plate: plate || null
      },
      months: monthBuckets
    });
  } catch (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') {
      return handleMissingEngineSessionsTable(res);
    }

    console.error('Error getting monthly kilometers trend:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get bi-weekly haul categories and overall points for all drivers
router.get('/bi-weekly-categories', async (req, res) => {
  try {
    const { driverName, periodStart, periodEnd, latestOnly = 'true' } = req.query;

    let query = supabase
      .from('eps_biweekly_category_points')
      .select('*')
      .order('period_start', { ascending: false })
      .order('updated_at', { ascending: false });

    if (driverName) {
      query = query.eq('driver_name', driverName);
    }
    if (periodStart) {
      query = query.gte('period_start', periodStart);
    }
    if (periodEnd) {
      query = query.lte('period_end', periodEnd);
    }

    const { data, error } = await query;
    if (error) {
      if (isMissingTableError(error)) {
        return handleMissingBiWeeklyTable(res);
      }
      throw error;
    }

    let rows = data || [];

    // Default behavior: latest row per driver unless a period filter is supplied
    const shouldLatestOnly = latestOnly !== 'false' && !periodStart && !periodEnd;
    if (shouldLatestOnly) {
      const latestByDriver = new Map();
      for (const row of rows) {
        if (!latestByDriver.has(row.driver_name)) {
          latestByDriver.set(row.driver_name, row);
        }
      }
      rows = Array.from(latestByDriver.values());
    }

    const categories = rows.map(formatBiWeeklyCategoryPoints).filter(Boolean);
    const summary = aggregateBiWeeklySummary(rows);

    res.json({
      filters: {
        driver_name: driverName || null,
        period_start: periodStart || null,
        period_end: periodEnd || null,
        latest_only: shouldLatestOnly
      },
      summary,
      categories
    });
  } catch (error) {
    console.error('Error getting bi-weekly categories:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Get overall risk score for insurance
router.get('/driver-risk-assessment', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('eps_driver_rewards')
      .select('*')
      .order('current_points', { ascending: true });
    
    if (error) throw error;
    
    // Calculate comprehensive risk score for insurance
    const driversWithRisk = data.map(driver => {
      const totalViolations = (driver.speed_violations_count || 0) + 
                             (driver.harsh_braking_count || 0) + 
                             (driver.night_driving_count || 0);
      
      // Insurance risk factors (0-100, higher = more risk)
      const pointsRisk = 100 - driver.current_points; // 0-100
      const violationRisk = Math.min(totalViolations * 5, 50); // Max 50 points
      const speedRisk = Math.min((driver.speed_violations_count || 0) * 10, 30); // Max 30 points
      const nightRisk = Math.min((driver.night_driving_count || 0) * 8, 20); // Max 20 points
      
      const overallRiskScore = Math.round(pointsRisk + violationRisk + speedRisk + nightRisk);
      
      return {
        driver_name: driver.driver_name,
        plate: driver.plate,
        current_points: driver.current_points,
        current_level: driver.current_level,
        total_violations: totalViolations,
        speed_violations: driver.speed_violations_count || 0,
        night_violations: driver.night_driving_count || 0,
        harsh_braking: driver.harsh_braking_count || 0,
        overall_risk_score: Math.min(overallRiskScore, 200), // Cap at 200
        risk_category: overallRiskScore <= 30 ? 'Low Risk' : 
                      overallRiskScore <= 70 ? 'Medium Risk' : 'High Risk',
        insurance_multiplier: overallRiskScore <= 30 ? 1.0 : 
                             overallRiskScore <= 70 ? 1.3 : 1.8
      };
    });
    
    const totalDrivers = driversWithRisk.length;
    const fleetRiskScore = totalDrivers > 0 ? 
      Math.round(driversWithRisk.reduce((sum, d) => sum + d.overall_risk_score, 0) / totalDrivers) : 0;
    
    res.json({
      fleet_overall_risk_score: fleetRiskScore,
      total_drivers: totalDrivers,
      risk_distribution: {
        low_risk: driversWithRisk.filter(d => d.risk_category === 'Low Risk').length,
        medium_risk: driversWithRisk.filter(d => d.risk_category === 'Medium Risk').length,
        high_risk: driversWithRisk.filter(d => d.risk_category === 'High Risk').length
      },
      average_insurance_multiplier: totalDrivers > 0 ? 
        (driversWithRisk.reduce((sum, d) => sum + d.insurance_multiplier, 0) / totalDrivers).toFixed(2) : 1.0,
      drivers: driversWithRisk.sort((a, b) => b.overall_risk_score - a.overall_risk_score)
    });
  } catch (error) {
    console.error('Error getting risk assessment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get monthly event counts (penalties)
router.get('/monthly-incident-criteria', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('eps_driver_rewards')
      .select('*');
    
    if (error) throw error;
    
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    
    // Calculate monthly totals
    const monthlyStats = {
      period: currentMonth,
      total_drivers: data.length,
      penalty_events: {
        speed_violations: data.reduce((sum, d) => sum + (d.speed_violations_count || 0), 0),
        harsh_braking: data.reduce((sum, d) => sum + (d.harsh_braking_count || 0), 0),
        night_driving: data.reduce((sum, d) => sum + (d.night_driving_count || 0), 0),
        total_penalties: data.reduce((sum, d) => sum + 
          (d.speed_violations_count || 0) + 
          (d.harsh_braking_count || 0) + 
          (d.night_driving_count || 0), 0)
      },
      points_deducted: data.reduce((sum, d) => sum + (d.points_deducted || 0), 0),
      drivers_affected: data.filter(d => (d.points_deducted || 0) > 0).length,
      performance_levels: {
        gold: data.filter(d => d.current_level === 'Gold').length,
        silver: data.filter(d => d.current_level === 'Silver').length,
        bronze: data.filter(d => d.current_level === 'Bronze').length,
        critical: data.filter(d => d.current_level === 'Critical').length
      }
    };
    
    res.json(monthlyStats);
  } catch (error) {
    console.error('Error getting monthly incident criteria:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function getTopSpeedingDriversData(query) {
  const parsedLimit = parseInt(query.limit, 10);
  const limit = Number.isInteger(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 100)) : 10;
  const hasMonthFilter = query.year !== undefined || query.month !== undefined;

  if (hasMonthFilter) {
    const { year, month, label, startIso, endIso } = getMonthWindow(query.year, query.month);

    const { data: dailyRows, error: dailyError } = await supabase
      .from('eps_daily_violations')
      .select('driver_name, plate, speeding_count, date')
      .gte('date', startIso.slice(0, 10))
      .lt('date', endIso.slice(0, 10));

    if (dailyError) throw dailyError;

    const aggregated = new Map();
    for (const row of dailyRows || []) {
      const driverName = row.driver_name;
      if (!driverName) continue;

      if (!aggregated.has(driverName)) {
        aggregated.set(driverName, {
          driver_name: driverName,
          plate: row.plate || null,
          speeding_violations: 0
        });
      }

      const entry = aggregated.get(driverName);
      entry.speeding_violations += toFiniteNumber(row.speeding_count);
      if (!entry.plate && row.plate) {
        entry.plate = row.plate;
      }
    }

    const driverNames = Array.from(aggregated.keys());
    const rewardsMap = new Map();
    if (driverNames.length > 0) {
      const { data: rewardRows, error: rewardError } = await supabase
        .from('eps_driver_rewards')
        .select('driver_name, plate, current_points, current_level, points_deducted, speed_violations_count')
        .in('driver_name', driverNames);

      if (rewardError) throw rewardError;

      for (const row of rewardRows || []) {
        rewardsMap.set(row.driver_name, row);
      }
    }

    const ranked = Array.from(aggregated.values())
      .sort((a, b) => b.speeding_violations - a.speeding_violations)
      .slice(0, limit)
      .map((entry, index) => {
        const rewards = rewardsMap.get(entry.driver_name);
        return {
          rank: index + 1,
          driver_name: entry.driver_name,
          plate: entry.plate || rewards?.plate || null,
          speeding_violations: entry.speeding_violations,
          points_deducted: toFiniteNumber(rewards?.points_deducted),
          current_points: toFiniteNumber(rewards?.current_points, 100),
          current_level: rewards?.current_level || getRewardLevel(toFiniteNumber(rewards?.current_points, 100)),
          lifetime_speed_violations: toFiniteNumber(rewards?.speed_violations_count)
        };
      });

    return {
      period: {
        type: 'month',
        year,
        month,
        label
      },
      source: 'eps_daily_violations',
      top_speeding_drivers: ranked
    };
  }

  const { data, error } = await supabase
    .from('eps_driver_rewards')
    .select('driver_name, plate, speed_violations_count, current_points, current_level, points_deducted')
    .order('speed_violations_count', { ascending: false })
    .limit(limit);

  if (error) throw error;

  const ranked = (data || []).map((driver, index) => ({
    rank: index + 1,
    driver_name: driver.driver_name,
    plate: driver.plate,
    speeding_violations: toFiniteNumber(driver.speed_violations_count),
    points_deducted: toFiniteNumber(driver.points_deducted),
    current_points: toFiniteNumber(driver.current_points, 100),
    current_level: driver.current_level || getRewardLevel(toFiniteNumber(driver.current_points, 100))
  }));

  return {
    period: {
      type: 'lifetime',
      label: 'Current standings'
    },
    source: 'eps_driver_rewards',
    top_speeding_drivers: ranked
  };
}

// Get top speeding drivers (default top 10)
router.get('/top-speeding-drivers', async (req, res) => {
  try {
    const payload = await getTopSpeedingDriversData(req.query);
    res.json(payload);
  } catch (error) {
    if (error.message && error.message.includes('Month must be between 1 and 12')) {
      return res.status(400).json({ error: error.message });
    }

    console.error('Error getting top speeding drivers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Backward-compatible alias
router.get('/top-worst-drivers', async (req, res) => {
  try {
    const payload = await getTopSpeedingDriversData(req.query);
    res.json(payload);
  } catch (error) {
    if (error.message && error.message.includes('Month must be between 1 and 12')) {
      return res.status(400).json({ error: error.message });
    }

    console.error('Error getting worst drivers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all drivers with comprehensive profiles
router.get('/all-driver-profiles', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('eps_driver_rewards')
      .select('*')
      .order('current_points', { ascending: false });
    
    if (error) throw error;
    
    const driverProfiles = data.map(driver => {
      const totalViolations = (driver.speed_violations_count || 0) + 
                             (driver.harsh_braking_count || 0) + 
                             (driver.night_driving_count || 0);
      
      const performanceRating = Math.max(0, 100 - (totalViolations * 5) - (driver.points_deducted || 0));
      
      const pointsRisk = 100 - driver.current_points;
      const violationRisk = Math.min(totalViolations * 5, 50);
      const speedRisk = Math.min((driver.speed_violations_count || 0) * 10, 30);
      const nightRisk = Math.min((driver.night_driving_count || 0) * 8, 20);
      const insuranceRiskScore = Math.min(pointsRisk + violationRisk + speedRisk + nightRisk, 200);
      
      const riskCategory = insuranceRiskScore <= 30 ? 'Low Risk' : 
                          insuranceRiskScore <= 70 ? 'Medium Risk' : 'High Risk';
      
      const insuranceMultiplier = insuranceRiskScore <= 30 ? 1.0 : 
                                 insuranceRiskScore <= 70 ? 1.3 : 1.8;
      
      return {
        driverName: driver.driver_name,
        plate: driver.plate,
        currentPoints: driver.current_points,
        performanceLevel: driver.current_level,
        scores: {
          performanceRating: Math.round(performanceRating),
          insuranceRiskScore: Math.round(insuranceRiskScore),
          riskCategory: riskCategory,
          insuranceMultiplier: parseFloat(insuranceMultiplier.toFixed(2))
        },
        violations: {
          total: totalViolations,
          speed: driver.speed_violations_count || 0,
          harshBraking: driver.harsh_braking_count || 0,
          nightDriving: driver.night_driving_count || 0
        }
      };
    });
    
    res.json({
      totalDrivers: driverProfiles.length,
      drivers: driverProfiles
    });
  } catch (error) {
    console.error('Error getting all driver profiles:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get comprehensive driver profile with scores and insurance info
router.get('/driver-profile/:driverName', async (req, res) => {
  try {
    const { driverName } = req.params;
    
    // Get driver rewards data
    const { data, error } = await supabase
      .from('eps_driver_rewards')
      .select('*')
      .eq('driver_name', driverName)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Driver not found' });
      }
      throw error;
    }
    
    // Calculate comprehensive scores
    const totalViolations = (data.speed_violations_count || 0) + 
                           (data.harsh_braking_count || 0) + 
                           (data.night_driving_count || 0);
    
    // Performance Rating (0-100)
    const performanceRating = Math.max(0, 100 - (totalViolations * 5) - (data.points_deducted || 0));
    
    // Insurance Risk Score (0-200)
    const pointsRisk = 100 - data.current_points;
    const violationRisk = Math.min(totalViolations * 5, 50);
    const speedRisk = Math.min((data.speed_violations_count || 0) * 10, 30);
    const nightRisk = Math.min((data.night_driving_count || 0) * 8, 20);
    const insuranceRiskScore = Math.min(pointsRisk + violationRisk + speedRisk + nightRisk, 200);
    
    // Risk Category
    const riskCategory = insuranceRiskScore <= 30 ? 'Low Risk' : 
                        insuranceRiskScore <= 70 ? 'Medium Risk' : 'High Risk';
    
    // Insurance Multiplier
    const insuranceMultiplier = insuranceRiskScore <= 30 ? 1.0 : 
                               insuranceRiskScore <= 70 ? 1.3 : 1.8;
    
    const driverProfile = {
      // Basic Info
      driverName: data.driver_name,
      plate: data.plate,
      lastUpdated: data.last_updated,
      
      // Current Status
      currentPoints: data.current_points,
      pointsDeducted: data.points_deducted,
      performanceLevel: data.current_level,
      
      // Scores
      scores: {
        performanceRating: Math.round(performanceRating),
        insuranceRiskScore: Math.round(insuranceRiskScore),
        riskCategory: riskCategory,
        insuranceMultiplier: parseFloat(insuranceMultiplier.toFixed(2))
      },
      
      // Violation Details
      violations: {
        total: totalViolations,
        speed: data.speed_violations_count || 0,
        harshBraking: data.harsh_braking_count || 0,
        nightDriving: data.night_driving_count || 0,
        route: data.route_violations_count || 0,
        other: data.other_violations_count || 0
      },
      
      // Threshold Status
      thresholds: {
        speedExceeded: data.speed_threshold_exceeded || false,
        brakingExceeded: data.braking_threshold_exceeded || false,
        nightExceeded: data.night_threshold_exceeded || false,
        routeExceeded: data.route_threshold_exceeded || false,
        otherExceeded: data.other_threshold_exceeded || false
      },
      
      // Risk Breakdown
      riskBreakdown: {
        pointsRisk: Math.round(pointsRisk),
        violationRisk: Math.round(violationRisk),
        speedRisk: Math.round(speedRisk),
        nightRisk: Math.round(nightRisk)
      }
    };
    
    res.json(driverProfile);
  } catch (error) {
    console.error('Error getting driver profile:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Get penalty cap information for a specific driver (legacy endpoint)
router.get('/penalty-cap/:driverName', async (req, res) => {
  try {
    const { driverName } = req.params;
    
    // Get driver rewards data
    const { data, error } = await supabase
      .from('eps_driver_rewards')
      .select('*')
      .eq('driver_name', driverName)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Driver not found' });
      }
      throw error;
    }
    
    // Calculate penalty info based on current system
    const penaltyInfo = {
      driverName: data.driver_name,
      plate: data.plate,
      currentPoints: data.current_points,
      pointsDeducted: data.points_deducted,
      currentLevel: data.current_level,
      violationBreakdown: {
        speedViolations: data.speed_violations_count,
        harshBraking: data.harsh_braking_count,
        nightDriving: data.night_driving_count,
        routeViolations: data.route_violations_count,
        otherViolations: data.other_violations_count
      },
      thresholdStatus: {
        speedThresholdExceeded: data.speed_threshold_exceeded,
        brakingThresholdExceeded: data.braking_threshold_exceeded,
        nightThresholdExceeded: data.night_threshold_exceeded,
        routeThresholdExceeded: data.route_threshold_exceeded,
        otherThresholdExceeded: data.other_threshold_exceeded
      }
    };
    
    res.json(penaltyInfo);
  } catch (error) {
    console.error('Error getting penalty cap info:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Get executive dashboard
router.get('/executive-dashboard', async (req, res) => {
  try {
    const dashboard = {
      fleet_summary: {
        total_vehicles: 0,
        active_vehicles: 0,
        inactive_vehicles: 0
      },
      driver_performance: {
        total_drivers: 0,
        average_points: 100,
        performance_levels: {
          gold: 0,
          silver: 0,
          bronze: 0,
          critical: 0
        }
      },
      violations_summary: {
        speed_violations: 0,
        route_violations: 0,
        night_violations: 0,
        total_violations: 0
      },
      fuel_summary: {
        total_readings: 0,
        average_fuel_percentage: 0,
        low_fuel_vehicles: 0
      },
      status: 'OK'
    };
    
    // Get vehicle count
    const { data: vehicles, error: vehicleError } = await supabase
      .from('eps_vehicles')
      .select('engine_status');
    
    if (!vehicleError && vehicles) {
      dashboard.fleet_summary.total_vehicles = vehicles.length;
      dashboard.fleet_summary.active_vehicles = vehicles.filter(v => v.engine_status === 'ON').length;
      dashboard.fleet_summary.inactive_vehicles = vehicles.length - dashboard.fleet_summary.active_vehicles;
    }
    
    // Get driver performance summary
    const { data: drivers, error: driverError } = await supabase
      .from('eps_driver_rewards')
      .select('current_points, current_level');
    
    if (!driverError && drivers) {
      dashboard.driver_performance.total_drivers = drivers.length;
      if (drivers.length > 0) {
        dashboard.driver_performance.average_points = Math.round(
          drivers.reduce((sum, d) => sum + d.current_points, 0) / drivers.length
        );
        dashboard.driver_performance.performance_levels = {
          gold: drivers.filter(d => d.current_level === 'Gold').length,
          silver: drivers.filter(d => d.current_level === 'Silver').length,
          bronze: drivers.filter(d => d.current_level === 'Bronze').length,
          critical: drivers.filter(d => d.current_level === 'Critical').length
        };
      }
    }
    
    // Get recent violations from driver rewards
    if (!driverError && drivers) {
      const totalSpeedViolations = drivers.reduce((sum, d) => sum + (d.speed_violations_count || 0), 0);
      const totalRouteViolations = drivers.reduce((sum, d) => sum + (d.route_violations_count || 0), 0);
      const totalNightViolations = drivers.reduce((sum, d) => sum + (d.night_driving_count || 0), 0);
      
      dashboard.violations_summary = {
        speed_violations: totalSpeedViolations,
        route_violations: totalRouteViolations,
        night_violations: totalNightViolations,
        total_violations: totalSpeedViolations + totalRouteViolations + totalNightViolations
      };
    }
    
    // Get fuel data summary
    const { data: fuelData, error: fuelError } = await supabase
      .from('eps_fuel_data')
      .select('fuel_percentage')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    
    if (!fuelError && fuelData) {
      dashboard.fuel_summary.total_readings = fuelData.length;
      if (fuelData.length > 0) {
        dashboard.fuel_summary.average_fuel_percentage = Math.round(
          fuelData.reduce((sum, f) => sum + (f.fuel_percentage || 0), 0) / fuelData.length
        );
        dashboard.fuel_summary.low_fuel_vehicles = fuelData.filter(f => f.fuel_percentage < 20).length;
      }
    }
    
    res.json(dashboard);
  } catch (error) {
    console.error('Error getting executive dashboard:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    // Check Supabase connection
    const { data, error } = await supabase
      .from('eps_driver_rewards')
      .select('count')
      .limit(1);
    
    if (error) throw error;
    
    res.json({
      status: 'healthy',
      database_connection: 'ok',
      database_type: 'Supabase',
      current_time: new Date().toISOString(),
      message: 'EPS rewards service is running with Supabase'
    });
  } catch (error) {
    console.error('EPS rewards health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: 'Supabase connection failed',
      details: error.message
    });
  }
});

module.exports = router;
