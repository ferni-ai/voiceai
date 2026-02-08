# Emotion Event Dispatcher & Better-Than-Human Integration Analysis

**Purpose:** Complete technical analysis of the emotion dispatch system for replicating in Qwen3-Omni path.

**Date:** February 2026  
**Files Analyzed:** 5 core files, 6,937 total lines

---

## Executive Summary

The Emotion Event Dispatcher system bridges backend emotional analysis with frontend avatar expressions. It operates in **three layers**:

1. **Detection Layer** (`turn-handler.ts`) - Analyzes user input, detects emotional states
2. **Dispatch Layer** (`emotion-event-dispatcher.ts`) - Converts analysis to frontend signals
3. **Integration Layer** (`turn-events.ts`) - Orchestrates all event types (emotion, behavior, mood)

The system enables **"Better Than Human"** emotional intelligence through:
- Real-time concern detection (distress awareness)
- Voice-text mismatch detection (protective instinct)
- Emotional trajectory tracking (improving/declining arcs)
- 10 superhuman signal types (spontaneous delight, temporal insight, etc.)

---

## 1. Emotion Event Dispatcher (`emotion-event-dispatcher.ts`)

**File:** `src/agents/realtime/emotion-event-dispatcher.ts`  
**Lines:** 1,533  
**Purpose:** Core dispatcher that sends humanization signals to frontend EQ system

### Key Functions & Signatures

#### Main Dispatch Function

```typescript
async function dispatchEmotionEvents(
  options: EmotionDispatchOptions,
  sendDataMessage: SendDataMessageFn
): Promise<void>
```

**Input:**
- `options.emotionalState`: `EmotionalStateWithMismatch` (primary emotion, intensity, distressLevel, trajectory, mismatch)
- `options.userId`: `string` (required for telemetry)
- `options.personaId`: `string`
- `options.sessionId`: `string` (optional)
- `sendDataMessage`: `(type: string, payload: Record<string, unknown>) => Promise<void>`

**Output:** Sends `humanization_signal` messages via `sendDataMessage`

**Triggers:** Called from `turn-handler.ts` line 864 after emotional analysis completes

---

#### Signal Types Dispatched

The dispatcher sends these signal types (defined in `HumanizationSignalType`):

**Core Signals:**
- `concern_detected` - User distress detected (distressLevel > 0.3)
- `voice_state_detected` - Voice-text mismatch (protective instinct)
- `emotional_trajectory` - Mood trending up/down (improving/declining/volatile)
- `vulnerability` - User sharing vulnerable moment
- `breakthrough` - Significant emotional breakthrough
- `high_engagement` - User highly engaged (excited, intensity > 0.7)
- `disengagement` - User disengaging

**Better Than Human Signals (10 superhuman capabilities):**
- `emotional_bond_deepen` - Relationship strengthening detected
- `protective_instinct` - Sensing user vulnerability, voice-text mismatch
- `spontaneous_delight` - User shares joy/achievement
- `inside_joke_callback` - Referencing shared humor from memory
- `superhuman_observation` - Pattern surfacing ("I've noticed over weeks...")
- `visible_vulnerability` - Ferni expressing uncertainty/doubt (humanizing)
- `temporal_insight` - Cross-session comparison ("Last month you...")
- `meta_relationship_moment` - Commentary on the relationship itself
- `somatic_presence` - Breathing/settling/grounding cues
- `anticipatory_presence` - Time-of-day awareness (2am check-in, Monday blues)

---

#### Specific Dispatch Functions

**1. Concern Detection** (Lines 189-208)
```typescript
// Auto-dispatched when distressLevel >= 0.3
await sendDataMessage('humanization_signal', {
  signalType: 'concern_detected',
  concernLevel: 'none' | 'mild' | 'moderate' | 'elevated' | 'crisis',
  concernType: string, // e.g., 'sadness', 'anxiety', 'stress'
  intensity: number, // 0-1
  timestamp: number
});
```

**2. Voice-Text Mismatch** (Lines 213-230)
```typescript
// Dispatched when mismatch.hasMismatch && mismatch.confidence > 0.5
await sendDataMessage('humanization_signal', {
  signalType: 'voice_state_detected',
  voiceState: string, // e.g., 'masking_negative', 'suppressing_emotion'
  intensity: number,
  mismatchType: string,
  concernLevel?: string, // If also distressed
  timestamp: number
});
```

**3. Emotional Trajectory** (Lines 235-270)
```typescript
// Maps trajectory: improving → de_escalating, declining → escalating
await sendDataMessage('humanization_signal', {
  signalType: 'emotional_trajectory',
  emotionalTrajectory: 'de_escalating' | 'escalating' | 'volatile',
  intensity: number,
  concernLevel?: string, // For declining trajectory
  timestamp: number
});
```

**4. Holistic NLU Events** (Lines 382-483)
```typescript
async function dispatchHolisticEvents(
  options: HolisticDispatchOptions,
  sendDataMessage: SendDataMessageFn
): Promise<void>
```

**Input:**
- `holisticContext`: `HolisticContextSummary` (emotionType, sentiment, isCrisis, urgency, relationshipType, relationshipSentiment, isCompoundIntent)

**Purpose:** Dispatches signals BEFORE LLM runs, enabling anticipatory avatar responses

**Dispatches:**
- Crisis detection (highest priority, `concernLevel: 'crisis'`)
- Emotion signals (mapped to concern or engagement)
- Relationship warmth (for personal relationships)
- Compound intent (active listening)

