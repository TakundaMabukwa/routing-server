# Optional: Add Reload Endpoint

If you want to reload trips without restarting the server, add this to `server.js`:

## Code to Add

Add this after line 240 (after the existing trip routes endpoints):

```javascript
// Reload trips from Supabase (manual trigger)
app.post('/api/trips/reload', async (req, res) => {
  try {
    const company = req.query.company || 'eps';
    
    if (!tripMonitors[company]) {
      return res.status(400).json({ error: 'Invalid company' });
    }
    
    await tripMonitors[company].loadActiveTripsOnce();
    
    res.json({ 
      success: true, 
      message: `Trips reloaded for ${company}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## Usage

### Reload EPS trips
```bash
curl -X POST http://localhost:3001/api/trips/reload?company=eps
```

### Reload Maysene trips
```bash
curl -X POST http://localhost:3001/api/trips/reload?company=maysene
```

### From frontend
```javascript
fetch('http://localhost:3001/api/trips/reload?company=eps', {
  method: 'POST'
})
.then(res => res.json())
.then(data => console.log(data));
```

## When to Use

Call this endpoint when:
- New trip is created
- Trip assignments change
- Trip status changes
- You want to refresh trip data

## Cost

- **1 reload = 2 queries** (trips + stop points)
- Still minimal compared to continuous polling
- Example: 10 reloads/day = 20 queries/day (still 99.9% reduction)

## Alternative: Webhook

You can also trigger reload via Supabase webhook:
1. Go to Supabase Dashboard → Database → Webhooks
2. Create webhook on `trips` table INSERT/UPDATE
3. Point to: `http://your-server:3001/api/trips/reload?company=eps`
4. Trips auto-reload when changed in Supabase

This keeps your cache fresh automatically!
