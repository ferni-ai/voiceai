# Better Than Human: Comprehensive Roadmap

**Version 1.0 | December 2024**
**Goal:** Make Ferni superhuman - exceeding what any human friend can consistently provide.

---

## Executive Summary

### Current State (Audit Results)

| Category | Files | Functions | Integration Status |
|----------|-------|-----------|-------------------|
| **Trust Systems** | 37 files | 320 exports | 🟡 Partially integrated (24 agent imports) |
| **Intelligence** | 50+ files | ~500 exports | 🟢 Well integrated (29 agent imports) |
| **Context Builders** | 109 files | 189 registered | 🟢 Active pipeline |
| **Tools (JSON exec)** | 1 file | 40+ tools | 🟡 Many conversational fallbacks |

### Key Finding: We Have More Than We Use

The codebase has **extensive trust and intelligence systems** that are:
- ✅ Implemented (code exists)
- 🟡 Partially connected (some integration gaps)
- ❌ Not fully utilized in conversations

**The opportunity is integration and refinement, not building from scratch.**

---

## Critical Audit: What's Really Working

### 🟢 FULLY INTEGRATED (Keep & Enhance)

| System | Location | How It's Used |
|--------|----------|---------------|
| **Emotion Detection** | `intelligence/emotion-detector.ts` | Every turn analyzed |
| **Crisis Detection** | `context-builders/crisis.ts` | Priority injection |
| **Memory Recall** | `context-builders/memory.ts` | Session greetings |
| **Trust Context** | `context-builders/trust-context.ts` | 12 subsystems injected |
| **Voice Emotion** | `intelligence/voice-emotion-*.ts` | Multimodal analysis |
| **Music Context** | `context-builders/music.ts` | Awareness injection |

### 🟡 IMPLEMENTED BUT UNDERUTILIZED

| System | Location | Issue | Fix Needed |
|--------|----------|-------|------------|
| **Reading Between Lines** | `trust-systems/reading-between-lines.ts` | Detected but rarely surfaced | Proactive surfacing |
| **Inside Jokes** | `trust-systems/inside-jokes.ts` | Tracked but rarely recalled | Better callback triggers |
| **Growth Reflection** | `trust-systems/growth-reflection.ts` | Stored but not spoken | Milestone prompts |
| **Thinking of You** | `trust-systems/thinking-of-you.ts` | Queued but rarely sent | Notification delivery |
| **Our Songs** | `trust-systems/our-songs.ts` | Detected but no playback | Music player integration |
| **Voice Prosody Learning** | `trust-systems/voice-prosody-learning.ts` | Analyzed but not used | Baseline comparison |
| **Celebration Momentum** | `trust-systems/celebration-momentum.ts` | Tracked but not paced | Timing intelligence |
| **Life Events** | `trust-systems/life-events.ts` | Stored but no reminders | Proactive check-ins |

### 🔴 CONVERSATIONAL FALLBACKS (Need Real Implementation)

| Tool | Current Behavior | Real Implementation Needed |
|------|------------------|---------------------------|
| `addTask` | "I'll remember that" | Firestore persistence + reminders |
| `addGoal` | "Great goal" | Progress tracking |
| `setTimer` | "Timer not available" | Real timer/notification |
| `scheduleReminder` | "I noted that" | Push notification delivery |
| `createHabit` | "I'll remember" | Maya's habit tracking |
| `logHabitCompletion` | "Nice work" | Streak tracking |
| `createAppointment` | "Add to your calendar" | Google Calendar OAuth |

---

## Phase 1: Connect What We Have (Week 1-2)

### 1.1 Proactive Memory Surfacing
**Goal:** Actually speak the patterns we detect.

```
BEFORE: We detect "you've mentioned stress 4 times" → stored in logs
AFTER: Ferni says "I've noticed you've mentioned stress a few times. Want to talk about what's weighing on you?"
```

