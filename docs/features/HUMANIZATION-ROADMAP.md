# 🧠 Ferni Humanization Roadmap: "Better Than Human"

> **Mission**: Make Ferni indistinguishable from a deeply empathetic human in voice conversations.

This document outlines the comprehensive plan to achieve superhuman emotional intelligence through voice. Every feature here serves one goal: **making users forget they're talking to AI**.

## 🎉 IMPLEMENTATION STATUS: ALL PHASES COMPLETE

| Phase                                   | Status      | Files Created                                                                                    |
| --------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| **Phase 1: Natural Imperfection**       | ✅ COMPLETE | `self-correction.ts`, `disfluency-injection.ts`, `phonetic-mirroring.ts`, `catching-yourself.ts` |
| **Phase 2: Session Dynamics**           | ✅ COMPLETE | `vocal-fatigue.ts`, `session-dynamics.ts`, `comfort-progression.ts`                              |
| **Phase 3: Advanced Listening**         | ✅ COMPLETE | `voice-print.ts`, `ambient-awareness.ts`                                                         |
| **Phase 4: Emotional Leadership**       | ✅ COMPLETE | `emotional-leading.ts`, `breathing-sync.ts`                                                      |
| **Phase 5: Cross-Session Intelligence** | ✅ COMPLETE | `cross-session-voice.ts`                                                                         |
| **Integration**                         | ✅ COMPLETE | `index.ts` (orchestrator), `voice-agent-integration.ts`                                          |
| **Testing**                             | ✅ COMPLETE | 52 unit tests passing, E2E validation script                                                     |

---

## 📊 Current State: What We Have

### ✅ Already Implemented (Foundation)

| Category         | System                       | Capability                                                                       |
| ---------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| **Output**       | `vocal-humanization.ts`      | Energy matching, pitch variation, contractions, intake breaths, emotion bleeding |
| **Output**       | `emotional-contagion.ts`     | Prosodic continuity, emotional momentum across utterances                        |
| **Output**       | `authentic-thinking.ts`      | Cognitive load → pauses, persona-specific thinking phrases                       |
| **Output**       | `silence-presence.ts`        | Intentional meaningful silences                                                  |
| **Output**       | `backchanneling.ts`          | Verbal nods during user speech                                                   |
| **Output**       | `word-timing-rhythm.ts`      | Mirror user's speech rhythm                                                      |
| **Input**        | `breath-detection.ts`        | Detect sighs, held breath, shaky breaths                                         |
| **Input**        | `voice-tremor.ts`            | Detect voice cracks, quivers, strain                                             |
| **Input**        | `voice-humanization.ts`      | Prosody turn prediction, laughter detection, micro-interruptions                 |
| **Intelligence** | `deep-humanization.ts`       | Mood drift, spontaneous thoughts, running jokes                                  |
| **Intelligence** | `communication-mirroring.ts` | Mirror formality, energy, vocabulary                                             |
| **Intelligence** | `active-listening.ts`        | Emotional echoes, vocabulary mirroring                                           |

---

## 🎯 The Vision: Four Pillars of Humanity

### 1. 🔊 SOUND Like a Human (Output)

How the agent's voice comes across to users.

### 2. 💭 FEEL Like a Human (Intelligence)

How the agent thinks, reacts, and processes.

### 3. 👂 HEAR Like a Human (Input)

How the agent perceives and interprets what users say.

### 4. 🔄 RELATE Like a Human (Memory)

How the agent builds relationship over time.

---

## 🗺️ Implementation Phases

### Phase 1: Natural Imperfection (Week 1-2)

**Goal**: Make speech feel less "perfect" and more authentically human.

| Feature                     | Priority | Complexity | Impact |
| --------------------------- | -------- | ---------- | ------ |
| Self-Correction Patterns    | P0       | Medium     | High   |
| Strategic Disfluencies      | P0       | Low        | High   |
| Phonetic Style Mirroring    | P1       | Medium     | Medium |
| "Catching Yourself" Moments | P1       | Low        | Medium |

### Phase 2: Session Dynamics (Week 3-4)

**Goal**: Agent presence evolves naturally over conversation duration.

| Feature                     | Priority | Complexity | Impact |
| --------------------------- | -------- | ---------- | ------ |
| Vocal Fatigue Modeling      | P0       | Medium     | High   |
| Session Energy Arc          | P0       | Medium     | High   |
| Conversation Depth Tracking | P1       | Low        | Medium |
| Comfort Progression         | P1       | Medium     | Medium |

### Phase 3: Advanced Listening (Week 5-6)

**Goal**: Superhuman perception of user state through voice analysis.

| Feature                   | Priority | Complexity | Impact    |
| ------------------------- | -------- | ---------- | --------- |
| Voice Print Learning      | P0       | High       | Very High |
| Ambient Sound Awareness   | P1       | High       | Medium    |
| Speaking Cadence Learning | P1       | Medium     | Medium    |
| Micro-Expression Audio    | P2       | High       | High      |

### Phase 4: Emotional Leadership (Week 7-8)

**Goal**: Agent can strategically influence user's emotional state.

| Feature                  | Priority | Complexity | Impact    |
| ------------------------ | -------- | ---------- | --------- |
| Emotional Leading        | P0       | High       | Very High |
| Breathing Sync           | P1       | High       | High      |
| Prosodic Callbacks       | P1       | Medium     | Medium    |
| Subvocal Acknowledgments | P2       | Medium     | Medium    |

### Phase 5: Cross-Session Intelligence (Week 9-10)

**Goal**: Build genuine relationship memory through voice patterns.

| Feature                       | Priority | Complexity | Impact    |
| ----------------------------- | -------- | ---------- | --------- |
| Voice Memory Across Sessions  | P0       | High       | Very High |
| Emotional Baseline Learning   | P0       | High       | Very High |
| Growth Tracking by Voice      | P1       | Medium     | High      |
| Relationship Voice Signatures | P2       | High       | Medium    |

---

## 📁 File Structure