---

#### Expression Update Dispatch

**Function:** `dispatchExpressionUpdate` (Lines 676-715)

```typescript
async function dispatchExpressionUpdate(
  options: ExpressionDispatchOptions,
  sendDataMessage: SendDataMessageFn
): Promise<void>
```

**Input:**
- `expression?`: `LuxoExpressionId` (direct expression: 'joyful', 'concerned', etc.)
- `emotion?`: `string` (primary emotion: 'happy', 'sad', etc.)
- `intensity?`: `number` (0-1, default 0.7)
- `duration?`: `number` (ms, default 300)
- `hold?`: `number` (ms, default 0)
- `concernLevel?`: `'none' | 'mild' | 'moderate' | 'elevated' | 'crisis'`

**Output:** Sends `expression_update` message:
```typescript
{
  type: 'expression_update',
  expression: LuxoExpressionId, // One of 100+ expressions
  intensity: number,
  duration: number,
  hold: number,
  timestamp: number
}
```

**Emotion → Expression Mapping:** Lines 576-603 define `EMOTION_TO_EXPRESSION` mapping:
- `happy` → `['happy', 'joyful', 'pleased']`
- `sad` → `['concerned', 'sympathetic', 'comforting']`
- `anxious` → `['supportive', 'calm', 'grounded']`
- etc.

---

#### Better Than Human Signal Dispatchers

**1. Spontaneous Delight** (Lines 886-917)
```typescript
async function dispatchSpontaneousDelight(
  sendDataMessage: SendDataMessageFn,
  context: { trigger: string; intensity?: number },
  telemetryCtx?: BTHTelemetryContext
): Promise<void>
```

**Triggers:** When user shares good news/achievement (detected via `detectUserDelightWithContext`)

**Also dispatches:** `micro_expression` with type `'delight_flash'`

---

**2. Protective Instinct** (Lines 854-879)
```typescript
async function dispatchProtectiveInstinct(
  sendDataMessage: SendDataMessageFn,
  context: {
    mismatchType?: string;
    voiceEmotion?: string;
    textEmotion?: string;
    intensity?: number;
  }
): Promise<void>
```

**Triggers:** Voice-text mismatch detected (user says "I'm fine" but voice sounds sad)

---

**3. Temporal Insight** (Lines 1044-1070)
```typescript
async function dispatchTemporalInsight(
  sendDataMessage: SendDataMessageFn,
  context: { memoryReference: string; timeSpan?: string; intensity?: number },
  telemetryCtx?: BTHTelemetryContext
): Promise<void>
```

**Triggers:** When Ferni references past sessions ("Last month you mentioned...")

**Also dispatches:** `micro_expression` with type `'memory_spark'`

---

**4. Visible Vulnerability** (Lines 1014-1036)
```typescript
async function dispatchVisibleVulnerability(
  sendDataMessage: SendDataMessageFn,
  context: {
    vulnerabilityType: 'uncertainty' | 'admission' | 'reflection' | 'growth';
    intensity?: number;
  }
): Promise<void>
```

**Triggers:** When Ferni's response contains uncertainty ("I'm not sure...", "I might be wrong...")

---

**5. Micro-Expression Dispatch** (Lines 795-822)
```typescript
async function dispatchMicroExpression(
  expressionType: MicroExpressionType,
  sendDataMessage: SendDataMessageFn,
  intensity = 0.7,
  telemetryCtx?: BTHTelemetryContext
): Promise<void>
```

**Micro-expression types:** `'recognition'`, `'concern_flash'`, `'delight_flash'`, `'warmth_pulse'`, `'memory_spark'`, etc. (Lines 758-784)

**Output:** Sends `micro_expression` message:
```typescript
{
  type: 'micro_expression',
  expressionType: MicroExpressionType,
  intensity: number,
  timestamp: number
}
```

---

### Detection Helpers

**1. Delight Detection** (Lines 1268-1333)
```typescript
function detectUserDelightWithContext(
  userMessage: string,
  emotionalContext?: { sentiment?: 'positive' | 'negative' | 'neutral'; intensity?: number }
): DelightDetectionResult
```

**Returns:**
- `detected: boolean`
- `confidence: number` (0-1)
- `rejectionReason?: 'sarcasm' | 'third_person' | 'negative_context' | 'no_match'`
- `trigger?: string` (matched pattern)

**Patterns:** Lines 1174-1182 define `DELIGHT_PATTERNS` (e.g., "I got the job", "Great news", "Guess what!")

**Filters:** Lines 1188-1203 filter out sarcasm and third-person references

---

**2. Vulnerability Detection** (Lines 1407-1463)
```typescript
function detectVulnerabilityWithContext(
  ferniResponse: string,
  userTopic?: string
): VulnerabilityDetectionResult
```

**Returns:**
- `detected: boolean`
- `type: 'uncertainty' | 'admission' | 'reflection' | 'growth'`
- `confidence: number`
- `isEmotional: boolean` (vs technical "I don't know")
- `rejectionReason?: 'technical_context' | 'no_match'`

**Distinguishes:** Technical uncertainty (ignore) vs emotional vulnerability (trigger)

---

### Public API Summary

