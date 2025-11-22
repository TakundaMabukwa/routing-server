const CTrackClient = require('./ctrack-client');
const CTrackVehicleDB = require('./ctrack-vehicle-db');

class CTrackPoller {
  constructor(tripMonitor, highRiskMonitor, tollGateMonitor, borderMonitor, vehicleCache, sseClients, wsClients, rewardSystem) {
    this.client = new CTrackClient();
    this.vehicleDB = new CTrackVehicleDB();
    this.tripMonitor = tripMonitor;
    this.highRiskMonitor = highRiskMonitor;
    this.tollGateMonitor = tollGateMonitor;
    this.borderMonitor = borderMonitor;
    this.vehicleCache = vehicleCache;
    this.sseClients = sseClients;
    this.wsClients = wsClients;
    this.rewardSystem = rewardSystem;
    this.pollInterval = 15000;
    this.vehicleRefreshInterval = 600000; // 10 minutes
    this.isRunning = false;
    this.driverCache = new Map();
    this.rateLimitBackoff = 0;
  }

  async start() {
    if (this.isRunning) return;

    console.log('🚀 Starting C-Track poller (15s interval)...');
    this.isRunning = true;

    try {
      await this.client.authenticate();
      const vehicleMap = await this.client.getVehicles();
      const vehicles = Array.from(vehicleMap.values());
      this.vehicleDB.saveVehicles(vehicles);
      
      await this.loadDriversForVehicles();
    } catch (error) {
      console.log('⚠️ C-Track initialization failed, will retry on next poll');
    }

    this.poll();
    this.scheduleVehicleRefresh();
  }

  scheduleVehicleRefresh() {
    setInterval(async () => {
      try {
        console.log('🔄 Refreshing vehicle data from C-Track...');
        const vehicleMap = await this.client.getVehicles();
        const vehicles = Array.from(vehicleMap.values());
        this.vehicleDB.saveVehicles(vehicles);
      } catch (error) {
        console.log('⚠️ Vehicle refresh failed:', error.message);
      }
    }, this.vehicleRefreshInterval);
  }

  async poll() {
    if (!this.isRunning) return;

    try {
      await this.fetchAndProcessData();
      this.rateLimitBackoff = 0; // Reset on success
    } catch (error) {
      if (error.message === 'Authentication failed') {
        this.rateLimitBackoff = Math.min(this.rateLimitBackoff + 1, 10);
        console.log(`⏳ Rate limited, waiting ${this.rateLimitBackoff * 15}s before retry`);
      } else {
        console.error('❌ Polling error:', error.message);
      }
    }

    // Schedule next poll with backoff
    const delay = this.pollInterval * (1 + this.rateLimitBackoff);
    setTimeout(() => this.poll(), delay);
  }

  async fetchAndProcessData() {
    const data = await this.client.getLastDevicePositions();
    
    if (!data) {
      console.log('⚠️ No data from C-Track API');
      return;
    }
    
    // C-Track returns {count, privateTrip: [], businessTrip: []}
    const positions = [
      ...(data.privateTrip || []),
      ...(data.businessTrip || [])
    ];
    
    if (positions.length === 0) {
      console.log('⚠️ C-Track returned 0 positions');
      return;
    }

    console.log(`📍 Processing ${positions.length} vehicle positions from C-Track`);

    for (const position of positions) {
      await this.processVehiclePosition(position);
    }
  }

