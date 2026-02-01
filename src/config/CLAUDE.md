# Configuration

> **We believe in making AI human, and the decisions we make will reflect that.**

The config module centralizes all application configuration, environment variables, feature flags, and runtime constants.

---

## Architecture Level

Config is at **Level 10** (Infrastructure layer):

```
Level 100: agents/, api/
Level 70:  personas/, intelligence/, tools/, conversation/, speech/
Level 60:  services/
Level 30:  memory/
Level 10:  config/, utils/, types/    ← THIS LAYER
```

**Import rules:** Config can only import from utils and types. All other layers import from config.

---

## Directory Structure

```
config/
├── index.ts                    # Main exports
├── environment.ts              # Environment variable parsing
├── feature-flags.ts            # Feature flag definitions
├── unified-flags.ts            # Unified flag management
├── timeouts.ts                 # Timeout constants
├── handoff-timing.ts           # Handoff timing config
├── voice-ids.ts                # Voice ID mappings
├── voice-accents.ts            # Accent configurations
├── voice-humanization-flags.ts # Voice humanization settings
├── cartesia-config.ts          # Cartesia TTS config
├── gemini-config.ts            # Gemini LLM configuration
├── brand-colors.ts             # Brand color constants
├── intelligence-constants.ts   # AI/ML constants
├── resilience-config.ts        # Circuit breaker/resilience settings
└── tool-routing-config.ts      # Tool semantic routing configuration
```

---

## Environment Variables

### Loading Environment

```typescript
import { env, getEnv, requireEnv } from './config/environment.js';

// Get with default
const port = getEnv('PORT', '8080');

// Require (throws if missing)
const apiKey = requireEnv('GOOGLE_API_KEY');

// Pre-parsed env object
const { NODE_ENV, LIVEKIT_URL } = env;
```

### Key Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | `development` / `production` |
| `GOOGLE_CLOUD_PROJECT` | Yes | GCP project ID |
| `LIVEKIT_URL` | Yes | LiveKit server URL |
| `LIVEKIT_API_KEY` | Yes | LiveKit API key |
| `LIVEKIT_API_SECRET` | Yes | LiveKit API secret |
| `GOOGLE_API_KEY` | Yes | Gemini API key |
| `REDIS_URL` | No | Redis connection URL |
| `FIREBASE_PROJECT_ID` | No | Firebase project |

---

## Feature Flags

### Using Flags

```typescript
import { isFeatureEnabled, getFeatureValue } from './config/feature-flags.js';

// Boolean flag
if (isFeatureEnabled('ENABLE_VOICE_CLONING')) {
  await cloneVoice(userId);
}

// Value flag
const maxRetries = getFeatureValue('MAX_LLM_RETRIES', 3);
```

### Defining Flags

```typescript
// In feature-flags.ts
export const FEATURE_FLAGS = {
  // Boolean flags
  ENABLE_VOICE_CLONING: false,
  ENABLE_PREDICTIVE_COACHING: true,

  // Value flags
  MAX_LLM_RETRIES: 3,
  EMBEDDING_BATCH_SIZE: 100,

  // Per-environment
  ENABLE_DEBUG_PANEL: process.env.NODE_ENV === 'development',
} as const;
```

### Flag Categories

| Category | Prefix | Example |
|----------|--------|---------|
| Feature toggles | `ENABLE_` | `ENABLE_VOICE_AUTH` |
| Limits | `MAX_` | `MAX_SESSIONS` |
| Timeouts | `TIMEOUT_` | `TIMEOUT_LLM_MS` |
| Debug | `DEBUG_` | `DEBUG_LOGGING` |

---

## Timeouts

```typescript
import { TIMEOUTS } from './config/timeouts.js';

// Use predefined timeouts
const response = await Promise.race([
  llmCall(),
  timeout(TIMEOUTS.LLM_RESPONSE_MS),
]);

// Available timeouts
TIMEOUTS.LLM_RESPONSE_MS      // 30000 (30s)
TIMEOUTS.WORKER_STARTUP_MS    // 30000 (30s)
TIMEOUTS.SESSION_CLEANUP_MS   // 10000 (10s)
TIMEOUTS.HEALTH_CHECK_MS      // 5000 (5s)
TIMEOUTS.EMBEDDING_MS         // 10000 (10s)
```

---

## Voice Configuration

### Voice IDs

```typescript
import { getVoiceId, VOICE_IDS } from './config/voice-ids.js';

// Get voice for persona
const voiceId = getVoiceId('ferni');  // Returns Cartesia voice ID

// Available voices
VOICE_IDS.ferni       // Main Ferni voice
VOICE_IDS.alex        // Alex persona
VOICE_IDS.maya        // Maya persona
VOICE_IDS.peter       // Peter persona
VOICE_IDS.jordan      // Jordan persona
VOICE_IDS.nayan       // Nayan persona
```

### Voice Accents

```typescript
import { ACCENT_CONFIGS } from './config/voice-accents.js';

// Get accent configuration
const config = ACCENT_CONFIGS['en-GB'];
// { prosody: { rate: 0.95 }, emotionRange: 0.8 }
```

---

## Brand Colors

```typescript
import { BRAND_COLORS, getPersonaColor } from './config/brand-colors.js';

// Core brand colors
BRAND_COLORS.accent     // Primary CTA color
BRAND_COLORS.ferni      // Ferni persona color
BRAND_COLORS.naturalInk // Text color

// Get persona-specific color
const color = getPersonaColor('maya');  // Maya's brand color
```

---

## Best Practices

### Configuration Access

```typescript
// ✅ Good - centralized access
import { env, TIMEOUTS, isFeatureEnabled } from './config/index.js';

// ❌ Bad - direct process.env access
const key = process.env.API_KEY;
```

### Adding New Config

1. Add to appropriate file (`environment.ts`, `feature-flags.ts`, etc.)
2. Export from `index.ts`
3. Document in this CLAUDE.md
4. Add validation if required

---

## Rules

### Do
- Use `requireEnv()` for required variables
- Use `getEnv()` with defaults for optional variables
- Define timeouts in `timeouts.ts`
- Group related flags together

### Don't
- Access `process.env` directly outside config/
- Hardcode configuration values in other modules
- Create new config files without updating index.ts
- Use magic numbers (define as constants)

---

*Last updated: January 2026*