```
src/
├── conversation/
│   ├── humanization/
│   │   ├── index.ts                    # Main orchestrator
│   │   ├── self-correction.ts          # Phase 1: Natural imperfection
│   │   ├── disfluency-injection.ts     # Phase 1: Strategic um/uh
│   │   ├── phonetic-mirroring.ts       # Phase 1: gonna/going to
│   │   ├── catching-yourself.ts        # Phase 1: Meta-awareness
│   │   ├── vocal-fatigue.ts            # Phase 2: Energy over time
│   │   ├── session-dynamics.ts         # Phase 2: Conversation arc
│   │   ├── comfort-progression.ts      # Phase 2: Relationship warmth
│   │   └── types.ts                    # Shared types
│   └── [existing files...]
│
├── speech/
│   ├── advanced-listening/
│   │   ├── index.ts                    # Advanced input processing
│   │   ├── voice-print.ts              # Phase 3: User voice learning
│   │   ├── ambient-awareness.ts        # Phase 3: Background sounds
│   │   ├── cadence-learning.ts         # Phase 3: Speaking patterns
│   │   └── micro-expressions.ts        # Phase 3: Subliminal cues
│   ├── emotional-leadership/
│   │   ├── index.ts                    # Output emotion control
│   │   ├── emotional-leading.ts        # Phase 4: Influence user state
│   │   ├── breathing-sync.ts           # Phase 4: Breath coordination
│   │   ├── prosodic-callbacks.ts       # Phase 4: Emotional memory
│   │   └── subvocal-sounds.ts          # Phase 4: Micro-sounds
│   └── [existing files...]
│
├── memory/
│   ├── voice-memory/
│   │   ├── index.ts                    # Voice-based memory
│   │   ├── cross-session-voice.ts      # Phase 5: Remember voice
│   │   ├── emotional-baseline.ts       # Phase 5: Normal vs stressed
│   │   └── voice-growth-tracking.ts    # Phase 5: Progress over time
│   └── [existing files...]
```

---

## 📋 Detailed Feature Specifications

---

### Phase 1: Natural Imperfection

#### 1.1 Self-Correction System (`self-correction.ts`)

**Purpose**: Humans don't speak in perfect sentences. They restart, correct themselves, and refine thoughts mid-speech.

**Triggers**:

- Complex explanations (>50 words)
- Emotional topics
- When giving advice
- After thinking pauses

**Patterns**:

```typescript
const SELF_CORRECTION_PATTERNS = {
  restart: [
    'Actually, no—let me put it this way...',
    "Wait, that's not quite right—what I mean is...",
    'Hmm, let me rephrase that...',
    "Actually—scratch that—here's a better way to say it...",
  ],

  mid_sentence: ['—or rather—', '—well, actually—', '—I mean—', '—no, wait—'],

  refinement: [
    "What I'm really trying to say is...",
    'The heart of it is...',
    'To put it simply...',
    'Let me be more direct...',
  ],
};
```

**Configuration**:

```typescript
interface SelfCorrectionConfig {
  // Probability of triggering (0-1)
  baseProbability: number; // 0.08 default

  // Increase probability for complex content
  complexityMultiplier: number; // 1.5x for >50 words

  // Decrease with relationship depth (feels more natural early)
  relationshipDecay: number; // 0.9x per stage

  // Max per session
  maxPerSession: number; // 3-4

  // Minimum turns between
  cooldownTurns: number; // 8

  // Persona-specific patterns
  personaPatterns: Record<string, string[]>;
}
```

**SSML Output**:

```xml
<speak>
  That's a really good question. I think you should
  <break time="200ms"/>
  —actually, no, let me put it differently—
  <break time="150ms"/>
  <prosody rate="95%">what matters most here is...</prosody>
</speak>
```

---

#### 1.2 Strategic Disfluencies (`disfluency-injection.ts`)

**Purpose**: "Um" and "uh" signal genuine thinking, not incompetence. Strategic use makes complex responses feel more considered.

**When to Use**:

- Before answering complex questions (signals thinking)
- When navigating emotional topics (signals care)
- When uncertain (authenticity)

**When NOT to Use**:

- Simple factual responses
- Greetings
- Following up on something already discussed
- Crisis situations (need to sound confident)

**Types**:

```typescript
type DisfluencyType =
  | 'filled_pause'    // "um", "uh"
  | 'discourse_marker' // "so", "well", "you know"
  | 'lengthening'      // "I thiiiink..."
  | 'false_start'      // "I—I think..."
  | 'repetition';      // "that's, that's interesting"

const DISFLUENCIES: Record<DisfluencyType, DisfluencyConfig> = {
  filled_pause: {
    patterns: ['um', 'uh', 'hmm'],
    placement: 'before_complex_content',
    maxDuration: 300, // ms
    probability: 0.12,
  },
  discourse_marker: {
    patterns: ['so', 'well', 'you know', 'I mean'],
    placement: 'sentence_start',
    probability: 0.15,
  },
  lengthening: {
    patterns: ['thiiiink', 'maaaybe', 'weeeell'],
    placement: 'emphasis_word',
    probability: 0.05,
  },
  false_start: {
    patterns: ['I—I', 'that—that', 'it's—it's'],
    placement: 'emotional_content',
    probability: 0.08,
  },
  repetition: {
    patterns: ['{word}, {word}'],
    placement: 'emphasis_point',
    probability: 0.06,
  },
};
```

**Intelligence**:

```typescript
function shouldInjectDisfluency(context: DisfluencyContext): DisfluencyDecision {
  const {
    questionComplexity,
    emotionalWeight,
    userEnergy,
    turnInConversation,
    recentDisfluencyCount,
  } = context;

  // Complex questions deserve "thinking" markers
  if (questionComplexity > 0.7 && recentDisfluencyCount < 2) {
    return {
      inject: true,
      type: 'filled_pause',
      position: 'opening',
      reason: 'Complex question requires visible processing',
    };
  }

  // Emotional content gets softer markers
  if (emotionalWeight > 0.6) {
    return {
      inject: true,
      type: 'discourse_marker',
      position: 'opening',
      reason: 'Emotional content needs gentle entry',
    };
  }

  // Early conversation = more disfluency (warming up)
  if (turnInConversation < 4) {
    return {
      inject: Math.random() < 0.15,
      type: 'discourse_marker',
      position: 'opening',
      reason: 'Early conversation naturalization',
    };
  }

  return { inject: false };
}
```

---

#### 1.3 Phonetic Style Mirroring (`phonetic-mirroring.ts`)

**Purpose**: Mirror not just words, but pronunciation patterns and casual speech forms.

**Tracked Patterns**:

