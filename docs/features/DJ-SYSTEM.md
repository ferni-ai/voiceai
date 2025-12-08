# 🎧 Ferni DJ System - The Radio Show Experience

> Making every Ferni session feel like tuning into your favorite radio show.

## Overview

The DJ System transforms Ferni from a chatbot into a radio host. It orchestrates:
- **Session intros** ("Opening the show")
- **Session outros** ("Wrapping the show")
- **Cross-session music callbacks** ("Remember when we listened to...")
- **Guest DJ handoffs** ("Let me get Maya...")
- **Mid-song moments** ("Wait for it...")
- **Thinking music** (ambient during processing)

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DJ SYSTEM LAYERS                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  DJ Integration (src/agents/dj-integration.ts)               │  │
│  │  - Single import for voice-agent.ts                          │  │
│  │  - Convenience wrappers for all DJ features                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                            ↓                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  DJ Orchestrator (src/services/dj-orchestrator.ts)           │  │
│  │  - Coordinates all DJ subsystems                             │  │
│  │  - Single entry point for DJ functionality                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                            ↓                                        │
│  ┌─────────────────────┐  ┌────────────────────────────────────┐   │
│  │  DJ Session Service │  │  DJ Service (dj-service.ts)        │   │
│  │  - Intro/outro      │  │  - Persona DJ styles               │   │
│  │  - Guest DJ banter  │  │  - Music appreciation              │   │
│  │  - Session tracking │  │  - Spontaneous offers              │   │
│  └─────────────────────┘  │  - Read the room                   │   │
│                           │  - Music discovery                 │   │
│                           └────────────────────────────────────┘   │
│                            ↓                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Audio Layer                                                  │  │
│  │  - ambient-music.ts: DJ phrases, mood offers                 │  │
│  │  - session-sounds.ts: Stingers, game sounds                  │  │
│  │  - music-player.ts: Playback, crossfade, ducking             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Files Created/Modified

### New Files
| File | Purpose |
|------|---------|
| `src/services/dj-session.service.ts` | Session lifecycle (intro/outro) |
| `src/services/dj-orchestrator.ts` | Unified DJ coordinator |
| `src/audio/session-sounds.ts` | Sound effects service |
| `src/agents/dj-integration.ts` | Voice-agent integration |
| `design-system/assets/sounds/README.md` | Sound asset documentation |

### Modified Files
| File | Changes |
|------|---------|
| `src/agents/voice-agent.ts` | DJ intro, music tracking, session summary |
| `src/agents/shared/handoff-handler.ts` | Guest DJ entrances |
| `src/agents/index.ts` | DJ integration exports |
| `src/services/index.ts` | DJ service exports |
| `src/audio/index.ts` | Session sounds exports |
| `src/services/games/game-sounds.ts` | Local sound effects |

## Feature Details

### 1. Session Intros ("Opening the Show")

When a user connects, Ferni "opens the show":

```typescript
const djIntro = await dj.openShow({
  personaId: 'ferni',
  userName: 'Alex',
  isFirstSession: false,
  musicHistory: { lastPlayedArtist: 'Fleetwood Mac' },
});

// Returns:
{
  phrase: "Hey Alex! Last time we were jamming to Fleetwood Mac. Still in that mood?",
  shouldReplaceGreeting: true,
  playedSound: true,
}
```

**Intro Types:**
- `first-time`: Warm welcome for new users
- `returning`: Personalized return greeting
- `callback`: Music memory reference
- `time-aware`: Morning/evening/night variations

### 2. Session Outros ("Wrapping the Show")

When a session ends:

```typescript
const outro = await dj.wrapShow();
// "Good session! We talked about retirement planning. I'll remember."
```

**Outro Types:**
- `warm`: Full goodbye with warmth
- `quick`: Short session, brief goodbye
- `music-themed`: "I'll save that jazz energy for next time"
- `summary`: References topics discussed

### 3. Cross-Session Music Memory

The system tracks music played and uses it for callbacks:

```typescript
// During session:
dj.trackMusicPlayed('Taylor Swift');

// Next session:
dj.getMusicMemoryCallback(musicHistory);
// "You know I remember you love Taylor Swift!"
```

