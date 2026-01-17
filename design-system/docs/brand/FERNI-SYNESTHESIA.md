# 🎭 Ferni Synesthesia
## Voice + Visual + Sound Synchronization

**Version 1.0 | December 2024**

---

> *"Great experiences happen when every sense tells the same story."*

---

# Table of Contents

1. [The Synesthesia Principle](#1-the-synesthesia-principle)
2. [Voice-Visual Sync](#2-voice-visual-sync)
3. [Voice-Sound Sync](#3-voice-sound-sync)
4. [Emotional State Mapping](#4-emotional-state-mapping)
5. [Avatar Reaction System](#5-avatar-reaction-system)
6. [Persona Synesthesia Profiles](#6-persona-synesthesia-profiles)
7. [Speech Pattern Visualization](#7-speech-pattern-visualization)
8. [Technical Implementation](#8-technical-implementation)
9. [Edge Cases](#9-edge-cases)

---

# 1. The Synesthesia Principle

## What is Synesthesia?

In Ferni, synesthesia means that **voice, visuals, and sound move together as one**. When Ferni speaks faster, the avatar breathes faster. When the user shares something emotional, the ambient sound warms. When there's silence, everything calms.

### The Goal

The user should **feel** the AI, not just hear it.

### The Three Layers

```
┌─────────────────────────────────────┐
│  VOICE                              │
│  What Ferni says and how            │
│  • Words • Pace • Pitch • Pauses    │
├─────────────────────────────────────┤
│  VISUAL                             │
│  What the user sees                 │
│  • Avatar • Colors • Motion • Glow  │
├─────────────────────────────────────┤
│  SOUND                              │
│  What accompanies the voice         │
│  • Ambient • Accents • Transitions  │
└─────────────────────────────────────┘
```

**These three layers must always tell the same story.**

---

# 2. Voice-Visual Sync

## 2.1 Speaking State

When Ferni is speaking, visuals respond in real-time:

### Audio Amplitude → Avatar Breathing

| Amplitude | Avatar Behavior |
|-----------|-----------------|
| Silent | Gentle idle breathing (5s cycle) |
| Soft speaking | Moderate breathing (3s cycle) |
| Normal speaking | Active breathing (2s cycle) |
| Emphatic | Quick breathing + glow pulse |

### Implementation

```typescript
// Voice amplitude → Avatar breathing rate
const AMPLITUDE_TO_BREATH_RATE = {
  silent: 5000,    // 5s breath cycle
  low: 4000,       // 4s cycle
  medium: 3000,    // 3s cycle
  high: 2000,      // 2s cycle
  emphatic: 1500,  // 1.5s cycle + glow
};

function updateAvatarBreathing(amplitude: number) {
  const normalizedAmp = normalizeAmplitude(amplitude);
  const breathRate = interpolateBreathRate(normalizedAmp);
  avatar.setBreathingRate(breathRate);
  
  if (normalizedAmp > EMPHATIC_THRESHOLD) {
    avatar.pulse(); // Add glow pulse
  }
}
```

---

## 2.2 Speech Pace → Visual Rhythm

| Speech Pace | Visual Response |
|-------------|-----------------|
| Slow, deliberate | Avatar leans slightly, attentive |
| Normal | Standard breathing, centered |
| Fast, excited | Slight bounce, increased glow |
| Pause | Hold, then subtle "thinking" tilt |

---

## 2.3 Content → Color Temperature

What Ferni says affects the visual warmth:

| Content Type | Color Response |
|--------------|----------------|
| Empathetic ("I hear you") | Glow warms (amber tint) |
| Curious ("Tell me more") | Glow brightens slightly |
| Celebratory ("That's amazing!") | Glow pulses, sparkle |
| Thoughtful ("Hmm, let me think") | Glow softens, dims slightly |
| Serious ("This matters") | Glow steadies, deepens |

---

## 2.4 Word Emphasis → Visual Accent

When TTS emphasizes words, visuals respond:

```typescript
// Detect emphasis in speech
onWordEmphasis((word) => {
  avatar.pulse({
    intensity: word.emphasis, // 0-1
    duration: 300,
    color: getEmotionColor(word.sentiment),
  });
});
```

---

# 3. Voice-Sound Sync

## 3.1 Ambient Bed

The ambient sound layer responds to conversation state:

### Conversation Intensity → Ambient Volume

| State | Ambient Level |
|-------|---------------|
| Idle (no speech) | -24dB |
| User speaking | -30dB (duck for clarity) |
| AI speaking | -27dB |
| Emotional moment | -21dB (warmer, more present) |
| Celebration | -18dB (fuller sound) |

### Implementation

```typescript
const AMBIENT_LEVELS = {
  idle: -24,
  userSpeaking: -30,
  aiSpeaking: -27,
  emotional: -21,
  celebration: -18,
};

function updateAmbientLevel(conversationState: ConversationState) {
  const targetLevel = AMBIENT_LEVELS[conversationState];
  ambientPlayer.fadeToVolume(targetLevel, 500); // 500ms transition
}
```

---

## 3.2 Punctuation → Sound Accents

| Punctuation | Sound |
|-------------|-------|
| Period | Soft resolution tone |
| Question mark | Gentle upward inflection sound |
| Exclamation | Bright accent |
| Ellipsis (...) | Fading ambient swell |
| Comma | (silence, no sound) |

**Note:** These are subtle—barely noticeable consciously, but felt subconsciously.

---

## 3.3 Pause Duration → Sound Fill

| Pause Length | Sound Response |
|--------------|----------------|
| < 500ms | Silence |
| 500ms - 2s | Subtle ambient swell |
| > 2s | "Thinking" texture |
| > 5s | Gentle "we're here" tone |

---

## 3.4 Speech End → Sound Transition

When AI finishes speaking:

```typescript
onSpeechEnd(() => {
  // Play soft resolution
  audioPlayer.play('speech-end-soft', { volume: -12 });
  
  // Transition ambient back to idle level
  ambientPlayer.fadeToVolume(AMBIENT_LEVELS.idle, 1000);
  
  // If it was emotional content, hold warmth longer
  if (lastUtteranceWasEmotional) {
    setTimeout(() => {
      colorTemperature.fadeToNeutral(2000);
    }, 3000);
  }
});
```

---

# 4. Emotional State Mapping

## 4.1 Detected Emotion → Full Synesthesia

When emotion is detected in user or AI speech:

### User Emotion Detection

| Detected Emotion | Visual Response | Audio Response |
|------------------|-----------------|----------------|
| **Happy/Excited** | Glow brightens, warmer | Ambient lifts, brighter |
| **Sad/Down** | Glow softens, cooler | Ambient spacious, lower |
| **Anxious** | Glow steadies | Ambient grounding, stable |
| **Frustrated** | Glow calms | Ambient soothing |
| **Thoughtful** | Glow dims slightly | Ambient minimal |
| **Neutral** | Standard | Standard |

### Implementation

```typescript
interface EmotionState {
  type: 'happy' | 'sad' | 'anxious' | 'frustrated' | 'thoughtful' | 'neutral';
  intensity: number; // 0-1
  confidence: number; // 0-1
}

function applyEmotionSynesthesia(emotion: EmotionState) {
  if (emotion.confidence < 0.6) return; // Only act on confident detection
  
  // Visual
  avatar.setEmotionalState(emotion.type, emotion.intensity);
  colorTemperature.setEmotion(emotion.type);
  
  // Audio
  ambient.setEmotionalLayer(emotion.type, emotion.intensity);
  
  // Schedule return to neutral
  if (emotion.type !== 'neutral') {
    scheduleNeutralReturn(5000 * emotion.intensity);
  }
}
```

---

## 4.2 Emotional Transitions

Emotions don't snap—they transition smoothly:

```typescript
const EMOTION_TRANSITION_DURATIONS = {
  'neutral → happy': 800,
  'neutral → sad': 1200,      // Slower to sad
  'sad → happy': 1500,        // Takes time
  'happy → neutral': 2000,    // Let joy linger
  'anxious → calm': 3000,     // Gradual calming
};
```

---

# 5. Avatar Reaction System

## 5.1 Real-Time Reactions

The avatar reacts to specific triggers:

### During User Speech

| Trigger | Avatar Reaction |
|---------|-----------------|
| User pauses > 1s | Slight nod (acknowledgment) |
| User asks question | Attentive lean |
| User expresses emotion | Appropriate response pose |
| User finishes speaking | Ready-to-respond pose |

### During AI Speech

| Trigger | Avatar Reaction |
|---------|-----------------|
| Asking a question | Curious tilt |
| Expressing empathy | Warm pulse |
| Celebrating | Bounce + sparkle |
| Sharing something serious | Grounded, steady |
| Processing/thinking | Thoughtful tilt |

---

## 5.2 Backchannel Visuals

When AI produces backchannels ("mm-hmm", "I hear you"):

```typescript
const BACKCHANNEL_REACTIONS = {
  'mm-hmm': { reaction: 'nod', intensity: 0.3 },
  'uh-huh': { reaction: 'nod', intensity: 0.2 },
  'I see': { reaction: 'nod', intensity: 0.4 },
  'Go on': { reaction: 'attentive-lean', intensity: 0.3 },
  'Hmm': { reaction: 'think-tilt', intensity: 0.5 },
};
```

---

# 6. Persona Synesthesia Profiles

Each persona has a unique synesthesia signature:

## 6.1 Ferni

| Aspect | Profile |
|--------|---------|
| **Glow color** | Warm sage (#4a6741) |
| **Breathing pattern** | Calm, deep, centered |
| **Reaction style** | Warm, present, grounding |
| **Audio signature** | Felt piano, warm pad |
| **Ambient mood** | Centered, earthy |

---

## 6.2 Jack

| Aspect | Profile |
|--------|---------|
| **Glow color** | Cedar brown (#9a7b5a) |
| **Breathing pattern** | Slower, deliberate |
| **Reaction style** | Wise, knowing nods |
| **Audio signature** | Lower register, wood resonance |
| **Ambient mood** | Deep, spacious |

---

## 6.3 Peter

| Aspect | Profile |
|--------|---------|
| **Glow color** | Ocean teal (#3a6b73) |
| **Breathing pattern** | Quicker when excited |
| **Reaction style** | Curious tilts, eager leans |
| **Audio signature** | Brighter, clearer tones |
| **Ambient mood** | Energetic, bright |

---

## 6.4 Alex

| Aspect | Profile |
|--------|---------|
| **Glow color** | Soft indigo (#5a6b8a) |
| **Breathing pattern** | Measured, steady |
| **Reaction style** | Empathetic, mirroring |
| **Audio signature** | Clear, bell-like |
| **Ambient mood** | Calm, supportive |

---

## 6.5 Maya

| Aspect | Profile |
|--------|---------|
| **Glow color** | Dusty terracotta (#a67a6a) |
| **Breathing pattern** | Consistent rhythm |
| **Reaction style** | Efficient, focused |
| **Audio signature** | Grounded, rhythmic |
| **Ambient mood** | Structured, steady |

---

## 6.6 Jordan

| Aspect | Profile |
|--------|---------|
| **Glow color** | Warm sunset (#c4856a) |
| **Breathing pattern** | Higher energy |
| **Reaction style** | Bouncy, sparkly |
| **Audio signature** | Light, effervescent |
| **Ambient mood** | Joyful, anticipatory |

---

## 6.7 Persona Transition

When switching personas, all synesthesia layers transition together:

```typescript
async function transitionPersona(from: Persona, to: Persona) {
  const duration = 1000;
  
  // Audio transition
  await audio.crossfade(
    from.ambientProfile,
    to.ambientProfile,
    duration
  );
  
  // Visual transition
  await parallel([
    avatar.morphTo(to.avatarProfile, duration),
    glow.transitionColor(to.glowColor, duration),
    ambient.transitionMood(to.ambientMood, duration),
  ]);
  
  // Play persona entrance motif
  await audio.play(to.entranceMotif);
}
```

---

# 7. Speech Pattern Visualization

## 7.1 Waveform Display

When user is speaking, show voice waveform:

### Waveform Styling

| State | Visual Style |
|-------|--------------|
| User speaking | Warm, flowing wave |
| AI speaking | Persona-colored wave |
| Silence | Flat line with subtle pulse |
| Processing | Compressed, thinking wave |

### Implementation

```typescript
interface WaveformConfig {
  color: string;           // CSS variable or hex
  smoothing: number;       // 0-1, higher = smoother
  barCount: number;        // Number of frequency bars
  minHeight: number;       // Minimum bar height (px)
  maxHeight: number;       // Maximum bar height (px)
  gap: number;             // Gap between bars (px)
  borderRadius: number;    // Bar corner radius (px)
}

const USER_WAVEFORM: WaveformConfig = {
  color: 'var(--color-text-secondary)',
  smoothing: 0.8,
  barCount: 32,
  minHeight: 2,
  maxHeight: 48,
  gap: 2,
  borderRadius: 4,
};

const AI_WAVEFORM: WaveformConfig = {
  color: 'var(--persona-primary)',
  smoothing: 0.7,
  barCount: 48,
  minHeight: 2,
  maxHeight: 64,
  gap: 3,
  borderRadius: 4,
};
```

---

## 7.2 Transcript Timing

Words appear in sync with speech:

```typescript
// Word-by-word transcript reveal
interface TranscriptWord {
  text: string;
  startTime: number;  // ms from utterance start
  endTime: number;
  emphasis: boolean;
}

function revealTranscript(words: TranscriptWord[]) {
  words.forEach(word => {
    setTimeout(() => {
      transcriptElement.appendWord(word.text, {
        emphasized: word.emphasis,
        duration: word.endTime - word.startTime,
      });
    }, word.startTime);
  });
}
```

---

# 8. Technical Implementation

## 8.1 Audio Analysis

```typescript
interface AudioAnalyzer {
  // Real-time analysis
  getAmplitude(): number;      // 0-1
  getFrequencyData(): Uint8Array;
  getPitch(): number;          // Hz
  
  // Derived metrics
  getSpeechPace(): 'slow' | 'normal' | 'fast';
  getEmotionalTone(): EmotionState;
  isPaused(): boolean;
}

class SynesthesiaEngine {
  private audioAnalyzer: AudioAnalyzer;
  private avatar: AvatarController;
  private ambient: AmbientController;
  private glow: GlowController;
  
  // Main update loop (60fps)
  update() {
    const amp = this.audioAnalyzer.getAmplitude();
    const pace = this.audioAnalyzer.getSpeechPace();
    const emotion = this.audioAnalyzer.getEmotionalTone();
    
    this.avatar.update(amp, pace);
    this.glow.update(amp, emotion);
    this.ambient.update(emotion);
  }
}
```

## 8.2 State Machine

```typescript
type SynesthesiaState = 
  | 'idle'
  | 'user-speaking'
  | 'ai-speaking'
  | 'ai-thinking'
  | 'celebrating'
  | 'transitioning-persona';

interface StateConfig {
  avatar: AvatarConfig;
  ambient: AmbientConfig;
  glow: GlowConfig;
  allowedTransitions: SynesthesiaState[];
}

const STATE_CONFIGS: Record<SynesthesiaState, StateConfig> = {
  'idle': {
    avatar: { breathing: 'slow', pose: 'neutral' },
    ambient: { volume: -24, mood: 'calm' },
    glow: { intensity: 0.4, pulse: false },
    allowedTransitions: ['user-speaking', 'ai-speaking'],
  },
  'user-speaking': {
    avatar: { breathing: 'attentive', pose: 'listening' },
    ambient: { volume: -30, mood: 'attentive' },
    glow: { intensity: 0.3, pulse: false },
    allowedTransitions: ['idle', 'ai-thinking'],
  },
  // ... etc
};
```

## 8.3 Performance Optimization

```typescript
// Throttle visual updates for performance
const VISUAL_UPDATE_RATE = 60; // fps
const AUDIO_UPDATE_RATE = 30; // fps (lower for ambient)

class ThrottledSynesthesia {
  private visualTicker: Ticker;
  private audioTicker: Ticker;
  
  constructor() {
    this.visualTicker = new Ticker(1000 / VISUAL_UPDATE_RATE);
    this.audioTicker = new Ticker(1000 / AUDIO_UPDATE_RATE);
    
    this.visualTicker.onTick(() => this.updateVisuals());
    this.audioTicker.onTick(() => this.updateAudio());
  }
}
```

---

# 9. Edge Cases

## 9.1 Audio Muted

When user has muted audio:
- Visual synesthesia continues
- Avatar still reacts to voice amplitude
- No audio layer plays
- Visual cues become slightly more pronounced

## 9.2 Slow Connection

When latency is high:
- Show "thinking" state during delays
- Smooth over audio gaps with ambient
- Don't let avatar go completely idle

## 9.3 Multiple Speakers

If user has multiple voices (ambient noise):
- Focus on primary speech signal
- Reduce reaction sensitivity
- Maintain steady state over erratic

## 9.4 Accessibility Mode

When reduced motion is enabled:
- Disable avatar animations
- Keep audio synesthesia
- Show simpler visual feedback (color only)
- Maintain emotional responsiveness through color temperature

---

# Appendix: Sync Timing Reference

| Event | Visual Latency | Audio Latency |
|-------|----------------|---------------|
| Speech start | < 50ms | < 20ms |
| Amplitude change | < 33ms (60fps) | < 33ms |
| Emotion detection | < 500ms | < 500ms |
| Persona transition | 1000ms | 1000ms |
| Celebration trigger | < 100ms | < 50ms |

---

**© 2024 Ferni. All rights reserved.**

*When voice, sight, and sound move as one, the AI becomes truly present.*