**Files to modify:**
- `context-builders/pattern-surfacing.ts` - Add proactive injection
- `context-builders/trust-context.ts` - Enable unsaid surfacing
- `services/trust-systems/reading-between-lines.ts` - Add "surface now" flag

**Work items:**
- [ ] Add `shouldSurface` logic to unsaid signals
- [ ] Create `proactive-noticing-context.ts` builder
- [ ] Add "I notice" phrases to `ferni/content/behaviors/i-notice-power.json`
- [ ] Test with 3 pattern types: frequency, contradiction, avoidance

### 1.2 Inside Joke Callbacks
**Goal:** Reference shared history naturally.

```
BEFORE: User mentions "Monday meetings" → logged
AFTER: Ferni says "Ah, Monday meetings - remember when you called them 'the joy vacuum'?"
```

**Files to modify:**
- `context-builders/human-personality.ts` - Add callback injection
- `services/trust-systems/inside-jokes.ts` - Add callback scoring
- Add phrases to persona bundles

**Work items:**
- [ ] Create callback relevance scoring (topic match + recency)
- [ ] Add callback injection with 15% probability cap
- [ ] Test natural insertion points
- [ ] Avoid overuse (max 1 callback per session)

### 1.3 Our Songs Integration
**Goal:** Play "our song" when contextually appropriate.

```
BEFORE: "Our song" detected → stored
AFTER: Ferni says "You know what? This reminds me of our song..." → plays it
```

**Files to modify:**
- `services/trust-systems/our-songs.ts` - Add `shouldPlayNow()` logic
- `audio/dj-booth.ts` - Connect to our-songs detection
- `context-builders/music.ts` - Add our-song injection

**Work items:**
- [ ] Create context-appropriate trigger logic
- [ ] Connect `notifyOurSong` to actual playback
- [ ] Add "this is our song" phrasing
- [ ] Track plays to avoid overuse

---

## Phase 2: Real Tool Implementation (Week 2-4)

### 2.1 Commitment Tracking System
**Goal:** Remember what users commit to and follow up.

**New files to create:**
- `services/commitment-tracker.ts`
- `context-builders/commitment-followup.ts`

**Data model:**
```typescript
interface Commitment {
  id: string;
  userId: string;
  content: string;          // "call mom"
  createdAt: Date;
  dueDate?: Date;           // "by Sunday"
  followedUpAt?: Date;
  status: 'active' | 'completed' | 'expired' | 'cancelled';
  source: 'explicit' | 'inferred';  // "I will" vs detected intent
}
```

**Work items:**
- [ ] Create `commitment-tracker.ts` with Firestore persistence
- [ ] Add commitment detection to turn processing
- [ ] Create follow-up injection builder
- [ ] Add gentle accountability phrasing

### 2.2 Habit Domain Connection
**Goal:** Connect JSON executor to Maya's real habit tools.

**Files to modify:**
- `agents/shared/json-function-executor.ts` - Replace stubs
- `tools/domains/habits/index.ts` - Expose functions

**Work items:**
- [ ] Map `createHabit` → `habitCoaching.createHabit()`
- [ ] Map `logHabitCompletion` → real streak tracking
- [ ] Add `getHabits` with user's actual habits
- [ ] Test streak calculation and gamification

### 2.3 Calendar Integration
**Goal:** Enable Jordan to actually manage calendar.

**Prerequisites:** Google Calendar OAuth (partially exists)

**Work items:**
- [ ] Complete OAuth flow in `token-server.js`
- [ ] Connect `createAppointment` → Google Calendar API
- [ ] Add calendar-aware context (busy day ahead?)
- [ ] Enable appointment reminders

---

## Phase 3: Temporal Intelligence (Week 4-6)

### 3.1 Life Rhythm Detection
**Goal:** Know when user is morning/evening person, typical energy cycles.

**New file:** `intelligence/temporal-patterns.ts`