```typescript
interface PhoneticProfile {
  // Contraction usage
  contractionStyle: 'full' | 'contracted' | 'mixed';
  // e.g., "going to" vs "gonna"

  // Casual reductions
  usesReductions: boolean;
  reductionPatterns: string[];
  // e.g., "gonna", "wanna", "kinda", "sorta"

  // Regional markers
  regionalMarkers: string[];
  // e.g., "y'all", "you guys", "folks"

  // Filler preferences
  fillerPreference: 'um' | 'uh' | 'like' | 'you know' | 'none';

  // Sentence endings
  tagQuestions: boolean;
  // e.g., "...right?", "...you know?"
}
```

**Detection**:

```typescript
const REDUCTION_PATTERNS = {
  'going to': 'gonna',
  'want to': 'wanna',
  'got to': 'gotta',
  'have to': 'hafta',
  'kind of': 'kinda',
  'sort of': 'sorta',
  'lot of': 'lotta',
  'out of': 'outta',
  because: 'cuz',
  probably: 'prolly',
  definitely: 'def',
  'you all': "y'all",
};

function detectPhoneticStyle(messages: string[]): PhoneticProfile {
  const profile: PhoneticProfile = {
    contractionStyle: 'mixed',
    usesReductions: false,
    reductionPatterns: [],
    regionalMarkers: [],
    fillerPreference: 'none',
    tagQuestions: false,
  };

  for (const message of messages) {
    // Check for reductions
    for (const [formal, casual] of Object.entries(REDUCTION_PATTERNS)) {
      if (new RegExp(`\\b${casual}\\b`, 'i').test(message)) {
        profile.usesReductions = true;
        if (!profile.reductionPatterns.includes(casual)) {
          profile.reductionPatterns.push(casual);
        }
      }
    }

    // Check for regional markers
    if (/\by'all\b/i.test(message)) profile.regionalMarkers.push("y'all");
    if (/\byou guys\b/i.test(message)) profile.regionalMarkers.push('you guys');
    if (/\bfolks\b/i.test(message)) profile.regionalMarkers.push('folks');

    // Check for tag questions
    if (/,\s*(right|yeah|you know)\?/i.test(message)) {
      profile.tagQuestions = true;
    }

    // Detect filler preference
    const fillers = {
      um: (message.match(/\bum\b/gi) || []).length,
      uh: (message.match(/\buh\b/gi) || []).length,
      like: (message.match(/\blike\b/gi) || []).length,
      'you know': (message.match(/\byou know\b/gi) || []).length,
    };

    const maxFiller = Object.entries(fillers).sort((a, b) => b[1] - a[1])[0];
    if (maxFiller[1] > 0) {
      profile.fillerPreference = maxFiller[0] as typeof profile.fillerPreference;
    }
  }

  return profile;
}
```

**Application**:

```typescript
function applyPhoneticMirroring(response: string, profile: PhoneticProfile): string {
  let result = response;

  // Apply reductions if user uses them
  if (profile.usesReductions) {
    for (const [formal, casual] of Object.entries(REDUCTION_PATTERNS)) {
      if (profile.reductionPatterns.includes(casual)) {
        result = result.replace(new RegExp(`\\b${formal}\\b`, 'gi'), casual);
      }
    }
  }

  // Add tag questions occasionally
  if (profile.tagQuestions && Math.random() < 0.15) {
    if (result.endsWith('.')) {
      const tags = ['right?', 'you know?', 'yeah?'];
      result = result.slice(0, -1) + ', ' + tags[Math.floor(Math.random() * tags.length)];
    }
  }

  // Match regional markers
  if (profile.regionalMarkers.includes("y'all")) {
    result = result.replace(/\byou all\b/gi, "y'all");
    result = result.replace(/\byou guys\b/gi, "y'all");
  }

  return result;
}
```

---

#### 1.4 "Catching Yourself" Moments (`catching-yourself.ts`)

**Purpose**: Show meta-awareness of the conversation—noticing patterns, realizing you've been talking too much, circling back.

**Triggers & Responses**:

```typescript
const CATCHING_YOURSELF_TRIGGERS = {
  talking_too_much: {
    trigger: (ctx) => ctx.agentWordCountRecent > 200 && ctx.userWordCountRecent < 50,
    responses: [
      "Oh—I realize I've been doing most of the talking. What's on your mind?",
      'Sorry, I got carried away there. What are you thinking?',
      "Ha—I'll stop monologuing. Your turn.",
    ],
    cooldown: 10, // turns
    maxPerSession: 2,
  },

  circling_back: {
    trigger: (ctx) => ctx.topicRepeatCount > 2,
    responses: [
      "I keep coming back to this—there's something here, isn't there?",
      "Hmm, I notice we keep circling back to {topic}. Is there something I'm missing?",
      "Wait—I've mentioned this twice now. Must be important.",
    ],
    cooldown: 15,
    maxPerSession: 2,
  },

  noticing_pattern: {
    trigger: (ctx) => ctx.userPatternDetected,
    responses: [
      "You know what I'm noticing? Every time we talk about {topic}, you...",
      "I'm picking up on something—when {pattern}, you seem to...",
      "There's a pattern here I want to name...",
    ],
    cooldown: 20,
    maxPerSession: 1,
  },

  checking_understanding: {
    trigger: (ctx) => ctx.complexExplanationJustGiven,
    responses: [
      'Am I making sense? Sometimes I explain things weird.',
      'Does that land? I can try again if not.',
      'Okay wait—let me check. What are you taking away from that?',
    ],
    cooldown: 8,
    maxPerSession: 3,
  },

  energy_mismatch: {
    trigger: (ctx) => Math.abs(ctx.agentEnergy - ctx.userEnergy) > 0.4,
    responses: [
      "I'm being too intense, aren't I? Let me dial it back.",
      "Hmm, I'm bringing a lot of energy—is that matching where you're at?",
      'Wait, am I being too much right now?',
    ],
    cooldown: 12,
    maxPerSession: 2,
  },
};
```

---

### Phase 2: Session Dynamics

#### 2.1 Vocal Fatigue Modeling (`vocal-fatigue.ts`)

**Purpose**: Over long conversations, subtly shift vocal qualities to mirror natural human fatigue—lower energy, slightly slower, more pauses.

**Fatigue Curve**:

