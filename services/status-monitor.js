const { createClient } = require('@supabase/supabase-js');

class StatusMonitor {
  constructor(company = 'eps') {
    this.company = company;
    const isMaysene = company === 'maysene';
    const isWaterford = company === 'waterford';
    const supabaseUrl = isMaysene
      ? process.env.NEXT_PUBLIC_MAYSENE_SUPABASE_URL
      : isWaterford
        ? process.env.NEXT_PUBLIC_WATERFORD_SUPABASE_URL || process.env.NEXT_PUBLIC_EPS_SUPABASE_URL
        : process.env.NEXT_PUBLIC_EPS_SUPABASE_URL;
    const supabaseKey = isMaysene
      ? process.env.NEXT_PUBLIC_MAYSENE_SUPABASE_ANON_KEY
      : isWaterford
        ? process.env.NEXT_PUBLIC_WATERFORD_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY
        : process.env.NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY;
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.statusTimestamps = new Map();
    this.alertedTrips = new Map();
    
    // Status time limits (in milliseconds)
    this.STATUS_LIMITS = {
      'pending': 10 * 60 * 1000,              // 10 minutes
      'accepted': 30 * 60 * 1000,             // 30 minutes
      'arrived-at-loading': 30 * 60 * 1000,   // 30 minutes
      'staging-area': 30 * 60 * 1000,         // 30 minutes
      'loading': 60 * 60 * 1000,              // 60 minutes
      'on-trip': null,                        // No limit
      'offloading': 60 * 60 * 1000,           // 60 minutes (delivery)
      'weighing': 30 * 60 * 1000,             // 30 minutes
      'depo': 30 * 60 * 1000,                 // 30 minutes
      'handover': 30 * 60 * 1000,             // 30 minutes
      'delivered': null                        // No limit (final status)
    };
    
    this.STATUS_REASONS = {
      'pending': 'Driver has not accepted trip',
      'accepted': 'Driver has not arrived at loading location',
      'arrived-at-loading': 'Driver has not started staging',
      'staging-area': 'Driver has not started loading',
      'loading': 'Loading is taking too long',
      'offloading': 'Delivery/offloading is taking too long',
      'weighing': 'Weighing process is taking too long',
      'depo': 'Depo process is taking too long',
      'handover': 'Handover process is taking too long'
    };
    
    this.startMonitoring();
  }