**Exported Functions:**
- `dispatchEmotionEvents()` - Main emotion dispatch
- `dispatchHolisticEvents()` - Pre-LLM holistic context dispatch
- `dispatchExpressionUpdate()` - Luxo expression updates
- `dispatchEmotionWithExpression()` - Combined emotion + expression
- `dispatchMicroExpression()` - Micro-expression dispatcher
- `dispatchSpontaneousDelight()` - BTH delight signal
- `dispatchProtectiveInstinct()` - BTH protective signal
- `dispatchTemporalInsight()` - BTH temporal signal
- `dispatchVisibleVulnerability()` - BTH vulnerability signal
- `dispatchEmotionalBondDeepen()` - BTH bond signal
- `dispatchMetaRelationshipMoment()` - BTH meta-relationship signal
- `dispatchSomaticPresence()` - BTH somatic signal
- `dispatchAnticipatoryPresence()` - BTH time-awareness signal
- `dispatchSuperhumanObservation()` - BTH pattern surfacing
- `dispatchInsideJokeCallback()` - BTH memory callback
- `detectUserDelightWithContext()` - Delight detection helper
- `detectVulnerabilityWithContext()` - Vulnerability detection helper
- `detectMetaRelationship()` - Meta-relationship detection
- `detectTemporalInsight()` - Temporal insight detection
- `getTimeContext()` - Time context helper

---

## 2. Better-Than-Human Integration (`better-than-human-integration.ts`)

**File:** `src/agents/integrations/better-than-human-integration.ts`  
**Lines:** 1,837  
**Purpose:** Integrates ALL superhuman services with the voice pipeline

### Key Functions & Signatures

#### Session Lifecycle

**1. Load Profiles** (Lines 289-326)
```typescript
async function loadBetterThanHumanProfiles(userId: string): Promise<void>
```

**Purpose:** Loads all BTH profiles at session start (Original 10 + Enhanced 9 capabilities)

**Called from:** `session-init-handler.ts` (session initialization)

**Loads in parallel:**
- Commitment Keeper context
- Capacity Guardian context
- Values Alignment context
- Dream Keeper context
- Life Narrative context
- Relationship Network context
- Seasonal Awareness context
- Silence Interpreter context
- Contradiction Comfort context
- Perfect Timing context
- Pattern Mirror context
- First-Time Vulnerability context
- Linguistic Mirroring context

---

#### Transcript Processing

**2. Process Transcript** (Lines 494-615)
```typescript
async function processTranscriptForBetterThanHuman(
  input: TranscriptInput,
  ctx: SessionContext
): Promise<{
  vulnerability?: { isFirstTime: boolean; category: string; level: number };
  contradiction?: { detected: boolean; emotions: string[] };
  patterns?: { insights: string[] };
}>
```

**Input:**
- `input.transcript`: `string` (final transcript)
- `input.isFinal`: `boolean`
- `input.emotion?`: `string`
- `input.emotionIntensity?`: `number`
- `input.topic?`: `string`
- `input.recentEmotions?`: `string[]`
- `ctx.userId`: `string`
- `ctx.sessionId`: `string`
- `ctx.personaId`: `string`
- `ctx.turnCount`: `number`

**Output:**
- `vulnerability` - First-time vulnerability detection
- `contradiction` - Emotional contradiction detection
- `patterns` - Pattern insights to surface

**Called from:** `transcript-handler.ts` on final transcripts

**Detects:**
- First-time vulnerability (via `detectFirstTimeVulnerability`)
- Emotional contradictions (via `detectContradiction`)
- Patterns to surface (via `getPatternToSurface`)
- Linguistic patterns (via `recordLinguisticPatterns`)

---

#### Voice Processing

**3. Process Voice Prosody** (Lines 403-439)
```typescript
function processVoiceProsody(
  input: VoiceAnalysisInput,
  ctx: SessionContext,
  currentTopic?: string
): void
```

**Input:**
- `input.energy`: `number`
- `input.stressLevel`: `number`
- `input.speechRate?`: `number`
- `input.pitchVariance?`: `number`
- `input.valence?`: `number`
- `ctx.userId`: `string`
- `currentTopic?`: `string`

**Purpose:** Records topic energy for Pattern Mirror (tracks which topics energize/drain user)

**Called from:** `audio-processor.ts` when voice emotion is analyzed

---

**4. Process Voice Biomarkers** (Lines 710-748)
```typescript
async function processVoiceBiomarkers(
  userId: string,
  sessionId: string,
  input: BiomarkerInput
): Promise<VoiceBiomarkers | null>
```

**Input:**
- `input.speechRate`: `number`
- `input.pauseFrequency`: `number`
- `input.voiceStrain`: `number`
- `input.fatigueIndicators`: `number[]`

**Output:** `VoiceBiomarkers` with:
- `fatigueLevel`: `number` (0-1)
- `illnessRisk`: `number` (0-1)
- `stressTrajectory`: `'rising' | 'stable' | 'falling'`

**Purpose:** Wellness detection from voice signals

---

#### Context Building

**5. Build BTH Context** (Lines 659-698)
```typescript
async function buildBetterThanHumanContext(userId: string): Promise<string>
```

**Purpose:** Builds combined BTH context string for LLM injection

**Returns:** Formatted context string with all BTH capabilities:
```
### Better Than Human Intelligence
[Commitment Keeper context]
[Capacity Guardian context]
[Values Alignment context]
...
```

**Called from:** Context builders during turn processing

---

#### Original 10 Processing

