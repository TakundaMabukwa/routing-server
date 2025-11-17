class SupabaseCache {
  constructor() {
    this.cache = new Map();
    this.CACHE_TTL = 30 * 1000;
  }

  async getCached(key, fetchFn, ttl = this.CACHE_TTL) {
    const cached = this.cache.get(key);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < ttl) {
      return cached.data;
    }

    const data = await fetchFn();
    this.cache.set(key, { data, timestamp: now });
    return data;
  }

  invalidate(key) {
    this.cache.delete(key);
  }

  invalidateAll() {
    this.cache.clear();
  }
}

module.exports = new SupabaseCache();