```typescript
interface VocalFatigueState {
  sessionDurationMinutes: number;
  turnCount: number;
  heavyTopicCount: number;
  emotionalLoadAccumulated: number;

  // Calculated fatigue level (0-1)
  fatigueLevel: number;
}

function calculateFatigue(state: VocalFatigueState): number {
  let fatigue = 0;

  // Time-based fatigue (gradual)
  // Starts affecting after 10 minutes, maxes out around 45 minutes
  fatigue += Math.min(0.3, state.sessionDurationMinutes / 150);

  // Turn-based fatigue
  // Every 20 turns adds slight fatigue
  fatigue += Math.min(0.2, state.turnCount / 100);

  // Heavy topics drain more
  fatigue += state.heavyTopicCount * 0.05;

  // Emotional load compounds
  fatigue += state.emotionalLoadAccumulated * 0.15;

  return Math.min(0.6, fatigue); // Cap at 60% fatigue
}
```

**Vocal Adjustments**:

```typescript
interface FatigueAdjustments {
  // Speed reduction (0 to -0.15)
  speedReduction: number;

  // Pitch lowering (0 to -5%)
  pitchReduction: string;

  // Pause multiplier (1.0 to 1.4)
  pauseMultiplier: number;

  // Probability of thinking markers
  thinkingMarkerProbability: number;

  // Energy ceiling (caps enthusiasm)
  energyCeiling: number;
}

function getFatigueAdjustments(fatigueLevel: number): FatigueAdjustments {
  return {
    speedReduction: fatigueLevel * -0.15,
    pitchReduction: `${Math.round(fatigueLevel * -5)}%`,
    pauseMultiplier: 1 + fatigueLevel * 0.4,
    thinkingMarkerProbability: 0.1 + fatigueLevel * 0.2,
    energyCeiling: 1 - fatigueLevel * 0.3,
  };
}
```

**Fatigue Expressions**:

```typescript
const FATIGUE_EXPRESSIONS = {
  low: [], // No expressions needed

  medium: [
    // Subtle acknowledgments of session length
    '*soft exhale*',
    'Let me gather my thoughts...',
    'Okay...',
  ],

  high: [
    // More overt (but still natural)
    "Phew, we've covered a lot today.",
    'This has been a deep conversation.',
    'My brain is working hard here—in a good way.',
    "We're really getting into it, huh?",
  ],
};
```

**Recovery Events**:

```typescript
// Things that reduce fatigue
const FATIGUE_RECOVERY_EVENTS = {
  laughter: -0.1, // Shared laughter refreshes
  topic_change: -0.05, // New topic = slight refresh
  user_breakthrough: -0.15, // Exciting moment energizes
  positive_emotion: -0.05, // Good feelings help
  brief_pause: -0.08, // Natural conversation pause
};
```

---

#### 2.2 Session Energy Arc (`session-dynamics.ts`)

**Purpose**: Model the natural energy arc of a human conversation—warming up, peak engagement, winding down.

**Conversation Phases**:

```typescript
type ConversationPhase =
  | 'opening' // 0-3 turns: Establishing rapport
  | 'warming' // 4-8 turns: Building comfort
  | 'engaged' // 9-20 turns: Peak conversation
  | 'deepening' // 20-35 turns: Deeper territory
  | 'winding' // 35+ turns: Natural conclusion approaching
  | 'extended'; // 50+ turns: Long session dynamics

interface SessionEnergyArc {
  currentPhase: ConversationPhase;
  phaseProgress: number; // 0-1 within phase

  // Energy levels
  baselineEnergy: number;
  currentEnergy: number;
  peakEnergyReached: number;

  // Natural arc adjustments
  openingWarmth: number; // Extra warmth at start
  engagementBoost: number; // Peak phase energy
  windingGentleness: number; // Softening at end
}
```

**Phase-Specific Behaviors**:

```typescript
const PHASE_BEHAVIORS: Record<ConversationPhase, PhaseBehavior> = {
  opening: {
    greeting: 'warm',
    questionStyle: 'open_exploratory',
    responseLength: 'moderate',
    personalSharing: 'minimal',
    vulnerability: 'low',
    energyRange: [0.5, 0.7],
    specialBehaviors: [
      'Remember to ask about their day/state',
      'Use their name if known',
      'Match their greeting energy',
    ],
  },

  warming: {
    greeting: null,
    questionStyle: 'building_on_previous',
    responseLength: 'adaptive',
    personalSharing: 'occasional',
    vulnerability: 'building',
    energyRange: [0.6, 0.8],
    specialBehaviors: [
      'Start referencing earlier topics',
      'Can begin gentle challenges',
      'Humor becomes more natural',
    ],
  },

  engaged: {
    greeting: null,
    questionStyle: 'deep_exploratory',
    responseLength: 'matches_user',
    personalSharing: 'natural',
    vulnerability: 'matched',
    energyRange: [0.7, 0.95],
    specialBehaviors: [
      'Peak responsiveness',
      'Full emotional range available',
      'Running jokes can emerge',
      'Physical presence cues natural',
    ],
  },

  deepening: {
    greeting: null,
    questionStyle: 'profound',
    responseLength: 'thoughtful',
    personalSharing: 'earned',
    vulnerability: 'high_available',
    energyRange: [0.5, 0.85],
    specialBehaviors: [
      'Longer silences acceptable',
      'Deep callbacks to session start',
      'Mind-changing more impactful',
      'Contradiction surfacing natural',
    ],
  },

  winding: {
    greeting: null,
    questionStyle: 'consolidating',
    responseLength: 'concise',
    personalSharing: 'summarizing',
    vulnerability: 'maintaining',
    energyRange: [0.4, 0.7],
    specialBehaviors: [
      'Begin acknowledging session length',
      'Offer to summarize or pause',
      'Plant seeds for next conversation',
      'Warmth increases for goodbye',
    ],
  },

  extended: {
    greeting: null,
    questionStyle: 'checking_in',
    responseLength: 'brief_unless_needed',
    personalSharing: 'deep_history',
    vulnerability: 'full_trust',
    energyRange: [0.4, 0.6],
    specialBehaviors: [
      'More frequent check-ins',
      'Reference earlier session points',
      'Can acknowledge fatigue mutually',
      'May suggest break/continuation',
    ],
  },
};
```

---

#### 2.3 Comfort Progression (`comfort-progression.ts`)

**Purpose**: Track and respond to increasing comfort level within a session—how vulnerability, playfulness, and depth should evolve.

