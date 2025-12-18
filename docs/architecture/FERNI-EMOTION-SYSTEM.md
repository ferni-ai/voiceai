# 🎬 Ferni Emotion System

> *"Animation is about creating the illusion of life."*

## Vision

Transform Ferni from a functional avatar into a **living character** that users form emotional bonds with — simple forms with profound personality.

---

## ✅ Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| **Emotion State Machine** | ✅ Complete | 8 core emotions with full parameters |
| **FerniOrchestrator** | ✅ Complete | GSAP-powered breathing, glow, ring, reactions |
| **Emotion Triggers** | ✅ Complete | Voice/text analysis → emotion mapping |
| **Waveform Shapes** | ✅ Complete | Design system integration with morphing |
| **Dev Panel Testing** | ✅ Complete | All emotions testable via Cmd/Ctrl+Shift+D |
| **Design System Tokens** | ✅ Complete | 10 emotion shapes with parameters |
| **Persona Profiles** | ✅ Complete | Per-persona animation timing/style |
| **Character Reactions** | ✅ Complete | nod, shake, bounce, celebrate, curious, surprise |
| **Personality Quirks** | ✅ Complete | Blinks, tilts, warmth pulses |
| **Voice-Reactive** | ⚡ Partial | Text triggers work; real-time voice analysis planned |

---

## 🎭 The 12 Principles of Animation Applied to Ferni

These classic animation principles guide how Ferni moves and expresses emotion:

| Principle | Application |
|-----------|-------------|
| **1. Squash & Stretch** | Avatar compresses on "inhale", stretches on "exhale". Reactions exaggerate this. |
| **2. Anticipation** | Brief wind-up before every action. Nod pulls back slightly before dipping. |
| **3. Staging** | One clear action at a time. When speaking, avatar is the star — UI fades. |
| **4. Straight Ahead** | Continuous breathing, never static. Always alive. |
| **5. Follow-Through** | Secondary elements (ring, glow, text) lag slightly behind primary motion. |
| **6. Slow In/Out** | Golden ratio easing. Never linear motion. |
| **7. Arcs** | Eye tracking follows curved paths, not straight lines. |
| **8. Secondary Action** | Glow pulses slightly out of phase with breathing. Ring rotates independently. |
| **9. Timing** | Fast reactions for excitement, slow for contemplation. Persona-specific. |
| **10. Exaggeration** | Push emotions 10-20% beyond "realistic" — make feelings unmistakable. |
| **11. Solid Drawing** | Consistent transform origins. No visual glitches. |
| **12. Appeal** | Warm colors, soft gradients, curious behaviors. Instantly lovable. |

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    EMOTION STATE MACHINE                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │ NEUTRAL │──│  HAPPY  │──│ EXCITED │──│ CURIOUS │       │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘       │
│       │            │            │            │              │
│  ┌────┴────┐  ┌────┴────┐  ┌────┴────┐  ┌────┴────┐       │
│  │  CALM   │  │   SAD   │  │FRUSTRATED│  │THINKING │       │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   ANIMATION ORCHESTRATOR                     │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   GSAP Master Timeline                │  │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │  │
│  │  │Breathing│ │ Glow   │ │  Ring  │ │ Eyes   │        │  │
│  │  │Timeline │ │Timeline│ │Timeline│ │Timeline│        │  │
│  │  └────────┘ └────────┘ └────────┘ └────────┘        │  │
│  └──────────────────────────────────────────────────────┘  │
│                              │                              │
│                              ▼                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Visual Output Layers                     │  │
│  │                                                       │  │
│  │   Layer 4: Particles & Effects (celebration, sparkle) │  │
│  │   Layer 3: Glow & Shadows (emotion-reactive)          │  │
│  │   Layer 2: Ring (breathing, pulse, emotion color)     │  │
│  │   Layer 1: Avatar (squash/stretch, transforms)        │  │
│  │   Layer 0: Container (position, scale baseline)       │  │
│  │                                                       │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 File Structure

```
apps/web/src/
├── emotion/
│   ├── emotion-state.ts          # Central emotion state machine
│   ├── emotion-triggers.ts       # NLP/voice analysis → emotion mapping
│   └── index.ts                  # Public API
│
├── animation/
│   ├── ferni-orchestrator.ts     # GSAP master timeline coordinator
│   └── index.ts                  # Public API
│
├── ui/
│   ├── presence.ui.ts            # Integrated with emotion system
│   ├── avatar-feedback.ui.ts     # Avatar feedback reactions
│   └── ...
```

