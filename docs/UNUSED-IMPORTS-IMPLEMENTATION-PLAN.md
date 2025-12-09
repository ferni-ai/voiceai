# Unused Imports Implementation Plan

> **Goal:** Fully implement, integrate, and test all unused imports/variables that indicate incomplete features.
> **Total Issues Found:** 616 unused imports/variables across `src/`

---

## Overview

This document tracks the implementation of all incomplete features identified through unused import analysis. Each phase focuses on a related system to ensure coherent integration.

---

## Phase 1: Trust Systems 🔒

**Files Affected:**
- `src/api/trust-systems-routes.ts`
- `src/api/routes/relationship-health-routes.ts`
- `src/intelligence/context-builders/trust-context.ts`

### Unused Imports to Implement

#### trust-systems-routes.ts (Lines 27-76)
| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `calculateHealthScore` | Calculate relationship health metrics | Wire into GET /trust/health endpoint |
| `recordEventOutcome` | Track trust-building event outcomes | Wire into POST /trust/events endpoint |
| `generateFollowUpMessage` | Create follow-up messages for trust building | Wire into GET /trust/followup endpoint |
| `generateTuningGuidance` | Generate personalization guidance | Wire into GET /trust/guidance endpoint |
| `getBestPrompt` | Get optimal prompt for context | Wire into prompt selection logic |
| `getSuggestionsForMood` | Mood-based suggestions | Wire into GET /trust/suggestions endpoint |

#### relationship-health-routes.ts (Lines 34-38)
| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `RelationshipHealthScore` | Type for health scoring | Use in response typing |
| `buildInsightContext` | Build context for insights | Wire into insight generation |

#### trust-context.ts (Lines 44-62, 273)
| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `getEventsNeedingReminders` | Find events that need reminders | Wire into context building |
| `analyzeDeviation` | Detect behavioral deviations | Wire into trust analysis |
| `getFamiliarityScore` | Calculate user familiarity | Wire into context |
| `VoiceCharacteristics` | Type for voice analysis | Use in voice-based trust |
| `buildSeasonalContext` | Add seasonal awareness | Wire into context |
| `getLearningProfile` | Get user learning preferences | Wire into personalization |
| `userData` | Function parameter | Use or prefix with _ |

### Implementation Steps

1. [ ] Review existing trust system architecture in `src/services/trust-systems/`
2. [ ] Implement missing API endpoints in trust-systems-routes.ts
3. [ ] Wire up context builders in trust-context.ts
4. [ ] Add tests for each new endpoint
5. [ ] Verify integration with frontend trust-journey.ui.ts

### Test Cases
- [ ] GET /api/trust/health returns valid health score
- [ ] POST /api/trust/events records outcomes correctly
- [ ] GET /api/trust/suggestions returns mood-appropriate suggestions
- [ ] Context builder includes all trust signals

---

## Phase 2: DJ/Music System 🎵

**Files Affected:**
- `src/agents/dj-integration.ts`
- `src/audio/dj-booth.ts`
- `src/audio/dj-enhancements.ts`
- `src/services/dj-orchestrator.ts`
- `src/services/dj-service.ts`
- `src/services/dj-session.service.ts`

### Unused Imports to Implement

#### dj-integration.ts (Line 34)
| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `playSessionSound` | Play session transition sounds | Integrate into session lifecycle |
| `getVerbalSound` | Get verbal audio cues | Wire into conversation flow |

#### dj-booth.ts (Lines 25, 36)
| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `getDJEnhancements` | Get DJ enhancement options | Wire into DJ decision making |
| `EmotionDuringMoment` | Type for emotional context | Use in emotion-aware music |

#### dj-enhancements.ts (Lines 1026, 1158-1171)
| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `personaId` | Persona context for music | Use in persona-specific music |
| `t` (multiple) | Unused array elements | Destructure correctly or use _ |

#### dj-orchestrator.ts (Lines 42-43)
| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `getVerbalSound` | Get verbal audio cues | Wire into orchestration |
| `getMusicPlayer` | Get music player instance | Use for playback control |

#### dj-service.ts (Lines 16, 379)
| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `getMusicPlayer` | Get music player instance | Use for service operations |
| `track` | Track parameter | Use or prefix with _ |

#### dj-session.service.ts (Lines 20-24, 528)
| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `getMusicConversationStarter` | Start music-related conversations | Wire into session start |
| `getContextualMusicSuggestion` | Context-aware music suggestions | Wire into recommendations |
| `getReadTheRoomAction` | Environmental awareness | Wire into mood detection |
| `context` | Session context parameter | Use or prefix with _ |

