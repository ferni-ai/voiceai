# 🤝 Ferni Trust Systems

> "Better than human" trust-building capabilities

**Created:** December 8, 2024  
**Last Updated:** December 13, 2024  
**Status:** ✅ **COMPLETE & INTEGRATED** - All 29 phases implemented

### December 2024 Verification

All systems verified as implemented and integrated:
- ✅ 6 Core Systems (reading-between-lines, boundary-memory, growth-reflection, inside-jokes, small-wins, thinking-of-you)
- ✅ 5 Support Layers (persistence, voice-emotion, outreach, handoff, analytics)
- ✅ Context builder integration (`trust-context.ts`)
- ✅ Advanced phases 11-29 (consolidation, health score, starters, life events, etc.)

---

## Overview

The Trust Systems are a collection of services that enable Ferni to build genuine, lasting relationships with users. These systems track what matters, remember what to avoid, celebrate growth, and proactively check in - all the things a great friend does naturally.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          TRUST SYSTEMS ARCHITECTURE                              │
│                                                                                 │
│  User Message → Context Builders → [trust-context.ts] → LLM Context Injection  │
│                                           │                                      │
│                    ┌──────────────────────┴──────────────────────┐              │
│                    │           6 CORE SYSTEMS                     │              │
│                    │                                              │              │
│                    │  🔍 Reading Between Lines                    │              │
│                    │  🚫 Boundary Memory                          │              │
│                    │  🌱 Growth Reflection                        │              │
│                    │  😄 Inside Jokes & Callbacks                 │              │
│                    │  🏆 Small Wins Celebrator                    │              │
│                    │  💭 Thinking of You                          │              │
│                    │                                              │              │
│                    └──────────────────────┬──────────────────────┘              │
│                                           │                                      │
│                    ┌──────────────────────┴──────────────────────┐              │
│                    │           5 SUPPORT LAYERS                   │              │
│                    │                                              │              │
│                    │  💾 Persistence (Firestore)                  │              │
│                    │  🎤 Voice Emotion Integration                │              │
│                    │  📬 Outreach Execution                       │              │
│                    │  🤝 Team Handoff Context                     │              │
│                    │  📊 Analytics & A/B Testing                  │              │
│                    │                                              │              │
│                    └─────────────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
src/services/trust-systems/
├── index.ts                      # Main exports & unified API
├── reading-between-lines.ts      # Detect what's NOT being said
├── boundary-memory.ts            # Track what NOT to bring up
├── growth-reflection.ts          # Notice & reflect evolution
├── inside-jokes.ts               # Shared history & callbacks
├── small-wins.ts                 # Celebrate effort, not just outcomes
├── thinking-of-you.ts            # Proactive no-agenda outreach
├── persistence.ts                # Firestore save/load
├── voice-emotion-integration.ts  # Enhance with voice signals
├── outreach-integration.ts       # Execute proactive outreach
├── handoff-context.ts            # Pass context during persona handoffs
├── analytics.ts                  # Track effectiveness & A/B testing
├── cross-device-sync.ts          # Phase 3: Real-time Firestore sync
├── outreach-timing-ml.ts         # Phase 4: ML for optimal timing
└── persona-specific-learning.ts  # Phase 5: Per-persona relationships

src/api/
├── trust-journey-routes.ts       # Phase 1: Journey visualization API
└── trust-export-routes.ts        # Phase 2: Data export API

frontend-typescript/src/ui/
└── trust-journey.ui.ts           # Phase 1: Journey visualization UI

