# Emotion State Management

> **We believe in making AI human, and the decisions we make will reflect that.**

This directory manages Ferni's emotional state and expression system. It bridges the gap between detected emotions and visual/audio expressions.

---

## Quick Reference

| What | Where |
|------|-------|
| Emotion State | `emotion-state.ts` |
| Expression Bridge | `emotion-expression-bridge.ts` |
| Triggers | `emotion-triggers.ts` |
| Index | `index.ts` |

---

## Architecture

```
Backend Detection          Frontend Expression
─────────────────          ───────────────────
Voice Analysis    ──┐
                    │      ┌─── Avatar Expression
Text Sentiment   ───┼──▶ emotion-state.ts ──┼─── Voice Modulation
                    │      └─── UI Effects
Context Signals  ──┘
```

---

## Components

### Emotion State (`emotion-state.ts`)

Central state management for Ferni's emotional display:

```typescript
import { emotionState } from './emotion-state.js';

// Update emotion
emotionState.setEmotion({
  primary: 'empathetic',
  intensity: 0.7,
  secondary: 'concerned',
});

// Subscribe to changes
emotionState.subscribe((state) => {
  updateAvatar(state);
  updateVoice(state);
});

// Get current state
const current = emotionState.getState();
```

### Expression Bridge (`emotion-expression-bridge.ts`)

Translates emotion states to visual expressions:

```typescript
import { emotionExpressionBridge } from './emotion-expression-bridge.js';

// Map emotion to avatar expression
const expression = emotionExpressionBridge.mapToExpression({
  emotion: 'empathetic',
  intensity: 0.7,
});

// Returns:
// {
//   eyeExpression: 'soft',
//   mouthExpression: 'gentle-smile',
//   posture: 'leaning-in',
//   breathRate: 'slow',
// }
```

### Emotion Triggers (`emotion-triggers.ts`)

Defines what triggers emotional changes:

```typescript
import { emotionTriggers } from './emotion-triggers.js';

// Check for triggers in user input
const triggers = emotionTriggers.analyze({
  transcript: userText,
  tone: voiceTone,
  context: sessionContext,
});

// triggers might be:
// [
//   { emotion: 'concern', trigger: 'mention of loss', confidence: 0.8 },
//   { emotion: 'supportive', trigger: 'request for help', confidence: 0.9 },
// ]
```

---

## Emotion Types

### Primary Emotions
| Emotion | Visual | Voice |
|---------|--------|-------|
| `neutral` | Calm, attentive | Balanced |
| `empathetic` | Soft eyes, gentle | Warm, slower |
| `encouraging` | Bright eyes, smile | Upbeat |
| `concerned` | Furrowed, attentive | Gentle, slower |
| `curious` | Wide eyes, tilted | Interested |
| `celebratory` | Big smile, bright | Excited |
| `reflective` | Thoughtful, calm | Measured |
| `playful` | Sparkling, smile | Light |

### Intensity Levels
| Level | Range | Visual Impact |
|-------|-------|---------------|
| Subtle | 0.0-0.3 | Barely noticeable |
| Moderate | 0.3-0.6 | Clear but gentle |
| Strong | 0.6-0.9 | Prominent |
| Intense | 0.9-1.0 | Maximum expression |

---

## State Shape

```typescript
interface EmotionState {
  primary: EmotionType;
  secondary?: EmotionType;
  intensity: number;        // 0-1
  confidence: number;       // How sure we are
  source: 'detected' | 'inferred' | 'default';
  timestamp: number;
  history: EmotionHistoryEntry[];
}
```

---

## Integration

### With EQ System

```typescript
import { emotionState } from './emotion/index.js';
import { ferni } from './eq/index.js';

// EQ micro-expressions can be based on emotion state
emotionState.subscribe((state) => {
  if (state.primary === 'concerned' && state.intensity > 0.6) {
    ferni.playMicroExpression('concern');
  }
});
```

### With Avatar

```typescript
import { emotionState } from './emotion/index.js';
import { avatarSoul } from './ui/avatar-soul.ui.js';

emotionState.subscribe((state) => {
  avatarSoul.setExpression(
    emotionExpressionBridge.mapToExpression(state)
  );
});
```

---

## Rules

### Do ✅
- Smooth transitions between emotions
- Consider context when inferring emotions
- Track emotion history for patterns
- Use appropriate intensity levels
- Sync with EQ system

### Don't ❌
- Jump abruptly between emotions
- Ignore context signals
- Over-express emotions
- Hardcode emotion mappings
- Skip the bridge for expressions

---

## Reference Docs

- EQ System: `../eq/CLAUDE.md`
- Avatar: `../ui/avatar-soul.ui.ts`
- Backend Detection: `src/speech/emotion-detection.ts`
- Better Than Human: `design-system/docs/brand/BETTER-THAN-HUMAN.md`

---

*Last updated: January 2026*
