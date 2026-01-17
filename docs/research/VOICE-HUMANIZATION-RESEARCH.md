# 🎙️ Voice Humanization Research - The Art of the Possible

> Deep research on Cartesia Sonic-3, TTS humanization, and making AI voices feel genuinely human.

---

## ✅ IMPLEMENTATION STATUS

All researched humanization techniques have been implemented in Ferni:

| Feature                 | Status         | Location                                |
| ----------------------- | -------------- | --------------------------------------- |
| 50+ Emotion Mapping     | ✅ Implemented | `src/speech/advanced-humanization.ts`   |
| Natural Fillers         | ✅ Implemented | `src/speech/advanced-humanization.ts`   |
| Breath Group Pacing     | ✅ Implemented | `src/speech/advanced-humanization.ts`   |
| Speech Rhythm Variation | ✅ Implemented | `src/speech/advanced-humanization.ts`   |
| Enhanced Backchanneling | ✅ Implemented | `src/speech/enhanced-backchanneling.ts` |
| Persona-specific styles | ✅ Implemented | Both files                              |

### Usage

```typescript
import {
  humanizeText,
  mapContextToEmotion,
  getEnhancedBackchannelingEngine,
} from './speech/index.js';

// Full humanization pipeline
const humanized = humanizeText(response, {
  fillers: true,
  breathGroups: true,
  rhythmVariation: true,
  emotionContext: {
    agentIntent: 'supportive',
    userEmotion: 'anxious',
    topicWeight: 'heavy',
    relationshipStage: 'friend',
  },
  personaId: 'ferni',
});

// Enhanced backchanneling
const engine = getEnhancedBackchannelingEngine(sessionId);
const decision = engine.decide({
  userSpeechDuration: 5000,
  currentPauseDuration: 1000,
  userEmotion,
  topicWeight: 'medium',
  backchannelCountThisTurn: 0,
});
if (decision.shouldEmit) {
  // Emit decision.ssml as backchannel
}
```

---

## 📊 Cartesia Sonic-3 Capabilities (Official)

### Supported SSML Tags

| Tag         | Usage               | Range          | Example                              |
| ----------- | ------------------- | -------------- | ------------------------------------ |
| `<speed>`   | Control speech rate | 0.6 - 1.5      | `<speed ratio="0.8"/>Slower speech`  |
| `<volume>`  | Control loudness    | 0.5 - 2.0      | `<volume ratio="0.7"/>Softer speech` |
| `<emotion>` | Set emotional tone  | See list below | `<emotion value="affectionate"/>`    |
| `<break>`   | Insert pauses       | seconds or ms  | `<break time="300ms"/>`              |
| `<spell>`   | Spell out text      | N/A            | `<spell>ABC-123</spell>`             |

### Supported Non-Verbal Sounds

| Sound        | Syntax       | Status       |
| ------------ | ------------ | ------------ |
| **Laughter** | `[laughter]` | ✅ Supported |
| Sighs        | TBD          | 🔜 Planned   |
| Coughs       | TBD          | 🔜 Planned   |
| Breathing    | TBD          | 🔜 Planned   |

### Complete Emotion List (50+ emotions!)

**Positive Emotions:**

- `happy`, `excited`, `enthusiastic`, `elated`, `euphoric`, `triumphant`
- `content`, `peaceful`, `serene`, `calm`, `grateful`
- `affectionate`, `trust`, `sympathetic`, `flirtatious`

**Engagement Emotions:**

- `curious`, `amazed`, `surprised`, `anticipation`, `mysterious`
- `joking`, `comedic`, `sarcastic`, `ironic`

**Negative Emotions:**

- `sad`, `dejected`, `melancholic`, `disappointed`, `hurt`
- `angry`, `mad`, `outraged`, `frustrated`, `agitated`, `threatened`
- `scared`, `disgusted`, `contempt`, `envious`

**Nuanced States:**

- `hesitant`, `insecure`, `confused`, `resigned`
- `guilty`, `bored`, `tired`, `rejected`
- `nostalgic`, `wistful`, `apologetic`

### Best Voices for Emotional Expression

Cartesia recommends these "Emotive" voices:

- **Male:** Leo, Jace, Kyle, Gavin, Cory
- **Female:** Maya, Tessa, Dana, Marian, Ariana

---

## 🔬 Humanization Techniques (Research-Backed)

### 1. Speech Disfluencies (Fillers)

Natural speech includes hesitations. Adding these makes AI sound spontaneous:

```typescript
// Natural fillers to use
const FILLERS = [
  'um', // Thinking/hesitation
  'uh', // Searching for words
  'well', // Transition/consideration
  'like', // Casual speech marker
  'you know', // Seeking connection
  'I mean', // Clarification marker
  'so', // Transition
  'actually', // Correction/emphasis
];

// Example usage
("Well... <break time='200ms'/> I think what you're getting at is...");
("Um, <break time='150ms'/> let me think about that.");
```

**Research finding:** Fillers like "um" and "uh" make AI speech sound more human-like, improving listener engagement and comprehension.

### 2. Backchanneling (Active Listening Sounds)

Short verbal cues that signal active listening:

```typescript
const BACKCHANNELS = {
  agreement: ['mm-hmm', 'mhm', 'uh-huh', 'right', 'yeah'],
  understanding: ['I see', 'got it', 'okay', 'ah'],
  encouragement: ['go on', 'and then?', 'tell me more'],
  empathy: ['mmm', 'oh', 'wow', 'oh no'],
};
```

**Benefits:**

- Reduces awkward pauses
- Encourages users to continue speaking
- Increases perceived attentiveness and trust

### 3. Prosodic Phrasing (Breath Groups)

