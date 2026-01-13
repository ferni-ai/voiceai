# Audio Module

> **We believe in making AI human, and the decisions we make will reflect that.**

The audio module handles all music and sound functionality - DJ orchestration, intelligent music selection, user preference learning, and ambient audio.

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

## 🎧 NEW DJ ARCHITECTURE (January 2026)

The DJ system was completely refactored to use a clean, modular architecture with a **single source of truth** for state.

### Architecture Overview

```
                    ┌─────────────────────┐
                    │    DJController     │  ← Single source of truth
                    │   (State Machine)   │     for ALL DJ state
                    └─────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ DecisionEngine  │  │  SpeechEngine   │  │  TimingEngine   │
│ (Pure Functions)│  │ (Phrase Gen)    │  │ (Timers)        │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
                    ┌─────────────────────┐
                    │    MusicPlayer      │  ← Low-level playback
                    │ (LiveKit/Spotify)   │
                    └─────────────────────┘
```

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| **DJController** | `dj-controller.ts` | State machine, single source of truth |
| **DecisionEngine** | `dj-decision-engine.ts` | Pure functions: when to duck, speak, interject |
| **SpeechEngine** | `dj-speech-engine.ts` | What to say: phrases, intros, outros |
| **TimingEngine** | `dj-timing-engine.ts` | Timer management for scheduled moments |
| **MusicPlayer** | `music-player.ts` | Low-level playback (LiveKit/Spotify) |

---

## State Machine

The DJController uses a finite state machine with these states:

```
idle → playing → ducking → playing → fading → stopped → idle
  ↑       ↓         ↓         ↑        ↓         ↓       ↑
  └───────┴─────────┴─────────┴────────┴─────────┴───────┘
```

| State | Description |
|-------|-------------|
| `idle` | No music, ready to play |
| `playing` | Music actively playing |
| `ducking` | Music volume lowered (agent/user speaking) |
| `fading` | Track near end, fading out |
| `paused` | Music paused (can resume) |
| `stopped` | Music stopped (explicit or track ended) |
| `changing` | Transitioning between tracks |

---

## Usage Pattern

```typescript
// ✅ CORRECT - Use singleton getters
import { getDJController } from './audio/dj-controller.js';
import { getDJTimingEngine } from './audio/dj-timing-engine.js';

// Initialize (done in music-handler.ts)
const controller = getDJController();
controller.initialize({ sessionId, personaId, userId });

// Dispatch commands (the ONLY way to change state)
controller.dispatch({ type: 'PLAY_TRACK', track, isAmbient: false });
controller.dispatch({ type: 'DUCK', reason: 'agent_speaking' });
controller.dispatch({ type: 'UNDUCK' });
controller.dispatch({ type: 'STOP' });

// Query state
const state = controller.getState();
const isActive = controller.isMusicActive(); // true if playing, ducking, or fading

// Listen to events
controller.on('state_changed', ({ from, to }) => { ... });
controller.on('track_started', ({ track, isAmbient }) => { ... });
controller.on('ducking_started', ({ reason }) => { ... });
controller.on('ducking_ended', () => { ... });
```

---

## Decision Engine (Pure Functions)

```typescript
import { shouldDuck, shouldSpeakIntro, calculateScheduledMoments } from './audio/dj-decision-engine.js';

// Should we duck the music?
const duckDecision = shouldDuck({ state: controller.getState() });

// Should we speak an intro for this track?
const introDecision = shouldSpeakIntro({
  state: controller.getState(),
  track,
  personaId: 'ferni',
});

// Calculate scheduled DJ moments for a track
const moments = calculateScheduledMoments(track, 'ferni');
// Returns: [{ type: 'buildup', triggerTimeMs: 165000 }, ...]
```

---

## Speech Engine (Phrase Generation)

```typescript
import { getOutroPhrase, getDropPhrase, getMomentPhrase } from './audio/dj-speech-engine.js';

// Get an outro phrase for the current track
const outro = getOutroPhrase({ track, personaId: 'ferni' });
// Returns: '<break time="200ms"/>That was Queen. <break time="200ms"/>Nice little moment there.'

// Get a track intro phrase
const intro = getDropPhrase({ track, personaId: 'maya' });

// Get a DJ moment phrase
const moment = getMomentPhrase('appreciation', 'ferni');
```

