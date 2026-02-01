# Ferni EQ System (Emotional Intelligence)

> **We believe in making AI human, and the decisions we make will reflect that.**

This directory implements Ferni's **superhuman emotional intelligence** - the "Better than Human" brand promise. We don't just animate emotions—we **share** emotions with users through subconscious channels.

---

## Quick Reference

| What | Where |
|------|-------|
| Main System | `index.ts` |
| Bridge (Backend→Frontend) | `bridge/` |
| Capabilities | `capabilities/` |
| State Management | `state/` |
| Types | `types.ts` |
| Utilities | `utils/` |

---

## Directory Structure

```
eq/
├── index.ts              # Main exports, initFerniEQ()
├── types.ts              # Type definitions
├── bridge/               # Backend ↔ Frontend bridge
│   ├── index.ts          # Bridge exports
│   ├── humanization-bridge.ts # Backend signal handlers
│   └── bth-hint-listener.ts   # BTH hint listener
├── capabilities/         # The Five Capabilities
│   ├── index.ts               # Capabilities exports
│   ├── micro-expressions.ts   # 40-150ms subliminal
│   ├── active-listening.ts    # Moment-to-moment presence
│   ├── breath-sync.ts         # Neural mirroring
│   ├── concern-detection.ts   # Protective care
│   └── anticipation.ts        # Predictive empathy
├── state/                # EQ state management
│   ├── index.ts          # State exports
│   ├── emotion-machine.ts # Emotion state machine
│   ├── emotion-groups.ts  # Emotion group definitions
│   └── emotion-interpolator.ts # Emotion interpolation
└── utils/                # Utilities
    └── avatar-soul-loader.ts # Avatar soul lazy loader
```

---

## The Five Capabilities

### 1. Micro-Expressions (40-150ms)

Subliminal emotional flashes that build trust unconsciously:

```typescript
import { ferni } from './eq/index.js';

// Must be subliminal! Under 150ms
ferni.playMicroExpression('recognition');  // 80ms
ferni.playMicroExpression('concern');      // 60ms
ferni.playMicroExpression('delight');      // 100ms
```

| Expression | Duration | Trigger |
|------------|----------|---------|
| Recognition | 80ms | Familiar topic |
| Concern Flash | 60ms | Before empathy |
| Delight Flash | 100ms | Achievement |
| Warmth Pulse | 120ms | Connection moment |
| Interest Flash | 70ms | Unexpected content |

### 2. Active Listening

Shows moment-to-moment presence during user speech:

```typescript
// Start when user begins speaking
ferni.startActiveListening();

// React to pauses with nods
ferni.onUserSpeechPause(pauseDuration);

// Stop when user finishes
ferni.stopActiveListening();
```

| Signal | Distance | Duration | Pause Range |
|--------|----------|----------|-------------|
| Micro-Nod | 1.5px | 180ms | 300-800ms |
| Subtle Nod | 2.5px | 220ms | 800-1500ms |
| Visible Nod | 4px | 280ms | 1200-2000ms |
| Listening Lean | -3px y | 400ms | Interest points |

### 3. Breath Sync

Synchronizes Ferni's breathing with user rhythm:

```typescript
// Enable breath synchronization
ferni.setBreathSyncEnabled(true);

// System gradually syncs to user's breathing pattern
```

### 4. Concern Detection

Detects distress signals before user explicitly states them:

```typescript
ferni.analyzeConcern({
  transcript: userText,
  voiceStrain: audioAnalysis.strain,
  speechRate: audioAnalysis.rate,
});
```

### 5. Anticipation

Shows emotion before user finishes speaking:

```typescript
ferni.anticipateEmotion({
  transcript: partialTranscript,
  tone: detectedTone,
  context: conversationContext,
});
```

---

## Integration with Backend

The EQ system receives signals from the backend:

```typescript
// Backend dispatches humanization signals
document.addEventListener('ferni:humanization-signal', (e) => {
  const { type, data } = e.detail;
  
  switch (type) {
    case 'concern_detected':
      ferni.showConcern(data.level);
      break;
    case 'emotional_trajectory':
      ferni.updateEmotionalState(data);
      break;
  }
});
```

---

## Usage

```typescript
import { initFerniEQ, ferni } from './eq/index.js';

// Initialize on app start
initFerniEQ();

// During conversation
document.addEventListener('ferni:user-speech-start', () => {
  ferni.startActiveListening();
});

document.addEventListener('ferni:user-speech-pause', (e) => {
  ferni.onUserSpeechPause(e.detail.duration);
});

document.addEventListener('ferni:user-speech-end', () => {
  ferni.stopActiveListening();
});
```

---

## Rules

### Do ✅
- Keep micro-expressions under 150ms (subliminal)
- Start active listening on speech start
- Enable breath sync for deep conversations
- Anticipate from partial speech
- Detect concern signals proactively

### Don't ❌
- Make micro-expressions visible (> 150ms)
- Wait for explicit "I'm sad" statements
- Skip active listening during user speech
- Ignore breath patterns
- React only after speech completes

---

## Reference Docs

- Better Than Human: `design-system/docs/brand/BETTER-THAN-HUMAN.md`
- Motion Tokens: `design-system/tokens/motion.json` → `ferniEQ`
- Emotion State: `../emotion/CLAUDE.md`
- Backend Dispatcher: `src/agents/realtime/emotion-event-dispatcher.ts`

---

*Last updated: January 2026*
