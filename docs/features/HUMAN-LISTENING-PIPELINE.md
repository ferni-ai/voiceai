# 🎧 Human Listening Pipeline

> "Better than Human" — hearing what humans can't consciously perceive

## Overview

The Human Listening Pipeline gives Ferni **superhuman emotional awareness** by analyzing voice patterns, linguistic cues, and conversational dynamics that humans process subconsciously.

When your best friend notices something's wrong before you say it—that's what we're replicating, but with even more sensitivity and consistency.

## Why This Matters

Human listeners are good at picking up emotional cues, but they:

- Get distracted
- Miss signals when tired
- Have inconsistent sensitivity
- Can't articulate what they noticed

Ferni notices **every** signal, **every** time, and can respond appropriately without being intrusive.

---

## 🔊 Audio-Based Analysis

These features analyze the actual sound of speech, not just words.

### 1. Breath Pattern Detection

**File:** `src/speech/breath-detection.ts`

Detects breath patterns that reveal emotional state:

- **Sighs** → resignation, fatigue, release
- **Held breath** → bracing for something difficult
- **Deep breath** → gathering courage, centering
- **Shaky breath** → held-back tears, anxiety
- **Gasp** → surprise, shock

```typescript
import { getBreathDetector } from '../speech/index.js';

const detector = getBreathDetector(sessionId);
const result = detector.analyzeAudio(audioSamples, sampleRate);

if (result.needsSpace) {
  // User is processing something - give them room
}
```

### 2. Voice Tremor/Strain Detection

**File:** `src/speech/voice-tremor.ts`

Detects wavering, cracking, and strain in the voice:

- **Tremor** → nervousness, strong emotion
- **Strain** → struggling to maintain composure
- **Crack** → emotion breaking through
- **Quiver** → emotional content being processed

```typescript
import { getVoiceTremorDetector } from '../speech/index.js';

const detector = getVoiceTremorDetector(sessionId);
const result = detector.analyzeAudio(audioSamples, sampleRate);

if (result.possibleTears) {
  // Voice suggests held-back tears - be extra gentle
}
```

### 3. Volume Dynamics Tracking

**File:** `src/speech/volume-dynamics.ts`

Tracks volume changes within and across utterances:

- Getting **quieter** → vulnerable content, sensitivity
- Getting **louder** → passion, frustration, emphasis
- **Fading** at end → losing confidence, uncertainty

```typescript
import { getVolumeDynamicsTracker } from '../speech/index.js';

const tracker = getVolumeDynamicsTracker(sessionId);
const result = tracker.recordFromAudioSamples(samples, rate, text);

if (result.onSensitiveTopic) {
  // User's voice got quieter - they're approaching something difficult
}
```

### 4. Energy Fade Detection

**File:** `src/speech/energy-dynamics.ts`

Detects when voice energy trails off:

- **Fatigue** → tiredness
- **Discouragement** → giving up on the point
- **Realization** → realizing something difficult mid-thought
- **Uncertainty** → unsure if should continue

```typescript
import { getEnergyDynamicsTracker } from '../speech/index.js';

const tracker = getEnergyDynamicsTracker(sessionId);
const result = tracker.analyzeFromAudio(samples, rate, text);

if (result.fadeDetected) {
  // Voice faded - acknowledge what they said, don't rush past it
}
```

### 5. Fluency Analysis

**File:** `src/speech/fluency-analysis.ts`

Analyzes speech disfluencies:

- **Repetitions** → "the the the"
- **Revisions** → "he— she said"
- **Interjections** → "um", "uh"
- **Restarts** → "I was— I mean, I went—"
- **Trailing** → "and then..."

Patterns detected:

- `word_finding` → searching for right words
- `emotional_block` → emotion interfering with speech
- `rushing` → speaking too fast
- `careful` → choosing words deliberately

### 6. Filler Analysis

**File:** `src/speech/filler-analysis.ts`

Deep analysis of filler words (not all fillers are equal):

- **"Um" at sentence start** → gathering thoughts
- **"Uh" mid-sentence** → word-finding difficulty
- **"Like" as quotative** → storytelling mode
- **Sudden increase** → emotional content incoming

```typescript
import { getFillerAnalyzer } from '../speech/index.js';

const analyzer = getFillerAnalyzer(sessionId);
const result = analyzer.analyze(text);

if (result.emotionalProcessing) {
  // Elevated fillers suggest something significant is being processed
}
```

---

## 📝 Text-Based Analysis

These features analyze the words themselves for emotional signals.

### 7. Cognitive Load Detection

**File:** `src/intelligence/cognitive-load.ts`

Detects mental overload from speech patterns:

- **Speech rate decline** from baseline
- **Filler frequency** increase
- **Self-corrections** ("no, wait, I mean...")
- **Incomplete utterances**
- **Repetitions**

Levels: `low` | `medium` | `high` | `overloaded`

```typescript
import { getCognitiveLoadDetector } from '../intelligence/index.js';

const detector = getCognitiveLoadDetector(sessionId);
const result = detector.analyzeUtterance(text, durationMs, pauseInfo);

if (result.shouldSimplify) {
  // Use shorter sentences, simpler language
}
if (result.shouldBreakDown) {
  // One point at a time, avoid complexity
}
```

### 8. Hedging Language Detection

**File:** `src/intelligence/hedging-detection.ts`

Detects uncertainty, minimizing, and protecting language:

| Category        | Examples                                 | What it indicates               |
| --------------- | ---------------------------------------- | ------------------------------- |
| **Uncertainty** | "maybe", "I think", "I guess"            | Uncertain about facts/decisions |
| **Minimizing**  | "just", "only", "a little"               | Downplaying importance          |
| **Distancing**  | "they said", "supposedly"                | Not taking ownership            |
| **Protecting**  | "it's probably nothing", "forget I said" | Self-protection                 |
| **Qualifying**  | "kind of", "sort of"                     | Softening assertions            |
| **Softening**   | "might", "could", "possibly"             | Hedged certainty                |

```typescript
import { getHedgingDetector } from '../intelligence/index.js';

const detector = getHedgingDetector(sessionId);
const result = detector.analyze(text);

if (result.shouldProbe) {
  // Consider gently asking: "You said 'probably nothing' - but is it?"
}
```

### 9. Self-Soothing Detection

**File:** `src/intelligence/self-soothing-detection.ts`

Detects phrases people say to themselves, not the listener:

| Category        | Examples                                 | Underlying state        |
| --------------- | ---------------------------------------- | ----------------------- |
| **Reassurance** | "It'll be fine", "I'm fine"              | Anxiety, uncertainty    |
| **Minimizing**  | "It doesn't matter", "I don't care"      | Hurt, disappointment    |
| **Dismissive**  | "Whatever", "Never mind"                 | Frustration, withdrawal |
| **Normalizing** | "Everyone does", "It's normal"           | Feeling alone           |
| **Deflecting**  | "No big deal", "I shouldn't complain"    | Protecting self         |
| **Convincing**  | "I'm sure it's fine", "I'm overreacting" | Internal conflict       |

```typescript
import { getSelfSoothingDetector } from '../intelligence/index.js';

const detector = getSelfSoothingDetector(sessionId);
const result = detector.analyze(text);

if (result.possibleDistress) {
  // User may be masking how they really feel
  // Don't challenge directly, create space
}

if (result.probeQuestion) {
  // e.g., "You said it's fine... but how are you actually feeling?"
}
```

---

## 💬 Conversation-Based Analysis

These features analyze patterns across the conversation.

### 10. Narrative Arc Tracking

**File:** `src/conversation/narrative-arc.ts`

Tracks the structure of what user is sharing:

| Structure             | Description                       | Agent response          |
| --------------------- | --------------------------------- | ----------------------- |
| **building_to_point** | Clear buildup toward climax       | Listen, don't interrupt |
| **meandering**        | No clear direction                | Gently check in         |
| **circular**          | Keeps returning to same concern   | Reflect it back         |
| **digressing**        | Started somewhere, went off track | Explore or guide back   |
| **direct**            | Making point efficiently          | Respond naturally       |
| **exploratory**       | Thinking out loud                 | Give space to discover  |

```typescript
import { getNarrativeArcTracker } from '../conversation/index.js';

const tracker = getNarrativeArcTracker(sessionId);
const result = tracker.analyzeUtterance({ text, turn, emotion, emotionalIntensity });

if (result.hasReachedCore) {
  // User has reached their point - acknowledge and validate
}
if (result.climaxApproaching) {
  // Be patient, let them get there
}
```

### 11. Engagement Scoring

**File:** `src/conversation/engagement-scoring.ts`

Real-time tracking of user presence vs. distraction:

**Engagement signals:**

- Response latency (faster = more engaged)
- Response length trends
- Question asking
- Topic continuity
- Engagement phrases ("interesting", "tell me more")
- Disengagement phrases ("uh huh", "sure", "okay")

Levels: `high` | `medium` | `low` | `distracted`

```typescript
import { getEngagementScorer } from '../conversation/index.js';

const scorer = getEngagementScorer(sessionId);
const result = scorer.recordResponse(text, { lastAgentMessageTime, currentTopic });

if (result.declining) {
  // Engagement is dropping - may need to shift approach
}
if (result.level === 'distracted') {
  // Check in: "Are you still with me?"
}
```

---

