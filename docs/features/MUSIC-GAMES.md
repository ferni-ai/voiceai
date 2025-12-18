# 🎮 Music Games System

> Making AI more human through playful musical interactions

The Music Games system brings fun, engaging music games to Ferni that deepen relationships, learn user preferences, and provide delightful moments of play.

---

## Table of Contents

1. [Overview](#overview)
2. [Available Games](#available-games)
3. [Architecture](#architecture)
4. [User Entry Points](#user-entry-points)
5. [Agent Integration](#agent-integration)
6. [Data Persistence](#data-persistence)
7. [Analytics](#analytics)
8. [API Reference](#api-reference)
9. [Testing](#testing)
10. [Deployment](#deployment)

---

## Overview

### Philosophy

Games aren't just entertainment—they're relationship builders. Through music games, Ferni:
- **Learns user preferences** - Discovers favorite genres, decades, and artists
- **Creates shared memories** - "Remember when you picked that song for Desert Island?"
- **Builds trust** - Playful moments deepen the relationship
- **Provides "more than human" insights** - Musical personality analysis, milestones, streaks

### Key Features

| Feature | Description |
|---------|-------------|
| 5 Music Games | Name That Tune, One Word Song, Desert Island Discs, This or That, Mood DJ |
| Musical DNA | Tracks genre/decade affinities over time |
| Milestone Celebrations | Recognizes achievements and streaks |
| Cross-Session Memory | Remembers past games and preferences |
| Proactive Offers | Agent suggests games during conversational lulls |
| Musical You Dashboard | Coaching-oriented insights visualization |

---

## Available Games

### 🎵 Name That Tune
**Difficulty:** Medium | **Duration:** 3-5 min

Listen to a short music clip and guess the song or artist. The faster you guess, the more points!

**How to Play:**
- Say your guess out loud
- Partial answers count (artist OR song title)
- Say "skip" or "next" to move on

**What We Learn:** Speed of recognition, genre familiarity, decade knowledge

---

### 💬 One Word Song
**Difficulty:** Easy | **Duration:** 2-3 min

Ferni gives a word, user thinks of a song with that word in the title.

**How to Play:**
- Any song with the word counts
- Bonus points for creative picks
- We'll play your song together

**What We Learn:** Musical breadth, creative associations

---

### 🏝️ Desert Island Discs
**Difficulty:** Easy | **Duration:** 5-10 min

Pick 5 songs to take to a desert island. Tell Ferni why each one matters.

**How to Play:**
- No wrong answers—it's about your story
- Share memories connected to each song
- We'll play each song as you share

**What We Learn:** Emotional connections to music, life story, values

---

### ⚡ This or That
**Difficulty:** Easy | **Duration:** 2-3 min

Quick choices between two songs. Which speaks to you more?

**How to Play:**
- Fast-paced decisions
- No overthinking—go with your gut!
- Explain your choice if you want

**What We Learn:** Musical preferences, taste patterns

---

### 🎧 Mood DJ Challenge
**Difficulty:** Medium | **Duration:** 3-5 min

Ferni gives a mood, user picks the perfect song for it.

**How to Play:**
- Be creative with your picks
- Explain why it fits the mood
- We'll play your selection

**What We Learn:** Emotional intelligence, music-mood associations

---

## Architecture

### Directory Structure

```
src/services/games/
├── index.ts              # Main exports
├── types.ts              # TypeScript types
├── game-engine.ts        # Core game lifecycle management
├── game-store.ts         # Persistence layer (Firestore)
├── game-music.ts         # Music search, playback, preloading
├── game-persistence.ts   # Session/memory management
├── game-intelligence.ts  # "More than human" features
├── game-insights.ts      # Dashboard data generation
├── game-analytics.ts     # Usage tracking
├── game-sounds.ts        # TTS sound effects
└── music-games.ts        # Individual game implementations

src/tools/domains/games/
└── index.ts              # LLM-accessible game tools

apps/web/src/ui/
├── game-picker.ui.ts     # Game selection modal
└── music-dashboard.ui.ts # Musical You dashboard
```

### Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│  Voice Agent │────▶│  Game Engine │
│  (UI/Voice)  │     │   (LLM)      │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
                                                  │
                     ┌────────────────────────────┼────────────────────────────┐
                     │                            │                            │
                     ▼                            ▼                            ▼
              ┌──────────────┐            ┌──────────────┐            ┌──────────────┐
              │  Game Music  │            │  Game Store  │            │  Analytics   │
              │   (iTunes)   │            │  (Firestore) │            │   Tracking   │
              └──────────────┘            └──────────────┘            └──────────────┘
```

### Key Classes

#### GameEngine
Manages the lifecycle of a game session:
- `startGame(gameType)` - Initialize a new game
- `submitAnswer(answer)` - Process user responses
- `endGame()` - Complete and record the game
- `getGameContext()` - Provide context for silence handler

#### GameStore
Handles persistence to Firestore:
- `loadGameMemory(userId)` - Load at session start
- `saveGameMemory(userId, memory)` - Debounced saving
- `forceSaveGameMemory(userId)` - Immediate save on disconnect

#### Game Music
Interfaces with iTunes API:
- `searchSong(query)` - Find a specific song
- `playGameTrack(track)` - Play during games
- `preloadNextRoundSongs()` - Pre-fetch for performance
- `duckForUserGuess()` - Lower volume when user speaks

---

## User Entry Points

### 1. Settings Menu
**Path:** Settings → Fun → Play Music Games

Opens the Game Picker modal with all 5 games.

### 2. Voice Command
Say any of:
- "Let's play a game"
- "Play Name That Tune"
- "I want to play a music game"
- "Can we play something fun?"

### 3. Proactive Offers
During conversational lulls, Ferni may offer:
- "Want to take a quick music break?"
- "I've got a fun game if you want..."

### 4. Dev Panel (Development)
**Shortcut:** `Cmd+Shift+D`

Direct game triggers for testing each game type.

---

## Agent Integration

### System Prompt Guidance

Ferni's manifest includes game guidance:

```json
{
  "tool_guidance": {
    "games": {
      "proactive_offers": "Offer games during lulls...",
      "game_memory": "You remember past games!",
      "mid_game_banter": "Be playful during games!",
      "available_games": ["startGame:name-that-tune", ...],
      "ending_games": "Gracefully end if user changes topic"
    }
  }
}
```

### Conversation Context

Games integrate with ConversationState:

```typescript
interface GameContext {
  isActive: boolean;
  gameType?: string;
  currentRound?: number;
  score?: number;
  awaitingAnswer?: boolean;
  startedAt?: Date;
}
```

### Silence Handler Awareness

The silence handler checks `isGameActive` to avoid interrupting games:

```typescript
if (context.isGameActive) {
  // Don't interrupt - user may be thinking about their answer
  return null;
}
```

---

## Data Persistence

### Storage Location

Game data is stored in `EngagementProfile.gameMemory`:

```
Firestore:
  engagement_profiles/
    {userId}/
      gameMemory: GameMemory
      musicMemory: MusicMemory
```

### GameMemory Structure

```typescript
interface GameMemory {
  totalGamesPlayed: number;
  bestStreak: number;
  currentStreak: number;
  lastPlayedAt?: Date;
  
  // Per-game stats
  gameStats: Record<GameType, {
    gamesPlayed: number;
    highScore: number;
    averageScore: number;
    totalTime: number;
  }>;
  
  // Musical DNA
  genreAffinities: Array<{
    genre: string;
    correctGuesses: number;
    avgGuessTimeMs: number;
    affinityScore: number;
  }>;
  
  decadeAffinities: Array<{...}>;
  
  // Milestones
  milestones: Array<{
    type: string;
    timestamp: Date;
    details?: string;
  }>;
  
  // Personality insights
  musicalPersonalityTraits: string[];
  
  // Desert Island picks
  desertIslandPicks?: string[];
}
```

### Save Triggers

| Event | Save Type |
|-------|-----------|
| Game ends | Immediate |
| Each guess | Debounced (3s) |
| Session disconnect | Force save |
| Musical DNA update | Debounced |

---

## Analytics

### Tracked Events

| Event | Data |
|-------|------|
| `game_started` | gameType, userId, personaId |
| `game_completed` | score, roundsPlayed, duration |
| `game_abandoned` | roundReached |
| `correct_answer` | guessTimeMs |
| `incorrect_answer` | guessTimeMs |
| `dashboard_opened` | userId |
| `proactive_offer_accepted` | gameType |

### Analytics Summary

```typescript
interface GameAnalyticsSummary {
  totalGamesStarted: number;
  totalGamesCompleted: number;
  completionRate: number;
  averageScore: number;
  mostPlayedGame: string | null;
  proactiveOfferAcceptanceRate: number;
  uniquePlayersCount: number;
}
```

### Usage

```typescript
import { 
  trackGameStart, 
  trackGameComplete,
  getAnalyticsSummary 
} from './services/games';

// Track game start
trackGameStart(userId, 'name-that-tune', 'ferni');

// Get summary
const summary = getAnalyticsSummary();
console.log(`Completion rate: ${summary.completionRate}%`);
```

---

## API Reference

### REST Endpoints

#### GET /api/games/insights
Returns dashboard data for the Musical You page.

**Query Params:**
- `userId` (required)

**Response:**
```json
{
  "success": true,
  "insights": {
    "personality": { "title": "...", "traits": [...] },
    "strengths": [...],
    "growthAreas": [...],
    "journey": { "totalGames": 10, ... },
    "milestones": [...],
    "personasPlayed": [...]
  }
}
```

#### GET /api/games/suggestion
Returns a personalized game suggestion.

**Response:**
```json
{
  "success": true,
  "suggestion": {
    "gameType": "name-that-tune",
    "reason": "You haven't played in a while!",
    "message": "How about a quick Name That Tune?"
  }
}
```

#### GET /api/games/conversational
Returns a short insight for the agent to share.

**Response:**
```json
{
  "success": true,
  "insight": "You've got a great ear for 80s music!"
}
```

### Rate Limiting

- **Limit:** 30 requests/minute per user
- **Response on limit:** 429 with `Retry-After: 60`

---

## Testing

### Unit Tests

```bash
# Run game tests
npm test -- src/tests/games/

# Run specific test file
npm test -- src/tests/games/game-engine.test.ts
```

### Manual Testing Checklist

- [ ] Open game picker from Settings → Fun → Play Music Games
- [ ] Start each game type via UI button
- [ ] Start a game via voice: "Let's play Name That Tune"
- [ ] Complete a full game and verify score saved
- [ ] Disconnect and reconnect - verify data persists
- [ ] Check Musical You dashboard shows game history
- [ ] Test proactive offer: wait for silence during conversation
- [ ] Verify music ducks when speaking during a game

### Dev Panel Testing

1. Open dev panel: `Cmd+Shift+D`
2. Find "🎮 Music Games" section
3. Click any game button to start immediately
4. Use "📊 Musical You Dashboard" to view insights

---

## Deployment

### Deploy Commands

```bash
# Deploy frontend (game picker, dashboard)
npm run deploy:frontend

# Deploy backend (game engine, APIs)
npm run deploy:ui

# Deploy both
npm run deploy:frontend && npm run deploy:ui
```

### Environment Variables

No new environment variables required. Games use:
- Existing Firestore connection
- iTunes API (no auth required)
- Existing music player infrastructure

### Verification

```bash
# Check API health
curl https://app.ferni.ai/api/games/insights?userId=test

# Expected: 200 OK with insights object
```

---

## Troubleshooting

### Game Won't Start

1. Check voice connection is active
2. Verify user is authenticated
3. Check console for game engine errors

### Music Not Playing

1. Verify `MUSIC_ENABLED=true` in environment
2. Check iTunes API is accessible
3. Verify music player is initialized

### Data Not Persisting

1. Check Firestore connection
2. Verify `flushToStorage()` called on disconnect
3. Check for save errors in logs

### Dashboard Empty

1. Ensure user has played games
2. Check `/api/games/insights` returns data
3. Verify gameMemory exists in profile

---

## Future Enhancements

- [ ] More games: Finish the Lyric, Decade Challenge, Music Trivia
- [ ] Multiplayer: Play with friends
- [ ] Leaderboards: Compare scores
- [ ] Spotify integration: Use user's actual playlists
- [ ] Voice-powered hints: "Give me a hint!"
- [ ] Adaptive difficulty: Auto-adjust based on performance
- [ ] Social sharing: Share Desert Island picks

---

## Related Documentation

- [Trust Systems](../TRUST-SYSTEMS.md) - How games build trust
- [Humanization](HUMANIZATION.md) - Making games feel natural
- [Spotify Integration](SPOTIFY-INTEGRATION.md) - Music playback details
- [Persistence Architecture](../architecture/PERSISTENCE-ARCHITECTURE.md) - Data storage patterns

