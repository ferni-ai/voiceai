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

### Migration from speech/ssml-tagger

The `src/speech/ssml-tagger/` module is **deprecated**. Migrate as follows:

| Deprecated Import                                                            | New Import                                                     |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `import { tagTextWithSsml } from '../speech/ssml-tagger'`                    | `import { tagTextWithSsmlPersonaAware } from '../ssml'`        |
| `import { sanitizeSsml } from '../speech/ssml-tagger'`                       | `import { sanitizeSsml } from '../ssml'`                       |
| `import { detectEmotion } from '../speech/ssml-tagger'`                      | `import { detectEmotion } from '../ssml'`                      |
| `import { FINANCIAL_PRONUNCIATIONS } from '../speech/ssml-tagger/constants'` | `import { FINANCIAL_PRONUNCIATIONS } from '../ssml/constants'` |

### Jack Bogle-Specific Code

Jack Bogle (Peter John) specific speech patterns are in the persona bundle:

```typescript
// ✅ CORRECT - Import from persona bundle
import {
  applyPeterJohnSpeechTraits,
  addCatchphraseEmphasis,
  addWisdomCadence,
} from '../personas/bundles/peter-john/speech-traits.js';

// ❌ DEPRECATED - Don't import from ssml-tagger
import { addCatchphraseEmphasis } from '../speech/ssml-tagger/jack-bogle.js';
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
