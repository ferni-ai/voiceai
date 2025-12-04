# Spotify Integration Guide

## Current Status

The Spotify Web Playback SDK integration is built and ready, but requires:

1. **Spotify Premium** - Web Playback SDK only works with Premium accounts
2. **Backend Token Endpoint** - The frontend expects `/spotify/token` to return an access token
3. **OAuth Flow** - User must authenticate with Spotify

## Requirements

### 1. Spotify Developer App
1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Add redirect URI: `http://localhost:3000/callback` (or your domain)
4. Note your Client ID and Client Secret

### 2. Backend Token Endpoint

Create a backend endpoint at `/spotify/token` that returns:

```json
{
  "access_token": "BQD...",
  "expires_in": 3600
}
```

### 3. OAuth Flow

The backend needs to handle Spotify OAuth:

```typescript
// Example using Express
app.get('/spotify/callback', async (req, res) => {
  const code = req.query.code;
  
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });
  
  const tokens = await response.json();
  // Store tokens and return to app
});
```

## Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `authentication_error` | Invalid/expired token | Refresh the token |
| `account_error` | Not Premium | User needs Spotify Premium |
| `initialization_error` | SDK load failed | Check network/script loading |

## Testing Without Spotify

The app works fine without Spotify - it shows "Premium required" and music features are disabled. All other features work normally.

## Alternative: Spotify Embed

For basic playback without Premium requirement, consider using Spotify's Embed API instead of Web Playback SDK. This shows an embedded player but doesn't allow programmatic control.

```html
<iframe src="https://open.spotify.com/embed/track/YOUR_TRACK_ID" 
        width="300" height="80" frameborder="0" 
        allow="encrypted-media"></iframe>
```