## 🔗 Unified Pipeline

**File:** `src/speech/human-listening-pipeline.ts`

The `HumanListeningPipeline` orchestrates all 12 features into a single analysis.

### Full Analysis

```typescript
import { getHumanListeningPipeline } from '../speech/index.js';

const pipeline = getHumanListeningPipeline(sessionId);

const result = await pipeline.analyze({
  sessionId,
  text: userTranscript,
  audioSamples: audioBuffer, // Optional
  sampleRate: 16000, // Optional
  turnNumber: 5,
  currentTopic: 'work stress', // Optional
  emotion: 'anxious', // Optional
  emotionalIntensity: 0.7, // Optional
});

// Access synthesized insights
console.log(result.overallAssessment);
// "User may be struggling with difficult emotions."

console.log(result.prioritySignals);
// ["Possible tears - be gentle", "Self-soothing distress signals"]

console.log(result.agentGuidance);
// "Voice suggests held-back emotion. Be gentle, slow down..."

console.log(result.shouldSlowDown); // true
console.log(result.shouldGiveSpace); // true
console.log(result.possibleDistress); // true

console.log(result.ssmlSuggestions);
// { speedMultiplier: 0.85, pauseMultiplier: 1.3, volumeLevel: 'softer' }
```

### Quick Analysis (Text-Only)

For real-time use without audio:

```typescript
const quick = pipeline.quickAnalyze(userText, turnNumber);
// Returns: { cognitiveLoad, hedging, selfSoothing, shouldSlowDown }
```

### LLM Context Injection

Build context for the LLM prompt:

```typescript
const context = pipeline.buildLLMContext();
// Returns formatted string or null if no significant signals
```

---

## 🧠 Context Builder Integration

**File:** `src/intelligence/context-builders/human-listening.ts`

The Human Listening Context Builder automatically injects insights into LLM prompts:

```
[🎧 DISTRESS SIGNALS DETECTED]
Voice suggests held-back emotion. Be gentle, slow down...
Priority: Possible tears - be gentle; Self-soothing distress signals

[🎧 NEEDS SLOWER PACE]
User is mentally overloaded - needs simpler communication.
Use very simple language, short sentences, one question at a time.

[🎧 EMOTIONAL UNDERCURRENT]
Detecting vulnerability beneath the surface.
Evidence: voice getting quieter, self-soothing language
Their words may be masking how they really feel.
```

---

## 📊 Example Output

For input: _"Um, I guess it's probably nothing. I'm fine, really. It doesn't matter."_

```typescript
{
  overallAssessment: "User may be struggling with difficult emotions. Words may be masking vulnerability.",

  prioritySignals: [
    "Self-soothing distress signals",
    "Hedging detected - consider gentle probe"
  ],

  agentGuidance: "Don't challenge their reassurance directly. Create space: 'How are you really feeling about this?'",

  emotionalUndercurrent: {
    primary: "vulnerability",
    confidence: 0.75,
    evidence: ["self-soothing language detected", "elevated hedging (protecting)"],
    possiblyMasked: true
  },

  shouldSlowDown: true,
  shouldGiveSpace: true,
  possibleDistress: true,

  ssmlSuggestions: {
    speedMultiplier: 0.9,
    pauseMultiplier: 1.2,
    volumeLevel: "softer"
  }
}
```

---

## 🧪 Testing

Run tests:

```bash
npm test src/tests/human-listening.test.ts
```

---

## 📁 File Structure

```
src/
├── speech/
│   ├── human-listening-pipeline.ts  # Unified orchestrator
│   ├── breath-detection.ts
│   ├── voice-tremor.ts
│   ├── volume-dynamics.ts
│   ├── energy-dynamics.ts
│   ├── fluency-analysis.ts
│   └── filler-analysis.ts
├── intelligence/
│   ├── cognitive-load.ts
│   ├── hedging-detection.ts
│   ├── self-soothing-detection.ts
│   └── context-builders/
│       └── human-listening.ts       # LLM context injection
└── conversation/
    ├── narrative-arc.ts
    └── engagement-scoring.ts
```

---

## 🎯 Design Principles

1. **Subliminal, not obvious** — Notice without pointing out
2. **Create space, don't push** — Make room for sharing, don't demand it
3. **Guide, don't challenge** — Gentle probes, not confrontations
4. **Trust the signals** — If multiple indicators align, act on them
5. **Adjust, don't announce** — Slow down speech, don't say "I notice you seem stressed"

---

## 🚀 Next Steps

1. **Audio integration** — Pass actual audio samples from VAD/prosody systems
2. **Personalization** — Learn individual baselines per user
3. **Cross-session memory** — Track patterns across conversations
4. **Therapeutic integration** — Connect to crisis detection and support protocols