---

## Timing Engine (Scheduled Events)

```typescript
import { getDJTimingEngine } from './audio/dj-timing-engine.js';

const timing = getDJTimingEngine();

// Schedule a DJ moment
timing.scheduleTimer('buildup-moment', 165000, () => {
  // Speak buildup phrase
});

// Cancel a timer
timing.cancelTimer('buildup-moment');

// Clear all timers (on track change/stop)
timing.clearAllTimers('track_ended');

// Notify of state transitions (auto-clears timers on stop)
timing.onStateTransition('playing', 'stopped');
```

---

## Integration from Music Handler

The `music-handler.ts` in `src/agents/voice-agent/` wires everything together:

```typescript
// music-handler.ts (simplified)
export async function setupMusicHandler(ctx: MusicHandlerContext) {
  // 1. Initialize controllers
  const djController = getDJController();
  djController.initialize({ sessionId, personaId, userId });
  
  const timingEngine = getDJTimingEngine();
  timingEngine.initialize({ sessionId, personaId });
  
  // 2. Wire music player events to DJ controller
  musicPlayer.setOnMusicStateChangeCallback((state, track, prevState) => {
    if (state === 'playing') {
      djController.dispatch({ type: 'PLAY_TRACK', track, isAmbient: false });
    } else if (state === 'stopped') {
      djController.dispatch({ type: 'TRACK_ENDED' });
    }
  });
  
  // 3. React to DJ controller events
  djController.on('track_started', async ({ track }) => {
    const intro = shouldSpeakIntro({ ... });
    if (intro.shouldSpeak) {
      await coordinatedSay(getDropPhrase({ track, personaId }), sessionId);
    }
  });
  
  return { cleanup: () => { ... } };
}

// Public API for other modules
export function isMusicActive(): boolean {
  return getDJController().isMusicActive();
}

export function notifyAgentSpeakingStart(): void {
  getDJController().dispatch({ type: 'AGENT_SPEAKING_START' });
}
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

## Testing

```bash
# Run all audio tests
pnpm vitest run src/audio/__tests__/

# Run DJ Controller tests (63 tests)
pnpm vitest run src/audio/__tests__/dj-controller.test.ts

# Run Decision Engine tests
pnpm vitest run src/audio/__tests__/dj-decision-engine.test.ts
```

---

## Directory Structure

```
audio/
├── index.ts                          # Main exports
│
├── dj-controller.ts                  # 🎧 State machine (SINGLE SOURCE OF TRUTH)
├── dj-decision-engine.ts             # 🧠 Pure decision functions
├── dj-speech-engine.ts               # 🗣️ Phrase generation
├── dj-timing-engine.ts               # ⏰ Timer management
│
├── music-player.ts                   # 🎵 Core playback (LiveKit/Spotify)
├── music-session-context.ts          # Session-aware music state
│
├── intelligent-music-transitions.ts  # Context-aware transitions
├── music-humanization.ts             # Emotional music offers
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
    ├── dj-controller.test.ts         # State machine tests (30 tests)
    └── dj-decision-engine.test.ts    # Decision engine tests (33 tests)
```

---

## Rules

| ✅ Do | ❌ Don't |
|-------|---------|
| Use `getDJController()` | Import old `getDJBooth` (DELETED) |
| Use `controller.dispatch({ type: ... })` | Mutate state directly |
| Use `controller.isMusicActive()` | Check music player directly |
| Use `getDJTimingEngine()` for timers | Create your own timeouts |
| Call `resetDJController()` on session end | Leave state hanging |
| Use pure decision functions | Put decision logic elsewhere |

---

## Deleted Files (Legacy)

These files were DELETED during the architecture overhaul:

- `dj-booth.ts` - Replaced by DJController
- `dj-enhancements.ts` - Logic distributed to engines
- `dj-integration.ts` - Merged into music-handler.ts
- `dj-orchestrator.ts` - Redundant
- `dj-session.service.ts` - Redundant

If you see imports to these files, they need to be updated!

---

## Related Docs

- `docs/architecture/MUSIC-SYSTEM.md` - Full architecture
- `src/agents/voice-agent/music-handler.ts` - Integration point
- `src/services/CLAUDE.md` - Service patterns

---

*Last updated: January 2026*