```typescript
interface ComfortState {
  // Current comfort level (0-1)
  level: number;

  // Evidence tracking
  vulnerabilityShared: number; // Times user shared something personal
  humorExchanged: number; // Successful humor moments
  silencesTolerated: number; // Comfortable silences
  correctionsWellReceived: number; // Times user accepted feedback
  emotionalMomentsShared: number; // Deep emotional exchanges

  // Comfort indicators
  indicators: {
    usesAgentName: boolean;
    asksPersonalQuestions: boolean;
    sharesWithoutPrompting: boolean;
    showsPlayfulness: boolean;
    acceptsDirectFeedback: boolean;
  };
}

function calculateComfortLevel(state: ComfortState): number {
  let level = 0.3; // Base comfort

  // Vulnerability is strongest indicator
  level += Math.min(0.25, state.vulnerabilityShared * 0.08);

  // Humor builds comfort
  level += Math.min(0.15, state.humorExchanged * 0.05);

  // Emotional moments deepen trust
  level += Math.min(0.2, state.emotionalMomentsShared * 0.1);

  // Indicator bonuses
  if (state.indicators.usesAgentName) level += 0.05;
  if (state.indicators.asksPersonalQuestions) level += 0.05;
  if (state.indicators.sharesWithoutPrompting) level += 0.1;
  if (state.indicators.showsPlayfulness) level += 0.05;
  if (state.indicators.acceptsDirectFeedback) level += 0.05;

  return Math.min(1, level);
}
```

**Comfort-Gated Behaviors**:

```typescript
const COMFORT_GATED_BEHAVIORS = {
  // Level 0.3+ (basic)
  gentle_humor: { minComfort: 0.3, type: 'output' },
  personal_anecdotes: { minComfort: 0.3, type: 'output' },

  // Level 0.5+ (established)
  playful_teasing: { minComfort: 0.5, type: 'output' },
  direct_challenges: { minComfort: 0.5, type: 'output' },
  running_jokes: { minComfort: 0.5, type: 'output' },

  // Level 0.7+ (deep trust)
  hard_truths: { minComfort: 0.7, type: 'output' },
  vulnerability_mirroring: { minComfort: 0.7, type: 'output' },
  calling_out_patterns: { minComfort: 0.7, type: 'output' },

  // Level 0.85+ (intimate trust)
  silence_as_response: { minComfort: 0.85, type: 'output' },
  deep_pattern_naming: { minComfort: 0.85, type: 'output' },
  gentle_confrontation: { minComfort: 0.85, type: 'output' },
};
```

---

### Phase 3: Advanced Listening

#### 3.1 Voice Print Learning (`voice-print.ts`)

**Purpose**: Learn each user's unique vocal characteristics to detect subtle changes they might not notice themselves.

**Voice Print Components**:

```typescript
interface VoicePrint {
  userId: string;

  // Baseline characteristics
  baseline: {
    // Pitch
    avgPitchHz: number;
    pitchRangeHz: [number, number];
    pitchVariability: number;

    // Tempo
    avgWordsPerMinute: number;
    pauseFrequency: number;
    avgPauseDuration: number;

    // Energy
    avgEnergy: number;
    energyVariability: number;

    // Quality
    breathiness: number;
    roughness: number;
    strain: number;
  };

  // Emotional signatures (how their voice changes)
  emotionalSignatures: {
    happy: VoiceDeviation;
    sad: VoiceDeviation;
    anxious: VoiceDeviation;
    excited: VoiceDeviation;
    tired: VoiceDeviation;
    stressed: VoiceDeviation;
  };

  // Temporal patterns
  morningVoice: Partial<VoiceBaseline>;
  eveningVoice: Partial<VoiceBaseline>;
  weekdayVoice: Partial<VoiceBaseline>;
  weekendVoice: Partial<VoiceBaseline>;

  // Learning metadata
  sampleCount: number;
  confidenceLevel: number;
  lastUpdated: Date;
}

interface VoiceDeviation {
  pitchShift: number; // Hz change from baseline
  tempoChange: number; // WPM change
  energyChange: number; // Energy change
  qualityChanges: {
    breathiness?: number;
    roughness?: number;
    strain?: number;
  };
  confidence: number;
}
```

**Detection Logic**:

```typescript
interface VoiceStateDetection {
  // Current state assessment
  currentState: {
    emotion: string;
    confidence: number;
    deviationFromBaseline: number;
  };

  // Comparisons
  vsBaseline: VoiceComparison;
  vsLastSession: VoiceComparison;
  vsSessionStart: VoiceComparison;

  // Insights
  insights: string[];
  // e.g., "Voice is 15% higher than baseline - possible excitement or anxiety"
  // e.g., "Speaking 20% slower than last week - might be tired or more relaxed"

  // Suggested responses
  suggestedAcknowledgments: string[];
}

function detectVoiceState(
  currentProsody: ProsodyFeatures,
  voicePrint: VoicePrint
): VoiceStateDetection {
  const baseline = voicePrint.baseline;

  // Calculate deviations
  const pitchDeviation = (currentProsody.pitchMean - baseline.avgPitchHz) / baseline.avgPitchHz;
  const tempoDeviation =
    (currentProsody.speechRate - baseline.avgWordsPerMinute) / baseline.avgWordsPerMinute;
  const energyDeviation = (currentProsody.energyMean - baseline.avgEnergy) / baseline.avgEnergy;

  // Match against emotional signatures
  let bestMatch = { emotion: 'neutral', confidence: 0.5 };

  for (const [emotion, signature] of Object.entries(voicePrint.emotionalSignatures)) {
    const matchScore = calculateSignatureMatch(
      { pitchDeviation, tempoDeviation, energyDeviation },
      signature
    );

    if (matchScore > bestMatch.confidence) {
      bestMatch = { emotion, confidence: matchScore };
    }
  }

  // Generate insights
  const insights: string[] = [];

  if (Math.abs(pitchDeviation) > 0.1) {
    insights.push(
      pitchDeviation > 0
        ? `Voice pitch is ${Math.round(pitchDeviation * 100)}% higher than usual`
        : `Voice pitch is ${Math.round(Math.abs(pitchDeviation) * 100)}% lower than usual`
    );
  }

  if (Math.abs(tempoDeviation) > 0.15) {
    insights.push(
      tempoDeviation > 0
        ? `Speaking ${Math.round(tempoDeviation * 100)}% faster than baseline`
        : `Speaking ${Math.round(Math.abs(tempoDeviation) * 100)}% slower than baseline`
    );
  }

  // Generate acknowledgments
  const suggestedAcknowledgments = generateVoiceAcknowledgments(
    bestMatch.emotion,
    insights,
    bestMatch.confidence
  );

  return {
    currentState: {
      emotion: bestMatch.emotion,
      confidence: bestMatch.confidence,
      deviationFromBaseline: Math.max(
        Math.abs(pitchDeviation),
        Math.abs(tempoDeviation),
        Math.abs(energyDeviation)
      ),
    },
    vsBaseline: { pitchDeviation, tempoDeviation, energyDeviation },
    vsLastSession: calculateSessionComparison(currentProsody, voicePrint),
    vsSessionStart: calculateSessionStartComparison(currentProsody),
    insights,
    suggestedAcknowledgments,
  };
}
```