**6. Process Original 10** (Lines 1410-1488)
```typescript
async function processOriginal10ForTurn(
  userId: string,
  sessionId: string,
  transcript: string,
  options?: {
    topic?: string;
    emotion?: string;
    voiceSignals?: { emotion?: string; arousal?: number; speechRate?: number };
  }
): Promise<{
  commitment?: CommitmentDetectionResult | null;
  energy?: { level: EnergyLevel; score: number } | null;
  value?: { category: string; statement: string } | null;
  dream?: { type: string; summary: string } | null;
  chapter?: { type: string; significance: number } | null;
  person?: { name: string; relationship: string } | null;
  season?: Season;
}>
```

**Purpose:** Runs all Original 10 detections in parallel for comprehensive analysis

**Detections:**
1. Commitment detection (`processCommitmentDetection`)
2. Energy detection (`processEnergyDetection`)
3. Values detection (`processValuesDetection`)
4. Dream detection (`processDreamDetection`)
5. Narrative moment (`processNarrativeMoment`)
6. Relationship mention (`processRelationshipMention`)
7. Seasonal awareness (`processSeasonalAwareness`)

**Called from:** `turn-processor.ts` for comprehensive detection

---

### Public API Summary

**Exported Object:** `betterThanHumanIntegration` (Lines 1750-1837)

**Lifecycle:**
- `loadProfiles()` - Load BTH profiles at session start

**Silence:**
- `processSilence()` - Analyze silence with interpreter
- `recordSilenceOutcome()` - Record silence outcome

**Voice:**
- `detectReceptivity()` - Detect voice receptivity
- `processVoiceProsody()` - Process voice prosody
- `recordConversationTiming()` - Record timing learning
- `checkTopicTiming()` - Check if good time for topic
- `processVoiceBiomarkers()` - Process voice biomarkers

**Transcript:**
- `processTranscript()` - Process transcript for BTH

**Ambient:**
- `processAmbientSignals()` - Process ambient context

**Context:**
- `buildContext()` - Build BTH context string

**Original 10:**
- `processCommitment()` - Commitment detection
- `getCommitmentFollowUps()` - Get follow-ups
- `processEnergy()` - Energy detection
- `processValues()` - Values detection
- `processDream()` - Dream detection
- `processNarrative()` - Narrative moment
- `processRelationship()` - Relationship mention
- `processSeasonal()` - Seasonal awareness
- `processOriginal10()` - Combined processing

**V2 BTH:**
- `recordMood()` - Record mood
- `getMoodPrediction()` - Get mood prediction
- `recordSocialInteraction()` - Record social event
- `getSocialBatteryStatus()` - Get battery status
- `recordConflict()` - Record conflict
- `getConflictResolution()` - Get conflict recommendations
- `recordBoundary()` - Record boundary
- `inferBoundary()` - Infer boundary from reaction
- `getEventPrepCoaching()` - Get calendar prep
- `startRecoveryTracking()` - Start recovery tracking
- `getActiveRecoveries()` - Get active recoveries
- `detectSharedMoment()` - Detect shared moment

**Resonance:**
- `queueResonanceCheck()` - Queue resonance check
- `getNextResonanceCheck()` - Get next check
- `recordResonanceResponse()` - Record response
- `classifyResonanceResponse()` - Classify response
- `cleanupResonanceQueue()` - Cleanup queue
- `getPendingResonanceCheck()` - Get pending check
- `processUserResponseForResonance()` - Process response

---

## 3. Turn Handler (`turn-handler.ts`)

**File:** `src/agents/voice-agent/turn-handler.ts`  
**Lines:** 2,621  
**Purpose:** Orchestrates turn processing, integrates emotion dispatch

### Integration Points

#### 1. Emotion Dispatch (Lines 857-939)

**Location:** After emotional analysis completes (line 863)

**Code:**
```typescript
if (result.emotional) {
  // Main emotion dispatch
  void dispatchEmotionEvents(
    {
      emotionalState: result.emotional,
      userId: services.userId || 'anonymous',
      personaId: persona.id,
      sessionId: services.sessionId,
    },
    sendDataMessage
  ).catch((e) => {
    diag.debug('Emotion dispatch failed (non-critical)', { error: String(e) });
  });

  // Expression update
  void dispatchExpressionUpdate(
    {
      emotion: result.emotional.primary || 'neutral',
      intensity: result.emotional.intensity ?? 0.5,
    },
    sendDataMessage
  ).catch((e) => {
    diag.debug('Expression dispatch failed (non-critical)', { error: String(e) });
  });

  // Spontaneous delight detection
  const delightResult = detectUserDelightWithContext(userText, {
    sentiment: result.emotional.distressLevel > 0.5 ? 'negative' : 'positive',
    intensity: result.emotional.intensity,
  });

  if (delightResult.detected && delightResult.confidence > 0.7) {
    fireAndForget(async () => {
      await dispatchSpontaneousDelight(sendDataMessage, {
        trigger: delightResult.trigger || 'user_achievement',
        intensity: Math.min(delightResult.confidence, result.emotional.intensity ?? 0.8),
      });
    }, 'bth-spontaneous-delight');
  }

  // Emotional bond deepen
  const isGratitude = /thank(s| you)|grateful|appreciate/i.test(userText);
  const isVulnerable = result.emotional.distressLevel > 0.4 || /i('m| am) (scared|afraid|worried)/i.test(userText);
  if (isGratitude || isVulnerable) {
    fireAndForget(async () => {
      await dispatchEmotionalBondDeepen(sendDataMessage, {
        trigger: isGratitude ? 'gratitude_expressed' : 'vulnerability_shared',
        intensity: isVulnerable ? 0.85 : 0.7,
        relationshipContext: isGratitude ? 'gratitude' : 'vulnerability',
      });
      await dispatchMicroExpression('warmth_pulse', sendDataMessage, 0.75);
    }, 'bth-emotional-bond');
  }

  // Meta-relationship moment
  if (detectMetaRelationship(userText)) {
    fireAndForget(async () => {
      await dispatchMetaRelationshipMoment(sendDataMessage, {
        relationshipContext: 'user_reflection',
        intensity: 0.75,
      });
    }, 'bth-meta-relationship');
  }
}
```