  startMonitoring() {
    // Check status durations every 5 minutes
    setInterval(() => this.checkAllStatuses(), 5 * 60 * 1000);
    
    // Setup realtime listener for status changes
    this.supabase
      .channel('status-changes')
      .on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'trips', filter: `status=neq.delivered` },
        (payload) => {
          if (payload.new.status !== payload.old.status) {
            this.onStatusChange(payload.new.id, payload.new.status);
          }
        }
      )
      .subscribe();
    
    console.log('📊 Status monitoring started');
  }

  onStatusChange(tripId, newStatus) {
    const now = Date.now();
    this.statusTimestamps.set(tripId, { status: newStatus, timestamp: now });
    
    // Clear alert for this trip when status changes
    const alertKey = `status_delay:${tripId}`;
    this.alertedTrips.delete(alertKey);
    
    console.log(`📝 Trip ${tripId} status changed to: ${newStatus}`);
  }

  getAllAssignments(trip) {
    const parseAssignments = (value) => {
      if (!value) return [];
      let assignments = value;
      if (typeof assignments === 'string') {
        assignments = JSON.parse(assignments);
      }
      if (!Array.isArray(assignments)) {
        assignments = [assignments];
      }
      return assignments.filter(Boolean);
    };

    return [
      ...parseAssignments(trip.vehicleassignments),
      ...parseAssignments(trip.handed_vehicleassignments)
    ];
  }

  getPrimaryDriverAndPlate(trip) {
    let driverName = 'Unknown';
    let plate = 'Unknown';

    for (const assignment of this.getAllAssignments(trip)) {
      const drivers = Array.isArray(assignment.drivers) ? assignment.drivers : [assignment.drivers].filter(Boolean);
      if (drivers.length > 0 && driverName === 'Unknown') {
        const driver = drivers[0];
        driverName =
          driver?.name ||
          driver?.surname ||
          driver?.first_name ||
          driverName;
      }

      const vehiclePlate =
        assignment?.vehicle?.registration_number ||
        assignment?.vehicle?.plate ||
        assignment?.vehicle?.name;
      if (vehiclePlate && plate === 'Unknown') {
        plate = vehiclePlate;
      }
    }

    return { driverName, plate };
  }

  async checkAllStatuses() {
    try {
      const { data: trips } = await this.supabase
        .from('trips')
        .select('id, status, status_history, vehicleassignments, handed_vehicleassignments, updated_at, created_at, accepted_at, late_acceptance, late_arrival')
        .not('status', 'in', '(delivered,on-trip,completed,cancelled,Delivered,On-Trip,Completed,Cancelled)');
      
      if (!trips) return;
      
      const now = Date.now();
      
      for (const trip of trips) {
        const statusKey = String(trip.status || '').toLowerCase();
        const limit = this.STATUS_LIMITS[statusKey];
        if (!limit) continue;
        
        // Get status timestamp
        let statusTimestamp;
        const cached = this.statusTimestamps.get(trip.id);
        
        if (cached && cached.status === trip.status) {
          statusTimestamp = cached.timestamp;
        } else if (trip.status_history && trip.status_history.length > 0) {
          // Get timestamp from latest status_history entry
          const latestStatus = trip.status_history[trip.status_history.length - 1];
          const statusData = typeof latestStatus === 'string' ? JSON.parse(latestStatus) : latestStatus;
          if (statusData.timestamp) {
            statusTimestamp = new Date(statusData.timestamp).getTime();
            this.statusTimestamps.set(trip.id, { status: trip.status, timestamp: statusTimestamp });
          } else {
            continue;
          }
        } else if (trip.updated_at) {
          // Fallback to updated_at
          statusTimestamp = new Date(trip.updated_at).getTime();
          this.statusTimestamps.set(trip.id, { status: trip.status, timestamp: statusTimestamp });
        } else {
          continue;
        }
        
        const duration = now - statusTimestamp;
        
        if (duration >= limit) {
          if (statusKey === 'pending' && !trip.late_acceptance) {
            await this.flagSpecificDelay(trip, duration, 'late_acceptance', 'Driver has not accepted trip');
            continue;
          }

          if (statusKey === 'accepted' && !trip.late_arrival) {
            await this.flagSpecificDelay(trip, duration, 'late_arrival', 'Driver has not arrived at loading location');
            continue;
          }

          await this.flagStatusDelay(trip, duration);
        }
      }
    } catch (error) {
      console.error('❌ Error checking statuses:', error.message);
    }
  }

  async flagSpecificDelay(trip, duration, flagKey, reason) {
    const alertKey = `${flagKey}:${trip.id}`;
    if (this.alertedTrips.has(alertKey)) return;

    const durationMinutes = Math.round(duration / 60000);
    const timestamp = new Date().toISOString();
    const { driverName, plate } = this.getPrimaryDriverAndPlate(trip);

    try {
      const { data: tripData } = await this.supabase
        .from('trips')
        .select('alert_message')
        .eq('id', trip.id)
        .single();

      let alerts = tripData?.alert_message || [];
      if (!Array.isArray(alerts)) {
        alerts = [];
      }

      alerts.push({
        type: flagKey,
        message: `${reason} (${durationMinutes} minutes)`,
        status: trip.status,
        duration_minutes: durationMinutes,
        reason,
        driver: driverName,
        vehicle: plate,
        timestamp
      });

      await this.supabase
        .from('trips')
        .update({
          [flagKey]: true,
          alert_type: flagKey,
          alert_message: alerts,
          alert_timestamp: timestamp,
          updated_at: timestamp
        })
        .eq('id', trip.id);

      this.alertedTrips.set(alertKey, Date.now());
    } catch (error) {
      console.error('âŒ Error flagging specific status delay:', error.message);
    }
  }

  async flagStatusDelay(trip, duration) {
    const alertKey = `status_delay:${trip.id}`;
    if (this.alertedTrips.has(alertKey)) return;
    
    const durationMinutes = Math.round(duration / 60000);
    const limitMinutes = Math.round(this.STATUS_LIMITS[trip.status] / 60000);
    const reason = this.STATUS_REASONS[trip.status] || 'Status duration exceeded';
    
    try {
      const timestamp = new Date().toISOString();
      const { data: tripData } = await this.supabase
        .from('trips')
        .select('alert_message')
        .eq('id', trip.id)
        .single();
      
      let alerts = tripData?.alert_message || [];
      if (!Array.isArray(alerts)) {
        alerts = [];
      }

      const { driverName, plate } = this.getPrimaryDriverAndPlate(trip);
      
      alerts.push({
        type: 'status_delay',
        message: `Trip stuck in "${trip.status}" status for ${durationMinutes} minutes (limit: ${limitMinutes} min)`,
        status: trip.status,
        duration_minutes: durationMinutes,
        limit_minutes: limitMinutes,
        reason: reason,
        driver: driverName,
        vehicle: plate,
        timestamp
      });
      
      await this.supabase
        .from('trips')
        .update({
          alert_type: 'status_delay',
          alert_message: alerts,
          alert_timestamp: timestamp,
          updated_at: timestamp
        })
        .eq('id', trip.id);
      
      this.alertedTrips.set(alertKey, Date.now());
      console.log(`⏱️ STATUS DELAY: Trip ${trip.id} - ${trip.status} for ${durationMinutes}min (${driverName}/${plate}) - ${reason}`);
    } catch (error) {
      console.error('❌ Error flagging status delay:', error.message);
    }
  }

  destroy() {
    // Cleanup if needed
  }
}

module.exports = StatusMonitor;