### Implementation Steps

1. [ ] Audit current DJ system flow in voice-agent.ts
2. [ ] Wire playSessionSound into session start/end events
3. [ ] Integrate getMusicPlayer across all DJ services
4. [ ] Implement contextual music suggestions
5. [ ] Add "read the room" functionality
6. [ ] Test with Spotify integration

### Test Cases
- [ ] Session sounds play at correct lifecycle points
- [ ] Music suggestions match user mood
- [ ] Persona-specific music preferences work
- [ ] DJ conversation starters trigger appropriately

---

## Phase 3: Context Builders 🧠

**Files Affected:**
- `src/intelligence/context-builders/cognitive-quirks.ts`
- `src/intelligence/context-builders/cognitive.ts`
- `src/intelligence/context-builders/engagement-context.ts`
- `src/intelligence/context-builders/engagement.ts`
- `src/intelligence/context-builders/meta-conversation.ts`
- `src/intelligence/context-builders/persona-memory.ts`
- `src/intelligence/context-builders/persona-quirks.ts`
- `src/intelligence/context-builders/role-boundaries.ts`
- `src/intelligence/context-builders/team-dynamics.ts`
- `src/intelligence/context-builders/voice-emotion.ts`
- `src/intelligence/context-builders/alive-awareness.ts`
- `src/intelligence/context-builders/cognitive-distortions.ts`
- `src/intelligence/context-builders/cognitive-insights.ts`
- `src/intelligence/context-builders/handoff.ts`
- `src/intelligence/context-builders/humanizing.ts`
- `src/intelligence/context-builders/memory.ts`
- `src/intelligence/context-builders/somatic-context.ts`
- `src/intelligence/context-builders/spontaneous-vulnerability.ts`

### Common Pattern: createStandardInjection Not Used

Multiple files import `createStandardInjection` but don't use it:
- cognitive-quirks.ts
- meta-conversation.ts
- persona-quirks.ts
- role-boundaries.ts
- team-dynamics.ts

**Action:** Determine if these should use the standard injection pattern or if imports should be removed.

### Unused Imports to Implement

#### cognitive.ts (Lines 27, 62-63)
| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `createInjection` | Create context injections | Wire into cognitive context |
| `broadcastQuirkActivated` | Emit quirk activation events | Wire into quirk system |
| `broadcastInsightGenerated` | Emit insight events | Wire into insight system |

#### engagement-context.ts (Line 17)
| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `getMemoryEngagementEngine` | Get engagement scoring | Wire into engagement context |

#### persona-memory.ts (Lines 32-33)
| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `getImportantDates` | Get user's important dates | Wire into memory context |
| `getWatchlist` | Get user's watchlist items | Wire into memory context |

#### voice-emotion.ts (Lines 24, 26)
| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `getSessionVoiceState` | Get voice analysis state | Wire into emotion context |
| `CognitiveStateAdjustment` | Type for state adjustments | Use in cognitive adjustments |

#### alive-awareness.ts (Line 28)
| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `getMoodState` | Get current mood state | Wire into awareness context |

#### handoff.ts (Line 36)
| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `getFrontendPersonaId` | Get frontend persona mapping | Wire into handoff context |

#### somatic-context.ts (Line 29)
| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `generateVoiceGuidance` | Generate voice-based guidance | Wire into somatic context |

### Implementation Steps

1. [ ] Audit which context builders are actively used in turn-processor.ts
2. [ ] Implement broadcast events for quirks/insights
3. [ ] Wire up memory engagement into context
4. [ ] Add important dates and watchlist to persona memory
5. [ ] Integrate voice state into emotion context
6. [ ] Ensure all context builders contribute to prompt

### Test Cases
- [ ] All context builders generate valid context
- [ ] Broadcasts emit when quirks/insights activate
- [ ] Important dates surface in conversations
- [ ] Voice emotion affects cognitive state

---

## Phase 4: Outreach System 📧

**Files Affected:**
- `src/services/goal-outreach-integration.ts`
- `src/services/outreach-analytics.ts`
- `src/services/outreach/session-integration.ts`
- `src/api/outreach-routes.ts`
- `src/api/outreach-handler.ts`

### Unused Imports to Implement

#### goal-outreach-integration.ts (Lines 17-18)
| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `scheduleEmail` | Schedule outreach emails | Wire into goal milestone triggers |
| `getUserContactInfo` | Get user contact details | Use for email delivery |

#### outreach-analytics.ts (Lines 125, 154)
| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `loadUserEvents` | Load user event history | Wire into analytics |
| `saveUserAnalytics` | Persist analytics data | Wire into tracking |

