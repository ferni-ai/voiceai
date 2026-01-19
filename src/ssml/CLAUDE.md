# SSML Module (`src/ssml/`)

> "We believe in making AI human, and the decisions we make will reflect that."

The SSML module is the **canonical source of truth** for all SSML (Speech Synthesis Markup Language) functionality in the Ferni voice AI platform.

## 🎯 Module Purpose

This module provides:

- SSML tag generation for Cartesia Sonic-3 TTS
- Text detection (emotion, pacing, volume, vocal cues)
- Stage direction sanitization
- Financial pronunciation handling
- Persona-aware SSML tagging

## 📋 Cartesia Sonic-3 SSML Specification

**Reference:** https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags

### Supported SSML Tags

| Tag         | Format                                        | Range        | Notes                          |
| ----------- | --------------------------------------------- | ------------ | ------------------------------ |
| **Speed**   | `<speed ratio="X"/>`                          | 0.6-1.5      | 1.0 = normal speed             |
| **Volume**  | `<volume ratio="X"/>`                         | 0.5-2.0      | 1.0 = normal volume            |
| **Emotion** | `<emotion value="X"/>`                        | See list     | Beta feature                   |
| **Break**   | `<break time="Xms"/>` or `<break time="Xs"/>` | Any duration | Inserts pause                  |
| **Spell**   | `<spell>text</spell>`                         | Any text     | Letter-by-letter pronunciation |

### Nonverbal Sounds

| Sound    | Syntax       | Status                               |
| -------- | ------------ | ------------------------------------ |
| Laughter | `[laughter]` | ✅ **SUPPORTED**                     |
| Sigh     | `[sigh]`     | ❌ NOT YET (planned)                 |
| Cough    | `[cough]`    | ❌ NOT YET (planned)                 |
| Hmm      | `[hmm]`      | ❌ NOT YET (use plain text "Hmm...") |

**⚠️ IMPORTANT:** Only `[laughter]` is currently supported by Cartesia Sonic-3. Other nonverbal sounds like `[sigh]` and `[cough]` are planned for future updates but will be spoken literally if used now.

### Supported Emotions

Primary emotions (confirmed working):

- `angry`, `sad`, `surprised`, `curious`, `affectionate`

Extended emotions (beta):

- `excited`, `content`, `scared`, `happy`, `nostalgic`
- `contemplative`, `grateful`, `proud`, `sympathetic`, `skeptical`

### Mid-Sentence Emotion Changes

Cartesia supports changing emotions mid-sentence:

```xml
<emotion value="angry"/>I will not allow you to continue this! <emotion value="sad"/>I was hoping for a peaceful resolution.
```

**How our code handles this:**

- ✅ **Explicit inline tags are PRESERVED** - If content already includes `<emotion>` tags, they pass through unchanged
- ⚠️ **Auto-detection adds ONE emotion** - For plain text, we detect the dominant emotion and add it at the start
- 💡 **For emotional range**, include emotion tags directly in persona content/responses

**Best practice for emotional responses:**

```typescript
// In persona content files - explicit emotions are preserved:
"<emotion value=\"excited\"/>Oh that's amazing! <emotion value=\"curious\"/>Tell me more about how that happened."

// Plain text gets auto-detected emotion at start:
"Oh that's amazing! Tell me more." → "<emotion value=\"surprised\"/>Oh that's amazing! Tell me more."
```

### SSML Tag Examples

```xml
<!-- Speed control -->
<speed ratio="1.5"/>I like to speak quickly.
<speed ratio="0.8"/>This is more deliberate.

<!-- Volume control -->
<volume ratio="0.5"/>I will speak softly.
<volume ratio="1.5"/>This is louder.

<!-- Emotion (Beta) -->
<emotion value="angry"/>I will not allow this!
<emotion value="sad"/>I was hoping for better.

<!-- Pauses -->
Hello.<break time="500ms"/>Nice to meet you.
Let me think.<break time="1s"/>Okay, here's my answer.

<!-- Spelling out text -->
My account is <spell>ABC-123</spell>.

<!-- Laughter (ONLY supported nonverbal) -->
That's hilarious! [laughter]
```

### ⚠️ CRITICAL: Streaming Requirements

**If you're streaming token by token, you MUST buffer complete SSML tags!**

From Cartesia docs:
> "Note that if you're streaming token by token, you'll need to buffer the whole value of the speed or volume tags. Passing in `1`, `.`, `0` as separate inputs, for example, will result in **reading out the tags**."

**Example of the bug:**
```
// Fragmented streaming causes tags to be spoken!
Stream chunk 1: "<speed "
Stream chunk 2: "ratio=\"1."
Stream chunk 3: "5\"/> Hello"
// Result: Cartesia speaks "speed ratio 1.5 Hello" literally!
```

