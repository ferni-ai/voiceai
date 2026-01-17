# Voice-Reactive Visualizations

> **Principle**: Visualizations should anticipate, not just react.

This system implements voice-synchronized, anticipatory visualizations inspired by Nadieh Bremer's data art and real-time user experience patterns.

## Core Concept: Anticipatory Motion

Visualizations begin transitioning **BEFORE** the user finishes speaking, based on speech pattern recognition and intent prediction.

```typescript
import { startAnticipatoryAnimation } from './anticipatory-motion.js';

// Start animation when intent is detected (not after speech ends)
onIntentDetected('show_week', confidence => {
  if (confidence > 0.7) {
    startAnticipatoryAnimation({
      targetVisualization: 'mood-calendar',
      transitionType: 'zoom-in',
      preloadData: true,
    });
  }
});
```

**Why?** This creates the feeling that Ferni truly understands you - the UI moves with your thoughts, not after them.

---

## Speech Binding Rules

How speech characteristics map to visual properties:

| Speech Characteristic | Visual Property | Example |
|----------------------|-----------------|---------|
| Intensity (volume) | Animation energy | Louder → faster motion |
| Speaking pace | Transition speed | Slower speech → gentler transitions |
| Emotional tone | Color warmth | Sad → cooler colors |
| Question intonation | Anticipation animation | Rising tone → preview animation |
| Pause | Hold/breathe | Silence → visualization breathes |

### Implementation
```typescript
import { bindSpeechToVisualization } from './speech-binding.js';

bindSpeechToVisualization({
  visualization: moodCalendar,
  speechAnalysis: currentSpeechAnalysis,
  bindings: {
    intensity: 'animationEnergy',
    pace: 'transitionSpeed',
    tone: 'colorWarmth',
    pause: 'breatheCycle',
  },
});
```

---

## Voice Commands

Natural language controls for visualizations:

### Implemented Commands

| Command Pattern | Action | Visualization |
|----------------|--------|---------------|
| "Show me my week" | Display weekly view | Mood Calendar |
| "How have I been sleeping?" | Sleep trend | Sparkline Lifeline |
| "Compare this month to last" | Side-by-side | Small Multiples |
| "Zoom in on Tuesday" | Detail view | Focused Day |
| "How am I doing?" | Overview | Composite Dashboard |
| "Show my habits" | Habit grid | Growth Radar |
| "Am I burned out?" | Capacity gauge | Burnout Gauge |
| "Who have I talked to?" | Network view | Relationship Network |

### Adding New Commands
```typescript
// In conversational-grammar.ts
registerVoiceCommand({
  patterns: [
    'show my {timeframe}',
    'what happened {timeframe}',
    'how was my {timeframe}',
  ],
  handler: async (params) => {
    const viz = mapTimeframeToVisualization(params.timeframe);
    await transitionToVisualization(viz, { source: 'voice' });
  },
  anticipationCue: 'show|what|how',  // Start preparing when these words detected
});
```

---

## Emotional Forces (Attraction/Repulsion)

Data points move based on emotional associations:

```typescript
import { applyEmotionalForces } from './emotional-forces.js';

// Positive emotions attract, negative repel
applyEmotionalForces(visualization, {
  forces: {
    joyful: { type: 'attract', strength: 0.8 },
    anxious: { type: 'repel', strength: 0.6 },
    calm: { type: 'attract', strength: 0.4 },
  },
  dampening: 0.95,  // Prevent oscillation
});
```

### Use Cases
- Mood calendar cells cluster by emotional similarity
- Timeline events orbit around emotional centers
- Relationship nodes group by connection strength

---

## Real-Time Updates

Visualizations update in real-time as conversation progresses:

```typescript
import { createLiveVisualization } from './live-viz.js';

const liveViz = createLiveVisualization({
  type: 'mood-trend',
  updateFrequency: 100,  // ms
  smoothing: 0.85,       // Prevent jitter
  transitionMode: 'interpolate',
});

// Updates flow through automatically
onMoodDetected(mood => {
  liveViz.addDataPoint(mood);  // Smooth animation to new state
});
```

---

## Performance Considerations

### Debouncing
```typescript
// Don't update on every audio frame
const debouncedUpdate = debounce(updateVisualization, 50);
```

### Progressive Enhancement
```typescript
// Lower-end devices get simpler animations
if (context.devicePerformance === 'low') {
  options.animationComplexity = 'simple';
  options.particleCount = 0;
}
```

### Reduced Motion
```typescript
if (context.prefersReducedMotion) {
  // Instant transitions, no anticipation
  options.anticipatoryMotion = false;
  options.transitionDuration = 0;
}
```

---

## Files to Create

```
voice-reactive/
├── CLAUDE.md                # This file
├── speech-binding.ts        # Speech → visual mapping
├── anticipatory-motion.ts   # Pre-emptive animations
├── emotional-forces.ts      # Attraction/repulsion physics
├── conversational-grammar.ts # Voice command parsing
├── live-viz.ts              # Real-time updates
└── index.ts                 # Exports
```

---

## Integration Points

### Speech Recognition
```typescript
// From speech/recognition.ts
onSpeechAnalysis(analysis => {
  voiceReactiveSystem.updateFromSpeech(analysis);
});
```

### Emotion Detection
```typescript
// From speech/emotion-detection.ts
onEmotionDetected(emotion => {
  voiceReactiveSystem.updateEmotionalForces(emotion);
});
```

### Intent Recognition
```typescript
// From conversation/intent.ts
onIntentDetected(intent => {
  voiceReactiveSystem.triggerAnticipation(intent);
});
```

---

## Testing

```bash
# Run voice-reactive tests
pnpm test -- --run voice-reactive

# Test with mock speech input
pnpm test:speech-mock

# Performance benchmarks
pnpm bench:voice-reactive
```

---

## Common Mistakes

| Wrong | Right |
|-------|-------|
| Wait for speech to end | Anticipate from partial input |
| Update on every audio frame | Debounce updates |
| Same animation for all devices | Progressive enhancement |
| Ignore reduced motion | Respect accessibility |
| Complex commands only | Natural language patterns |

---

## Brand Alignment

All voice-reactive visualizations must use:
- CSS variables for colors (`var(--color-*)`)
- Animation constants (`DURATION.*`, `EASING.*`)
- MA spacing system (`var(--space-ma-*)`)
- Brand fonts (`var(--font-body)`)

```typescript
// ✅ Correct
import { DURATION, EASING } from 'animation-constants.generated';

transition: `transform ${DURATION.FAST}ms ${EASING.SPRING}`;

// ❌ Wrong
transition: 'transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)';
```