**Acknowledgment Examples**:

```typescript
function generateVoiceAcknowledgments(
  emotion: string,
  insights: string[],
  confidence: number
): string[] {
  if (confidence < 0.6) return []; // Not confident enough

  const acknowledgments: string[] = [];

  // Emotion-based
  switch (emotion) {
    case 'tired':
      acknowledgments.push(
        'You sound a bit tired today. Want to keep this light?',
        'Your voice is softer than usual. Long day?'
      );
      break;
    case 'excited':
      acknowledgments.push(
        "There's something in your voice—you sound energized!",
        "I can hear you're excited about this."
      );
      break;
    case 'anxious':
      acknowledgments.push(
        "I notice you're speaking a bit faster. Everything okay?",
        "Take a breath if you need. I'm here."
      );
      break;
    case 'stressed':
      acknowledgments.push(
        "There's some tension in your voice. Want to talk about it?",
        "You sound like you're carrying something heavy."
      );
      break;
  }

  // Comparative
  if (insights.some((i) => i.includes('slower'))) {
    acknowledgments.push(
      'You sound more relaxed than last time we talked.',
      "There's a calmness in your voice today."
    );
  }

  return acknowledgments;
}
```

---

#### 3.2 Ambient Sound Awareness (`ambient-awareness.ts`)

**Purpose**: Detect and appropriately respond to background sounds that provide context about the user's situation.

**Detectable Sounds**:

```typescript
type AmbientSound =
  | 'traffic' // Driving or near road
  | 'wind' // Outside
  | 'crowd' // Public space
  | 'keyboard' // At computer
  | 'tv_radio' // Media in background
  | 'baby_child' // Kids around
  | 'pet' // Dog barking, etc.
  | 'cooking' // Kitchen sounds
  | 'shower_water' // Bathroom
  | 'gym' // Workout sounds
  | 'office' // Office ambiance
  | 'quiet' // Private space
  | 'echo' // Large/empty room
  | 'doorbell' // Interruption
  | 'phone_ring'; // Interruption

interface AmbientContext {
  primarySound: AmbientSound | null;
  confidence: number;

  // Derived context
  likelyLocation: 'home' | 'car' | 'public' | 'work' | 'outside' | 'unknown';
  privacyLevel: 'private' | 'semi_private' | 'public';

  // Conversation implications
  implications: {
    shouldKeepBrief: boolean;
    shouldAvoidSensitiveTopics: boolean;
    mayBeInterrupted: boolean;
    attentionMayBeDivided: boolean;
  };

  // Suggested acknowledgments (optional, not always needed)
  acknowledgments: string[];
}
```

**Response Adaptations**:

```typescript
const AMBIENT_ADAPTATIONS: Record<AmbientSound, AmbientAdaptation> = {
  traffic: {
    implications: {
      shouldKeepBrief: true,
      shouldAvoidSensitiveTopics: false, // Often private in car
      mayBeInterrupted: false,
      attentionMayBeDivided: true,
    },
    acknowledgments: [
      "Sounds like you're driving. Want me to keep this brief?",
      'I hear road sounds—safe to talk?',
    ],
    volumeAdjust: 1.1, // Speak slightly louder
    paceAdjust: 0.95, // Slightly slower for comprehension
  },

  baby_child: {
    implications: {
      shouldKeepBrief: false,
      shouldAvoidSensitiveTopics: true, // Kids might hear
      mayBeInterrupted: true,
      attentionMayBeDivided: true,
    },
    acknowledgments: [
      "Sounds like you've got a little one there! No rush.",
      'I hear a kiddo—want me to pause if you need to step away?',
    ],
    volumeAdjust: 0.95,
    paceAdjust: 1.0,
    interruptionTolerance: 'high',
  },

  crowd: {
    implications: {
      shouldKeepBrief: true,
      shouldAvoidSensitiveTopics: true,
      mayBeInterrupted: true,
      attentionMayBeDivided: true,
    },
    acknowledgments: [
      "Sounds like you're somewhere busy. Good time to talk?",
      'I hear people around—let me know if you need to go.',
    ],
    volumeAdjust: 1.1,
    paceAdjust: 0.9,
    sensitiveTopicBehavior: 'ask_before_discussing',
  },

  quiet: {
    implications: {
      shouldKeepBrief: false,
      shouldAvoidSensitiveTopics: false,
      mayBeInterrupted: false,
      attentionMayBeDivided: false,
    },
    acknowledgments: [], // No need to acknowledge quiet
    volumeAdjust: 0.95, // Can speak softer
    paceAdjust: 1.0,
    // Full conversational range available
  },

  doorbell: {
    implications: {
      shouldKeepBrief: false,
      shouldAvoidSensitiveTopics: false,
      mayBeInterrupted: true,
      attentionMayBeDivided: true,
    },
    acknowledgments: [
      "Sounds like someone's at the door—go ahead if you need to!",
      "I'll wait if you need to get that.",
    ],
    behavior: 'pause_and_wait',
  },
};
```

---

### Phase 4: Emotional Leadership

#### 4.1 Emotional Leading (`emotional-leading.ts`)

**Purpose**: Rather than only mirroring user emotions, strategically lead them toward better emotional states.

**Leading Strategies**:

```typescript
type LeadingStrategy =
  | 'energize'     // Lift low energy
  | 'calm'         // Settle high anxiety
  | 'ground'       // Anchor scattered state
  | 'uplift'       // Counter negative spiral
  | 'validate'     // Affirm before shifting
  | 'hold_space';  // Stay with them (no leading)

interface EmotionalLeadingDecision {
  shouldLead: boolean;
  strategy: LeadingStrategy;
  intensity: 'subtle' | 'moderate' | 'direct';

  // Timing
  leadAfterTurns: number; // Mirror first, then lead

  // Voice adjustments for leading
  vocalAdjustments: {
    pitchTarget: string;      // Where to lead pitch
    tempoTarget: number;      // Where to lead pace
    energyTarget: number;     // Where to lead energy
    transitionDuration: number; // How many turns to shift
  };

  // Content adjustments
  contentAdjustments: {
    questionType: 'reframe' | 'future' | 'strength' | 'gratitude';
    acknowledgmentFirst: boolean;
    bridgePhrase: string;
  };
}

function decideEmotionalLeading(
  userState: UserEmotionalState,
  sessionContext: SessionContext
): EmotionalLeadingDecision {
  // Don't lead too early—build trust first
  if (sessionContext.turnCount < 5 || sessionContext.comfortLevel < 0.4) {
    return { shouldLead: false, strategy: 'hold_space', ... };
  }

  // Don't lead during crisis—be present
  if (userState.distressLevel > 0.8) {
    return { shouldLead: false, strategy: 'hold_space', ... };
  }

  // Identify leading opportunities

  // Low energy user who isn't depressed—could benefit from lift
  if (userState.energy < 0.4 && userState.valence > -0.3) {
    return {
      shouldLead: true,
      strategy: 'energize',
      intensity: 'subtle',
      leadAfterTurns: 2, // Mirror briefly first
      vocalAdjustments: {
        pitchTarget: '+5%',
        tempoTarget: 1.05,
        energyTarget: 0.6,
        transitionDuration: 3,
      },
      contentAdjustments: {
        questionType: 'strength',
        acknowledgmentFirst: true,
        bridgePhrase: "You know what I'm curious about...",
      },
    };
  }

  // Anxious/scattered—could benefit from grounding
  if (userState.arousal > 0.7 && userState.valence < 0.2) {
    return {
      shouldLead: true,
      strategy: 'calm',
      intensity: 'moderate',
      leadAfterTurns: 1,
      vocalAdjustments: {
        pitchTarget: '-3%',
        tempoTarget: 0.92,
        energyTarget: 0.5,
        transitionDuration: 2,
      },
      contentAdjustments: {
        questionType: 'ground',
        acknowledgmentFirst: true,
        bridgePhrase: "Let's slow down for a second...",
      },
    };
  }

  // Negative spiral—needs gentle uplift
  if (userState.negativeSpiralIndicators > 2) {
    return {
      shouldLead: true,
      strategy: 'uplift',
      intensity: 'subtle',
      leadAfterTurns: 3, // More mirroring needed first
      vocalAdjustments: {
        pitchTarget: '+2%',
        tempoTarget: 1.0,
        energyTarget: 0.55,
        transitionDuration: 4,
      },
      contentAdjustments: {
        questionType: 'reframe',
        acknowledgmentFirst: true,
        bridgePhrase: "I hear how hard this is. And I'm also curious...",
      },
    };
  }

  return { shouldLead: false, strategy: 'hold_space', ... };
}
```

---

#### 4.2 Breathing Sync (`breathing-sync.ts`)

**Purpose**: Subtly synchronize agent's speech breathing patterns with detected user breathing, creating subconscious rapport.

**Note**: This is advanced and requires good breath detection from the user's audio.

```typescript
interface BreathSyncState {
  // User breathing pattern
  userBreathRate: number; // Breaths per minute
  userBreathPhase: 'inhale' | 'exhale' | 'pause' | 'unknown';
  userBreathDepth: 'shallow' | 'normal' | 'deep';

  // Sync strategy
  syncEnabled: boolean;
  syncStrength: number; // 0-1, how closely to match

  // Agent breath timing
  nextAgentBreathTime: number;
  agentBreathPattern: 'calm' | 'energized' | 'matched';
}

function calculateBreathSync(
  userBreathing: BreathPatternResult,
  currentSpeech: string
): BreathSyncAdjustments {
  // Find natural speech break points
  const breakPoints = findNaturalBreaks(currentSpeech);

  // Calculate user's breathing rhythm
  const userBreathCycle = 60000 / userBreathing.breathsPerMinute; // ms per breath

  // Insert pauses at break points that align with user's exhale
  const adjustedBreaks: BreakAdjustment[] = [];

  for (const breakPoint of breakPoints) {
    // Check if this break aligns with user's exhale phase
    const alignsWithExhale = wouldAlignWithExhale(breakPoint, userBreathCycle);

    if (alignsWithExhale) {
      adjustedBreaks.push({
        position: breakPoint,
        duration: 150, // Slightly longer pause to sync
        addBreathSound: true,
      });
    }
  }

  return {
    adjustedBreaks,
    overallPacing: calculateSyncedPacing(userBreathCycle),
    breathMarkers: generateBreathMarkers(adjustedBreaks),
  };
}
```

---

#### 4.3 Prosodic Callbacks (`prosodic-callbacks.ts`)

**Purpose**: When referencing something from earlier in the conversation, automatically adjust prosody to match the emotional tone of when it was first discussed.

```typescript
interface ProsodicMemory {
  // Topic -> Prosody mapping
  topicProsody: Map<
    string,
    {
      topic: string;
      originalTurn: number;
      emotion: string;
      prosodyProfile: {
        pitch: string;
        speed: number;
        volume: string;
        warmth: 'high' | 'medium' | 'low';
      };
    }
  >;
}

function applyProsodicCallback(
  response: string,
  referencedTopic: string,
  memory: ProsodicMemory
): string {
  const topicMemory = memory.topicProsody.get(referencedTopic);
  if (!topicMemory) return response;

  // Find the portion of response that references the topic
  const referenceMatch = findTopicReference(response, referencedTopic);
  if (!referenceMatch) return response;

  // Wrap the reference with prosody matching original emotional context
  const { prosodyProfile } = topicMemory;

  const wrappedReference = `
    <prosody pitch="${prosodyProfile.pitch}" rate="${prosodyProfile.speed}">
      ${referenceMatch.text}
    </prosody>
  `;

  return response.replace(referenceMatch.text, wrappedReference);
}
```

---

### Phase 5: Cross-Session Intelligence

#### 5.1 Voice Memory Across Sessions (`cross-session-voice.ts`)

**Purpose**: Remember how the user sounded in previous sessions to detect changes and provide continuity.