#### session-integration.ts (Line 10)
| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `getOutreachDecisionEngine` | Get outreach decision logic | Wire into session flow |

### Implementation Steps

1. [ ] Review outreach decision engine in `src/services/outreach/`
2. [ ] Implement email scheduling for goal milestones
3. [ ] Wire analytics loading/saving
4. [ ] Integrate decision engine into session
5. [ ] Test email delivery flow

### Test Cases
- [ ] Goal milestones trigger email scheduling
- [ ] Analytics persist correctly
- [ ] Outreach decisions respect user preferences
- [ ] Session integration triggers at appropriate times

---

## Phase 5: Therapeutic Frameworks 🧘

**Files Affected:**
- `src/services/therapeutic-frameworks/index.ts`
- `src/intelligence/context-builders/therapeutic-frameworks.ts`
- `src/services/cognitive-intelligence/distortion-detector.ts`

### Unused Imports to Implement

#### index.ts (Lines 154-159)
| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `buildDefusionContext` | ACT defusion context | Wire into framework selection |
| `selectDefusionTechnique` | Choose defusion approach | Wire into technique selection |
| `selectDBTSkill` | Choose DBT skill | Wire into DBT module |
| `detectSustainTalk` | MI sustain talk detection | Wire into conversation analysis |

#### distortion-detector.ts (Line 30)
| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `ResponseApproach` | Type for response strategy | Use in detector output |

#### therapeutic-frameworks.ts (Line 27)
| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `TherapeuticContextResult` | Return type for context | Use in function signatures |

### Implementation Steps

1. [ ] Review therapeutic framework architecture
2. [ ] Wire defusion techniques into ACT module
3. [ ] Wire DBT skill selection into DBT module
4. [ ] Implement sustain talk detection in MI
5. [ ] Add context builder for therapeutic approaches

### Test Cases
- [ ] Defusion techniques selected appropriately
- [ ] DBT skills match user situation
- [ ] Sustain talk detected in conversation
- [ ] Therapeutic context enriches responses

---

## Phase 6: Miscellaneous Systems 🔧

### Auth System
**File:** `src/api/auth-middleware.ts`

| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `clearFailedAuth` | Clear failed auth attempts | Wire into auth recovery |

### Experiments System
**File:** `src/services/experiments/api.ts`

| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `getRunningExperiments` | Get active experiments | Wire into experiment API |
| `getExperimentResults` | Get experiment results | Wire into results endpoint |

### Subscription System
**File:** `src/services/stripe-subscription.ts`

| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `getCurrentPeriod` | Get billing period | Wire into subscription status |

### Games System
**Files:** `src/services/games/*.ts`

| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `nextRound` (music-games.ts) | Game round progression | Wire into game flow |
| `personaId` (game-persistence.ts) | Persona context for games | Use in game storage |

### Cross-Agent Awareness
**File:** `src/services/cross-agent-awareness.ts`

| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `agentId` | Agent identification | Use in awareness logic |
| `currentAgentId` | Current agent context | Use in cross-agent comms |

### Cultural Awareness
**File:** `src/services/cultural-awareness.ts`

| Import | Purpose | Action Required |
|--------|---------|-----------------|
| `getSeasonalContext` | Seasonal awareness | Wire into cultural context |

### Implementation Steps

1. [ ] Implement clearFailedAuth in auth flow
2. [ ] Wire experiment APIs
3. [ ] Add billing period to subscription status
4. [ ] Fix game round progression
5. [ ] Complete cross-agent awareness
6. [ ] Add seasonal context to cultural awareness

---

## Phase 7: Cleanup 🧹

### Unused Caught Errors
Rename to `_error` pattern for intentionally ignored errors:
- `djErr` → `_djErr`
- `wtErr` → `_wtErr`
- `ambientErr` → `_ambientErr`
- `laughErr` → `_laughErr`
- `rhythmErr` → `_rhythmErr`
- `antErr` → `_antErr`

### Unused Function Parameters
Prefix with `_` for interface compliance:
- `emotionalState` in turn-processor.ts
- `personaId` in multiple files
- `context` in multiple callbacks
- `profile` in engagement handlers

### Unused Type Imports
Remove or use these type imports:
- `SessionServices` in voice-agent.ts
- `HandoffDirection` in handoff-handler.ts
- `FeatureFlag` in feature-flag-routes.ts
- Various `*Type` imports across files

### Implementation Steps