**Solution: Buffer incomplete tags**
```typescript
// Our SSML buffering transform in cache-aware-tts.ts
function createSSMLBufferingTransform() {
  let buffer = '';
  return new TransformStream({
    transform(chunk, controller) {
      buffer += chunk;
      const lastOpenBracket = buffer.lastIndexOf('<');
      const lastCloseBracket = buffer.lastIndexOf('>');
      
      if (lastOpenBracket > lastCloseBracket) {
        // Incomplete tag - hold it, emit only complete text
        const completeText = buffer.substring(0, lastOpenBracket);
        buffer = buffer.substring(lastOpenBracket);
        if (completeText) controller.enqueue(completeText);
      } else {
        // No incomplete tags - emit entire buffer
        if (buffer) {
          controller.enqueue(buffer);
          buffer = '';
        }
      }
    },
    flush(controller) {
      if (buffer) controller.enqueue(buffer);
    }
  });
}
```

### Prompting Tips (from Cartesia docs)

1. **Use appropriate punctuation** - Add punctuation at the end of each transcript
2. **Dates: MM/DD/YYYY** - Use `04/20/2023` format
3. **Time formatting** - Add space before AM/PM: `7:00 PM`, `7 PM`
4. **Insert pauses** - Use `-` or `<break time="X"/>` for pauses
5. **Match voice to language** - Each voice has optimal languages
6. **Stream contiguous audio** - Use continuations for connected chunks
7. **Custom pronunciations** - Specify for domain-specific/ambiguous words
8. **Force spelling** - Use `<spell>` for IDs, email addresses, numbers

### Important Notes

1. **Buffer complete tags** when streaming token-by-token to prevent tags from being read aloud
2. **Emotion tag** works best with voices tagged as "Emotive" in Cartesia
3. **Mid-generation emotion shifts** may yield unpredictable results
4. **Break tags** count as 1 character for billing purposes
5. **Best emotive voices**: Leo, Jace, Kyle, Gavin, Maya, Tessa, Dana, Marian

## Architecture Overview

```
src/ssml/
├── index.ts          # Main exports (IMPORT FROM HERE!)
├── types.ts          # Type definitions & Cartesia emotions
├── constants.ts      # All SSML constants (single source of truth)
├── tags.ts           # Tag generation helpers (speed, volume, break, emotion)
├── detection.ts      # Text analysis (emotion, pacing, volume, vocal cues)
├── core.ts           # Main functions (tagTextWithSsmlPersonaAware, sanitizeSsml)
├── cartesia.ts       # Cartesia-specific helpers
└── CLAUDE.md         # This file
```

## Key Concepts

### 1. Single Source of Truth

**This module is the canonical source** for all SSML functionality. Other modules should import from here:

```typescript
// ✅ CORRECT - Import from ssml module
import {
  tagTextWithSsmlPersonaAware,
  sanitizeSsml,
  detectEmotion,
  CARTESIA_EMOTIONS,
  FINANCIAL_PRONUNCIATIONS,
} from '../ssml/index.js';

// ❌ DEPRECATED - Don't import from speech/ssml-tagger
import { tagTextWithSsml } from '../speech/ssml-tagger/index.js';
```

### 2. Cartesia Emotions

Emotions supported by Cartesia Sonic-3 TTS:

```typescript
import { CARTESIA_EMOTIONS, type CartesiaEmotion } from '../ssml/types.js';

// Primary emotions (directly supported in <emotion> tag)
const supportedInTag: CartesiaEmotion[] = ['angry', 'sad', 'surprised', 'curious', 'affectionate'];

// Use isCartesiaSupportedEmotion() to check
if (isCartesiaSupportedEmotion(emotion)) {
  tagged += `<emotion value="${emotion}"/>`;
}
```

### 3. Financial Pronunciations

Financial terms are automatically converted to speakable pronunciations:

```typescript
import { FINANCIAL_PRONUNCIATIONS } from '../ssml/constants.js';

// Examples:
// "401k" → "four oh one K"
// "S&P 500" → "S and P five hundred"
// "$100k" → "100 thousand dollars"
// "IRA" → "I R A"
```

### 4. Stage Direction Sanitization

The `sanitizeSsml()` function removes LLM-generated stage directions:

```typescript
import { sanitizeSsml } from '../ssml/index.js';

// Input:  "*chuckles* Well, that's interesting!"
// Output: "[laughter] Well, that's interesting!"

// Input:  "*smiles warmly* Hello!"
// Output: "Hello!"

// Input:  "(sighs) This is difficult..."
// Output: "This is difficult..."
```

## Usage Examples

### Basic SSML Tagging

