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

  async checkETA(vehicleLat, vehicleLng, destinationLat, destinationLng, deadline) {
    try {
      const cacheKey = `${vehicleLat},${vehicleLng}-${destinationLat},${destinationLng}`;
      const cached = this.etaCache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        return this.calculateStatus(cached.duration, deadline);
      }

      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${vehicleLng},${vehicleLat};${destinationLng},${destinationLat}`;
      const response = await axios.get(url, {
        params: {
          access_token: this.mapboxToken,
          geometries: 'geojson',
          overview: 'full',
          steps: false
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

      return this.calculateStatus(durationSeconds, deadline, distanceMeters);
    } catch (error) {
      console.error('❌ Error checking ETA:', error.message);
      return null;
    }
  }

  calculateStatus(durationSeconds, deadline, distanceMeters = null) {
    const now = new Date();
    const deadlineTime = new Date(deadline);
    const eta = new Date(now.getTime() + durationSeconds * 1000);
    const timeRemaining = deadlineTime - now;
    const timeNeeded = durationSeconds * 1000;
    const buffer = timeRemaining - timeNeeded;

    return {
      will_arrive_on_time: buffer > 0,
      eta: eta.toISOString(),
      deadline: deadlineTime.toISOString(),
      duration_minutes: Math.round(durationSeconds / 60),
      distance_km: distanceMeters ? (distanceMeters / 1000).toFixed(1) : null,
      buffer_minutes: Math.round(buffer / 60000),
      status: buffer > 0 ? 'on_time' : 'delayed'
    };
  }
}

module.exports = ETAMonitor;