  async processVehiclePosition(position) {
    try {
      const vehicleData = this.transformToStandardFormat(position);
      
      if (!vehicleData.Latitude || !vehicleData.Longitude) return;

      const vehicle = this.vehicleDB.getVehicle(position.vehicleId);
      if (vehicle) {
        vehicleData.Plate = vehicle.registration_number || vehicle.display_name || position.vehicleId;
      } else {
        vehicleData.Plate = position.vehicleId;
      }

      if (position.driverId && position.driverId !== '') {
        if (!this.driverCache.has(position.driverId)) {
          const driver = await this.client.getDriver(position.driverId);
          if (driver) {
            this.driverCache.set(position.driverId, driver);
            vehicleData.DriverName = driver.displayName || driver.surname || 'Unknown';
          }
        } else {
          const cachedDriver = this.driverCache.get(position.driverId);
          vehicleData.DriverName = cachedDriver.displayName || cachedDriver.surname || 'Unknown';
        }
        
        if (vehicle) {
          vehicle.currentDriver = vehicleData.DriverName;
        }
      }

      this.vehicleDB.saveFormattedVehicle(vehicleData);
      
      if (this.vehicleCache) {
        this.vehicleCache.set(`eps:${vehicleData.Plate}`, vehicleData);
      }
      
      if (this.sseClients && this.sseClients.size > 0) {
        this.sseClients.forEach(client => {
          client.write(`data: ${JSON.stringify({ plate: vehicleData.Plate, data: vehicleData })}\n\n`);
        });
      }
      
      if (this.wsClients && this.wsClients.size > 0) {
        this.wsClients.forEach(client => {
          if (client.readyState === 1) {
            client.send(JSON.stringify({ type: 'ctrack-update', data: vehicleData }));
          }
        });
      }

      if (this.tripMonitor && vehicleData.DriverName) {
        await this.tripMonitor.processVehicleData(vehicleData, this.borderMonitor);
      }

      if (this.highRiskMonitor) {
        await this.highRiskMonitor.checkVehicleLocation(vehicleData);
      }

      if (this.tollGateMonitor) {
        await this.tollGateMonitor.checkVehicleLocation(vehicleData);
      }

      if (this.rewardSystem && vehicleData.DriverName && vehicleData.Plate) {
        await this.rewardSystem.processEPSData(vehicleData);
      }

    } catch (error) {
      console.error('❌ Error processing vehicle position:', error.message);
    }
  }

  transformToStandardFormat(position) {
    const addr = position.address || {};
    const loc = position.locationDetail || {};
    
    const addressParts = [
      addr.street,
      addr.district,
      addr.city,
      addr.postalcode,
      addr.country
    ].filter(Boolean);
    
    const geozoneParts = [
      loc.name,
      addressParts.join(', ')
    ].filter(Boolean);
    
    return {
      Plate: position.vehicleId || position.deviceId,
      Speed: position.speed || 0,
      Latitude: position.latitude,
      Longitude: position.longitude,
      LocTime: position.eventDateTimeUTC?.replace('T', ' ').replace('Z', '') || new Date().toISOString(),
      Quality: '',
      Mileage: Math.round(position.runningOdo / 1000) || 0,
      Pocsagstr: '',
      Head: position.heading || 0,
      Geozone: geozoneParts.join(', '),
      DriverName: null,
      NameEvent: position.statusText || '',
      Temperature: '',
      Address: geozoneParts.join(', '),
      Statuses: '',
      Rules: '',
      IP: '',
      parseMethod: 'C-Track API',
      timestamp: new Date().toISOString(),
      VehicleId: position.vehicleId,
      DeviceId: position.deviceId,
      DriverId: position.driverId
    };
  }

  async loadDriversForVehicles() {
    const vehicles = this.vehicleDB.getAllVehicles();
    const vehiclesWithDrivers = vehicles.filter(v => v.driver_id);
    
    for (const vehicle of vehiclesWithDrivers) {
      if (!this.driverCache.has(vehicle.driver_id)) {
        const driver = await this.client.getDriver(vehicle.driver_id);
        if (driver) {
          this.driverCache.set(vehicle.driver_id, driver);
        }
      }
    }
    
    console.log(`✅ Loaded ${this.driverCache.size} drivers`);
  }

  stop() {
    console.log('🛑 Stopping C-Track poller...');
    this.isRunning = false;
  }
}

module.exports = CTrackPoller;
