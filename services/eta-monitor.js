const axios = require('axios');

class ETAMonitor {
  constructor() {
    this.mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    this.etaCache = new Map();
    this.geocodeCache = new Map();
    this.CACHE_DURATION = 5 * 60 * 1000;
  }
  
  async geocode(address) {
    if (this.geocodeCache.has(address)) {
      return this.geocodeCache.get(address);
    }
    
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`;
      const response = await axios.get(url, {
        params: {
          access_token: this.mapboxToken,
          limit: 1
        }
      });
      
      if (response.data.features && response.data.features.length > 0) {
        const coords = response.data.features[0].center;
        const result = { lng: coords[0], lat: coords[1] };
        this.geocodeCache.set(address, result);
        return result;
      }
      
      return null;
    } catch (error) {
      console.error('❌ Geocoding error:', error.message);
      return null;
    }
  }

  async checkETA(vehicleLat, vehicleLng, destinationLat, destinationLng, deadline = null, vehicleLocTime = null) {
    try {
      const cacheKey = `${vehicleLat},${vehicleLng}-${destinationLat},${destinationLng}`;
      const cached = this.etaCache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        return this.calculateStatus(cached.duration, deadline, cached.distance, vehicleLocTime);
      }

      // Use Mapbox Directions API with traffic profile for maximum accuracy
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${vehicleLng},${vehicleLat};${destinationLng},${destinationLat}`;
      const response = await axios.get(url, {
        params: {
          access_token: this.mapboxToken,
          geometries: 'geojson',
          overview: 'full',
          steps: false,
          annotations: 'duration,distance'
        }
      });

      if (!response.data.routes || response.data.routes.length === 0) {
        return null;
      }

      const route = response.data.routes[0];
      const durationSeconds = route.duration;
      const distanceMeters = route.distance;

      this.etaCache.set(cacheKey, {
        duration: durationSeconds,
        distance: distanceMeters,
        timestamp: Date.now()
      });

      return this.calculateStatus(durationSeconds, deadline, distanceMeters, vehicleLocTime);
    } catch (error) {
      console.error('❌ Error checking ETA:', error.message);
      return null;
    }
  }

  calculateStatus(durationSeconds, deadline = null, distanceMeters = null, vehicleLocTime = null) {
    // Use vehicle loc_time if provided, otherwise use server time
    let now;
    if (vehicleLocTime) {
      // Add 2 hours to vehicle time for SAST timezone
      now = new Date(new Date(vehicleLocTime).getTime() + 2 * 60 * 60 * 1000);
    } else {
      now = new Date();
    }
    
    const eta = new Date(now.getTime() + durationSeconds * 1000);
    const hasDeadline = Boolean(deadline && !Number.isNaN(new Date(deadline).getTime()));

    if (!hasDeadline) {
      return {
        will_arrive_on_time: null,
        eta: eta.toISOString(),
        deadline: null,
        original_deadline: null,
        duration_minutes: Math.round(durationSeconds / 60),
        distance_km: distanceMeters ? (distanceMeters / 1000).toFixed(1) : null,
        buffer_minutes: null,
        status: 'eta_only'
      };
    }

    const deadlineTime = new Date(deadline);

    // Add 2 hours to deadline for SAST timezone
    const adjustedDeadline = new Date(deadlineTime.getTime() + 2 * 60 * 60 * 1000);
    const timeRemaining = adjustedDeadline - now;
    const timeNeeded = durationSeconds * 1000;
    const buffer = timeRemaining - timeNeeded;

    return {
      will_arrive_on_time: buffer > 0,
      eta: eta.toISOString(),
      deadline: adjustedDeadline.toISOString(),
      original_deadline: deadlineTime.toISOString(),
      duration_minutes: Math.round(durationSeconds / 60),
      distance_km: distanceMeters ? (distanceMeters / 1000).toFixed(1) : null,
      buffer_minutes: Math.round(buffer / 60000),
      status: buffer > 0 ? 'on_time' : 'delayed'
    };
  }
}

module.exports = ETAMonitor;
