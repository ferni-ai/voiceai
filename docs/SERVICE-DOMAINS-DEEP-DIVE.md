# Ferni AI Service Domains Deep Dive
## Complete E2E Capability Reference

---

## Table of Contents

1. [Voice Agent Domain](#1-voice-agent-domain)
2. [Intelligence Domain](#2-intelligence-domain)
3. [Persona Domain](#3-persona-domain)
4. [Tool Domain](#4-tool-domain)
5. [Memory Domain](#5-memory-domain)
6. [Trust Systems Domain](#6-trust-systems-domain)
7. [Engagement Domain](#7-engagement-domain)
8. [Monetization Domain](#8-monetization-domain)

---

## 1. Voice Agent Domain

### Purpose
Real-time voice conversation orchestration using LiveKit infrastructure.

### Key Components

| Component | File | Responsibility |
|-----------|------|----------------|
| VoiceAgent | `src/agents/voice-agent.ts` | Main agent orchestrator (3,200 LOC) |
| TurnProcessor | `src/agents/processors/turn-processor.ts` | 12-step turn analysis (1,220 LOC) |
| FrontendPublisher | `src/agents/realtime/frontend-publisher.ts` | Real-time UI sync |
| Startup | `src/startup.ts` | System initialization sequence |

### Capabilities

**Audio Pipeline:**
- Speech-to-Text (STT) with prosody analysis
- Turn completion detection
- LLM generation with context injection
- Text-to-Speech (TTS) with adaptive SSML
- Interruption handling (300ms threshold)

**Session Management:**
- Per-session service creation
- User identification (metadata + heuristics)
- Conversation state tracking
- Graceful shutdown handling

**Real-Time Features:**
- Emotion broadcasting to frontend
- Handoff event coordination
- Music state synchronization
- Connection quality monitoring

### Data Flow

```
Audio Input → VAD (Voice Activity Detection)
    ↓
STT Processing (parallel: prosody analysis)
    ↓
Turn Completion Trigger
    ↓
12-Step Turn Analysis:
├─ 1. Message Analysis (emotion, intent, topics)
├─ 2. State Update (turn count, emotional context)
├─ 3. Easter Egg Detection
├─ 4. Emotional State Computation
├─ 5. Response Guidance (length, humor, stories)
├─ 6. Identity Reinforcement (post-handoff)
├─ 7. Humanizing Context (mood, relationship)
├─ 8. Bundle Runtime Processing
├─ 9. Context Injection Assembly (14 categories)
├─ 10. LLM Generation
├─ 11. Humanization Post-Processing
└─ 12. SSML Tagging
    ↓
TTS Output → Audio Playback
```

### Performance Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| First Response | <2s | 1.45s |
| Turn Processing | <500ms | 400ms |
| Interruption Detection | <500ms | 300ms |
| Handoff Transition | <500ms | 350ms |

---

## 2. Intelligence Domain

### Purpose
Contextual understanding, learning, and response enhancement.

### Key Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Context Builders | `src/intelligence/context-builders/` | 60+ modular perception modules |
| User Learning Engine | `src/intelligence/user-learning-engine.ts` | Per-user preference learning |
| Community Insights | `src/intelligence/community-insights.ts` | Cross-user pattern aggregation |
| Agent Evolution | `src/intelligence/agent-evolution.ts` | Persona self-improvement |

### Context Builder Categories

**Safety Layer (Priority 0-20):**
- `crisis.ts` - Panic/emergency detection
- `role-boundaries.ts` - AI limitations enforcement

**Emotional Intelligence (Priority 20-40):**
- `emotional.ts` - Text + voice emotion merging
- `voice-emotion.ts` - Prosody analysis
- `intent.ts` - User intent classification

**Memory & Continuity (Priority 40-50):**
- `memory.ts` - Session callbacks
- `advanced-memory.ts` - Semantic retrieval with temporal decay
- `cross-session-threading.ts` - Multi-conversation weaving

**Relationship (Priority 50-60):**
- `engagement.ts` - Curiosity injection
- `celebration.ts` - Milestone acknowledgment
- `team-dynamics.ts` - Cross-persona awareness

**Personalization (Priority 60-70):**
- `cognitive.ts` - Persona-specific reasoning
- `humor-calibration.ts` - Humor receptivity learning
- `story-preference.ts` - Narrative appetite detection

### Learning Mechanisms

**Per-User Learning:**
```
Input: User messages + responses
    ↓
Pattern Detection:
├─ Key moments (15+ regex patterns)
├─ Emotional patterns (timestamp, emotion, intensity)
├─ Small details (names, places, amounts)
└─ Preference inference (every 5 turns)
    ↓
Profile Update:
├─ keyMoments (max 50)
├─ emotionalPatterns (max 50)
├─ preferences (confidence > 0.6)
├─ financialAnxietyTriggers
└─ sharedStories
```

**Community Learning:**
```
Signal Types:
├─ Response strategy effectiveness
├─ Story resonance by context
├─ Breakthrough questions
└─ Journey patterns

Aggregation:
├─ Every 100 signals → pattern recomputation
├─ Context grouping (emotion × topic × stage × persona)
├─ Minimum 10 signals for pattern confidence
└─ Privacy: Complete anonymization (no PII)
```

**Agent Evolution:**
```
Improvement Mechanisms:
├─ Community pattern adjustments
├─ A/B testing experiments
└─ Emergent pattern detection

Evolution Cycle (Daily):
├─ Import best strategies
├─ Create new adjustments
├─ Update story rankings
├─ Update effective phrases
└─ Log metrics
```

---

## 3. Persona Domain

### Purpose
Distinct AI personalities with unique cognitive styles and specializations.

### Key Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Persona Bundles | `src/personas/bundles/` | 6 complete personas |
| Cognitive Profiles | `src/personas/cognitive-profiles.ts` | Thinking patterns |
| Meaningful Silence | `src/personas/meaningful-silence.ts` | Pause handling |
| Greetings | `src/personas/greetings.ts` | Dynamic greeting generation |

### Persona Bundle Structure

```
bundles/{persona-id}/
├─ persona.manifest.json     # Single source of truth
├─ identity/
│  ├─ biography.md          # Background story
│  └─ system-prompt.md      # Core personality
└─ content/
   ├─ behaviors/            # JSON: greetings, micro-moments
   ├─ stories/              # Personal anecdotes
   ├─ knowledge/            # Domain expertise
   └─ voice/                # Speech characteristics
```

### The 6 Personas

| Persona | Cognitive Style | Voice | Specialization |
|---------|-----------------|-------|----------------|
| **Ferni** | Narrative/Empathetic | Warm, measured | Life coaching, coordination |
| **Peter John** | Analytical/Pattern | Fast, energetic | Stock analysis, markets |
| **Alex Chen** | Systematic/Pragmatic | Clear, professional | Communication, email |
| **Maya Santos** | Empathetic/Pragmatic | Warm, encouraging | Habits, budgeting |
| **Jordan Taylor** | Pragmatic/Systematic | Upbeat, enthusiastic | Life planning, events |
| **Nayan Patel** | Intuitive/Narrative | Gentle, contemplative | Wisdom, meaning |

### Cognitive Profile Attributes

```typescript
interface CognitiveProfile {
  reasoningStyle: 'narrative' | 'analytical' | 'empathetic' | 'pragmatic' | 'intuitive';
  attentionFocus: string[];      // ["meaning", "emotions", "possibilities"]
  blindSpots: string[];          // ["details", "systems", "risks"]
  curiosityTriggers: string[];   // ["purpose", "why", "dream"]
  primaryBias: string;           // "optimism_bias"
  metacognition: {
    reflectionFrequency: number; // 0-1
    uncertaintyThreshold: number;
  };
}
```

### Humanization Features

| Feature | Description |
|---------|-------------|
| Disfluencies | "Um, well..." natural pauses |
| Vocabulary Mirroring | Echo user's word choices |
| Mood Drift | Energy changes over conversation |
| Mind Changing | "Actually, wait—that changes things..." |
| Running Jokes | Pattern recognition callbacks |
| Physical Presence | "I can hear that in your voice" |

---

## 4. Tool Domain

### Purpose
40 specialized domains with 250+ tools covering all life areas.

### Key Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Tool Registry | `src/tools/registry/` | Central registration |
| Tool Builder | `src/tools/builder.ts` | Per-agent tool compilation |
| Dynamic Loader | `src/tools/dynamic-loader.ts` | Topic-based loading |
| Domains | `src/tools/domains/` | 40 domain directories |

### Domain Categories

**Core Operational (4):**
- memory, handoff, calendar, telephony

**Life Productivity (8):**
- productivity, finance, habits, entertainment
- information, communication, research, awareness

**Life Coaching (15):**
- crisis, health, career, decisions, family
- home, learning, creativity, community, legal-admin
- relationships, meaning, grief, stories, vulnerability

**Deep Engagement (10):**
- curiosity, dreams, self-compassion, play, presence

### Tool Architecture

```typescript
interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  domain: ToolDomain;           // One of 40 domains
  tags: string[];
  requiredServices?: string[];  // ['plaid', 'stripe']
  create: (ctx: ToolContext) => Tool;
}

interface ToolContext {
  agentId: string;
  userId: string;
  services: ServiceRegistry;
  userData: {
    profile: UserProfile;
    preferences: UserPreferences;
    mood?: EmotionalContext;
  };
}
```

### Behavioral Science Tools

**Habit Coaching Framework:**
| Framework | Implementation |
|-----------|---------------|
| Tiny Habits | 5-level glidepath (2min → full) |
| Atomic Habits | Habit stacking |
| Power of Habit | Cue-routine-reward |
| Four Tendencies | Personality-based strategies |

**Gamification System:**
- 30+ badge types
- 10-level title progression
- 15+ 30-day challenges
- Streak tracking with milestones

---

## 5. Memory Domain

### Purpose
Persistent, semantically-aware memory that makes users feel genuinely known.

### Key Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Memory System | `src/memory/index.ts` | Unified facade |
| Firestore Store | `src/memory/firestore-store.ts` | Production storage |
| Vector Store | `src/memory/vector-store.ts` | Semantic embeddings |
| Advanced Retrieval | `src/memory/advanced-retrieval.ts` | 4D scoring |
| Summarizer | `src/memory/summarizer.ts` | Conversation summarization |

### Storage Tiers

```
Development: InMemoryStore
Production:  FirestoreStore + VectorStore + RedisCache
Self-Hosted: PostgresStore
```

### User Profile Schema

```typescript
interface UserProfile {
  // Structural Memories
  conversationSummaries: ConversationSummary[];
  keyMoments: KeyMoment[];
  financialContext: FinancialContext;
  familyMembers: FamilyMember[];

  // Behavioral Memories
  communicationStyle: 'formal' | 'casual' | 'playful';
  speakingPace: 'slow' | 'moderate' | 'fast';
  emotionalPatterns: EmotionalPattern[];
  voiceSketch: VoiceCharacteristics;

  // Preferences
  preferredTopics: string[];
  humorReceptivity: number;
  storyAppetite: 'loves_stories' | 'prefers_facts';
}
```

### 4D Retrieval Algorithm

```
Score = (0.4 × Semantic) + (0.2 × Temporal) + (0.25 × Emotional) + (0.15 × Contextual)

Semantic (40%):
├─ Embedding cosine similarity
└─ Keyword matching fallback

Temporal (20%):
├─ Exponential decay: score = 0.5^(days/30)
└─ Emotional memories: 3x slower decay

Emotional (25%):
├─ Breakthrough: 0.9
├─ Shared vulnerability: 0.95
└─ Milestone: 0.85

Contextual (15%):
├─ Topic overlap
├─ Persona relevance
└─ Person mentions

Boosts:
├─ Commitments: 1.5x
├─ Person mentions: 1.3x
└─ Recent topics: 1.2x
```

---

## 6. Trust Systems Domain

### Purpose
Build genuine relationships through behavioral understanding.

### Key Components

| Component | Location | Lines |
|-----------|----------|-------|
| Reading Between Lines | `trust-systems/reading-between-lines.ts` | 630 |
| Boundary Memory | `trust-systems/boundary-memory.ts` | 600+ |
| Growth Reflection | `trust-systems/growth-reflection.ts` | 600+ |
| Inside Jokes | `trust-systems/inside-jokes.ts` | 600+ |
| Small Wins | `trust-systems/small-wins.ts` | 714 |
| Thinking of You | `trust-systems/thinking-of-you.ts` | 675 |
| Relationship Health | `trust-systems/relationship-health.ts` | 721 |

### The 6 Trust Systems

**1. Reading Between Lines**
```typescript
type UnsaidSignal =
  | 'emotional_mismatch'    // "I'm fine" + heavy topic
  | 'topic_avoidance'       // Steering away from subject
  | 'permission_seeking'    // "Can I tell you something?"
  | 'minimizing_pain';      // Downplaying significance

interface Detection {
  observation: string;
  underlying: string;
  confidence: number;
  approach: 'create_space' | 'gentle_probe' | 'wait';
}
```

**2. Boundary Memory**
```typescript
interface Boundary {
  topic: string;
  severity: 'soft' | 'hard';
  context: string;
  probing_depth: number;
}
```

**3. Growth Reflection**
```typescript
interface GrowthPattern {
  topic: string;
  initialState: string;    // "Anxious about speaking up"
  currentState: string;    // "Confidently advocated"
  emotionalProgression: string[];
}
```

**4. Inside Jokes**
```typescript
interface SharedMoment {
  description: string;
  contexts: string[];
  successRate: number;
}
```

**5. Small Wins**
```typescript
type SmallWin =
  | 'action_taken'
  | 'difficult_conversation'
  | 'stayed_consistent'
  | 'emotional_shift'
  | 'vulnerability';
```

**6. Thinking of You**
```typescript
interface ThinkingOfYouMoment {
  reason: string;
  daysToWait: number;
  personalizationHints: string[];
}
```

### Relationship Health Score

```typescript
interface RelationshipHealth {
  overallScore: number;           // 0-100
  overallTrend: 'improving' | 'stable' | 'declining';

  factors: {
    boundary_respect: number;
    emotional_attunement: number;
    growth_acknowledgment: number;
    callback_success: number;
    outreach_reception: number;
    session_depth: number;
  };

  stage: 'new' | 'building' | 'established' | 'deep' | 'flourishing';
}
```

---

## 7. Engagement Domain

### Purpose
Drive retention through meaningful interactions and gamification.

### Key Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Engagement Store | `src/services/engagement-store.ts` | Persistence |
| Engagement Routes | `src/api/engagement-routes.ts` | API endpoints |
| Proactive Outreach | `src/services/outreach/` | Multi-channel outreach |
| Games | `src/services/games/` | Interactive experiences |

### Daily Rituals

**Per-Persona Games:**
| Persona | Games |
|---------|-------|
| Ferni | Sky Check, Kintsugi Moments, Question of the Week |
| Alex | Inbox Zero, Meeting Bingo, Sunday Prep |
| Maya | Compound & Interest, Tiny Bets, Savings Sprint |
| Jordan | Future Self Letter, Life Portfolio Review, Bucket List Bingo |
| Nayan | Paradox of the Day, Story Trading, Question Beneath |
| Peter | Pattern Detective, Weekly Prediction, Correlation Hunt |

### Engagement Mechanics

```
Retention Features:
├─ Streak tracking (3, 7, 14, 21, 30, 66, 100, 365 day milestones)
├─ Badge system (30+ types)
├─ Level progression (10 levels)
├─ Team huddles (cross-persona)
└─ Memory callbacks (proactive)

Notification Types:
├─ Streak reminders (>20 hrs, <28 hrs)
├─ Ritual due notifications
├─ Milestone celebrations
├─ Team huddle invitations
└─ Seasonal events
```

### Proactive Outreach System

```typescript
type OutreachTrigger =
  | 'commitment_check'
  | 'emotional_support'
  | 'celebration'
  | 'memory_callback'
  | 'thinking_of_you'
  | 'life_event'
  | 'follow_up'
  | 'seasonal';

interface OutreachDecision {
  trigger: OutreachTrigger;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  channel: 'sms' | 'email' | 'push' | 'voice';
  timing: OptimalWindow;
  personaVoice: PersonaId;
}
```

---

## 8. Monetization Domain

### Purpose
Sustainable revenue through relationship-based pricing.

### Key Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Stripe Integration | `src/services/stripe-subscription.ts` | Payment processing |
| Subscription Routes | `src/api/subscription-routes.ts` | API endpoints |
| Feature Flags | `src/services/feature-flags.ts` | Tier gating |
| Team Unlock | `frontend/services/team-unlock.service.ts` | Persona unlocks |

### Subscription Tiers

| Tier | Price | Limits | Features |
|------|-------|--------|----------|
| **Free** | $0 | 5 conv/mo, 30 min | Basic memory, single device |
| **Friend** | $9.99/mo | Unlimited | Full memory, cross-device, beta |
| **Partner** | $19.99/mo | Unlimited | Priority, family (4), exclusive |

### Expansion Revenue

**Marketplace Personas (7):**
- Moxie (Accountability)
- River (Grief)
- Zen (Mindfulness)
- Luna (Sleep)
- Atlas (Career)
- Spark (Creativity)
- Sage (Relationships)

**Premium Features:**
- Streak protection
- Advanced game content
- Priority responses
- API access

### Revenue Model

```
Unit Economics (per user):
├─ Free: $0 (acquisition funnel)
├─ Friend: $120/year LTV
├─ Partner: $240/year LTV
├─ Add-ons: $20-60/year
└─ Enterprise: $240-600+/year

Projected ARR (100K users):
├─ 10K Friend tier @ $120    = $1.2M
├─ 5K Partner tier @ $240    = $1.2M
├─ 10% add-ons @ $40 avg     = $600K
├─ 5% games @ $50            = $250K
├─ 500 enterprise @ $300     = $150K
────────────────────────────────────
Total                        = $3.4M
```

---

## Cross-Domain Integration

### Request Flow Example

```
User says: "I'm worried about my retirement savings"

1. VOICE AGENT
   ├─ Audio → STT
   └─ Turn processing triggered

2. INTELLIGENCE
   ├─ Emotion detected: anxiety (0.72)
   ├─ Intent: seeking_reassurance
   ├─ Topic: retirement, finance
   └─ Context builders fire (14 injections)

3. MEMORY
   ├─ Retrieve: previous retirement conversations
   ├─ Key moments: "shared concern about market volatility"
   └─ Semantic score: 0.87

4. TRUST SYSTEMS
   ├─ Reading between lines: "deeper anxiety than expressed"
   ├─ Growth reflection: "More comfortable discussing money now"
   └─ Small wins: "Saved $500 last month"

5. PERSONA (Maya)
   ├─ Cognitive style: empathetic/pragmatic
   ├─ Voice: warm, encouraging
   └─ Humanization: "I hear that worry..."

6. TOOLS
   ├─ Dynamic load: finance domain
   ├─ Available: retirement calculator, savings tracker
   └─ Suggested: retirement projection tool

7. RESPONSE
   ├─ LLM generation with context
   ├─ Humanization post-processing
   ├─ SSML tagging (soft volume, slower pace)
   └─ TTS output

8. ENGAGEMENT
   ├─ Track: retirement topic discussed
   ├─ Schedule: follow-up check-in (3 days)
   └─ Celebration: if milestone reached
```

---

## Summary

Ferni's architecture demonstrates:

1. **Depth**: Each domain has comprehensive implementation
2. **Integration**: Domains work together seamlessly
3. **Scalability**: Clean separation enables independent scaling
4. **Extensibility**: New domains/personas/tools can be added
5. **Data Moat**: Learning systems compound over time
6. **Defensibility**: Proprietary algorithms and accumulated data

---

*Document generated from codebase analysis - December 2024*
