const { createClient } = require('@supabase/supabase-js');

class StatusMonitor {
  constructor(company = 'eps') {
    this.company = company;
    const supabaseUrl = company === 'maysene' 
      ? process.env.NEXT_PUBLIC_MAYSENE_SUPABASE_URL
      : process.env.NEXT_PUBLIC_EPS_SUPABASE_URL;
    const supabaseKey = company === 'maysene'
      ? process.env.NEXT_PUBLIC_MAYSENE_SUPABASE_ANON_KEY
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

  async checkAllStatuses() {
    try {
      const { data: trips } = await this.supabase
        .from('trips')
        .select('id, status, status_history, vehicleassignments, updated_at')
        .not('status', 'in', '(delivered,on-trip)');
      
      if (!trips) return;
      
      const now = Date.now();
      
      for (const trip of trips) {
        const limit = this.STATUS_LIMITS[trip.status];
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
          await this.flagStatusDelay(trip, duration);
        }
      }
    } catch (error) {
      console.error('❌ Error checking statuses:', error.message);
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
        .select('alert_message, vehicleassignments')
        .eq('id', trip.id)
        .single();
      
      const alerts = tripData?.alert_message || [];
      
      // Get driver/vehicle info
      let driverName = 'Unknown';
      let plate = 'Unknown';
      
      if (tripData?.vehicleassignments) {
        const assignments = typeof tripData.vehicleassignments === 'string' 
          ? JSON.parse(tripData.vehicleassignments) 
          : tripData.vehicleassignments;
        
        const assignmentArray = Array.isArray(assignments) ? assignments : [assignments];
        
        for (const assignment of assignmentArray) {
          if (assignment.drivers) {
            const drivers = Array.isArray(assignment.drivers) ? assignment.drivers : [assignment.drivers];
            const driver = drivers[0];
            if (driver && driver.name) {
              driverName = driver.name;
            }
          }
          if (assignment.vehicle && assignment.vehicle.name) {
            plate = assignment.vehicle.name;
          }
        }
      }
      
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
