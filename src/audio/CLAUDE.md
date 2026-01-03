# Audio Module

> **We believe in making AI human, and the decisions we make will reflect that.**

The audio module handles all music and sound functionality (~13,400 lines) - DJ Booth orchestration, intelligent music selection, user preference learning, and ambient audio.

---

## Architecture Level

```
Level 70: audio/               ← THIS LAYER (Domain)
         ↓ imports from
Level 60: services/
Level 30: memory/
Level 10: config/, utils/, types/
```

**Import rules:** Audio can import from services, memory, config, utils. It CANNOT import from agents/ or api/.

---

## Directory Structure

```
audio/
├── index.ts                          # Main exports
├── dj-booth.ts                       # 🎧 DJ orchestration (ducking, timing)
├── dj-enhancements.ts                # Advanced DJ features
├── music-player.ts                   # Core music playback
├── music-session-context.ts          # Session-aware music state
│
├── intelligent-music-transitions.ts  # 🎵 Context-aware transitions
├── music-humanization.ts             # Spontaneous musical moments
├── music-feedback-manager.ts         # Track what works
│
├── music-user-learning.ts            # 📊 Thompson Sampling for preferences
├── music-preference-extractor.ts     # Extract preferences from conversation
├── music-learning-persistence.ts     # Save learning to Firestore
├── music-memory-integration.ts       # Memory system integration
│
├── ambient-music.ts                  # Background ambient audio
├── session-sounds.ts                 # Session event sounds
├── sound-effects-player.ts           # Sound effects
│
└── __tests__/                        # Unit tests
```

---

## Key Components

| Component | File | Purpose |
|-----------|------|---------|
| **DJ Booth** | `dj-booth.ts` | Master orchestration (ducking, timing, talk-over) |
| **Music Player** | `music-player.ts` | Core playback with session context |
| **User Learning** | `music-user-learning.ts` | Thompson Sampling for preferences |
| **Intelligent Transitions** | `intelligent-music-transitions.ts` | Context-aware responses |
| **Music Humanization** | `music-humanization.ts` | Spontaneous musical moments |

---

## DJ Booth System

The DJ Booth is the central orchestrator:

```typescript
import { getDJBooth } from './audio/dj-booth.js';

const dj = getDJBooth(sessionId);

// Duck audio when speaking
await dj.duck({ duration: 3000, level: 0.3 });

// Intelligent transition
await dj.transition({
  mood: 'energizing',
  context: 'morning routine',
});

// Talk-over with timing
await dj.talkOver('Here\'s something to lift your spirits');
```

---

## User Learning (Thompson Sampling)

Music preferences are learned using Thompson Sampling:

```typescript
import { getMusicLearner } from './audio/music-user-learning.js';

const learner = getMusicLearner(userId, sessionId);

// Record feedback
await learner.recordFeedback({
  trackId: 'spotify:track:xxx',
  feedback: 'positive',  // positive | negative | skip | explicit
  context: 'morning-routine',
});

// Get recommendation
const next = await learner.recommend({
  mood: 'energizing',
  timeOfDay: 'morning',
});
```

Learning persists to Firestore via `music-learning-persistence.ts`.

---

## Integration Pattern

```typescript
// ✅ CORRECT - Use singleton pattern
import { getDJBooth } from './audio/index.js';

const dj = getDJBooth(sessionId);
await dj.playForMood('relaxing');

// ❌ WRONG - Don't create new instances
import { DJBooth } from './audio/dj-booth.js';
const dj = new DJBooth(); // No session context!
```

---

## Music Humanization

Spontaneous musical moments that feel natural:

```typescript
import { getMusicHumanizer } from './audio/music-humanization.js';

const humanizer = getMusicHumanizer(sessionId);

// Inject spontaneous moment
await humanizer.maybeSpontaneousMoment({
  conversationMood: 'joyful',
  energyLevel: 0.8,
});
```

---

## Testing

```bash
# Run all audio tests
pnpm vitest run src/audio/__tests__/

# Test specific component
pnpm vitest run src/audio/__tests__/dj-booth.test.ts
```

---

## Rules

| ✅ Do | ❌ Don't |
|-------|---------|
| Use `getDJBooth(sessionId)` | Create DJBooth instances directly |
| Use `getMusicLearner(userId, sessionId)` | Share learners across sessions |
| Call `cleanup()` on session end | Leave audio resources hanging |
| Persist learning to Firestore | Keep learning in memory only |
| Duck audio during speech | Compete with agent voice |

---

## Session Lifecycle

```typescript
// Session start
const dj = getDJBooth(sessionId);
const learner = getMusicLearner(userId, sessionId);

// During session
await dj.playForMood('focusing');
await learner.recordFeedback({ ... });

// Session end
await dj.cleanup();
await learner.persist();
```

---

## Spotify Integration

Music playback uses Spotify (when available):

- OAuth handled in `src/servers/token/oauth/`
- Playback via Spotify Web API
- Fallback to ambient sounds if no Spotify

---

## Related Docs

- `docs/features/DJ-SYSTEM.md` - DJ feature spec
- `docs/features/SPOTIFY-INTEGRATION.md` - Spotify setup
- `src/services/CLAUDE.md` - Service patterns
- `docs/architecture/MUSIC-SYSTEM.md` - Full architecture

---

*Last updated: January 2026*