### 4. Guest DJ Handoffs

When handing off to another persona:

```typescript
const { departingBanter, arrivingEntrance } = dj.orchestrateHandoff('ferni', 'maya-santos');

// departingBanter: "Maya would be perfect for this! Hold on..."
// arrivingEntrance: "Hey! Maya here. Ferni told me you wanted to talk habits?"
```

**Each persona has unique:**
- Handoff banter style
- Entrance phrases
- Energy level

### 5. Mid-Song Moments

During music playback:

```typescript
// 30% chance during songs:
dj.getMidSongMoment('buildup', 'Bohemian Rhapsody');
// "Ooh, here it comes..."

dj.getMidSongMoment('drop', 'Bohemian Rhapsody');
// "YES! Love this part."
```

### 6. Thinking Music

During heavy processing:

```typescript
await dj.startThinkingMusic();
// Plays soft ambient music at 8% volume

await dj.stopThinkingMusic();
// Fades out over 1.5 seconds
```

## Persona DJ Styles

Each persona has a distinct DJ personality:

| Persona | Style | Interjection Freq | Preferred Moods |
|---------|-------|-------------------|-----------------|
| Ferni | Warm | 30% | relaxing, thoughtful |
| Jack | Chill | 35% | acoustic, indie |
| Jordan | Hype | 50% | upbeat, energetic |
| Maya | Mindful | 20% | calm, meditation |
| Alex | Sophisticated | 25% | focus, classical |
| Peter | Sophisticated | 30% | jazz, oldies |
| Nayan | Mindful | 15% | meditation, spiritual |

## Sound Effects

### Existing Sounds (design-system/assets/sounds/)
- `connect.mp3` - Session start
- `disconnect.mp3` - Session end
- `dramatic-entrance.mp3` - First meeting
- `handoff-to-*.mp3` - Persona handoffs

### Needed Sounds
- `correct.mp3` - Game correct answer
- `wrong.mp3` - Game wrong answer
- `game-start.mp3` - Game beginning
- `game-end.mp3` - Game complete
- `high-score.mp3` - Achievement

### Fallback System

All sounds have TTS verbal fallbacks:
```typescript
// If correct.mp3 fails:
"<break time='100ms'/><prosody rate='fast'>Ding ding ding!</prosody>"
```

## Usage in Voice Agent

The DJ system is integrated at key points:

### 1. Session Start
```typescript
// In voice-agent.ts STEP 8
const dj = getDJIntegration();
const djIntro = await dj.openShow({ ... });
if (djIntro.shouldReplaceGreeting) {
  greeting = djIntro.phrase;
}
```

### 2. Music Playback
```typescript
// In music state callback
if (state === 'playing' && track) {
  dj.trackMusicPlayed(track.artist);
}
```

### 3. Handoffs
```typescript
// In handoff-handler.ts
const entrance = dj.getArrivingEntrance(prevPersona.id, persona.id);
session.say(entrance);
```

### 4. Session End
```typescript
// In cleanup section
const djSummary = dj.getSessionSummary();
// Saves music memory for next session
```

## Testing

```bash
# Test DJ service
npm test -- src/services/dj-service.test.ts

# Test session sounds
npm test -- src/audio/session-sounds.test.ts

# Integration test
npm test -- src/tests/dj-integration.test.ts
```

## Configuration

```env
# Enable/disable music features
MUSIC_ENABLED=true
AMBIENT_MUSIC_ENABLED=true

# Ambient tracks (optional)
AMBIENT_TRACK_1=https://example.com/track1.mp3
AMBIENT_MUSIC_URLS=url1,url2,url3
```

## Future Enhancements

1. **Session Outro Speaking** - Currently the outro is saved but not spoken (user disconnects too fast)
2. **Music Genre Detection** - Auto-detect genre for smarter callbacks
3. **Mood-Based Playlists** - Auto-suggest based on conversation mood
4. **DJ "Shows"** - Themed sessions (Morning Show, Night Owl, etc.)
5. **Sound Generation** - Auto-generate remaining sound effects

