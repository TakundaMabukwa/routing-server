const { postJson, getJson } = require('./http-client');

class CTrackClient {
  constructor() {
    this.baseURL = process.env.CTRACK_BASE_URL || 'https://stgapi.ctrackcrystal.co.za/api';
    this.username = process.env.CTRACK_USERNAME;
    this.password = process.env.CTRACK_PASSWORD;
    this.subscriptionKey = process.env.CTRACK_PK;
    this.tenantId = process.env.CTRACK_TENANT_ID;
    this.token = null;
    this.tokenExpiry = null;
    this.authBlockedUntil = null;
    this.authPromise = null;
  }

  createAuthError(message, status = 401, data = null) {
    const error = new Error(message);
    error.status = status;
    error.data = data;
    error.code = status === 429 ? 'CTRACK_RATE_LIMITED' : 'CTRACK_AUTH_FAILED';
    return error;
  }

  getRetryDelayMs(error) {
    if (error.status !== 429 && error.data?.statusCode !== 429) {
      return null;
    }

    const message = String(error.data?.message || error.message || '');
    const match = message.match(/try again in\s+(\d+)\s+seconds?/i);
    if (match) {
      return Number(match[1]) * 1000;
    }

    return 60000;
  }

  async authenticate() {
    if (this.authPromise) {
      return this.authPromise;
    }

    if (this.authBlockedUntil && Date.now() < this.authBlockedUntil) {
      const retryAfterSeconds = Math.max(1, Math.ceil((this.authBlockedUntil - Date.now()) / 1000));
      throw this.createAuthError(
        `C-Track authentication rate limited. Try again in ${retryAfterSeconds} seconds.`,
        429,
        { statusCode: 429, message: `Rate limit is exceeded. Try again in ${retryAfterSeconds} seconds.` }
      );
    }

    this.authPromise = this.performAuthentication();
    try {
      await this.authPromise;
      return true;
    } finally {
      this.authPromise = null;
    }
  }

  async performAuthentication() {
    try {
      const data = await postJson(
        `${this.baseURL}/Authenticate/Login`,
        {
          username: this.username,
          password: this.password
        },
        {
          headers: {
            'Ocp-Apim-Subscription-Key': this.subscriptionKey
          }
        }
      );

      this.token = data.jwt;
      this.tokenExpiry = new Date(data.validToUtc);
      this.authBlockedUntil = null;
      console.log('âœ… C-Track authenticated');
    } catch (error) {
      const retryDelayMs = this.getRetryDelayMs(error);
      if (retryDelayMs) {
        this.authBlockedUntil = Date.now() + retryDelayMs;
        console.log(`â³ C-Track auth rate limited, backing off for ${Math.ceil(retryDelayMs / 1000)}s`);
        throw this.createAuthError(error.data?.message || error.message, 429, error.data);
      }

      this.authBlockedUntil = null;
      console.error('âŒ Auth failed:', error.data?.message || error.message);
      throw this.createAuthError(error.data?.message || error.message, error.status || 401, error.data);
    }
  }

  async ensureAuthenticated() {
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
    if (!this.token || !this.tokenExpiry || oneHourFromNow >= this.tokenExpiry) {
      await this.authenticate();
    }
  }

  async getVehicles() {
    await this.ensureAuthenticated();

    try {
      const data = await getJson(`${this.baseURL}/Vehicle/GetVehicles`, {
        headers: {
          'Ocp-Apim-Subscription-Key': this.subscriptionKey,
          'x-token': this.token,
          'x-tenant': this.tenantId
        }
      });

      const vehicles = data.vehicles || [];
      const vehicleMap = new Map();
      vehicles.forEach(v => vehicleMap.set(v.id, v));
      return vehicleMap;
    } catch (error) {
      console.error('âŒ Failed to fetch vehicles:', error.data || error.message);
      throw error;
    }
  }

  async getLastDevicePositions() {
    await this.ensureAuthenticated();

    try {
      return await getJson(`${this.baseURL}/Vehicle/LastDevicePosition`, {
        headers: {
          'Ocp-Apim-Subscription-Key': this.subscriptionKey,
          'x-token': this.token,
          'x-tenant': this.tenantId
        }
      });
    } catch (error) {
      console.error('âŒ Failed to fetch positions:', error.data || error.message);
      throw error;
    }
  }

  async getDriver(driverId) {
    await this.ensureAuthenticated();

    try {
      return await getJson(`${this.baseURL}/Drivers/${driverId}`, {
        headers: {
          'Ocp-Apim-Subscription-Key': this.subscriptionKey,
          'x-token': this.token,
          'x-tenant': this.tenantId
        }
      });
    } catch (error) {
      return null;
    }
  }

  async getAllDrivers() {
    await this.ensureAuthenticated();

    try {
      return await getJson(`${this.baseURL}/Drivers`, {
        headers: {
          'Accept': 'application/json',
          'Ocp-Apim-Subscription-Key': this.subscriptionKey,
          'x-token': this.token,
          'x-tenant': this.tenantId
        }
      });
    } catch (error) {
      console.error('âŒ Failed to fetch drivers:', error.data || error.message);
      throw error;
    }
  }
}

module.exports = CTrackClient;
