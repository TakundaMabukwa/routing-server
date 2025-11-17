# Stop Frontend Direct Supabase Requests

## The Problem

Your Supabase logs show GET requests because:
- **Frontend/dashboard is calling Supabase directly** (not through your server)
- Frontend has `NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY` from .env
- This bypasses all your optimizations

## Solutions

### Option 1: Force Frontend Through Your Server (Recommended)

**In your frontend code, change:**
```javascript
// ❌ BEFORE - Direct Supabase calls
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const { data } = await supabase.from('trips').select('*')

// ✅ AFTER - Use your cached API
const response = await fetch('http://your-server:3001/api/trips/active')
const data = await response.json()
```

### Option 2: Enable Row Level Security (RLS)

In Supabase dashboard:
1. Go to Authentication → Policies
2. Enable RLS on `trips` table
3. Create policy: Only allow reads through service role

This forces all requests through your backend.

### Option 3: Rotate Anon Key

If you can't update frontend immediately:
1. Go to Supabase → Settings → API
2. Generate new anon key
3. Only update it in your server's .env (not frontend)
4. Frontend requests will fail, forcing migration to your API

## Verify the Source

Check your frontend code for:
```bash
# Search for direct Supabase usage
grep -r "createClient" your-frontend/
grep -r "supabase.from" your-frontend/
grep -r "NEXT_PUBLIC_SUPABASE" your-frontend/
```

## Expected Behavior After Fix

**Before:**
- Frontend → Supabase (many GET requests)
- Server → Supabase (PATCH requests)

**After:**
- Frontend → Your Server (cached) → Supabase (minimal)
- Server → Supabase (debounced PATCH)

## Quick Test

Temporarily remove anon key from frontend .env:
```bash
# In frontend .env
# NEXT_PUBLIC_EPS_SUPABASE_ANON_KEY=xxx  # commented out
```

If Supabase GET requests stop, that confirms frontend is the source.