Humans speak in "breath groups" - segments produced on a single exhalation:

```typescript
// Break long sentences into natural breath groups
// ❌ Too long
"I think what you're experiencing is completely normal and many people go through similar situations";

// ✅ Natural breath groups
"I think what you're experiencing <break time='200ms'/> is completely normal. <break time='300ms'/> Many people go through similar situations.";
```

**Key insights:**

- Longer/complex phrases need longer preceding pauses
- Spontaneous speech has different pause patterns than read speech
- Pause placement affects perceived naturalness

### 4. Emotional Transitions

Don't switch emotions abruptly - use transitions:

```typescript
// ❌ Abrupt emotion change
"<emotion value='happy'/>Great job! <emotion value='concerned'/>But I'm worried about...";

// ✅ Gradual transition with pause
"<emotion value='happy'/>Great job! <break time='400ms'/> <emotion value='curious'/>Though I'm wondering... <break time='200ms'/> <emotion value='concerned'/>are you taking care of yourself?";
```

### 5. Speech Rhythm Variation

Avoid monotonous delivery by varying:

```typescript
// Mix sentence lengths
"Yeah. <break time='150ms'/> That's tough. <break time='300ms'/> I think what you're dealing with here is actually pretty common, and there are some things we could try.";

// Speed variation for emphasis
"<speed ratio='0.9'/>This is important.</speed> <break time='200ms'/> <speed ratio='1.05'/>Here's what we can do about it.";
```

---

## 🎯 Implementation Recommendations for Ferni

### Immediate Actions (Use Now)

1. **Expand emotion usage:**

```typescript
// Use the full emotion palette
const EMOTION_MAP = {
  supportive: 'affectionate',
  thinking: 'curious',
  worried: 'sympathetic',
  celebrating: 'triumphant',
  uncertain: 'hesitant',
  remembering: 'nostalgic',
  joking: 'comedic',
};
```

2. **Add natural fillers:**

```typescript
// Insert fillers before thoughtful responses
const THINKING_STARTERS = [
  'Hmm... <break time="200ms"/>',
  'Well... <break time="150ms"/>',
  'Let me think... <break time="250ms"/>',
  'You know... <break time="150ms"/>',
];
```

3. **Use backchanneling during user speech:**

```typescript
// When user pauses 3-5 seconds during their turn
const ACTIVE_LISTENING = ['Mm-hmm.', 'Yeah.', 'I hear you.', 'Go on.'];
```

4. **Breath group pacing:**

```typescript
// Add pauses at natural phrase boundaries
function addBreathGroupPauses(text: string): string {
  return (
    text
      // After commas in long clauses
      .replace(/,\s+(\w{15,})/g, ', <break time="150ms"/> $1')
      // After sentence endings
      .replace(/\.\s+/g, '. <break time="250ms"/> ')
      // Before "but", "however", "although"
      .replace(/\s+(but|however|although)\s+/gi, ' <break time="200ms"/> $1 ')
  );
}
```

### Medium-Term Enhancements

1. **Emotion-aware response generation:**
   - Detect user emotion from voice prosody
   - Mirror with appropriate counter-emotion
   - Use `hesitant` for uncertain topics
   - Use `nostalgic` for memory recall

2. **Dynamic backchannel system:**
   - Track user speech duration
   - Insert backchannels at natural pauses
   - Vary backchannel types based on content weight

3. **Voice-specific optimization:**
   - Test which Cartesia voice works best for each persona
   - Consider using "Emotive" labeled voices
   - Match voice to persona's emotional range needs

### Future Possibilities (When Cartesia Adds Support)

1. **Breath sounds** - Natural breathing between phrases
2. **Sighs** - Express empathy, exhaustion, relief
3. **Throat clearing** - Before important statements
4. **Coughs** - Very rare, for character moments

---

## 📚 Comparison: Cartesia vs ElevenLabs

| Feature       | Cartesia Sonic-3       | ElevenLabs v3    |
| ------------- | ---------------------- | ---------------- |
| Laughter      | `[laughter]` ✅        | `[laughs]` ✅    |
| Sighs         | 🔜 Planned             | `[sighs]` ✅     |
| Breathing     | 🔜 Planned             | ❌ Not supported |
| Exhales       | 🔜 Planned             | `[exhales]` ✅   |
| Emotions      | 50+ emotions ✅        | Style presets    |
| Speed control | SSML tag               | API parameter    |
| Latency       | ~100ms (best-in-class) | ~200-300ms       |

---

## 🧪 Testing Recommendations

### A/B Test These Variations

1. **Filler frequency:** 0%, 5%, 10%, 15% of responses
2. **Backchannel timing:** 3s, 5s, 8s pause thresholds
3. **Emotion usage:** Basic (5 emotions) vs Rich (20+ emotions)
4. **Pause duration:** Short (100-200ms) vs Natural (200-400ms)

### Metrics to Track

- User perceived naturalness (survey)
- Conversation duration
- User turn length (are they opening up more?)
- Sentiment progression
- Return rate / engagement

---

## 📖 References

- Cartesia Docs: https://docs.cartesia.ai/build-with-cartesia/sonic-3/
- Pipecat Framework: https://reference-server.pipecat.ai/
- ElevenLabs Docs: https://elevenlabs.io/docs/
- Research: "PauseSpeech: Natural Phrasing in TTS" (arXiv:2306.07489)
- Research: "Breath Groups in Spontaneous Speech" (PMC2945274)
- Research: "Fillers and Disfluencies in Human Speech" (arXiv:2412.12710)

---

_Last updated: December 2024_
_Next research: Monitor Cartesia updates for sigh/breath support_
