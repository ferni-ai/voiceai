# Ferni Storytelling System

> **Principle**: Let the user complete the meaning. The gutter matters.

This storytelling system implements visual narrative patterns inspired by Scott McCloud (Understanding Comics) and Shaun Tan (wordless narrative).

## McCloud Principles

### 1. Closure
The user's imagination fills in the gaps.

```typescript
import { createClosurePattern } from './storytelling/closure-patterns.js';

// Don't show everything - let user imagine
const pattern = createClosurePattern({
  revealDelay: 500,        // Time before showing conclusion
  partialVisuals: true,    // Incomplete visuals invite completion
  suggestiveAnimation: true // Motion implies without showing
});
```

**Example**: When showing emotional growth, don't explicitly state "You're improving!" - show a partially-revealed trend line that lets the user draw their own conclusion.

### 2. The Gutter (Meaningful Silence)
What happens between panels matters as much as the panels.

```typescript
import { createMeaningfulPause } from './storytelling/pause-moments.js';

const pause = createMeaningfulPause(context, duration);
```

### Pause Durations
| Duration | Meaning | Usage |
|----------|---------|-------|
| 500ms | Thoughtful pause | Between related ideas |
| 1000ms | Processing moment | After insight |
| 2000ms | Deep reflection | Before important reveal |
| 3000ms | Pregnant pause | Before life-changing insight |

### 3. Iconic Abstraction
Simpler = more relatable. The Luxo lamp has no face details but feels alive.

```typescript
// Don't over-detail emotional representations
// Simple shapes are more universally relatable

// ❌ Too specific
<DetailedSadFace expressions={40} />

// ✅ Iconic (like Ferni's Luxo eyes)
<SimpleEyeShape emotion="soft" />
```

### 4. Time = Space (Voice = Time)
In comics, panel width controls pacing. In voice-first, speech pace affects display.

```typescript
import { syncToSpeechPace } from './storytelling/pace-control.js';

// Visualization transitions sync to speech rhythm
syncToSpeechPace(visualization, {
  speechRate: wordsPerMinute,
  pauseMultiplier: 1.5, // Slow down during pauses
});
```

---

## Environmental Mood Design (Shaun Tan)

The environment tells the story without words.

### Background Responds to Conversation
```typescript
import { updateAmbientEnvironment } from '../layout/ambient-environment.js';

updateAmbientEnvironment({
  mood: conversationMood,
  energy: energyLevel,
  depth: topicDepth,
});
```

### Environmental Elements
| Element | Maps To | Example |
|---------|---------|---------|
| Particle density | Energy level | More particles = higher energy |
| Gradient warmth | Emotional warmth | Warmer = comfort |
| Blur amount | Focus state | Clearer = more focused |
| Ambient light | Time of day + mood | Dimmer = reflective |

### Ambient Sound (Optional)
```typescript
// Environmental sounds respond to state
ambientSound.setProfile({
  mood: 'calm',
  elements: ['gentle-wind', 'distant-birds'],
  volume: 0.15,  // Very subtle
});
```

---

## Scale and Wonder

Micro-gestures create macro-feelings. Tiny movements have big emotional impact.

```typescript
export const MICRO_GESTURES = {
  attentiveNod: {
    scale: 1.002,      // Nearly imperceptible
    duration: 200,
    easing: 'ease-out'
  },
  thoughtfulPause: {
    opacity: 0.97,
    duration: 500,
    easing: 'ease-in-out'
  },
  warmGlow: {
    filter: 'brightness(1.05)',
    duration: 300,
    easing: 'ease-in'
  },
  gentleInterest: {
    transform: 'translateY(-0.5px)',
    duration: 400,
    easing: 'ease-out'
  }
};
```

---

## Wordless Moments

Sometimes the most powerful communication is visual.

### Types of Wordless Moments
1. **Recognition** - Ferni's eyes widen slightly
2. **Understanding** - Subtle nod, glow warmth
3. **Concern** - Eye shape softens
4. **Celebration** - Brief sparkle
5. **Companionship** - Breathing sync

```typescript
import { playWordlessMoment } from './storytelling/wordless.js';

// No text, just visual emotion
playWordlessMoment('recognition', {
  intensity: 0.8,
  holdDuration: 800,
});
```

---

## Closure Patterns

### Types
1. **Moment-to-Moment** - Small change, user fills in continuity
2. **Action-to-Action** - Subject performs action, outcome implied
3. **Subject-to-Subject** - Stay in scene, change focus
4. **Scene-to-Scene** - Significant time/space gap
5. **Aspect-to-Aspect** - Same moment, different facets
6. **Non-Sequitur** - Unrelated, forces new interpretation

### Usage in Ferni
```typescript
// When showing mood progression, use moment-to-moment
// Let user see pattern emerging rather than stating it

const pattern = await createClosureSequence({
  type: 'moment-to-moment',
  frames: moodSnapshots,
  transitionStyle: 'fade',
  gapDuration: 300,
});
```

---

## Files to Create

```
storytelling/
├── CLAUDE.md             # This file
├── closure-patterns.ts   # McCloud closure types
├── pace-control.ts       # Speech → display sync
├── pause-moments.ts      # Meaningful silence
├── iconic-abstraction.ts # Simplification rules
├── wordless.ts           # Wordless moments
└── index.ts              # Exports
```

---

## Common Mistakes

| Wrong | Right |
|-------|-------|
| Explain everything explicitly | Let user draw conclusions |
| No pauses between elements | Meaningful silence |
| Hyper-detailed emotional states | Iconic abstraction |
| Static environment | Responsive ambient |
| Rushed transitions | Paced to speech rhythm |
| All visual, no sound | Subtle ambient layer |

---

## References

- **McCloud**: "Understanding Comics" - closure, time=space
- **Tan**: "The Arrival" - wordless narrative
- **Pixar**: Emotion through minimal features (Luxo)
- **Animation**: `design-system/tokens/animation.json`
