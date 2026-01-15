# Frontend Services

> **We believe in making AI human, and the decisions we make will reflect that.**

This directory contains frontend services that power the Ferni web app. Services handle business logic, API communication, state management, and feature orchestration.

---

## Quick Reference

| What | Where |
|------|-------|
| Service Index | `index.ts` |
| Connection | `connection.service.ts` |
| Auth | `firebase-auth.service.ts` |
| Spotify | `spotify.service.ts` |
| Monetization | `monetization.service.ts` |
| Tests | `__tests__/` |

---

## Service Categories

### Core Services
| Service | Purpose |
|---------|---------|
| `connection.service.ts` | LiveKit room connection |
| `firebase-auth.service.ts` | Firebase authentication |
| `auth-init.service.ts` | Auth initialization |
| `offline.service.ts` | Offline mode handling |

### Voice & Audio
| Service | Purpose |
|---------|---------|
| `audio.service.ts` | Audio playback/recording |
| `ferni-audio.service.ts` | Ferni-specific audio |
| `voice-analyzer.service.ts` | Voice analysis |
| `voice-auth.service.ts` | Voice authentication |
| `voice-events.service.ts` | Voice event dispatching |
| `ambient-sounds.service.ts` | Background sounds |
| `procedural-sounds.service.ts` | Dynamic sound generation |

### Persona & Team
| Service | Purpose |
|---------|---------|
| `handoff.service.ts` | Persona handoffs |
| `cameo.service.ts` | Cameo appearances |
| `team-unlock.service.ts` | Team member unlocking |
| `roster-preferences.service.ts` | Team preferences |

### Music & Entertainment
| Service | Purpose |
|---------|---------|
| `spotify.service.ts` | Spotify integration |
| `spotify-mood.service.ts` | Mood-based music |
| `music-state-manager.ts` | Music state |
| `music-audio.controller.ts` | Music playback |

### Monetization
| Service | Purpose |
|---------|---------|
| `monetization.service.ts` | Subscription logic |
| `monetization-integration.service.ts` | Payment integration |
| `apple-iap.service.ts` | Apple In-App Purchase |
| `seeds-economy.service.ts` | Seeds virtual currency |

### Intelligence & Context
| Service | Purpose |
|---------|---------|
| `intelligence.service.ts` | AI intelligence features |
| `life-context.service.ts` | Life context tracking |
| `mood-context.service.ts` | Mood tracking |
| `predictive-insights.service.ts` | Predictive features |
| `cross-team-notifications.service.ts` | Team coordination |

### User Experience
| Service | Purpose |
|---------|---------|
| `celebration.service.ts` | Celebrations |
| `delight.service.ts` | Delightful moments |
| `haptics.service.ts` | Haptic feedback |
| `push-notifications.service.ts` | Push notifications |
| `loading-orchestrator.service.ts` | Loading states |

### Data & Analytics
| Service | Purpose |
|---------|---------|
| `conversation-tracker.service.ts` | Conversation tracking |
| `feature-analytics.service.ts` | Feature analytics |
| `telemetry-collector.service.ts` | Telemetry |
| `crash-reporter.service.ts` | Crash reporting |

### Integrations
| Service | Purpose |
|---------|---------|
| `calendar-providers.service.ts` | Calendar integration |
| `linkedin.service.ts` | LinkedIn integration |
| `banking.service.ts` | Banking integration |
| `geolocation.service.ts` | Location services |
| `biometrics.service.ts` | Biometric auth |

---

## Service Pattern

Services follow a singleton pattern with lazy initialization:

```typescript
// Standard service pattern
class MyService {
  private static instance: MyService | null = null;
  
  static getInstance(): MyService {
    if (!MyService.instance) {
      MyService.instance = new MyService();
    }
    return MyService.instance;
  }
  
  private constructor() {
    // Initialize
  }
}

export const myService = MyService.getInstance();
```

---

## Key Services

### Connection Service

Manages LiveKit room connections:

```typescript
import { connectionService } from './connection.service.js';

await connectionService.connect(roomName, token);
connectionService.disconnect();
```

### Monetization Service

Handles subscription state and features:

```typescript
import { monetizationService } from './monetization.service.js';

const tier = monetizationService.getCurrentTier();
const canAccess = monetizationService.hasFeatureAccess('team-roundtable');
```

### Spotify Service

Manages Spotify playback:

```typescript
import { spotifyService } from './spotify.service.js';

await spotifyService.connect();
await spotifyService.playPlaylist(playlistId);
```

---

## State Management

Services use event emitters for state updates:

```typescript
class MyService extends EventTarget {
  private _state: State = initialState;
  
  get state() { return this._state; }
  
  private setState(newState: Partial<State>) {
    this._state = { ...this._state, ...newState };
    this.dispatchEvent(new CustomEvent('stateChange', { detail: this._state }));
  }
}
```

---

## Rules

### Do ✅
- Use singleton pattern for services
- Emit events for state changes
- Handle errors gracefully
- Use TypeScript types
- Clean up subscriptions on destroy

### Don't ❌
- Store sensitive data in memory
- Use `console.log` - use logger
- Block the main thread
- Ignore error states
- Create circular dependencies

---

## Reference Docs

- Frontend: `../../CLAUDE.md`
- UI Components: `../ui/CLAUDE.md`
- State Management: `../state/`
- API Layer: `../api/`

---

*Last updated: January 2026*
