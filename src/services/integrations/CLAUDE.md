# Integration Hub

Central module for managing all external API integrations in Ferni.

## Purpose

The Integration Hub provides:
- **Unified OAuth**: Single flow for connecting all OAuth-based services
- **Rate Limiting**: Per-user, per-integration rate limiting
- **Webhook Routing**: Central router for incoming webhooks
- **API Client**: Authenticated requests to external APIs

## Architecture

```
integrations/
├── index.ts              # Re-exports
├── types.ts              # Shared types
├── integration-hub.ts    # Central registry and API client
├── oauth-manager.ts      # OAuth2 flows
├── rate-limiter.ts       # Rate limiting
└── webhook-router.ts     # Webhook handling
```

## Supported Integrations

| Integration | Auth Type | Status |
|------------|-----------|--------|
| Gmail | OAuth2 | ✅ Enabled |
| Google Calendar | OAuth2 | ✅ Enabled |
| Plaid | API Key | ✅ Enabled |
| Spotify | OAuth2 | ✅ Enabled |
| Twilio | Basic | ✅ Enabled |
| Uber | OAuth2 | ✅ Enabled |
| Lyft | OAuth2 | ✅ Enabled |
| Google Maps | API Key | ✅ Enabled |
| Instacart | OAuth2 | ⏳ Requires Partnership |
| DoorDash | API Key | ⏳ Requires Partnership |

## Usage

### Check Connection Status

```typescript
import { getIntegrationHub } from './integrations/index.js';

const hub = getIntegrationHub();

// Check if user is connected
const isConnected = hub.isConnected(userId, 'uber');

// Get all user connections
const connections = hub.getUserConnections(userId);
```

### Start OAuth Flow

```typescript
// Generate auth URL
const authUrl = await hub.getAuthorizationUrl(userId, 'uber', '/settings');

// Redirect user to authUrl...

// Handle callback (in your API route)
const result = await hub.handleOAuthCallback(code, state);
if (result.success) {
  // User is now connected
}
```

### Make API Requests

```typescript
// Make authenticated request
const response = await hub.request<UberRideEstimate>(userId, 'uber', {
  method: 'POST',
  path: '/requests/estimate',
  body: {
    start_latitude: 37.7749,
    start_longitude: -122.4194,
    end_latitude: 37.7849,
    end_longitude: -122.4094,
  },
});

if (response.success) {
  console.log(response.data);
}
```

### Register Webhook Handler

```typescript
import { getWebhookRouter } from './integrations/index.js';

const router = getWebhookRouter();

router.registerHandler({
  integrationId: 'uber',
  eventType: 'ride.status_changed',
  handler: async (event) => {
    console.log('Ride status changed:', event.payload);
  },
});
```

## Environment Variables

Each integration requires credentials set via environment variables:

```bash
# OAuth integrations
UBER_CLIENT_ID=xxx
UBER_CLIENT_SECRET=xxx
LYFT_CLIENT_ID=xxx
LYFT_CLIENT_SECRET=xxx

# API key integrations
GOOGLE_MAPS_API_KEY=xxx
PLAID_API_KEY=xxx

# Webhook secrets
UBER_WEBHOOK_SECRET=xxx
TWILIO_WEBHOOK_SECRET=xxx

# OAuth redirect base
OAUTH_REDIRECT_BASE_URI=https://app.ferni.ai
```

## Adding New Integrations

1. Add config to `INTEGRATIONS` in `integration-hub.ts`
2. Add OAuth config to `OAUTH_CONFIGS` in `oauth-manager.ts` (if OAuth)
3. Add webhook config to `WEBHOOK_CONFIGS` in `webhook-router.ts` (if webhooks)
4. Set environment variables
5. Test the full flow