```typescript
import { tagTextWithSsmlPersonaAware } from '../ssml/index.js';

// Simple usage
const ssml = tagTextWithSsmlPersonaAware('Hello, how are you today?');

// With persona
const ssml = tagTextWithSsmlPersonaAware('Hello!', {
  personaId: 'ferni',
  humanize: true,
});

// With thinking time
const ssml = tagTextWithSsmlPersonaAware('Let me think about that...', {
  personaId: 'ferni',
  thinkingTime: true,
  thinkingContext: { complexity: 0.8, topicWeight: 'heavy' },
});
```

### Tag Helpers

```typescript
import { speedTag, volumeTag, breakTag, emotionTag } from '../ssml/index.js';

// Generate tags
speedTag(0.9); // <speed ratio="0.90"/>
volumeTag(1.1); // <volume ratio="1.1"/>
breakTag('200ms'); // <break time="200ms"/>
emotionTag('sad'); // <emotion value="sad"/>
```

### Detection Functions

```typescript
import { detectEmotion, detectPacing, detectVolume, detectVocalCues } from '../ssml/index.js';

const emotion = detectEmotion("I'm so sorry to hear that.");
// Returns: 'sad'

const { speed, reason } = detectPacing('Think about it carefully.');
// Returns: { speed: 0.88, reason: 'slow: think' }

const { volume, hasEmphasis, hasWhisper } = detectVolume('This is VERY important!');
// Returns: { volume: 1.15, hasEmphasis: true, hasWhisper: false }

const { hasLaughter, hasSigh } = detectVocalCues("Haha, that's great!");
// Returns: { hasLaughter: true, hasSigh: false, ... }
```

## Relationship with `src/speech/`

The `src/speech/` module uses this SSML module for its SSML functionality:

```
src/ssml/                    ← Canonical SSML source
    ↑
    │ imports
    │
src/speech/                  ← Voice/audio processing
├── ssml-tagger/             ← DEPRECATED (re-exports from src/ssml/)
├── adaptive-ssml/           ← Advanced SSML features (uses src/ssml/)
└── ...
```

### Migration from speech/ssml-tagger (COMPLETED)

The `src/speech/ssml-tagger/` module has been **removed**. Import from `src/ssml/` instead:

```typescript
// ✅ CORRECT - Import from canonical src/ssml/ module
import {
  tagTextWithSsmlPersonaAware,
  sanitizeSsml,
  detectEmotion,
  FINANCIAL_PRONUNCIATIONS,
} from '../ssml/index.js';
```

### Jack Bogle-Specific Code (COMPLETED)

Jack Bogle (Peter John) specific speech patterns are now in the persona bundle:

```typescript
// ✅ CORRECT - Import from persona bundle
import {
  applyPeterJohnSpeechTraits,
  addCatchphraseEmphasis,
  addWisdomCadence,
} from '../personas/bundles/peter-john/speech-traits.js';
```

## Constants Reference

### Emotion Keywords

Maps keywords in text to Cartesia emotions:

```typescript
EMOTION_KEYWORDS = {
  // Angry
  frustrated: 'angry',
  annoyed: 'angry',
  // Sad
  sorry: 'sad',
  disappointed: 'sad',
  // Curious
  wonder: 'curious',
  interesting: 'curious',
  // Affectionate
  love: 'affectionate',
  care: 'affectionate',
  // ... many more
};
```

### Pacing Keywords

```typescript
SLOW_PACE_KEYWORDS = ['important', 'crucial', 'think', 'consider', ...]
FAST_PACE_KEYWORDS = ['exciting', 'amazing', 'quickly', 'hurry', ...]
```

### Stage Direction Keywords

Words that indicate stage directions to be removed:

```typescript
STAGE_DIRECTION_KEYWORDS = [
  'sigh',
  'smile',
  'grin',
  'nod',
  'pause',
  'exhale',
  'warmly',
  'gently',
  'softly',
  'teasing',
  'playful',
  // ... comprehensive list
];
```

## Performance Considerations

1. **Regex Caching**: Use the built-in `regexCache` for frequently used patterns:

```typescript
import { regexCache } from '../ssml/index.js';

const pattern = regexCache.get('\\b(hello|hi)\\b', 'gi');
```

2. **Early Returns**: Functions check for empty text and existing SSML tags early.

3. **Financial Protection**: Financial pronunciations use Unicode markers to prevent SSML corruption.

## Testing

Tests are in `src/tests/`:

```bash
# Run all SSML tests
npm test -- --run src/tests/ssml-*.test.ts

# Specific test files
npm test -- --run src/tests/ssml-core.test.ts
npm test -- --run src/tests/ssml-safety.test.ts
npm test -- --run src/tests/ssml-financial.test.ts
```
