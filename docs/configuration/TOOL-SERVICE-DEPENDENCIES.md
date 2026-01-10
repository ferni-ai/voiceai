# Tool Service Dependencies

This document lists all environment variables required by tool domains. Tools with missing dependencies will provide user-friendly error messages instead of silently failing.

## Quick Reference

| Domain | Required Services | Environment Variables |
|--------|-------------------|----------------------|
| Marketing | Twitter, LinkedIn | `TWITTER_*`, `LINKEDIN_*` |
| Referral | Twilio | `TWILIO_*` |
| Concierge | Twilio | `TWILIO_*` |
| Smart Home | Home Assistant | `HOME_ASSISTANT_*` |
| Local Search | Google Places | `GOOGLE_PLACES_API_KEY` |
| Banking | Plaid | `PLAID_*` |
| Music | Spotify | `SPOTIFY_*` |

---

## Twilio (Phone Calls)

**Used by:** `referral`, `concierge`

```bash
# Required
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Optional (for voice features)
TWILIO_VOICE_SID=optional_voice_id
```

**Get credentials:** [Twilio Console](https://console.twilio.com/)

**Cost:** ~$0.0085/min for outbound calls, ~$1/month for phone number

---

## Twitter (Marketing)

**Used by:** `marketing`

```bash
# Required
TWITTER_API_KEY=your_api_key
TWITTER_API_SECRET=your_api_secret

# Required for posting (obtained via OAuth)
TWITTER_ACCESS_TOKEN=user_access_token
TWITTER_ACCESS_TOKEN_SECRET=user_access_token_secret
```

**Get credentials:** [Twitter Developer Portal](https://developer.twitter.com/)

**OAuth Flow:**
1. User clicks "Connect Twitter" in Settings > Marketing
2. Redirected to Twitter for authorization
3. Callback to `/api/marketing/twitter/callback`
4. Tokens stored in Firestore

---

## LinkedIn (Marketing & Career)

**Used by:** `marketing`, integrations

```bash
# Required
LINKEDIN_CLIENT_ID=your_client_id
LINKEDIN_CLIENT_SECRET=your_client_secret

# Optional (for posting - obtained via OAuth)
LINKEDIN_ACCESS_TOKEN=user_access_token
```

**Get credentials:** [LinkedIn Developer Portal](https://www.linkedin.com/developers/)

**OAuth Scopes needed:**
- `r_liteprofile` - Basic profile info
- `w_member_social` - Post on behalf of user

---

## Spotify (Music)

**Used by:** `entertainment`

```bash
# Required
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret

# Optional (obtained via OAuth)
SPOTIFY_REFRESH_TOKEN=user_refresh_token
```

**Get credentials:** [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/)

**OAuth Scopes needed:**
- `user-read-playback-state`
- `user-modify-playback-state`
- `user-read-currently-playing`
- `streaming`

---

## Home Assistant (Smart Home)

**Used by:** `smart-home`

```bash
# Required
HOME_ASSISTANT_URL=http://homeassistant.local:8123
HOME_ASSISTANT_TOKEN=your_long_lived_access_token
```

**Get credentials:**
1. In Home Assistant: Profile > Long-Lived Access Tokens
2. Create token with descriptive name

---

## Google Places (Local Search)

**Used by:** `local-search`, `concierge`

```bash
# Required
GOOGLE_PLACES_API_KEY=your_api_key
```

**Get credentials:** [Google Cloud Console](https://console.cloud.google.com/)

**Enable APIs:**
- Places API
- Geocoding API

---

## Plaid (Banking)

**Used by:** `banking`, integrations

```bash
# Required
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_secret
PLAID_ENV=sandbox  # or development, production
```

**Get credentials:** [Plaid Dashboard](https://dashboard.plaid.com/)

---

## Google Cloud (Core Services)

**Used by:** All domains (Firestore, Logging)

```bash
# Required
GOOGLE_CLOUD_PROJECT=your-project-id

# Optional (for local development)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

---

## LiveKit (Voice Agent)

**Used by:** Voice agent core

```bash
# Development
LIVEKIT_URL=wss://dev-8sm1ba0z.livekit.cloud
LIVEKIT_API_KEY=your_dev_key
LIVEKIT_API_SECRET=your_dev_secret

# Production
LIVEKIT_URL=wss://test-rvg91u1z.livekit.cloud
LIVEKIT_API_KEY=your_prod_key
LIVEKIT_API_SECRET=your_prod_secret
```

---

## LLM Services

**Used by:** Voice agent, content generation

```bash
# OpenAI (for Realtime API)
OPENAI_API_KEY=sk-...
USE_OPENAI_REALTIME=true  # or false for Gemini

# Google AI (for Gemini)
GOOGLE_API_KEY=your_api_key

# Cartesia (TTS)
CARTESIA_API_KEY=your_api_key
```

---

## Validation

Run this command to check which services are configured:

```bash
pnpm quality:services
# or
node -e "const { generateEnvDocumentation } = require('./dist/tools/utils/service-dependency-validator.js'); console.log(generateEnvDocumentation())"
```

---

## Adding New Service Dependencies

When creating a new tool that requires external services:

1. Add to `SERVICE_ENV_VARS` in `src/tools/utils/service-dependency-validator.ts`
2. Add to `SERVICE_DISPLAY_NAMES` for user-friendly error messages
3. Use validation in your tool:

```typescript
import { validateServiceDependencies } from '../../utils/service-dependency-validator.js';

const def: ToolDefinition = {
  id: 'myTool',
  requiredServices: ['twilio', 'firestore'],
  create: (ctx) => {
    return llm.tool({
      execute: async (params) => {
        const validation = validateServiceDependencies(['twilio']);
        if (!validation.valid) {
          return validation.errorMessage;
        }
        // ... tool logic
      }
    });
  }
};
```