src/intelligence/context-builders/
└── trust-context.ts              # Inject trust into LLM context
```

---

## Core Systems

### 1. 🔍 Reading Between the Lines
**File:** `reading-between-lines.ts`

Detects what users are NOT saying directly.

**Signals Detected:**
- `emotional_mismatch` - "I'm fine" when context says otherwise
- `topic_avoidance` - Consistently steering away from topics
- `deflection` - Changing subject, minimizing
- `permission_seeking` - Wants to share but needs encouragement
- `unfinished_thought` - Started something, didn't finish
- `minimizing_pain` - Downplaying something significant

**Key Functions:**
```typescript
detectUnsaidSignals(userId, userMessage, context) → UnsaidSignal[]
getAvoidedTopics(userId) → string[]
shouldAvoidTopic(userId, topic) → boolean
```

---

### 2. 🚫 Boundary Memory
**File:** `boundary-memory.ts`

Remembers what topics are off-limits.

**Boundary Types:**
- `explicit` - User directly said "don't talk about X"
- `inferred_distress` - Topic caused visible distress
- `repeated_avoidance` - User avoided topic multiple times
- `sensitive_area` - Not off-limits but needs careful approach

**Key Functions:**
```typescript
detectNewBoundary(userId, userMessage, context) → Boundary | null
checkBoundary(userId, proposedResponse, context) → BoundaryCheckResult
isTopicOffLimits(userId, topic) → boolean
getActiveBoundaries(userId) → Boundary[]
```

---

### 3. 🌱 Growth Reflection
**File:** `growth-reflection.ts`

Notices evolution and reflects it back.

**Growth Types:**
- `emotional_regulation` - Better handling of difficult emotions
- `perspective_shift` - More flexible thinking
- `boundary_setting` - Better at asserting boundaries
- `behavior_change` - Acting differently in similar situations
- `self_awareness` - More aware of their patterns
- `coping_upgrade` - Better coping strategies

**Key Functions:**
```typescript
recordResponse(userId, situation, response, emotion, topic) → void
generateGrowthReflection(userId, context) → GrowthReflection | null
recordReflectionResponse(userId, patternId, response) → void
```

---

### 4. 😄 Inside Jokes & Callbacks
**File:** `inside-jokes.ts`

Tracks shared history for natural callbacks.

**Moment Types:**
- `phrase` - Memorable phrase they used
- `story` - Story they told
- `opinion` - Strong opinion they expressed
- `running_gag` - Something that became a recurring joke
- `quirk` - Something unique about them
- `preference` - Strong preference that's callback-worthy

**Key Functions:**
```typescript
detectCallbackMoment(userId, userMessage, context) → SharedMoment | null
findCallbackOpportunity(userId, currentContext) → CallbackOpportunity | null
recordCallbackUsed(userId, momentId, reception) → void
detectRunningGag(userId, topic) → SharedMoment | null
```

---

### 5. 🏆 Small Wins Celebrator
**File:** `small-wins.ts`

Celebrates effort, not just outcomes.

**Win Types:**
- `followed_through` - Did what they said they'd do
- `courage_moment` - Did something scary
- `self_care` - Took care of themselves
- `boundary_held` - Maintained a boundary
- `hard_conversation` - Had a difficult talk
- `showed_up` - Was present when it was hard
- `tried_new_thing` - Stepped outside comfort zone
- `asked_for_help` - Reached out
- `effort_made` - Tried, regardless of outcome

**Key Functions:**
```typescript
detectSmallWin(userId, userMessage, context) → SmallWin | null
detectIntention(userId, userMessage) → PendingIntention | null
generateCelebration(userId, win?) → CelebrationOpportunity | null
getPendingIntentions(userId) → PendingIntention[]
```

---

### 6. 💭 Thinking of You
**File:** `thinking-of-you.ts`

Proactive outreach with no agenda.

**Moment Types:**
- `genuine_check_in` - Just wondering how they're doing
- `thought_of_you` - Something reminded me of them
- `following_thread` - Continuing something they shared
- `celebrating_quietly` - Something good might have happened
- `holding_space` - Something hard might be happening
- `random_warmth` - Just because

**Key Functions:**
```typescript
detectSignificantShare(userId, userMessage, context) → SignificantShare | null
generateThinkingOfYouMoments(userId) → ThinkingOfYouMoment[]
generateRandomWarmth(userId) → ThinkingOfYouMoment | null
getDueMoments(userId) → ThinkingOfYouMoment[]
```

---

## Support Layers

### 💾 Persistence
**File:** `persistence.ts`

Saves trust profiles to Firestore.

**Firestore Structure:**
```
bogle_users/{userId}/
  └── trust_profiles/
      ├── boundaries
      ├── growth
      ├── inside_jokes
      ├── small_wins
      └── thinking_of_you
