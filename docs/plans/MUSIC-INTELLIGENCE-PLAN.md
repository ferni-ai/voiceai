# Music Intelligence System - Implementation Plan

## Overview

This plan implements a complete "Music Intelligence" system that makes Ferni's music experience feel superhuman - anticipating needs, learning deeply, and creating emotional connections through sound.

## Current State

### Working ✅
- Basic playback (iTunes/Spotify)
- DJ Booth orchestration (ducking, crossfades, timing)
- "Our Songs" memory system
- Music context builder
- Game music infrastructure (types + 5 games implemented)
- DJ Enhancement Controller (skeleton for Phases 2-8)

### Partially Working ⚠️
- DJ Enhancements Phases 2-8 (defined but not fully integrated)
- Emotion-reactive music (offers exist, limited integration)
- Session flow tracking (tracks data, doesn't act on it)
- Musical memory (saves preferences, doesn't learn)

### Not Implemented ❌
- Deep mood-to-music ML matching
- Cross-session preference learning
- Game-specific dynamic soundtracks
- Real-time waveform analysis
- Voice-based mood detection for music suggestions
- Collaborative music discovery

---

## Implementation Phases

### Phase 1: Complete DJ Enhancement Integration (2-8)
**Goal**: Wire up all existing DJ enhancement components to voice-agent

#### 1.1 Predictive Timing (Phase 2) - Wire to DJ Booth
- [ ] Connect `scheduleTrackTimingCallbacks` to DJBooth.onMusicStart()
- [ ] Add countdown phrases to agent speech at 30s/15s/5s marks
- [ ] Test with iTunes previews (30s tracks)

#### 1.2 Persona DJ Styles (Phase 3) - Full Integration
- [ ] Use `PERSONA_DJ_STYLES` in DJBooth for timing decisions
- [ ] Adjust comment frequency based on persona
- [ ] Implement silence approach per persona

#### 1.3 Thinking Music (Phase 4) - Connect to Agent
- [ ] Wire `ThinkingMusicController` to agent tool execution
- [ ] Call `onProcessingStart()` when LLM is thinking
- [ ] Call `onProcessingEnd()` before agent speaks

#### 1.4 Emotion-Reactive Music (Phase 5) - Full Integration
- [ ] Create new context builder: `music-emotion-offers.ts`
- [ ] Detect emotion from conversation state
- [ ] Inject music offers based on `getEmotionMusicSuggestion()`
- [ ] Track acceptance/rejection to improve offers

#### 1.5 Game Music (Phase 6) - Dynamic Soundtracks
- [ ] Create `game-music-controller.ts` service
- [ ] Implement correct/wrong answer sounds
- [ ] Add game-specific background music
- [ ] Add countdown timer music
- [ ] Wire to game engine events

#### 1.6 Session Flow (Phase 7) - Radio Show Experience
- [ ] Wire `SessionFlowManager` to track all events
- [ ] Generate session summaries for outro
- [ ] Implement "radio show" transitions
- [ ] Add topic/mood callbacks during session

#### 1.7 Cross-Session Memory (Phase 8) - Preference Learning
- [ ] Connect `MusicMemoryManager` to persistence layer
- [ ] Load preferences at session start
- [ ] Save preferences at session end
- [ ] Implement personalized suggestions based on history

---

### Phase 2: Deep Mood-to-Music Matching
**Goal**: Superhuman music selection based on emotional state

#### 2.1 Emotion Detection Enhancement
- [ ] Create `src/services/music-intelligence/emotion-music-mapper.ts`
- [ ] Define 20+ emotion states (not just 8)
- [ ] Map each emotion to:
  - Multiple genre options
  - Tempo preferences
  - Energy levels
  - Sample search queries

#### 2.2 Context-Aware Selection
- [ ] Consider time of day
- [ ] Consider day of week
- [ ] Consider recent conversation topics
- [ ] Consider recent music played (avoid repetition)

#### 2.3 Mood Transition Music
- [ ] Detect mood transitions (sad → hopeful)
- [ ] Select music that bridges emotional states
- [ ] Create "journey" playlists for emotional arcs

---

### Phase 3: Cross-Session Preference Learning
**Goal**: Learn user's music taste over time

#### 3.1 Preference Data Model
- [ ] Create `MusicUserProfile` interface:
  ```typescript
  interface MusicUserProfile {
    likedArtists: WeightedList<string>;
    dislikedArtists: string[];
    likedGenres: WeightedList<string>;
    moodToGenreMap: Map<string, WeightedList<string>>;
    timeOfDayPreferences: Map<TimeOfDay, WeightedList<string>>;
    energyPreference: 'low' | 'medium' | 'high' | 'varies';
    discoveryOpenness: number; // 0-1
    totalTracksPlayed: number;
    skipRate: number;
    averageListenTime: number;
  }
  ```

#### 3.2 Learning Algorithm
- [ ] Track implicit signals:
  - Full listen vs skip
  - Request to repeat
  - Positive verbal feedback
  - Mood improvement after music
- [ ] Weight recent preferences higher
- [ ] Decay old preferences over time

#### 3.3 Persistence Integration
- [ ] Save to Firestore under user profile
- [ ] Load at session start
- [ ] Merge with existing "Our Songs" data

---

### Phase 4: Game-Specific Dynamic Soundtracks
**Goal**: Music that responds to game events in real-time

#### 4.1 Game Sound Effect Library
- [ ] Create `src/audio/game-sounds.ts`
- [ ] Define sound effects:
  - Correct answer: celebratory chime
  - Wrong answer: gentle "try again" tone
  - Streak building: escalating excitement
  - High score: victory fanfare
  - Timer warning: tension building

#### 4.2 Dynamic Background Music
- [ ] Different music per game type:
  - Name That Tune: quiz show energy
  - Desert Island: reflective acoustic
  - This or That: upbeat pop
  - Mood DJ: ambient/chill

#### 4.3 Adaptive Intensity
- [ ] Increase tempo/energy as game progresses
- [ ] Match music to score/performance
- [ ] Build tension for final rounds

---

### Phase 5: Voice-Based Mood Detection for Music
**Goal**: Detect mood from voice characteristics and suggest music

#### 5.1 Voice Analysis Integration
- [ ] Leverage existing voice emotion detection
- [ ] Create `src/services/music-intelligence/voice-music-bridge.ts`
- [ ] Map voice characteristics to music suggestions:
  - Tired voice → energizing music offer
  - Stressed voice → calming music offer
  - Excited voice → match the energy

#### 5.2 Proactive Music Offers
- [ ] Detect emotional shifts in voice
- [ ] Offer music at appropriate moments
- [ ] Don't over-offer (once per emotion shift max)

#### 5.3 Mid-Conversation Detection
- [ ] Monitor voice during conversation
- [ ] Detect when user could benefit from music
- [ ] Subtle, non-intrusive offers

---

### Phase 6: Real-Time Waveform Analysis (Advanced)
**Goal**: Understand music structure for perfect timing

#### 6.1 Basic Beat Detection
- [ ] Create `src/audio/waveform-analysis.ts`
- [ ] Detect beats in playing track
- [ ] Time DJ comments to beat drops

#### 6.2 Structure Detection
- [ ] Identify verse/chorus/bridge sections
- [ ] Time outro to natural breaks
- [ ] Avoid interrupting during builds

#### 6.3 Energy Curve
- [ ] Analyze track energy over time
- [ ] Predict "peak" moments
- [ ] Comment on highlights ("Here it comes!")

*Note: This phase is complex and may require external libraries or APIs*

---

### Phase 7: Collaborative Music Discovery
**Goal**: Share music discoveries between users (anonymized)

#### 7.1 Community Music Trends
- [ ] Track what's popular across all users
- [ ] Surface trending tracks/artists
- [ ] "Other Ferni friends love this one..."

#### 7.2 Taste Matching (Privacy-Preserving)
- [ ] Anonymized preference clustering
- [ ] Suggest based on similar users
- [ ] "Someone with similar taste discovered..."

#### 7.3 Seasonal/Contextual Discovery
- [ ] Holiday music suggestions
- [ ] Weather-appropriate music
- [ ] Time-of-year vibes

---

## File Structure

```
src/
├── audio/
│   ├── dj-booth.ts                    # Existing - enhance
│   ├── dj-enhancements.ts             # Existing - complete integration
│   ├── music-player.ts                # Existing - good
│   ├── ambient-music.ts               # Existing - good
│   ├── game-sounds.ts                 # NEW - game sound effects
│   └── waveform-analysis.ts           # NEW - beat detection (Phase 6)
│
├── services/
│   ├── music-intelligence/            # NEW directory
│   │   ├── index.ts
│   │   ├── emotion-music-mapper.ts    # Mood-to-music matching
│   │   ├── preference-learner.ts      # Cross-session learning
│   │   ├── voice-music-bridge.ts      # Voice → music suggestions
│   │   ├── community-trends.ts        # Collaborative discovery
│   │   └── types.ts
│   │
│   ├── games/
│   │   ├── game-music-controller.ts   # NEW - game music orchestration
│   │   └── music-games.ts             # Existing - enhance
│   │
│   └── music-preferences.ts           # Existing - enhance
│
├── intelligence/context-builders/
│   ├── music.ts                       # Existing - enhance
│   └── music-emotion-offers.ts        # NEW - proactive offers
│
└── tests/
    ├── music-integration.test.ts      # Existing - expand
    ├── music-intelligence.test.ts     # NEW
    ├── dj-enhancements.test.ts        # NEW
    ├── game-music.test.ts             # NEW
    └── music-e2e.test.ts              # NEW - full flow tests
```

---

## Testing Strategy

### Unit Tests
- Each new service gets comprehensive unit tests
- Mock iTunes/Spotify APIs
- Test edge cases (no network, empty results)

### Integration Tests
- DJ Booth + Enhancements integration
- Music context builder + emotion detection
- Game engine + game music controller

### E2E Tests
- Full session with music offers
- Game with sound effects
- Cross-session preference persistence
- "Our Songs" callbacks

---

## Implementation Order (APPROVED)

**User Selection**: Phase 1 First, Include Waveform Analysis, Include Collaborative Discovery

### Sprint 1: DJ Enhancement Integration (Phase 1)
1. **Phase 1.1** - Predictive Timing - Wire countdown callbacks
2. **Phase 1.2** - Persona DJ Styles - Full integration
3. **Phase 1.3** - Thinking Music - Connect to agent
4. **Phase 1.4** - Emotion-Reactive Music - Context builder
5. **Phase 1.5** - Game Music - Dynamic soundtracks
6. **Phase 1.6** - Session Flow - Radio show experience
7. **Phase 1.7** - Cross-Session Memory - Preference persistence

### Sprint 2: Advanced Features
8. **Phase 2** - Deep Mood Matching
9. **Phase 3** - Preference Learning
10. **Phase 4** - Dynamic Soundtracks
11. **Phase 5** - Voice Detection

### Sprint 3: Advanced & Collaborative
12. **Phase 6** - Waveform Analysis ✅ INCLUDED
13. **Phase 7** - Collaborative Discovery ✅ INCLUDED

---

## Success Metrics

- [ ] Music offers accepted rate > 60%
- [ ] Skip rate < 20% for suggested tracks
- [ ] Game music enhances engagement (survey)
- [ ] Cross-session preferences loaded in < 100ms
- [ ] Emotion detection → music offer latency < 2s
- [ ] All existing tests pass
- [ ] New test coverage > 80%

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| iTunes API rate limits | Circuit breaker, caching, fallback tracks |
| Spotify auth complexity | Token auto-refresh, graceful degradation |
| Waveform analysis performance | Run in web worker, optional feature |
| Privacy for collaborative | Anonymize, aggregate, opt-in only |
| Over-offering music | Cooldown timers, context awareness |

---

## Questions Before Starting

1. **Priority**: Which features are most important to you? Should we start with all of Phase 1, or jump to specific high-value items?

2. **Waveform Analysis**: This requires either a server-side library or Web Audio API. Is this a priority, or should we defer?

3. **Collaborative Discovery**: This has privacy implications. Should we include it, or keep music preferences user-local only?

4. **Testing Depth**: How comprehensive should E2E tests be? Should they mock external APIs or test against real iTunes?