1. [ ] Run ESLint with --fix for auto-fixable issues
2. [ ] Manually prefix intentionally unused params with _
3. [ ] Remove truly dead imports
4. [ ] Verify no functionality broken

---

## Phase 8: E2E Testing 🧪

### API Endpoint Tests
- [ ] All trust system endpoints return valid responses
- [ ] Outreach scheduling works end-to-end
- [ ] Experiment APIs return correct data
- [ ] Subscription APIs reflect correct state

### Integration Tests
- [ ] Voice agent integrates all context builders
- [ ] DJ system plays appropriate music
- [ ] Therapeutic frameworks activate correctly
- [ ] Cross-agent handoffs work smoothly

### Frontend Verification
- [ ] Trust journey UI displays correct data
- [ ] Dev panel can trigger all systems
- [ ] Subscription flows work correctly
- [ ] Team unlock celebrations fire

### Load Testing
- [ ] Context builders perform under load
- [ ] No memory leaks in long sessions
- [ ] DB queries are optimized

---

## Progress Tracking

| Phase | Files | Issues | Status |
|-------|-------|--------|--------|
| 1. Trust Systems | 3 | 14 | ✅ Completed |
| 2. DJ/Music | 6 | 15 | ✅ Completed |
| 3. Context Builders | 18 | 25+ | ✅ Completed (Major fixes) |
| 4. Outreach | 5 | 5 | ⬜ Pending |
| 5. Therapeutic | 3 | 6 | ⬜ Pending |
| 6. Misc Systems | 8 | 10 | ⬜ Pending |
| 7. Cleanup | All | ~800 | 🔄 In Progress |
| 8. E2E Testing | All | - | ⬜ Pending |

## Completed Work (Session 1)

### Phase 1: Trust Systems ✅
- Added new endpoints to `trust-systems-routes.ts`:
  - `/api/trust/tuning` - Response tuning guidance
  - `/api/trust/life-events/outcome` - Record event outcomes
  - `/api/trust/life-events/follow-up` - Get follow-up messages
  - `/api/trust/health/calculate` - Calculate fresh health scores
  - `/api/trust/journaling/best` - Get best journaling prompt
  - `/api/trust/media/mood` - Get mood-based media suggestions
- Wired `buildInsightContext` into `relationship-health-routes.ts`
- Extended `trust-context.ts` with:
  - Events needing reminders context
  - Voice deviation analysis
  - Familiarity score context
  - Learning profile integration in tuning context
- Extended `TuningContext` interface with new fields

### Phase 2: DJ/Music System ✅
- Fixed `dj-integration.ts`:
  - Wired `playSessionSound` for session start/end
  - Added `getVerbalCue()` method using `getVerbalSound`
- Fixed `dj-booth.ts`:
  - Removed unused `EmotionDuringMoment` type
  - Added `getDJEnhancementsController()` export
- Fixed `dj-session.service.ts`:
  - Added `getMusicConversationStarterPhrase()`
  - Added `getContextualMusicSuggestionForTopics()`
  - Added `getReadTheRoomSuggestion()`
- Fixed `dj-orchestrator.ts`:
  - Added `isMusicPlaying()`, `getCurrentTrack()`, `getMusicVolume()`
  - Added `getVerbalSoundCue()` for verbal fallbacks
- Fixed `dj-enhancements.ts`:
  - Prefixed unused parameters with `_`
- Fixed `dj-service.ts`:
  - Added `isMusicCurrentlyPlaying()` and `getCurrentPlayingTrack()`

### Phase 3: Context Builders ✅
- Fixed `cognitive.ts`:
  - Removed unused `createInjection` import
  - Moved `broadcastQuirkActivated`/`broadcastInsightGenerated` to proper files
- Fixed `cognitive-quirks.ts`:
  - Wired `broadcastQuirkActivated` when quirks are used
- Fixed `cognitive-insights.ts`:
  - Wired `broadcastInsightGenerated` when insights are shared

### Remaining Work
~800 unused variable warnings remain, mostly:
- Type imports that aren't used (remove or add `type` keyword)
- Function parameters for interface compliance (prefix with `_`)
- Imported utilities that could be used or removed
- Variables assigned but not read

Run `npx eslint src --ext .ts 2>&1 | grep "no-unused-vars"` to see full list.

---

## Notes

- **Priority Order:** Trust → DJ → Context → Outreach → Therapeutic → Misc → Cleanup → Test
- **Estimated Time:** 2-3 days for full implementation
- **Risk Areas:** DJ system may need Spotify credentials, Outreach needs email service config
- **Dependencies:** Some context builders depend on others being implemented first