```

**Key Functions:**
```typescript
onSessionStart(userId) → Promise<void>    // Load profiles
onSessionEnd(userId) → Promise<void>      // Save profiles
periodicSync(userId) → Promise<void>      // Sync every 5 mins
saveTrustProfiles(userId) → Promise<{saved, failed}>
loadTrustProfiles(userId) → Promise<{loaded, notFound}>
```

---

### 🎤 Voice Emotion Integration
**File:** `voice-emotion-integration.ts`

Enhances detection with voice signals.

**Key Functions:**
```typescript
detectEmotionMismatch(statedText, voiceSignal) → EmotionMismatch | null
enhanceWithVoiceEmotion(userId, message, textContext, voiceSignal) → EnhancedUnsaidSignal[]
updateVoiceBaseline(userId, signal) → void
detectVoiceDeviation(userId, signal) → {deviates, deviation, significance}
```

---

### 📬 Outreach Integration
**File:** `outreach-integration.ts`

Executes proactive outreach.

**Key Functions:**
```typescript
queueThinkingOfYou(userId, moment) → OutreachItem
queueCelebration(userId, celebration) → OutreachItem
queueGrowthReflection(userId, reflection) → OutreachItem
canSendOutreach(userId) → {allowed, reason?}
executeOutreach(item, method) → Promise<OutreachResult>
processUserOutreach(userId) → Promise<{sent, skipped, failed}>
```

---

### 🤝 Team Handoff Context
**File:** `handoff-context.ts`

Passes trust context during persona handoffs.

**Key Functions:**
```typescript
buildHandoffContext(userId, sourcePersona, targetPersona) → HandoffTrustContext
getHandoffWarnings(userId) → string[]
formatHandoffForLLM(context) → string
createHandoffNote(context) → string
```

---

### 📊 Analytics
**File:** `analytics.ts`

Tracks effectiveness and enables A/B testing.

**Key Functions:**
```typescript
trackDetection(userId, system, details) → void
trackSurfaced(userId, system, personaId, details) → void
trackActedOn(userId, system, personaId, details) → void
trackUserResponse(userId, system, response, details) → void
calculateUserMetrics(userId, startDate, endDate) → Partial<TrustMetrics>
createABTest(config) → void
isFeatureEnabled(userId, testId) → boolean
getHealthCheck() → {status, systems, recentEventCount}
```

---

## Integration Points

### Context Builder Integration
The `trust-context.ts` context builder automatically integrates with the voice agent:

```typescript
// In src/intelligence/context-builders/index.ts
import('./trust-context.js'), // "Better than human" trust
```

### Session Lifecycle
Hook into session events:

```typescript
import { onSessionStart, onSessionEnd, periodicSync } from './trust-systems';

// When user connects
await onSessionStart(userId);

// Every 5 minutes during session
await periodicSync(userId);

// When user disconnects
await onSessionEnd(userId);
```

### Handoff Integration
When handing off to another persona:

```typescript
import { buildHandoffContext, formatHandoffForLLM } from './trust-systems';

const context = buildHandoffContext(userId, 'ferni', 'maya');
const llmContext = formatHandoffForLLM(context);
// Inject llmContext into Maya's system prompt
```

---

## Quick Start

### Basic Usage
```typescript
import {
  buildTrustContext,
  checkResponseSafety,
  onSessionStart,
  onSessionEnd,
} from './services/trust-systems';

// At session start
await onSessionStart(userId);

// Every turn
const trustContext = buildTrustContext(userId, userMessage, {
  currentTopic,
  detectedEmotion,
  emotionIntensity,
});

// Before sending AI response
const safety = checkResponseSafety(userId, aiResponse);
if (!safety.safe) {
  console.warn('Response may cross boundaries:', safety.warnings);
}

// At session end
await onSessionEnd(userId);
```

### With Voice Enhancement
```typescript
import { enhanceWithVoiceEmotion } from './services/trust-systems';

const enhanced = enhanceWithVoiceEmotion(
  userId,
  userMessage,
  { detectedEmotion: 'neutral' },
  { emotion: 'sad', confidence: 0.8 }
);

// enhanced signals have higher confidence when voice confirms
```

---

## Testing

### Dev Panel Integration
The trust systems can be tested via the dev panel:
- View active boundaries
- Trigger growth reflections
- Queue test outreach
- View analytics

### A/B Testing
```typescript
import { createABTest, isFeatureEnabled } from './services/trust-systems';