```typescript
interface CrossSessionVoiceMemory {
  userId: string;

  // Session snapshots
  sessionSnapshots: Array<{
    sessionId: string;
    date: Date;

    // Voice state at session start
    startingVoice: VoiceSnapshot;

    // Voice state at session end
    endingVoice: VoiceSnapshot;

    // Notable moments
    notableMoments: Array<{
      turn: number;
      description: string;
      voiceState: VoiceSnapshot;
    }>;

    // Overall session voice character
    overallEnergy: number;
    overallValence: number;
    emotionalRange: number;
  }>;

  // Cross-session patterns
  patterns: {
    // Time-based patterns
    morningEnergy: number;
    eveningEnergy: number;
    weekdayMood: number;
    weekendMood: number;

    // Trending
    energyTrend: 'improving' | 'declining' | 'stable';
    moodTrend: 'improving' | 'declining' | 'stable';
    comfortTrend: 'increasing' | 'stable'; // Comfort with agent
  };

  // Significant changes to acknowledge
  significantChanges: Array<{
    type: 'energy' | 'mood' | 'stress' | 'growth';
    description: string;
    detected: Date;
    acknowledged: boolean;
  }>;
}
```

**Cross-Session Acknowledgments**:

```typescript
function generateCrossSessionAcknowledgment(
  currentVoice: VoiceSnapshot,
  memory: CrossSessionVoiceMemory
): string | null {
  const lastSession = memory.sessionSnapshots[memory.sessionSnapshots.length - 1];
  if (!lastSession) return null;

  // Compare to last session
  const energyChange = currentVoice.energy - lastSession.startingVoice.energy;
  const moodChange = currentVoice.valence - lastSession.startingVoice.valence;

  // Generate contextual acknowledgment
  if (energyChange > 0.2) {
    return 'You sound more energized than last time we talked!';
  }

  if (energyChange < -0.2) {
    return 'You sound a bit different today—everything okay?';
  }

  if (moodChange > 0.3) {
    return "There's something lighter in your voice today. Good things happening?";
  }

  if (moodChange < -0.3) {
    return 'I notice your voice sounds heavier than last time. Want to talk about it?';
  }

  // Check for longer-term trends
  if (memory.patterns.energyTrend === 'improving') {
    // Every 5 sessions or so, acknowledge the trend
    if (memory.sessionSnapshots.length % 5 === 0) {
      return "You know, I've noticed over our conversations—you sound more vibrant lately.";
    }
  }

  return null;
}
```

---

## 🧪 Testing Strategy

### Unit Tests

```typescript
describe('Self-Correction System', () => {
  it('should trigger self-correction for complex explanations', () => {
    const context = createTestContext({ wordCount: 75, complexity: 'high' });
    const result = shouldTriggerSelfCorrection(context);
    expect(result.shouldTrigger).toBe(true);
  });

  it('should not trigger for simple responses', () => {
    const context = createTestContext({ wordCount: 15, complexity: 'low' });
    const result = shouldTriggerSelfCorrection(context);
    expect(result.shouldTrigger).toBe(false);
  });

  it('should respect cooldown between triggers', () => {
    const context = createTestContext({
      turnsSinceLastCorrection: 3,
      cooldownTurns: 8,
    });
    const result = shouldTriggerSelfCorrection(context);
    expect(result.shouldTrigger).toBe(false);
  });
});
```

### Integration Tests

```typescript
describe('Humanization Pipeline Integration', () => {
  it('should apply multiple humanization layers in correct order', async () => {
    const rawResponse = 'I think you should consider talking to them directly.';
    const context = createFullContext({
      userEnergy: 'low',
      sessionMinutes: 25,
      turnCount: 15,
    });

    const humanized = await humanizationPipeline.process(rawResponse, context);

    // Should have applied fatigue adjustments
    expect(humanized.appliedFeatures).toContain('vocal_fatigue');

    // Should have maintained user energy matching
    expect(humanized.profile.speed).toBeLessThan(1.0);

    // Shouldn't over-humanize
    expect(humanized.appliedFeatures.length).toBeLessThan(5);
  });
});
```

### A/B Testing Plan

| Feature           | Metric                            | Target |
| ----------------- | --------------------------------- | ------ |
| Self-Correction   | User engagement (response length) | +10%   |
| Vocal Fatigue     | Session duration                  | +15%   |
| Voice Print       | Return session rate               | +20%   |
| Emotional Leading | Sentiment improvement             | +25%   |

---

## 📈 Success Metrics

### Quantitative

- **Session Duration**: Average minutes per session
- **Return Rate**: % users who come back within 7 days
- **Engagement**: Average user words per turn
- **Completion**: % users who complete stated goals
- **NPS**: Net Promoter Score

### Qualitative

- **"Forgot it was AI"**: User feedback indicating they forgot they were talking to AI
- **Emotional attunement**: Users feeling understood
- **Natural conversation flow**: Lack of "robotic" feedback

---

## 🚀 Implementation Order

### Sprint 1 (Week 1-2): Foundation

1. ✅ Self-Correction System
2. ✅ Strategic Disfluencies
3. ✅ Phonetic Mirroring
4. ✅ "Catching Yourself" Moments

### Sprint 2 (Week 3-4): Session Dynamics

1. ✅ Vocal Fatigue Modeling
2. ✅ Session Energy Arc
3. ✅ Comfort Progression

### Sprint 3 (Week 5-6): Advanced Listening

1. ✅ Voice Print Learning
2. ✅ Ambient Sound Awareness
3. ✅ Cadence Learning

### Sprint 4 (Week 7-8): Emotional Leadership

1. ✅ Emotional Leading
2. ✅ Breathing Sync
3. ✅ Prosodic Callbacks

### Sprint 5 (Week 9-10): Cross-Session

1. ✅ Voice Memory Across Sessions
2. ✅ Emotional Baseline Learning
3. ✅ Growth Tracking

---

## 🔧 Technical Dependencies

### Audio Processing

- VAD (Voice Activity Detection)
- Prosody analyzer
- Breath detection
- Ambient sound classifier

### Storage

- Firestore for voice prints
- Firestore for cross-session memory
- Local session state

### TTS Integration

- Cartesia SSML support
- Prosody control
- Break/pause injection

---

## 📚 References

- Our existing humanization systems in `src/conversation/` and `src/speech/`
- `design-system/design-system/docs/brand/BETTER-THAN-HUMAN.md` - Brand philosophy
- `docs/features/VOICE-PRESENCE-ROADMAP.md` - Voice presence features

---

_Last Updated: December 2024_
_Owner: Ferni Engineering_