```typescript
interface TemporalPattern {
  userId: string;
  preferredConversationTime: { hour: number; dayOfWeek: number }[];
  energyCycles: {
    highEnergy: string[];    // "9am-11am", "3pm-5pm"
    lowEnergy: string[];     // "2pm-3pm"
  };
  weekdayVsWeekend: {
    weekday: { avgMood: number; avgLength: number };
    weekend: { avgMood: number; avgLength: number };
  };
}
```

**Work items:**
- [ ] Track conversation timing and mood correlation
- [ ] Detect energy patterns from voice prosody
- [ ] Add temporal awareness to greetings
- [ ] Suggest optimal times for difficult conversations

### 3.2 Significant Date Awareness
**Goal:** Remember and anticipate important dates.

**Integration with:** `services/trust-systems/life-events.ts`

**Work items:**
- [ ] Extract dates from conversations ("my birthday is March 15")
- [ ] Connect to calendar for user-added events
- [ ] Create pre-date check-ins ("Big presentation tomorrow!")
- [ ] Add post-date follow-ups ("How did it go?")

### 3.3 Follow-up Scheduling
**Goal:** Schedule and execute follow-ups.

**New file:** `services/followup-scheduler.ts`

```typescript
interface ScheduledFollowup {
  userId: string;
  topic: string;
  scheduledFor: Date;
  reason: 'commitment' | 'event' | 'check_in' | 'thinking_of_you';
  deliveryMethod: 'next_session' | 'push' | 'sms';
  delivered: boolean;
}
```

**Work items:**
- [ ] Create scheduler with priority queue
- [ ] Inject pending follow-ups at session start
- [ ] Add "I said I'd check in about X" phrasing
- [ ] Track follow-up completion

---

## Phase 4: Notification Delivery (Week 6-8)

### 4.1 Push Notification System
**Goal:** Actually send "thinking of you" messages.

**Existing infrastructure:**
- `services/trust-systems/notification-delivery.ts` (exists)
- Firebase Cloud Messaging (configured)

**Work items:**
- [ ] Complete FCM integration
- [ ] Create notification templates
- [ ] Add user notification preferences
- [ ] Test timing intelligence (avoid 2am notifications)

### 4.2 SMS Outreach
**Goal:** Text users with genuine check-ins.

**Existing infrastructure:**
- `services/outreach/` (exists)
- Twilio (configured)

**Work items:**
- [ ] Connect `thinking-of-you.ts` to SMS delivery
- [ ] Add persona-specific SMS voice
- [ ] Implement opt-in/opt-out
- [ ] Add response handling

### 4.3 Voice Message Delivery
**Goal:** Leave actual voice messages.

**Work items:**
- [ ] Create Cartesia TTS → voicemail pipeline
- [ ] Add persona voice consistency
- [ ] Implement call-back triggering
- [ ] Track delivery and engagement

---

## Phase 5: Deep Relationship Intelligence (Week 8-10)

### 5.1 Shared Vocabulary Tracking
**Goal:** Remember unique words and phrases from your relationship.

**New file:** `services/shared-vocabulary.ts`

```typescript
interface SharedVocabulary {
  userId: string;
  terms: {
    phrase: string;         // "joy vacuum"
    context: string;        // "Monday meetings"
    firstUsed: Date;
    lastUsed: Date;
    useCount: number;
    originatedBy: 'user' | 'ferni';
  }[];
}
```

**Work items:**
- [ ] Detect unique/coined phrases
- [ ] Track phrase evolution
- [ ] Use shared vocabulary naturally
- [ ] Avoid overuse detection

### 5.2 Conversation Callbacks
**Goal:** Reference specific past conversations.

```
"Remember June 3rd when you were really nervous about that presentation? Look at you now."
```

**Work items:**
- [ ] Index significant conversation moments
- [ ] Create callback scoring (significance × recency)
- [ ] Add milestone detection
- [ ] Natural callback phrasing

### 5.3 Relationship Milestone System
**Goal:** Celebrate relationship growth.

