# 📳 Ferni Haptics
## Touch Feedback Vocabulary

**Version 1.0 | December 2024**

---

> *"Haptics are the soul of touch. They make digital feel physical."*

---

# Table of Contents

1. [Philosophy](#1-philosophy)
2. [Haptic Vocabulary](#2-haptic-vocabulary)
3. [Core Patterns](#3-core-patterns)
4. [Persona Haptics](#4-persona-haptics)
5. [Emotional Haptics](#5-emotional-haptics)
6. [Interaction Haptics](#6-interaction-haptics)
7. [Technical Specifications](#7-technical-specifications)
8. [Accessibility](#8-accessibility)
9. [Implementation](#9-implementation)

---

# 1. Philosophy

## Why Haptics Matter for Ferni

Ferni is about **human connection**. Touch is our most intimate sense. When a user feels a gentle pulse as Ferni acknowledges their words, the AI becomes more real.

### Our Approach

| Standard Apps | Ferni |
|---------------|-------|
| Generic vibration | Meaningful pulses |
| Same feedback everywhere | Context-aware touch |
| Loud, attention-grabbing | Subtle, warm |
| Functional only | Emotional + functional |

### Guiding Principles

1. **Never startle** — Haptics should feel like a gentle touch
2. **Match the moment** — Intensity reflects emotional weight
3. **Persona-specific** — Each persona feels different
4. **Optional enhancement** — Never required, always additive
5. **Respects preferences** — Full user control

---

# 2. Haptic Vocabulary

## 2.1 Basic Haptic Types

| Name | Pattern | Duration | Intensity | Feel |
|------|---------|----------|-----------|------|
| **Tap** | Single pulse | 10ms | Light | Quick acknowledgment |
| **Soft Tap** | Single pulse | 15ms | Very light | Subtle feedback |
| **Double Tap** | Two quick pulses | 20ms × 2 | Light | Confirmation |
| **Press** | Hold + release | 50ms | Medium | Selection |
| **Bump** | Quick rise + fall | 30ms | Medium | Impact |
| **Breath** | Slow rise + fall | 200-500ms | Light | Organic feeling |
| **Heartbeat** | Two pulses, pause | 100ms × 2 | Medium | Warmth |
| **Rumble** | Sustained | 100-500ms | Variable | Celebration |

---

## 2.2 Haptic Intensity Scale

| Level | Name | iOS Intensity | Android Amplitude | Use Case |
|-------|------|---------------|-------------------|----------|
| 1 | Whisper | 0.1 | 10 | Background acknowledgment |
| 2 | Soft | 0.25 | 50 | Standard feedback |
| 3 | Medium | 0.5 | 100 | Important feedback |
| 4 | Strong | 0.75 | 180 | Emphasis |
| 5 | Full | 1.0 | 255 | Celebrations only |

---

# 3. Core Patterns

## 3.1 Ferni Signature Patterns

### The Ferni Pulse
**The signature haptic of acknowledging the user.**

```
Pattern: "breath"
Duration: 300ms
Intensity: Level 2 (Soft)
Shape: Sine wave rise/fall

  ╭──────╮
 ╱        ╲
╱          ╲
```

### The Warm Welcome
**Connection established haptic.**

```
Pattern: Double "breath" + "tap"
Duration: 600ms total
Intensity: Level 3 → Level 2 → Level 2

  ╭──╮    ╭──╮  •
 ╱    ╲  ╱    ╲ │
╱      ╲╱      ╲│
```

### The Celebration Burst
**Win moment haptic.**

```
Pattern: Quick ramp up + sparkle taps
Duration: 400ms
Intensity: Level 3 → Level 4 → Level 2 × 3

    ╱╲
   ╱  ╲
  ╱    ╲  • • •
 ╱      ╲ │ │ │
╱        ╲│ │ │
```

---

## 3.2 Standard Interaction Patterns

### Button Press

```typescript
const BUTTON_PRESS_HAPTIC = {
  pattern: 'tap',
  intensity: 2,
  duration: 15,
};
```

**Feel:** Crisp, confirming

---

### Toggle Switch

```typescript
const TOGGLE_ON_HAPTIC = {
  pattern: 'bump',
  intensity: 2,
  duration: 20,
};

const TOGGLE_OFF_HAPTIC = {
  pattern: 'soft-tap',
  intensity: 1,
  duration: 15,
};
```

**Feel:** On feels more substantial than off

---

### Selection

```typescript
const SELECT_HAPTIC = {
  pattern: 'double-tap',
  intensity: 2,
  duration: 40,
  gap: 30,
};
```

**Feel:** Two quick taps = "got it"

---

### Long Press

```typescript
const LONG_PRESS_HAPTIC = {
  pattern: 'ramp',
  intensity: [1, 2, 3], // Escalating
  duration: 500,
};
```

**Feel:** Builds as user holds

---

### Scroll Snap

```typescript
const SCROLL_SNAP_HAPTIC = {
  pattern: 'soft-tap',
  intensity: 1,
  duration: 10,
};
```

**Feel:** Subtle tick at each snap point

---

# 4. Persona Haptics

Each persona has a unique haptic signature:

## 4.1 Ferni (Life Coach)

| Event | Pattern | Feel |
|-------|---------|------|
| Speaking | Gentle breath pulse | Warm, grounding |
| Acknowledgment | Soft double tap | "I hear you" |
| Question | Rising breath | Curiosity |
| Insight | Warm pulse | "Aha" moment |

```typescript
const FERNI_HAPTICS = {
  speaking: { pattern: 'breath', intensity: 2, duration: 300 },
  acknowledgment: { pattern: 'double-tap', intensity: 2, gap: 40 },
  question: { pattern: 'ramp-up', intensity: [1, 2], duration: 200 },
  insight: { pattern: 'heartbeat', intensity: 3, duration: 300 },
};
```

---

## 4.2 Jack (Sage Mentor)

| Event | Pattern | Feel |
|-------|---------|------|
| Speaking | Slow, deep breath | Wisdom, weight |
| Story start | Gathering pulse | Settling in |
| Wisdom shared | Deep single pulse | Gravitas |

```typescript
const JACK_HAPTICS = {
  speaking: { pattern: 'slow-breath', intensity: 2, duration: 500 },
  storyStart: { pattern: 'gather', intensity: [1, 2, 2], duration: 600 },
  wisdom: { pattern: 'deep-pulse', intensity: 3, duration: 200 },
};
```

---

## 4.3 Peter (Researcher)

| Event | Pattern | Feel |
|-------|---------|------|
| Speaking | Quicker pulses | Energetic |
| Discovery | Excited burst | "I found it!" |
| Thinking | Rhythmic taps | Processing |

```typescript
const PETER_HAPTICS = {
  speaking: { pattern: 'quick-breath', intensity: 2, duration: 200 },
  discovery: { pattern: 'burst', intensity: [3, 2, 2, 1], duration: 300 },
  thinking: { pattern: 'rhythm', intensity: 1, interval: 200 },
};
```

---

## 4.4 Alex (Communicator)

| Event | Pattern | Feel |
|-------|---------|------|
| Speaking | Smooth, measured | Clarity |
| Guidance | Gentle leading tap | Direction |
| Empathy | Warm pulse | Understanding |

```typescript
const ALEX_HAPTICS = {
  speaking: { pattern: 'smooth-breath', intensity: 2, duration: 350 },
  guidance: { pattern: 'lead-tap', intensity: 2, duration: 15 },
  empathy: { pattern: 'warm-pulse', intensity: 3, duration: 250 },
};
```

---

## 4.5 Maya (Architect)

| Event | Pattern | Feel |
|-------|---------|------|
| Speaking | Consistent rhythm | Structure |
| Task complete | Satisfying click | Done! |
| Habit check | Firm tap | Checkpoint |

```typescript
const MAYA_HAPTICS = {
  speaking: { pattern: 'steady-rhythm', intensity: 2, interval: 300 },
  taskComplete: { pattern: 'click', intensity: 3, duration: 20 },
  habitCheck: { pattern: 'firm-tap', intensity: 2, duration: 25 },
};
```

---

## 4.6 Jordan (Celebrator)

| Event | Pattern | Feel |
|-------|---------|------|
| Speaking | Bouncy, light | Joy |
| Excitement | Sparkle burst | Anticipation |
| Celebration | Full party | Let's go! |

```typescript
const JORDAN_HAPTICS = {
  speaking: { pattern: 'bouncy', intensity: 2, interval: 250 },
  excitement: { pattern: 'sparkle', intensity: [2, 1, 2, 1, 2], duration: 400 },
  celebration: { pattern: 'party', intensity: [3, 4, 3, 2, 1], duration: 600 },
};
```

---

# 5. Emotional Haptics

## 5.1 User Emotion Response

When Ferni detects user emotion:

| Detected Emotion | Haptic Response |
|------------------|-----------------|
| **Happy** | Light, bouncy pulses |
| **Sad** | Slow, gentle holding pulse |
| **Anxious** | Steady, grounding rhythm |
| **Excited** | Quick, building pulses |
| **Frustrated** | Calming, slowing wave |

---

## 5.2 Emotional Acknowledgment

### "I Hear You're Struggling"

```typescript
const EMPATHY_HAPTIC = {
  pattern: 'hold',
  intensity: 2,
  duration: 500,
  shape: 'sustain',
  // Feels like a hand on shoulder
};
```

### "That's Wonderful!"

```typescript
const JOY_HAPTIC = {
  pattern: 'celebration',
  intensity: [2, 3, 2, 1],
  duration: 400,
  // Feels like shared happiness
};
```

### "I'm Here With You"

```typescript
const PRESENCE_HAPTIC = {
  pattern: 'heartbeat',
  intensity: 2,
  duration: 800,
  interval: 300,
  // Feels like companionship
};
```

---

# 6. Interaction Haptics

## 6.1 Connection States

### Connecting

```typescript
const CONNECTING_HAPTIC = {
  pattern: 'building',
  intensity: [1, 1, 2, 2, 3],
  duration: 1000,
  // Building anticipation
};
```

### Connected

```typescript
const CONNECTED_HAPTIC = {
  pattern: 'arrival',
  intensity: 3,
  duration: 200,
  followUp: { pattern: 'breath', intensity: 2, delay: 100 },
  // Satisfying arrival + settling
};
```

### Disconnected

```typescript
const DISCONNECTED_HAPTIC = {
  pattern: 'fade',
  intensity: [2, 1, 1],
  duration: 300,
  // Gentle goodbye
};
```

---

## 6.2 Conversation Events

### AI Starts Speaking

```typescript
const AI_SPEAKING_START = {
  pattern: 'soft-tap',
  intensity: 1,
  duration: 10,
  // Subtle "I'm here"
};
```

### User Turn

```typescript
const USER_TURN = {
  pattern: 'invite',
  intensity: 2,
  duration: 150,
  shape: 'opening',
  // "Your turn"
};
```

### Processing

```typescript
const PROCESSING_HAPTIC = {
  pattern: 'thinking',
  intensity: 1,
  interval: 400,
  repeats: 'until-done',
  // Subtle ongoing pulse
};
```

---

## 6.3 Celebration Events

### Small Win

```typescript
const SMALL_WIN_HAPTIC = {
  pattern: 'sparkle',
  intensity: 2,
  duration: 300,
  shape: [
    { intensity: 2, duration: 50 },
    { pause: 30 },
    { intensity: 1, duration: 30 },
    { pause: 20 },
    { intensity: 1, duration: 30 },
  ],
};
```

### Big Win

```typescript
const BIG_WIN_HAPTIC = {
  pattern: 'celebration',
  intensity: [3, 4, 3, 2, 2, 1, 1],
  duration: 700,
  shape: 'burst-then-sparkle',
};
```

### Milestone

```typescript
const MILESTONE_HAPTIC = {
  pattern: 'achievement',
  intensity: 4,
  duration: 500,
  shape: [
    { ramp: [2, 4], duration: 200 },
    { sustain: 4, duration: 100 },
    { sparkle: [2, 1, 2, 1], duration: 200 },
  ],
};
```

---

# 7. Technical Specifications

## 7.1 Platform Support

### iOS (Core Haptics)

```swift
import CoreHaptics

class FerniHaptics {
    var engine: CHHapticEngine?
    
    // Ferni breath pattern
    func ferniBreath() {
        let events: [CHHapticEvent] = [
            CHHapticEvent(
                eventType: .hapticContinuous,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.25),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.1)
                ],
                relativeTime: 0,
                duration: 0.3
            )
        ]
        
        let curves: [CHHapticParameterCurve] = [
            CHHapticParameterCurve(
                parameterID: .hapticIntensityControl,
                controlPoints: [
                    .init(relativeTime: 0, value: 0),
                    .init(relativeTime: 0.15, value: 1),
                    .init(relativeTime: 0.3, value: 0)
                ],
                relativeTime: 0
            )
        ]
        
        // Play pattern
    }
}
```

### Android (Vibration API)

```kotlin
class FerniHaptics(private val context: Context) {
    private val vibrator = context.getSystemService(Vibrator::class.java)
    
    // Ferni breath pattern
    fun ferniBreath() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val effect = VibrationEffect.createWaveform(
                longArrayOf(0, 150, 150),  // timing
                intArrayOf(0, 50, 0),       // amplitudes
                -1  // no repeat
            )
            vibrator.vibrate(effect)
        }
    }
}
```

### Web (Vibration API)

```typescript
class FerniHaptics {
  // Check support
  static isSupported(): boolean {
    return 'vibrate' in navigator;
  }
  
  // Ferni breath pattern
  ferniBreath() {
    if (!FerniHaptics.isSupported()) return;
    
    // Web API is limited - pattern only
    navigator.vibrate([150, 50, 100]);
  }
}
```

---

## 7.2 Pattern Definition Format

```typescript
interface HapticPattern {
  name: string;
  events: HapticEvent[];
  totalDuration: number;
}

interface HapticEvent {
  type: 'continuous' | 'transient';
  startTime: number;      // ms from pattern start
  duration?: number;      // ms, for continuous
  intensity: number;      // 0-1
  sharpness?: number;     // 0-1, iOS only
  curve?: IntensityCurve; // For smooth transitions
}

interface IntensityCurve {
  points: Array<{
    time: number;      // relative to event start
    value: number;     // 0-1
  }>;
}
```

---

## 7.3 Standard Patterns Library

```typescript
export const FERNI_HAPTIC_PATTERNS = {
  // Basic
  tap: { events: [{ type: 'transient', startTime: 0, intensity: 0.5 }] },
  
  softTap: { events: [{ type: 'transient', startTime: 0, intensity: 0.25 }] },
  
  doubleTap: { 
    events: [
      { type: 'transient', startTime: 0, intensity: 0.5 },
      { type: 'transient', startTime: 50, intensity: 0.5 },
    ]
  },
  
  // Signature
  ferniBreath: {
    events: [{
      type: 'continuous',
      startTime: 0,
      duration: 300,
      intensity: 0.25,
      curve: {
        points: [
          { time: 0, value: 0 },
          { time: 0.5, value: 1 },
          { time: 1, value: 0 },
        ]
      }
    }]
  },
  
  heartbeat: {
    events: [
      { type: 'transient', startTime: 0, intensity: 0.6 },
      { type: 'transient', startTime: 100, intensity: 0.5 },
    ]
  },
  
  celebration: {
    events: [
      { type: 'continuous', startTime: 0, duration: 150, intensity: 0.7 },
      { type: 'transient', startTime: 200, intensity: 0.4 },
      { type: 'transient', startTime: 280, intensity: 0.3 },
      { type: 'transient', startTime: 350, intensity: 0.2 },
    ]
  },
};
```

---

# 8. Accessibility

## 8.1 User Controls

Users must be able to:

- **Disable all haptics** — Master toggle
- **Adjust intensity** — 0-100% slider
- **Choose patterns** — Simplified vs. full
- **Sync with system** — Respect OS settings

```typescript
interface HapticPreferences {
  enabled: boolean;
  intensityMultiplier: number;  // 0-1
  mode: 'full' | 'simplified' | 'none';
  respectSystemSettings: boolean;
}
```

---

## 8.2 Alternative Feedback

When haptics disabled:
- Visual feedback remains
- Audio cues can substitute
- UI feedback (button press states) compensates

---

## 8.3 Sensitive Content

For sensitive emotional moments:
- Lighter haptic intensity
- Option to disable emotional haptics separately
- Never haptic on difficult topics unless user opts in

---

# 9. Implementation

## 9.1 Usage

```typescript
import { FerniHaptics, PATTERNS } from '@ferni/haptics';

const haptics = new FerniHaptics();

// Basic usage
haptics.play('tap');
haptics.play('ferniBreath');

// With persona context
haptics.playForPersona('speaking', 'peter');

// With emotion context
haptics.playForEmotion('acknowledgment', 'sad');

// Celebration
haptics.celebrate('small-win');
haptics.celebrate('milestone');
```

---

## 9.2 Integration Points

```typescript
// In conversation handler
onAISpeakingStart(() => {
  haptics.play('aiSpeakingStart');
});

onEmotionDetected((emotion) => {
  haptics.playForEmotion('acknowledgment', emotion.type);
});

onWinCelebrated((win) => {
  haptics.celebrate(win.magnitude);
});

onPersonaChange((persona) => {
  haptics.setPersonaContext(persona);
  haptics.play('personaArrival');
});
```

---

## 9.3 Testing

```typescript
// Haptic testing utility
const hapticTester = new HapticTester();

// Play all patterns
hapticTester.playAll();

// Play persona-specific
hapticTester.playPersonaPatterns('ferni');

// Play emotional patterns
hapticTester.playEmotionalPatterns();

// Compare intensity levels
hapticTester.compareIntensities('tap');
```

---

# Appendix: Quick Reference

## Pattern Names

| Basic | Persona | Emotional | Celebration |
|-------|---------|-----------|-------------|
| tap | ferniBreath | empathy | smallWin |
| softTap | jackWisdom | presence | bigWin |
| doubleTap | peterDiscovery | support | milestone |
| press | alexClarity | joy | streak |
| bump | mayaComplete | calm | unlock |
| breath | jordanBounce | — | — |

## Intensity Guidelines

| Context | Level | Intensity |
|---------|-------|-----------|
| Background feedback | 1 | 0.1 |
| Standard interaction | 2 | 0.25 |
| Important action | 3 | 0.5 |
| Emphasis | 4 | 0.75 |
| Celebration only | 5 | 1.0 |

---

**© 2024 Ferni. All rights reserved.**

*Touch makes digital feel human. Every haptic should feel like a friend reaching out.*

