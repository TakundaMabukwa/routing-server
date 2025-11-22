const axios = require('axios');

class CTrackClient {
  constructor() {
    this.baseURL = process.env.CTRACK_BASE_URL || 'https://stgapi.ctrackcrystal.co.za/api';
    this.username = process.env.CTRACK_USERNAME;
    this.password = process.env.CTRACK_PASSWORD;
    this.subscriptionKey = process.env.CTRACK_PK;
    this.tenantId = process.env.CTRACK_TENANT_ID;
    this.token = null;
    this.tokenExpiry = null;
  }

  async authenticate() {
    try {
      const response = await axios.post(
        `${this.baseURL}/Authenticate/Login`,
        {
          username: this.username,
          password: this.password
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Ocp-Apim-Subscription-Key': this.subscriptionKey
          }
        }
      );

      this.token = response.data.jwt;
      this.tokenExpiry = new Date(response.data.validToUtc);
      console.log('✅ C-Track authenticated');
      return true;
    } catch (error) {
      if (error.response?.data?.statusCode === 429) {
        console.log('⏳ Rate limited, will retry later');
      } else {
        console.error('❌ Auth failed:', error.response?.data?.message || error.message);
      }
      return false;
    }
  }

  async ensureAuthenticated() {
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
    if (!this.token || !this.tokenExpiry || oneHourFromNow >= this.tokenExpiry) {
      const success = await this.authenticate();
      if (!success) {
        throw new Error('Authentication failed');
      }
    }
  }

  async getVehicles() {
    try {
      await this.ensureAuthenticated();
      
      const response = await axios.get(
        `${this.baseURL}/Vehicle/GetVehicles`,
        {
          headers: {
            'Ocp-Apim-Subscription-Key': this.subscriptionKey,
            'x-token': this.token,
            'x-tenant': this.tenantId
          }
        }
      );

      const vehicles = response.data.vehicles || [];
      const vehicleMap = new Map();
      vehicles.forEach(v => vehicleMap.set(v.id, v));
      return vehicleMap;
    } catch (error) {
      if (error.message === 'Authentication failed') {
        return new Map();
      }
      console.error('❌ Failed to fetch vehicles:', error.response?.data || error.message);
      return new Map();
    }
  }

  async getLastDevicePositions() {
    try {
      await this.ensureAuthenticated();
      
      const response = await axios.get(
        `${this.baseURL}/Vehicle/LastDevicePosition`,
        {
          headers: {
            'Ocp-Apim-Subscription-Key': this.subscriptionKey,
            'x-token': this.token,
            'x-tenant': this.tenantId
          }
        }
      );

      return response.data;
    } catch (error) {
      if (error.message === 'Authentication failed') {
        return null;
      }
      console.error('❌ Failed to fetch positions:', error.response?.data || error.message);
      return null;
    }
  }

  async getDriver(driverId) {
    await this.ensureAuthenticated();
    
    try {
      const response = await axios.get(
        `${this.baseURL}/Drivers/${driverId}`,
        {
          headers: {
            'Ocp-Apim-Subscription-Key': this.subscriptionKey,
            'x-token': this.token,
            'x-tenant': this.tenantId
          }
        }
      );

      return response.data;
    } catch (error) {
      // Silently ignore driver not found errors
      return null;
    }
  }

  async getAllDrivers() {
    await this.ensureAuthenticated();
    
    try {
      const response = await axios.get(
        `${this.baseURL}/Drivers`,
        {
          headers: {
            'Accept': 'application/json',
            'Ocp-Apim-Subscription-Key': this.subscriptionKey,
            'x-token': this.token,
            'x-tenant': this.tenantId
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('❌ Failed to fetch drivers:', error.response?.data || error.message);
      return null;
    }
  }
}

module.exports = CTrackClient;