createABTest({
  id: 'celebration-style-v1',
  name: 'Enthusiastic vs Understated Celebrations',
  system: 'small_wins',
  treatmentPercentage: 0.5,
  primaryMetric: 'positive_response_rate',
  startDate: new Date(),
});

// In celebration code
const style = isFeatureEnabled(userId, 'celebration-style-v1')
  ? 'enthusiastic'
  : 'understated';
```

---

## Related Files

**Core:**
- `firestore.rules` - Security rules for trust_profiles collection
- `src/intelligence/context-builders/trust-context.ts` - Context builder
- `src/api/gdpr-routes.ts` - Includes trust profile deletion
- `src/services/security-events.ts` - Security audit trail
- `src/services/privacy-crypto.ts` - PII encryption

**Advanced Features:**
- `src/api/trust-journey-routes.ts` - Journey visualization API (Phase 1)
- `src/api/trust-export-routes.ts` - Data export API (Phase 2)
- `frontend-typescript/src/ui/trust-journey.ui.ts` - Journey UI component (Phase 1)
- `src/services/trust-systems/cross-device-sync.ts` - Real-time sync (Phase 3)
- `src/services/trust-systems/outreach-timing-ml.ts` - ML timing (Phase 4)
- `src/services/trust-systems/persona-specific-learning.ts` - Persona learning (Phase 5)

**Trust Through Play:**
- `src/services/games/` - Music games that build shared memories and learn preferences
- `docs/features/MUSIC-GAMES.md` - Full games documentation
- Games integrate with trust by: creating inside jokes ("Remember your Desert Island picks?"), celebrating small wins (milestones), and learning preferences over time

---

## Advanced Features (Implemented)

### Phase 1: Frontend Visualization
**File:** `frontend-typescript/src/ui/trust-journey.ui.ts`

Beautiful, cinematic visualization of the user's relationship with Ferni:
- Relationship strength ring (0-100 score)
- Stats grid (growth moments, wins celebrated, shared moments)
- Growth patterns visualization
- Timeline of key moments
- Privacy-preserving boundary summary

**API:** `/api/trust-journey`, `/api/trust-journey/summary`, `/api/trust-journey/timeline`

---

### Phase 2: Export for Users
**File:** `src/api/trust-export-routes.ts`

GDPR-compliant data export in multiple formats:
- JSON (full data)
- CSV (timeline data)
- Human-readable text summary

**API:** `/api/trust-export`, `/api/trust-export/csv`, `/api/trust-export/summary`

---

### Phase 3: Cross-Device Sync
**File:** `src/services/trust-systems/cross-device-sync.ts`

Real-time Firestore sync ensures trust travels with the user:
- Real-time listeners for instant sync
- Conflict resolution (last-write-wins with merge)
- Offline support with queued updates
- Session continuity detection
- Network status handling

**Key Functions:**
```typescript
startRealTimeSync(userId, onDataUpdate) → () => void
syncWrite(userId, systemId, data, options) → Promise<void>
detectSessionContinuity(userId) → Promise<SessionContinuity>
getSyncState(userId) → SyncState
```

---

### Phase 4: Machine Learning - Optimal Outreach Timing
**File:** `src/services/trust-systems/outreach-timing-ml.ts`

Thompson Sampling-based ML for learning optimal outreach times:
- Time-bucketed response rate tracking (hourly & daily)
- Beta distribution sampling for exploration/exploitation
- Contextual pattern detection (morning person, weekend active, quick responder)
- Gap optimization (learn optimal intervals between outreach)
- No external ML dependencies - pure TypeScript

**Key Functions:**
```typescript
recordTimingSignal(userId, signal) → void
predictOptimalTiming(userId) → TimingPrediction
shouldReachOutNow(userId, lastOutreachTime) → { should, confidence, reason }
recordOutreachGap(userId, gapHours, wasEngaged) → void
```

**Patterns Detected:**
- Morning person vs night owl
- Weekend vs weekday preference
- Quick vs delayed responder
- Optimal gap between messages

---

### Phase 5: Persona-Specific Learning
**File:** `src/services/trust-systems/persona-specific-learning.ts`

Each persona builds their own relationship with the user:

| Persona | Specialty | Learns About |
|---------|-----------|--------------|
| **Ferni** | Life coaching | Emotions, goals, relationships, growth |
| **Jack** | Wisdom & philosophy | Values, beliefs, meaning, decisions |
| **Peter** | Research & analysis | Interests, learning style, curiosities |
| **Alex** | Communications | Communication style, relationships, conflicts |
| **Maya** | Habits & routines | Routines, productivity, health, sleep |
| **Jordan** | Events & planning | Schedule, commitments, deadlines |
| **Nayan** | Premium synthesis | Everything (receives from all) |

**Transfer Learning:** Personas share relevant insights with each other based on configured relationships.

**Key Functions:**
```typescript
recordPersonaInteraction(userId, personaId, durationMinutes, topics) → void
learnDomainKnowledge(userId, personaId, domain, knowledge) → void
recordPersonaObservation(userId, personaId, type, observation) → PersonaObservation
getSharedInsights(userId, personaId) → ShareableInsight[]
buildPersonaContext(userId, personaId) → string // For LLM injection
```

---

### Phase 6: Frontend Integration
**Integration Point:** Settings menu & keyboard shortcuts

Wires the Trust Journey UI into the actual app:
- "Trust & Growth" menu item in Settings under "Your Journey"
- Keyboard shortcut: `Cmd+Shift+J` (planned)
- `initTrustJourneyUI()` called in app.ts

**Files:**
- `frontend-typescript/src/app.ts` - Import & initialize
- `frontend-typescript/src/ui/settings-menu.ui.ts` - Menu item

---

### Phase 7: Voice Agent Integration
**Integration Point:** Session start/end hooks

Trust context flows into every conversation:
- `loadTrustProfiles(userId)` called at session start
- `saveTrustProfiles(userId)` called at session end
- `trust-context.ts` builder auto-runs every turn

**Files:**
- `src/agents/voice-agent.ts` - Session hooks
- `src/intelligence/context-builders/trust-context.ts` - LLM injection

---

### Phase 8: Proactive Notification Delivery
**File:** `src/services/trust-systems/notification-delivery.ts`

Actually sends "thinking of you" messages:
- **Push notifications** via Firebase Admin SDK
- **Email** via Sendgrid API
- **SMS** via Twilio API
- Channel preference fallback

**Key Functions:**
```typescript
deliverPush(item, pushToken) → Promise<DeliveryResult>
deliverEmail(item, email, userName?) → Promise<DeliveryResult>
deliverSms(item, phone) → Promise<DeliveryResult>
deliverToUser(item, channelConfig) → Promise<DeliveryResult>
```

**API:** `/api/outreach/process`, `/api/outreach/pending`, `/api/outreach/preferences`

---

### Phase 9: User Preferences UI
**File:** `frontend-typescript/src/ui/outreach-preferences.ui.ts`

Let users control their experience:
- Master enable/disable toggle
- Preferred channel selection (push/email/SMS/any)
- Frequency limits (per day, per week)
- Quiet hours (time range)
- Quiet days (day selection)

**API:** `/api/outreach/preferences`

---

### Phase 10: Analytics Dashboard
**File:** `frontend-typescript/src/ui/trust-analytics.ui.ts`

Admin view for monitoring trust system health:
- System health status (healthy/degraded/down)
- Key metrics (users, detection rate, response rate)
- 7-day trend chart
- A/B test results with significance levels
- Feature flag status

**Access:** Admin-only via dev panel

---

### Phase 11: Long-term Memory Consolidation
**File:** `src/services/trust-systems/memory-consolidation.ts`

Prevents unbounded data growth:
- Archives old observations after they become patterns
- Merges similar boundaries into stronger boundaries
- Summarizes growth patterns into milestone markers
- Keeps only the best callback moments (quality over quantity)
- Consolidates small wins into themes

**Key Functions:**
```typescript
consolidateTrustProfiles(userId, profiles, config?) → Promise<ConsolidationResult>
getConsolidatedProfile(userId) → ConsolidatedProfile | null
getThemesForContext(userId) → { boundaries, growth, relationship, wins }
getMilestones(userId, since?) → Milestone[]
searchArchive(userId, query) → ArchivedMemory[]
runScheduledConsolidation(userIds, profileLoader, config?) → Promise<BatchResult>
```

**Consolidation Strategy:**
| Data Type | Archive After | Keep Max | Theme Detection |
|-----------|---------------|----------|-----------------|
| Boundaries | 90 days + 3 occurrences | 20 | Sensitive topics |
| Growth Patterns | 90 days (non-transformative) | 15 | Milestones |
| Shared Moments | Low-impact + old | 30 | Relationship highlights |
| Small Wins | 90 days | 25 | Win type themes |
| Unsaid Signals | After pattern detected | - | Avoidance patterns |

### Phase 12: Relationship Health Score
**File:** `src/services/trust-systems/relationship-health.ts`

Aggregates all trust signals into a single "relationship health" score with trend tracking:

- **Health Factors:** Boundary respect, emotional attunement, growth acknowledgment, callback success, outreach reception, session depth, consistency
- **Weighted Scoring:** Each factor contributes differently (boundary respect = 20%, etc.)
- **Stage Detection:** new → building → established → deep → flourishing
- **Trend Analysis:** Week/month/quarter trends with alerts for declining health
- **Milestone Tracking:** Record achievements like "first callback landed"

```typescript
const health = calculateHealthScore(userId, factorScores);
// { overallScore: 72, stage: 'established', trend: 'improving', alerts: [...] }
```

---

### Phase 13: Intelligent Conversation Starters
**File:** `src/services/trust-systems/conversation-starters.ts`

Generates context-aware, personalized greetings and conversation openers:

- **Starter Types:** Follow-ups, callbacks, celebrations, gentle check-ins, growth acknowledgments, time-sensitive
- **Priority Ranking:** Time-sensitive > follow-ups > celebrations > growth > callbacks > warmth
- **Relationship Stage Awareness:** Callbacks only for established+ relationships
- **SSML Generation:** Emotion-appropriate prosody for voice

```typescript
const { greeting, starter } = generateGreeting({
  userId, lastSession, pendingFollowUps, upcomingEvents, recentWins
});
// "Hey Sarah! Been a bit - I've been thinking about you. How did that interview go?"
```

---

### Phase 14: Life Event Detection
**File:** `src/services/trust-systems/life-events.ts`

Detects and tracks important dates and events mentioned in conversation:

- **Event Types:** Deadlines, appointments, milestones, travel, health, work, personal
- **Date Extraction:** Natural language parsing ("next Tuesday", "in 3 weeks", "March 15th")
- **Sentiment Detection:** Excited, nervous, dreading, hopeful, uncertain
- **Proactive Reminders:** Day-before reminders for high-importance events
- **Follow-up Generation:** "How did that presentation go?"

```typescript
const events = detectLifeEvents(userId, "I have a job interview next Thursday and I'm pretty nervous");
// Detects: date, type='interview', sentiment='nervous', importance='high'
```

---

### Phase 15: Trust-Aware Response Tuning
**File:** `src/services/trust-systems/response-tuning.ts`

Dynamically adjusts AI response style based on relationship depth and context:

- **Tuning Dimensions:** Directness, vulnerability, challenge, humor, depth, warmth
- **Stage-Based Defaults:** New relationships = gentler, flourishing = more direct
- **Emotional Adjustments:** Sad → less challenge, more warmth; Happy → more playful
- **Crisis Mode:** Maximum gentleness, no challenges
- **LLM Integration:** Generates guidance strings for context injection

```typescript
const guidance = generateTuningGuidance({
  relationshipStage: 'established',
  currentEmotion: 'anxious',
  isAskingForAdvice: true
});
// DO: "Use softer language", DON'T: "Challenge or push back"
```

---

### Phase 16: Celebration Momentum Tracker
**File:** `src/services/trust-systems/celebration-momentum.ts`

Tracks patterns of wins and builds positive momentum recognition:

- **Win Types:** Followed through, courage moment, self-care, boundary held, hard conversation, tried new thing, asked for help
- **Streak Tracking:** Daily streaks, type-specific streaks, milestone celebrations (3, 5, 7, 21, 30 days)
- **Theme Detection:** "You're really focusing on boundaries lately"
- **Comeback Detection:** Recognizes return after period of struggle
- **Breakthrough Detection:** Multiple hard wins = transformation moment

```typescript
recordWin(userId, { type: 'courage_moment', description: 'Had that hard conversation', difficulty: 'hard' });
const celebrations = generateCelebrations(userId);
// "Five wins! You're really getting somewhere."
```

---

### Phase 17: Sentiment Timeline
**File:** `src/services/trust-systems/sentiment-timeline.ts`

Tracks emotional journey over time with visualization data:

- **Emotional Snapshots:** Primary emotion, intensity, valence (-1 to +1), arousal (0 to 1)
- **Daily Summaries:** Average mood, dominant emotion, distribution
- **Peak/Valley Detection:** Identify significant emotional highs and lows
- **Trend Analysis:** Week/month/quarter trends with volatility
- **Pattern Detection:** Day-of-week patterns, trigger patterns, growth patterns
- **Exportable:** For sharing with therapist or coach

```typescript
recordEmotionalSnapshot(userId, { primaryEmotion: 'joy', intensity: 0.8, source: 'detected' });
const summary = generateTimelineSummary(userId);
// "Current: joy • week: improving • Pattern: Mondays tend to be harder"
```

---

### Phase 24: Voice Prosody Learning
**File:** `src/services/trust-systems/voice-prosody-learning.ts`

Learns user's unique voice patterns over time for personalized emotion detection:

- **Personal Baselines:** Pitch, energy, speaking rate, pause patterns, tension, clarity
- **Emotional Profiles:** How THIS user sounds when feeling different emotions
- **Deviation Detection:** "You sound different today" with confidence
- **Voice Evolution:** Track changes over weeks/months
- **Familiarity Score:** How well we know this voice (stranger → well_known)

```typescript
recordVoiceSample(userId, characteristics, { detectedEmotion: 'anxious' });
const deviation = analyzeDeviation(userId, currentCharacteristics);
// { deviates: true, magnitude: 0.7, possibleMeaning: "Voice sounds more tense than usual" }
```

---

### Phase 25: Journaling Prompts
**File:** `src/services/trust-systems/journaling-prompts.ts`

Generates personalized journaling prompts based on context and growth areas:

- **Categories:** Reflection, exploration, gratitude, challenge, integration, growth, healing
- **Contextual Prompts:** Based on current struggles, wins, upcoming events
- **Situational Prompts:** Morning routine, evening wind-down, post-session
- **Difficulty Levels:** Gentle, moderate, deep (adapts to relationship stage)
- **Voice Delivery:** SSML formatting for spoken prompts

```typescript
const prompts = generatePrompts({ currentEmotion: 'anxious', growthAreas: ['boundaries'] });
// "What would it feel like to trust that things will work out?"
```

---

### Phase 26: Seasonal Awareness
**File:** `src/services/trust-systems/seasonal-awareness.ts`

Anticipates seasonal patterns in user's emotional wellbeing:

- **Season Patterns:** Track mood/energy across spring/summer/fall/winter
- **Holiday Preferences:** Remember sentiment about holidays (positive/negative/mixed)
- **Personal Dates:** Anniversaries, milestones, difficult dates with approach guidance
- **SAD Detection:** Correlate mood with daylight hours
- **Proactive Warnings:** "Entering winter - historically harder for you"

```typescript
addPersonalDate(userId, { date: { month: 3, day: 15 }, name: "Dad's anniversary", type: 'difficult', approach: 'gentle' });
const context = buildSeasonalContext(userId);
// "Dad's anniversary is in 5 days - approach gently"
```

---

### Phase 27: Learning Style Adaptation
**File:** `src/services/trust-systems/learning-style.ts`

Adapts advice delivery to individual learning and processing styles:

- **Processing:** Analytical vs intuitive vs balanced
- **Pacing:** Fast, moderate, slow, adaptive
- **Structure:** Detailed (step-by-step) vs big-picture
- **Examples:** Concrete, abstract, metaphorical, mixed
- **Validation:** Direct, exploratory, supportive

```typescript
recordLearningSignals(userId, "Can you walk me through that step by step?");
const guidance = generateDeliveryGuidance(userId);
// { format: { useSteps: true }, pacing: "moderate", suggestions: ["Number your suggestions"] }
```

---

### Phase 28: Relationship Insights Report
**File:** `src/services/trust-systems/relationship-insights.ts`

Generates periodic "State of Us" reports summarizing the relationship:

- **Report Periods:** Weekly, monthly, quarterly, yearly
- **Conversation Insights:** Sessions, duration, patterns, most active times
- **Growth Insights:** Areas of progress, breakthroughs, shifts noticed
- **Wins Insights:** Total wins, streaks, categories, celebration moments
- **Shareable Formats:** User-friendly text and therapist-friendly summary

```typescript
const report = generateReport(userId, 'month');
// { summary: { headline: "This Month: Real Growth", emoji: "🌱", overallMood: "growing" } }
```

---

### Phase 29: Contextual Media Suggestions
**File:** `src/services/trust-systems/media-suggestions.ts`

Recommends music, podcasts, and guided experiences based on mood:

- **Media Types:** Music, podcast, meditation, breathwork, ambient, audiobook
- **Mood Intents:** Match (meet them where they are), shift, energize, calm, comfort, focus
- **Personalization:** Track what's worked before, respect preferences
- **Integration Ready:** Spotify URI, Apple Music ID, YouTube ID fields
- **Voice Delivery:** SSML formatted suggestions

```typescript
const suggestion = getBestSuggestion(userId, { currentMood: 'anxious', moodIntensity: 0.7 });
// { title: "4-7-8 Breathing", type: "breathwork", reason: "This breathing pattern activates your parasympathetic nervous system" }
```

---

## File Structure (Complete)

```
src/services/trust-systems/
├── index.ts                       # Main exports & unified API
├── reading-between-lines.ts       # Detect what's NOT being said
├── boundary-memory.ts             # Track what NOT to bring up
├── growth-reflection.ts           # Notice & reflect evolution
├── inside-jokes.ts                # Shared history & callbacks
├── small-wins.ts                  # Celebrate effort, not just outcomes
├── thinking-of-you.ts             # Proactive no-agenda outreach
├── persistence.ts                 # Firestore save/load
├── voice-emotion-integration.ts   # Enhance with voice signals
├── outreach-integration.ts        # Execute proactive outreach
├── handoff-context.ts             # Pass context during persona handoffs
├── analytics.ts                   # Track effectiveness & A/B testing
├── cross-device-sync.ts           # Phase 3: Real-time Firestore sync
├── outreach-timing-ml.ts          # Phase 4: ML for optimal timing
├── persona-specific-learning.ts   # Phase 5: Per-persona relationships
├── notification-delivery.ts       # Phase 8: Push/email/SMS delivery
├── memory-consolidation.ts        # Phase 11: Long-term memory management
├── relationship-health.ts         # Phase 12: Relationship health score
├── conversation-starters.ts       # Phase 13: Context-aware openers
├── life-events.ts                 # Phase 14: Life event tracking
├── response-tuning.ts             # Phase 15: Dynamic response style
├── celebration-momentum.ts        # Phase 16: Win streaks & momentum
├── sentiment-timeline.ts          # Phase 17: Emotional journey
├── voice-prosody-learning.ts      # Phase 24: Personalized voice patterns
├── journaling-prompts.ts          # Phase 25: Context-aware prompts
├── seasonal-awareness.ts          # Phase 26: Seasonal pattern tracking
├── learning-style.ts              # Phase 27: Advice delivery adaptation
├── relationship-insights.ts       # Phase 28: Monthly insights reports
└── media-suggestions.ts           # Phase 29: Mood-based media recommendations

src/api/
├── trust-journey-routes.ts        # Phase 1: Journey visualization API
├── trust-export-routes.ts         # Phase 2: Data export API
├── outreach-routes.ts             # Phase 8: Outreach management API
└── utils.ts                       # Shared API utilities

frontend-typescript/src/ui/
├── trust-journey.ui.ts            # Phase 1: Journey visualization UI
├── outreach-preferences.ui.ts     # Phase 9: User preferences UI
└── trust-analytics.ui.ts          # Phase 10: Admin analytics UI

src/intelligence/context-builders/
└── trust-context.ts               # Inject trust into LLM context
```

---

## Philosophy

> "We believe in making AI human, and the decisions we make will reflect that."

These systems embody Ferni's core mission:
- **Safety First** - Boundaries are never crossed
- **Genuine Understanding** - Notice what's unsaid
- **Celebrating Growth** - Reflect evolution before they see it
- **Shared History** - Inside jokes create intimacy
- **Witnessing Effort** - Every small courage matters
- **Proactive Care** - Reach out just because

This is what makes Ferni feel like a friend who genuinely knows you.