---

## 🎨 Emotion Definitions

### Core Emotions (8 States)

```typescript
interface EmotionState {
  id: EmotionId;
  
  // Visual Parameters
  color: {
    primary: string;      // Ring/glow color
    glow: string;         // Shadow color
    intensity: number;    // 0-1 glow strength
  };
  
  // Animation Parameters
  breathing: {
    rate: number;         // Breaths per minute (12-20 human range)
    depth: number;        // Squash/stretch amount (0.98-1.04)
    rhythm: 'regular' | 'irregular' | 'sighing';
  };
  
  // Movement Parameters
  movement: {
    energy: number;       // 0-1 movement intensity
    speed: number;        // Animation speed multiplier
    jitter: number;       // Random micro-movement amount
  };
  
  // Sound-reactive Parameters
  waveform: {
    shape: number[];      // 9-bar height curve
    bounce: number;       // Response to volume peaks
    smoothing: number;    // How quickly bars settle
  };
  
  // Personality
  quirks: {
    blinkRate: number;    // Blinks per minute
    curiousTilts: boolean;
    warmthPulses: boolean;
  };
}
```

### Emotion Presets

| Emotion | Breathing Rate | Energy | Waveform Shape |
|---------|----------------|--------|----------------|
| **Neutral** | 14 BPM | 0.3 | Centered peak |
| **Happy** | 16 BPM | 0.6 | Smile (edges up) |
| **Excited** | 20 BPM | 0.9 | All high, bouncy |
| **Curious** | 15 BPM | 0.5 | Attentive middle |
| **Thinking** | 12 BPM | 0.2 | Contemplative pulse |
| **Calm** | 10 BPM | 0.15 | Gentle even wave |
| **Sad** | 11 BPM | 0.1 | Frown (edges down) |
| **Frustrated** | 18 BPM | 0.7 | Jagged peaks |

---

## 🎬 GSAP Orchestrator Design

The `FerniOrchestrator` coordinates all avatar animations through GSAP timelines:

### Master Timeline Architecture

```typescript
class FerniOrchestrator {
  private masterTimeline: gsap.core.Timeline;
  private breathingTL: gsap.core.Timeline;
  private glowTL: gsap.core.Timeline;
  private ringTL: gsap.core.Timeline;
  
  // Emotion transitions with smooth morphing
  transitionTo(emotionId: EmotionId): void;
  
  // Character reactions
  react(type: 'nod' | 'shake' | 'bounce' | 'celebrate'): void;
}
```

### Reaction Types

| Reaction | Description | Use Case |
|----------|-------------|----------|
| `nod` | Acknowledgment with follow-through | Agreement, understanding |
| `shake` | Gentle disagreement | Correction, "not quite" |
| `bounce` | Excited hop with squash/stretch | Celebration, joy |
| `pulse` | Attention/warmth pulse | Acknowledgment |
| `curious` | Head tilt examining something | Interest, question |
| `surprise` | Quick scale up with brightness | Unexpected input |
| `celebrate` | Full multi-bounce celebration | Major achievements |

---

## 🎯 Emotion Triggers

### Voice Analysis → Emotion Mapping

| Voice Pattern | Detected Emotion |
|---------------|------------------|
| High volume + high pitch variance | Excited |
| Low volume + low pitch | Calm or Sad |
| Fast speaking rate + variance | Excited |
| Fast speaking rate - variance | Frustrated |
| Slow rate + pauses | Thinking |

### Text Analysis → Emotion Mapping

| Keywords | Detected Emotion |
|----------|------------------|
| great, wonderful, amazing, love | Happy |
| interesting, tell me more, how, why | Curious |
| let me think, consider, perhaps | Thinking |
| don't worry, relax, breathe | Calm |
| sorry, understand, difficult | Sad (empathetic) |

---

## 🌟 Personality Quirks

Random delightful behaviors that make Ferni feel alive:

| Quirk | Frequency | Description |
|-------|-----------|-------------|
| **Blinking** | 8-25/min (emotion-based) | Natural human-like blinks |
| **Curious Tilts** | 8-20 sec intervals | Head tilts when curious |
| **Warmth Pulses** | 15-35 sec intervals | Gentle glow when happy/calm |
| **Micro-movements** | 3-8 sec intervals | Subtle weight shifts |

---

## 🎮 API Design

### Public Interface

```typescript
import { presenceUI } from './ui/presence.ui';

// Initialize with GSAP orchestrator
presenceUI.init({ useGsapOrchestrator: true });

// Set emotions
presenceUI.setFerniEmotion('curious');

// Flash emotion temporarily (2 seconds)
presenceUI.flashFerniEmotion('excited', 2000);

// Play character reactions
presenceUI.reactFerni('bounce');    // Excited hop
presenceUI.reactFerni('celebrate'); // Full celebration

// Auto-detect emotion from text
presenceUI.processTextEmotion("That's amazing!"); // → happy

// Process TTS emotion hint from backend
presenceUI.processEmotionHint('cheerful'); // → happy
```

---

## 🎨 Visual Reference

### Emotion Color Palette (Brand-Compliant)

| Emotion | Primary | Glow | Ring Opacity |
|---------|---------|------|--------------|
| Neutral | `--persona-primary` | `--persona-glow` | 0.3 |
| Happy | `--color-highlight` | warm gold | 0.5 |
| Excited | `--color-jordan` | warm coral | 0.7 |
| Curious | `--color-peter` | cool teal | 0.4 |
| Thinking | `--color-alex` | soft indigo | 0.35 |
| Calm | `--color-ferni` | sage green | 0.25 |
| Sad | `--color-peter` | muted teal | 0.2 |
| Frustrated | `--color-error` | warm red | 0.45 |

---

## 🔗 Integration Points

### With Existing Systems

1. **TTS Emotion Hints** → `emotion-triggers.ts`
2. **Voice Activity** → `setVoiceMetrics()`
3. **Tool Results** → `react()` or `setEmotion()`
4. **Persona Switch** → `celebrate()` + `setEmotion()`
5. **User Sentiment** → `emotion-triggers.analyzeText()`

---

## 📚 References

- [The 12 Principles of Animation](https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation)
- [GSAP Timeline Documentation](https://greensock.com/docs/v3/GSAP/Timeline)
- [Apple Human Interface Guidelines - Motion](https://developer.apple.com/design/human-interface-guidelines/motion)

---

## 🧪 Testing with Dev Panel

Open the dev panel with **Cmd/Ctrl+Shift+D** to test all emotion features:

### Emotion Buttons
Click any emotion to set it immediately:
- 😐 Neutral, 😊 Happy, 🎉 Excited, 🤔 Curious
- 🧠 Thinking, 😌 Calm, 😢 Sad, 😤 Frustrated

### Reaction Buttons
Test character reactions with anticipation + follow-through:
- 👍 Nod - Agreement
- 👎 Shake - Gentle disagreement  
- 🦘 Bounce - Excited hop with squash/stretch
- 🎊 Celebrate - Full celebration sequence

### Flash Emotions
Temporarily set an emotion for 2 seconds, then return to previous:
- ⚡ Flash Excited, ⚡ Flash Happy, ⚡ Flash Curious

### Waveform Preview
Visual preview of emotion shapes in the dev panel:
- Neutral (centered peak)
- Happy (smile curve - edges up)
- Sad (frown curve - edges down)
- Excited (all high with bounce)

---

## 📝 Usage Examples

```typescript
import { presenceUI } from './ui/presence.ui';

// Set emotions
presenceUI.setFerniEmotion('happy');
presenceUI.setFerniEmotion('curious');

// Flash emotion temporarily (2 seconds)
presenceUI.flashFerniEmotion('excited', 2000);

// Play character reactions
presenceUI.reactFerni('nod');      // Agreement
presenceUI.reactFerni('bounce');   // Excited hop
presenceUI.reactFerni('celebrate'); // Full celebration

// Process text for emotion cues
presenceUI.processTextEmotion("That's amazing!"); // → happy
presenceUI.processTextEmotion("Hmm, let me think about that..."); // → thinking
```

---

*"The art challenges the technology, and the technology inspires the art."*