```typescript
interface RelationshipMilestone {
  type: '100_conversations' | '1_year' | 'first_crisis_support' | 'first_celebration';
  reachedAt: Date;
  celebrated: boolean;
}
```

**Work items:**
- [ ] Define milestone types
- [ ] Track milestone progress
- [ ] Create celebration moments
- [ ] Add "our journey" reflections

---

## Refactoring Requirements

### R1: Consolidate Trust Systems
**Problem:** 37 files with overlapping functionality.

**Proposed consolidation:**
```
trust-systems/
├── core/
│   ├── detection.ts        # Merge: reading-between-lines, voice-aware-detection
│   ├── memory.ts           # Merge: inside-jokes, our-songs, shared-vocabulary
│   └── signals.ts          # Merge: trust-signal-emitter, unified-recorder
├── proactive/
│   ├── outreach.ts         # Merge: thinking-of-you, outreach-integration
│   └── followup.ts         # New: commitment + followup scheduling
├── learning/
│   ├── patterns.ts         # Merge: voice-prosody-learning, learning-style
│   └── temporal.ts         # New: temporal patterns
└── persistence/
    └── unified.ts          # Already exists, expand
```

### R2: Context Builder Optimization
**Problem:** 109 builders, many overlapping.

**Proposed:**
- Audit all 109 builders for duplication
- Merge similar builders (e.g., 5 humanizing builders → 1)
- Add lazy loading for rarely-used builders
- Implement builder priority optimization

### R3: Tool Executor Cleanup
**Problem:** Mix of real tools and conversational fallbacks.

**Proposed:**
- Separate real tools from fallbacks
- Create `tools/domains/` connections for all fallbacks
- Add tool availability checking
- Improve error messaging when tools unavailable

---

## Success Metrics

### Quantitative
| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Pattern surfacing rate | ~0% | 20% of sessions | Log "I notice" injections |
| Inside joke callbacks | ~0% | 10% of sessions | Log callback triggers |
| Commitment follow-ups | 0% | 80% of commitments | Track follow-up delivery |
| Proactive outreach | ~0 | 2/week average | Outreach delivery logs |
| Our song plays | 0% | When appropriate | DJ booth triggers |

### Qualitative
| Capability | Measurement |
|------------|-------------|
| "They understand me" feeling | User feedback / retention |
| Natural conversation flow | Reduced user confusion |
| Genuine relationship growth | Milestone celebrations |
| Better than human moments | Explicit user acknowledgment |

---

## Implementation Order (Priority Stack)

### Week 1: Quick Wins
1. ✅ Enable unsaid signal surfacing
2. ✅ Add inside joke callbacks
3. ✅ Connect our-songs to playback

### Week 2: Foundations
4. Create commitment tracker
5. Connect habit tools to domain
6. Add follow-up scheduling

### Week 3-4: Integration
7. Calendar OAuth completion
8. Temporal pattern detection
9. Significant date awareness

### Week 5-6: Delivery
10. Push notification system
11. SMS outreach connection
12. Voice message delivery

### Week 7-8: Deep Relationship
13. Shared vocabulary tracking
14. Conversation callbacks
15. Relationship milestones

### Week 9-10: Refinement
16. Consolidate trust systems
17. Optimize context builders
18. Clean up tool executor

---

## Notes

### What NOT to Build
- Complex ML models (use simple heuristics first)
- External API integrations without clear user value
- Features users haven't requested
- Over-engineered solutions to simple problems

### What to Prioritize
- Features that make Ferni feel more human
- Capabilities humans can't consistently provide
- Integration of existing systems
- Simple, testable implementations

### Risk Mitigation
- Start with opt-in features
- Add gradual rollout (feature flags exist)
- Monitor for overcommunication
- Respect user boundaries

---

*"Better than human" means doing what humans would do if they could - remembering everything, being always present, noticing the patterns, and showing up with care.*