**Input Data:**
- `result.emotional`: `EmotionalState` from turn processing
  - `primary`: `string` (emotion name)
  - `intensity`: `number` (0-1)
  - `distressLevel`: `number` (0-1)
  - `trajectory?`: `string` ('improving' | 'declining' | 'volatile')
- `userText`: `string` (user's transcript)
- `services.userId`: `string`
- `persona.id`: `string`
- `services.sessionId`: `string`
- `sendDataMessage`: `(type: string, payload: Record<string, unknown>) => Promise<void>`

**Output:** Multiple `humanization_signal` and `expression_update` messages sent to frontend

---

#### 2. Personality Processing (Lines 1700-1795)

**Location:** After context building, before LLM call

**Code:**
```typescript
const personalityCtx: PersonalityContext = {
  sessionId: services.sessionId,
  userId: services.userId ?? null,
  personaId: persona.id,
  turnCount: userData.turnCount ?? 0,
  userText,
  userData,
  voiceEmotion: ctx.voiceEmotion,
  emotionalResult: result.emotional,
  humanizingResult: result.context.humanizingResult,
  analysisResult: result.analysis?.analysis,
  injections: result.context.injections,
  sessionStateManager,
};

const personalityResult = await processPersonality(personalityCtx);

if (personalityResult.shouldInject && personalityResult.injectionContent) {
  result.context.injections.push({
    category: 'personality',
    content: personalityResult.injectionContent,
    priority: 75,
  });
}
```

**Input Data:**
- `personalityCtx`: `PersonalityContext` (see `turn-personality.ts` types)
- `result.emotional`: Emotional analysis result
- `result.context.humanizingResult`: Humanization result (mood, relationship)
- `result.analysis?.analysis`: Intent/topic analysis
- `result.context.injections`: Context injections array

**Output:** Personality injection added to `result.context.injections` if `shouldInject === true`

---

#### 3. Event Dispatch (Lines 2080-2093)

**Location:** After LLM response, before learning recording

**Code:**
```typescript
const eventCtx: EventDispatchContext = {
  userId: services.userId ?? null,
  personaId: persona.id,
  sessionId: services.sessionId,
  turnCount: userData.turnCount ?? 0,
  emotionalResult: result.emotional,
  humanizingResult: result.context.humanizingResult,
  injections: result.context.injections,
  sessionStateManager,
  sendDataMessage,
  turnCtx,
};

await dispatchAllTurnEvents(eventCtx);
```

**Input Data:**
- `eventCtx`: `EventDispatchContext` (see `turn-events.ts` types)
- `result.emotional`: Final emotional state
- `result.context.humanizingResult`: Final humanization result
- `result.context.injections`: All context injections
- `sessionStateManager`: Session state manager
- `sendDataMessage`: Data message function
- `turnCtx`: LLM chat context

**Output:** Dispatches emotion, behavior, and mood events via `dispatchAllTurnEvents()`

---

### Data Flow Summary

```
User Speech
  ↓
Turn Processing (turn-processor.ts)
  ↓
Emotional Analysis (result.emotional)
  ↓
[Line 864] dispatchEmotionEvents() ──→ Frontend (humanization_signal)
  ↓
[Line 881] dispatchExpressionUpdate() ──→ Frontend (expression_update)
  ↓
[Line 896] detectUserDelightWithContext() ──→ dispatchSpontaneousDelight()
  ↓
[Line 925] Gratitude/Vulnerability Detection ──→ dispatchEmotionalBondDeepen()
  ↓
[Line 946] Meta-Relationship Detection ──→ dispatchMetaRelationshipMoment()
  ↓
[Line 1710] processPersonality() ──→ Personality injection
  ↓
LLM Call (with personality injection)
  ↓
[Line 2093] dispatchAllTurnEvents() ──→ Frontend (emotion, behavior, mood)
```

---

## 4. Turn Events (`turn-events.ts`)

**File:** `src/agents/voice-agent/turn-events.ts`  
**Lines:** 297  
**Purpose:** Orchestrates all event dispatch types (emotion, behavior, mood)

### Key Functions & Signatures

#### Main Dispatch Function

**1. Dispatch All Turn Events** (Lines 283-297)
```typescript
async function dispatchAllTurnEvents(
  ctx: EventDispatchContext
): Promise<EventDispatchResult>
```

**Input:**
- `ctx.userId`: `string | null`
- `ctx.personaId`: `string`
- `ctx.sessionId`: `string`
- `ctx.turnCount`: `number`
- `ctx.emotionalResult`: `{ primary: string; intensity: number; distressLevel: number; trajectory?: string }`
- `ctx.humanizingResult`: `{ mood?: { state?: string; energyLevel?: number }; relationship?: { stage?: string } }`
- `ctx.injections`: `Array<{ category: string; content: string }>`
- `ctx.sessionStateManager`: `SessionStateManager` (optional)
- `ctx.sendDataMessage`: `(type: string, payload: Record<string, unknown>) => Promise<void>`
- `ctx.turnCtx`: `llm.ChatContext`

**Output:**
```typescript
{
  emotionEventsDispatched: number,
  behaviorEventsDispatched: number,
  moodUpdateSent: boolean
}
```

**Calls in parallel:**
- `dispatchTurnEmotionEvents()` - Emotion events
- `dispatchTurnBehaviorEvents()` - Behavior events
- `sendMoodUpdate()` - Mood update

---

#### Emotion Event Dispatch

**2. Dispatch Turn Emotion Events** (Lines 87-138)
```typescript
async function dispatchTurnEmotionEvents(ctx: EventDispatchContext): Promise<number>
```

**Purpose:** Dispatches emotion events to frontend EQ system

**Calls:**
- `dispatchEmotionEvents()` from `emotion-event-dispatcher.ts`
- `dispatchExpressionUpdate()` from `emotion-event-dispatcher.ts`

**Maps trajectory:** Lines 96-109 map trajectory values:
- `improving` → `'improving'`
- `declining` → `'declining'`
- `volatile` → `'volatile'`
- `rising` → `'improving'`
- `falling` → `'declining'`

**Returns:** Number of emotion events dispatched (0 or 1)

---

#### Behavior Event Dispatch

**3. Dispatch Turn Behavior Events** (Lines 192-246)
```typescript
async function dispatchTurnBehaviorEvents(ctx: EventDispatchContext): Promise<number>
```

**Purpose:** Dispatches behavior events to both LLM context and frontend

**Calls:**
- `buildBehaviorContext()` - Builds behavior detection context
- `dispatchBehaviorEvents()` from `behavior-event-dispatcher.ts`

**Injects into LLM:** Lines 199-201 inject behavior events into `turnCtx`:
```typescript
dispatchBehaviorEvents(behaviorContext, (role, content) => {
  ctx.turnCtx.addMessage({ role, content });
});
```

**Emits to Frontend:** Lines 210-238 emit `behavior_signal` messages:
- `mode_shift` - Mode change signal
- `pacing_change` - Pacing change signal

**Returns:** Number of behavior events dispatched

---

#### Mood Update Dispatch

**4. Send Mood Update** (Lines 255-272)
```typescript
async function sendMoodUpdate(ctx: EventDispatchContext): Promise<boolean>
```

**Purpose:** Sends mood update to frontend

**Output:** Sends `mood` message:
```typescript
{
  type: 'mood',
  state: string, // Mood state
  energyLevel: number, // Energy level
  relationshipStage: string, // Relationship stage
  hasTransition: boolean // Whether relationship transition occurred
}
```

**Returns:** `true` if sent, `false` if no humanizing result

---

### Public API Summary

**Exported Functions:**
- `dispatchAllTurnEvents()` - Main entry point
- `dispatchTurnEmotionEvents()` - Emotion events only
- `dispatchTurnBehaviorEvents()` - Behavior events only
- `sendMoodUpdate()` - Mood update only
- `buildBehaviorContext()` - Build behavior context

**Exported Types:**
- `EventDispatchContext` - Context for event dispatch
- `EventDispatchResult` - Result of event dispatch

---

## 5. Turn Personality (`turn-personality.ts`)

**File:** `src/agents/voice-agent/turn-personality.ts`  
**Lines:** 649  
**Purpose:** Handles "Better Than Human" personality system integration for turns

### Key Functions & Signatures

#### Main Processing Function

**1. Process Personality** (Lines 643-649)
```typescript
async function processPersonality(
  ctx: PersonalityContext
): Promise<PersonalityProcessingResult>
```

**Purpose:** Routes to appropriate personality system based on persona

**Routing:**
- All personas → `processSharedPersonality()` (uses "Better Than Human" system)
- Ferni fallback → `processFerniPersonality()` (if shared system fails)

**Input:**
- `ctx.sessionId`: `string`
- `ctx.userId`: `string | null`
- `ctx.personaId`: `string`
- `ctx.turnCount`: `number`
- `ctx.userText`: `string`
- `ctx.userData`: `{ speechRateWPM?, pauseBeforeMs?, totalConversations?, sharedVulnerabilities?, relationshipStage? }`
- `ctx.voiceEmotion?`: `{ primary: string; confidence: number; arousal?: number; valence?: number }`
- `ctx.emotionalResult`: `{ primary: string; intensity: number; distressLevel: number; trajectory?: string }`
- `ctx.humanizingResult?`: `{ mood?: { state?: string; energyLevel?: number }; relationship?: { stage?: string } }`
- `ctx.analysisResult?`: `{ intent?: { primary?: string }; topics?: { detected?: string[] }; currentTopic?: string }`
- `ctx.injections`: `Array<{ category: string; content: string; priority?: number }>`
- `ctx.sessionStateManager?`: `{ getState: () => { conversation: { recentTopics: string[] } } }`

**Output:**
```typescript
{
  shouldInject: boolean,
  injectionContent: string | undefined,
  behaviorEvent?: BehaviorEvent,
  personalityResult: PersonalityTurnResult | PersonaTurnResult | null
}
```

**Called from:** `turn-handler.ts` line 1710

---

#### Ferni-Specific Processing

**2. Process Ferni Personality** (Lines 272-396)
```typescript
async function processFerniPersonality(
  ctx: PersonalityContext
): Promise<PersonalityProcessingResult>
```

**Purpose:** Processes Ferni-specific personality (fallback path)

**Calls:** `ferniPersonality.processTurn()` from `personas/bundles/ferni/personality-integration.ts`

**Input:** Same as `processPersonality()`

**Output:** Same as `processPersonality()`

**Note:** This is a fallback path. Most personas use the shared "Better Than Human" system.

---

#### Shared Personality Processing

**3. Process Shared Personality** (Lines 408-511)
```typescript
async function processSharedPersonality(
  ctx: PersonalityContext
): Promise<PersonalityProcessingResult>
```

**Purpose:** Processes shared personality for all personas (Maya, Jordan, Peter, Alex, Nayan)

**Routing:**
- If persona has building blocks → `processBetterThanHumanPersonality()`
- Else → `legacySharedPersonality.processTurn()`

**Input:** Same as `processPersonality()`

**Output:** Same as `processPersonality()`

---

#### Better Than Human Personality Processing

**4. Process Better Than Human Personality** (Lines 522-629)
```typescript
async function processBetterThanHumanPersonality(
  ctx: PersonalityContext
): Promise<PersonalityProcessingResult>
```

**Purpose:** Full "Better Than Human" personality system with:
- 8-dimensional context sensing
- Real-time noticing (pauses, energy shifts, topic deflection)
- Cross-session resonance learning
- Dynamic expression composition

**Calls:** `betterThanHumanPersonality.processTurn()` from `personas/shared/shared-personality-integration.ts`

**Input:** Same as `processPersonality()`

**Output:** Same as `processPersonality()`

**Features:**
- Noticing guidance (acknowledges pauses, energy shifts, topic deflection)
- Expression guidance (persona-specific expressions based on building blocks)
- Resonance learning (learns from previous expressions)

---

### State Tracking

**5. Turn History Tracking** (Lines 108-152)

**Functions:**
- `recordTurnHistory()` - Records turn for pattern detection
- `getTurnHistory()` - Gets turn history for session
- `getPreviousExpression()` - Gets previous expression for resonance learning
- `storePreviousExpression()` - Stores expression for next turn

**Purpose:** Tracks cross-turn patterns for personality emergence

**Data Structure:**
```typescript
interface TurnHistory {
  userTranscript: string;
  speechRate?: number;
  pauseBefore?: number;
  voiceEmotion?: string;
  topics?: string[];
  timestamp: number;
}
```

**Storage:** `Map<string, TurnHistory[]>` keyed by `sessionId` (max 10 turns per session)

---

### Cleanup

**6. Cleanup Personality State** (Lines 155-161)
```typescript
function cleanupPersonalityState(sessionId: string, userId?: string): void
```

**Purpose:** Cleans up session-scoped personality state

**Cleans:**
- Previous expressions map
- Turn histories map
- Ferni personality state
- Shared personality state

**Called from:** Session cleanup handlers

---

### Public API Summary

**Exported Functions:**
- `processPersonality()` - Main entry point
- `processFerniPersonality()` - Ferni-specific (fallback)
- `processSharedPersonality()` - Shared personality
- `getPreviousExpression()` - Get previous expression
- `storePreviousExpression()` - Store expression
- `recordTurnHistory()` - Record turn
- `getTurnHistory()` - Get turn history
- `cleanupPersonalityState()` - Cleanup state

**Exported Types:**
- `PersonalityContext` - Context for personality processing
- `PersonalityProcessingResult` - Result of personality processing

---

## Integration Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    TURN HANDLER (turn-handler.ts)              │
│                                                                 │
│  1. User Speech → Turn Processing                              │
│  2. Emotional Analysis (result.emotional)                      │
│  3. [Line 864] dispatchEmotionEvents()                         │
│     └─→ emotion-event-dispatcher.ts                            │
│         ├─→ concern_detected (if distressLevel >= 0.3)         │
│         ├─→ voice_state_detected (if mismatch)                │
│         └─→ emotional_trajectory (if trajectory)               │
│                                                                 │
│  4. [Line 881] dispatchExpressionUpdate()                      │
│     └─→ emotion-event-dispatcher.ts                            │
│         └─→ expression_update (Luxo expression)                │
│                                                                 │
│  5. [Line 896] detectUserDelightWithContext()                  │
│     └─→ dispatchSpontaneousDelight() (if detected)            │
│                                                                 │
│  6. [Line 1710] processPersonality()                           │
│     └─→ turn-personality.ts                                    │
│         └─→ betterThanHumanPersonality.processTurn()           │
│             └─→ Personality injection added to context        │
│                                                                 │
│  7. LLM Call (with personality injection)                      │
│                                                                 │
│  8. [Line 2093] dispatchAllTurnEvents()                        │
│     └─→ turn-events.ts                                         │
│         ├─→ dispatchTurnEmotionEvents()                        │
│         ├─→ dispatchTurnBehaviorEvents()                       │
│         └─→ sendMoodUpdate()                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (better-than-human.ui.ts)           │
│                                                                 │
│  Receives:                                                      │
│  - humanization_signal (concern, trajectory, etc.)             │
│  - expression_update (Luxo expressions)                         │
│  - micro_expression (subliminal flashes)                        │
│  - behavior_signal (mode shifts, pacing)                       │
│  - mood (mood state, energy level)                             │
│                                                                 │
│  Responds with:                                                 │
│  - Avatar expressions                                            │
│  - Micro-expressions (40-150ms)                                 │
│  - Concern mode                                                 │
│  - Active listening animations                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Integration Points for Qwen3-Omni

### Required Inputs

1. **Emotional State** (from turn processing):
   ```typescript
   {
     primary: string,        // Emotion name ('happy', 'sad', etc.)
     intensity: number,      // 0-1
     distressLevel: number,  // 0-1
     trajectory?: string,   // 'improving' | 'declining' | 'volatile'
     mismatch?: {            // Voice-text mismatch
       hasMismatch: boolean,
       type: string,
       confidence: number,
       voiceEmotion?: string,
       textEmotion?: string
     }
   }
   ```

2. **User Context**:
   ```typescript
   {
     userId: string,
     personaId: string,
     sessionId: string,
     turnCount: number
   }
   ```

3. **Send Data Message Function**:
   ```typescript
   (type: string, payload: Record<string, unknown>) => Promise<void>
   ```

### Required Calls

1. **After Emotional Analysis**:
   ```typescript
   await dispatchEmotionEvents(
     {
       emotionalState: emotionalState,
       userId: userId,
       personaId: personaId,
       sessionId: sessionId,
     },
     sendDataMessage
   );
   ```

2. **After Expression Detection**:
   ```typescript
   await dispatchExpressionUpdate(
     {
       emotion: emotionalState.primary || 'neutral',
       intensity: emotionalState.intensity ?? 0.5,
     },
     sendDataMessage
   );
   ```

3. **After Turn Complete**:
   ```typescript
   await dispatchAllTurnEvents({
     userId: userId,
     personaId: personaId,
     sessionId: sessionId,
     turnCount: turnCount,
     emotionalResult: emotionalState,
     humanizingResult: humanizingResult,
     injections: injections,
     sessionStateManager: sessionStateManager,
     sendDataMessage: sendDataMessage,
     turnCtx: turnCtx,
   });
   ```

### Optional Enhancements

1. **Delight Detection**:
   ```typescript
   const delightResult = detectUserDelightWithContext(userText, {
     sentiment: emotionalState.distressLevel > 0.5 ? 'negative' : 'positive',
     intensity: emotionalState.intensity,
   });
   if (delightResult.detected && delightResult.confidence > 0.7) {
     await dispatchSpontaneousDelight(sendDataMessage, {
       trigger: delightResult.trigger || 'user_achievement',
       intensity: delightResult.confidence,
     });
   }
   ```

2. **Vulnerability Detection**:
   ```typescript
   const vulnerabilityResult = detectVulnerabilityWithContext(ferniResponse, userTopic);
   if (vulnerabilityResult.detected && vulnerabilityResult.isEmotional) {
     await dispatchVisibleVulnerability(sendDataMessage, {
       vulnerabilityType: vulnerabilityResult.type,
       intensity: vulnerabilityResult.confidence,
     });
   }
   ```

3. **Temporal Insight Detection**:
   ```typescript
   if (detectTemporalInsight(ferniResponse)) {
     await dispatchTemporalInsight(sendDataMessage, {
       memoryReference: extractMemoryReference(ferniResponse),
       intensity: 0.8,
     });
   }
   ```

---

## File Line Counts Summary

| File | Lines | Purpose |
|------|-------|---------|
| `emotion-event-dispatcher.ts` | 1,533 | Core dispatcher, signal types, detection helpers |
| `better-than-human-integration.ts` | 1,837 | BTH service integration, transcript/voice processing |
| `turn-handler.ts` | 2,621 | Main turn orchestration, integration points |
| `turn-events.ts` | 297 | Event dispatch orchestration |
| `turn-personality.ts` | 649 | Personality system integration |
| **Total** | **6,937** | Complete emotion dispatch system |

---

## Essential Files for Understanding

**Core Dispatcher:**
- `src/agents/realtime/emotion-event-dispatcher.ts` - **MUST READ** - All signal types, dispatch functions

**Integration:**
- `src/agents/integrations/better-than-human-integration.ts` - BTH service wrappers
- `src/agents/voice-agent/turn-events.ts` - Event orchestration
- `src/agents/voice-agent/turn-personality.ts` - Personality integration

**Usage:**
- `src/agents/voice-agent/turn-handler.ts` - **MUST READ** - Integration points (lines 857-939, 1700-1795, 2080-2093)

**Frontend Handler:**
- `apps/web/src/ui/better-than-human.ui.ts` - Frontend EQ system (receives signals)

---

## Next Steps for Qwen3-Omni Integration

1. **Create Qwen3-Omni Session Manager** that:
   - Receives emotional analysis results
   - Calls `dispatchEmotionEvents()` after analysis
   - Calls `dispatchExpressionUpdate()` for expressions
   - Calls `dispatchAllTurnEvents()` after turn complete

2. **Wire Send Data Message**:
   - Implement `sendDataMessage` function that sends to frontend via WebSocket/DataChannel
   - Format: `{ type: string, payload: Record<string, unknown> }`

3. **Add Optional Enhancements**:
   - Delight detection (spontaneous delight)
   - Vulnerability detection (visible vulnerability)
   - Temporal insight detection (memory references)
   - Meta-relationship detection (relationship commentary)

4. **Test Integration**:
   - Verify signals reach frontend
   - Verify avatar expressions update
   - Verify micro-expressions trigger
   - Verify concern mode activates

---

*Analysis complete. Ready for Qwen3-Omni integration implementation.*
