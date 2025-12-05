# Spotify Integration Guide

## Current Status ✅

The Spotify integration is **fully built** with:
- Web Playback SDK for browser-based playback
- Auto-refreshing tokens (no manual token updates needed!)
- OAuth endpoints in `ui-server.js` and `token-server.js`
- Backend `spotify-auth.ts` service with circuit breaker

## Requirements

1. **Spotify Premium** - Web Playback SDK only works with Premium accounts
2. **Spotify Developer App** - Client ID and Secret
3. **Initial OAuth** - One-time authentication via script

---

## Quick Setup (Local Development)

### Step 1: Create Spotify App
1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click "Create App"
3. Add **redirect URI**: `https://example.com/callback`
4. Copy your **Client ID** and **Client Secret**

### Step 2: Run Auth Script
```bash
node scripts/spotify-auth.js
```

Follow the prompts - this will:
- Open Spotify authorization in your browser
- Exchange the code for tokens
- Save tokens to `.spotify-tokens.json` (auto-refreshes!)

### Step 3: Add to .env
```bash
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
# SPOTIFY_REFRESH_TOKEN is NOT needed - .spotify-tokens.json handles it!
```

### Step 4: Test It!
```bash
npm run dev
```
Ask Ferni: "Play some relaxing jazz music"

---

## Production Setup (ferni.ai)

### Step 1: Add Production Redirect URI

In [Spotify Developer Dashboard](https://developer.spotify.com/dashboard):
1. Select your app → Settings
2. Add redirect URI:
   ```
   https://john-bogle-ui-1031920444452.us-central1.run.app/spotify/callback
   ```
   Or if using custom domain:
   ```
   https://app.ferni.ai/spotify/callback
   ```

### Step 2: Set Environment Variable

Add to your `.env` and upload to GCP:
```bash
SPOTIFY_REDIRECT_URI=https://your-production-url/spotify/callback
```

Then run:
```bash
./scripts/upload-secrets-gcp.sh
```

### Step 3: Re-deploy
```bash
./scripts/deploy-all.sh --ui
```

---

## How It Works

### Token Flow (Auto-Refresh)

```
┌─────────────────────────────────────────────────────────────────┐
│ INITIAL SETUP (one-time)                                        │
│                                                                 │
│  scripts/spotify-auth.js                                        │
│         │                                                       │
│         ▼                                                       │
│  .spotify-tokens.json  ◄─── Contains access + refresh tokens    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ RUNTIME (automatic)                                             │
│                                                                 │
│  ui-server.js / token-server.js                                 │
│         │                                                       │
│         ├──► /spotify/token endpoint                            │
│         │         │                                             │
│         │         ├── Check if token expired                    │
│         │         ├── Auto-refresh if needed                    │
│         │         └── Return valid access_token                 │
│         │                                                       │
│         └──► Auto-refresh every 5 minutes (background)          │
└─────────────────────────────────────────────────────────────────┘
```

### Endpoints Available

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/spotify/token` | GET | Get access token (auto-refreshes) |
| `/spotify/device` | POST | Register Web Playback SDK device |
| `/spotify/device` | GET | Get current device ID |
| `/spotify/login` | GET | Start OAuth flow (token-server only) |
| `/spotify/status` | GET | Check link status (token-server only) |

---

## Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `authentication_error` | Invalid/expired token | Re-run `node scripts/spotify-auth.js` |
| `account_error` | Not Premium | User needs Spotify Premium subscription |
| `initialization_error` | SDK load failed | Check browser console, network tab |
| `Token refresh failed` | Refresh token revoked | Re-authenticate via script |
| `503 Spotify not configured` | Missing credentials | Check `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in `.env` |

### Debug Commands

```bash
# Check if tokens exist
cat .spotify-tokens.json

# Check token status (in agent logs)
# Look for: "🎵 Spotify token valid for X minutes"

# Force token refresh
curl "http://localhost:3003/spotify/token?force=1"

# Check Spotify health (backend service)
# The agent logs detailed diagnostics automatically
```

### Production Checklist

- [ ] Spotify Developer App created
- [ ] Redirect URI added: `https://your-domain.com/spotify/callback`
- [ ] `SPOTIFY_CLIENT_ID` in GCP secrets
- [ ] `SPOTIFY_CLIENT_SECRET` in GCP secrets
- [ ] `SPOTIFY_REDIRECT_URI` in GCP secrets (for production URL)
- [ ] User has Spotify Premium account

---

## Testing Without Spotify

The app works fine without Spotify configured:
- Shows "Spotify not configured" in logs
- Music features gracefully disabled
- All other Ferni features work normally

---

## Alternative: Spotify Embed (No Premium Required)

For basic playback without Premium, use Spotify's Embed API:

```html
<iframe src="https://open.spotify.com/embed/track/YOUR_TRACK_ID" 
        width="300" height="80" frameborder="0" 
        allow="encrypted-media"></iframe>
```

**Limitations:**
- No programmatic control (can't play/pause via voice)
- User must interact with the iframe
- 30-second previews for non-logged-in users

