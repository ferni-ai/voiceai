# Ferni Sound Design Brief

> **"Sound is the invisible architecture of emotion."**

---

## Philosophy

Sound in Ferni is never decorative. Every audio element serves emotional purpose:
- **Welcome** the user
- **Acknowledge** their input
- **Signal** state changes
- **Celebrate** their wins
- **Calm** their anxiety

Sound should feel organic, warm, and human—never synthetic or gamified.

---

## Core Sound Palette

### Tonal Center
- **Key**: A major (warm, hopeful)
- **Mode**: Mixolydian (slightly dreamy)
- **Tempo**: 60-80 BPM (resting heart rate)

### Instruments
| Category | Instruments | Feel |
|----------|-------------|------|
| **Primary** | Piano, soft synths | Warm, intimate |
| **Secondary** | Marimba, kalimba | Organic, friendly |
| **Texture** | Soft pads, breath sounds | Ambient, alive |
| **Avoid** | Sharp synths, digital beeps | Cold, robotic |

### Reference Artists
- Nils Frahm (intimate piano)
- Ólafur Arnalds (electronic warmth)
- Brian Eno (ambient texture)
- Ryuichi Sakamoto (emotional minimalism)

---

## UI Sound System

### Feedback Sounds

| Action | Sound | Duration | Notes |
|--------|-------|----------|-------|
| **Tap/Select** | Soft marimba note | 80ms | Light, not clicky |
| **Confirm** | Two-note rising | 150ms | Gentle affirmation |
| **Cancel** | Soft descend | 120ms | Not punishing |
| **Error** | Low soft tone | 200ms | Concerned, not alarming |
| **Success** | Warm chord | 300ms | Celebration without fanfare |

### Navigation Sounds

| Action | Sound | Duration | Notes |
|--------|-------|----------|-------|
| **Open app** | Warm welcome | 500ms | Like a door opening |
| **Screen transition** | Soft whoosh | 200ms | Air, not digital |
| **Menu open** | Light rise | 150ms | Invitation |
| **Menu close** | Light fall | 150ms | Gentle closing |
| **Back** | Soft step back | 100ms | Spatial movement |

### Input Sounds

| Action | Sound | Duration | Notes |
|--------|-------|----------|-------|
| **Start recording** | Breath in | 200ms | Listening begins |
| **Stop recording** | Breath out | 200ms | Message received |
| **Typing** | None | - | Silence is fine |
| **Send** | Soft release | 150ms | Message on its way |

---

## Persona Sound Signatures

Each persona has a subtle audio identity:

### Ferni (The Heart)
- **Tone**: Warm, centered, grounding
- **Instrument**: Soft piano, gentle pad
- **Interval**: Perfect fifth (stable, home)
- **Entry**: Soft chord like returning home

### Maya (The Habits Coach)
- **Tone**: Encouraging, rhythmic
- **Instrument**: Marimba, light percussion
- **Interval**: Major third (cheerful)
- **Entry**: Playful rising arpeggio

### Peter (The Quant)
- **Tone**: Curious, sparkling
- **Instrument**: Celesta, bright synth
- **Interval**: Minor seventh (mystery, discovery)
- **Entry**: Lightbulb sparkle sound

### Jordan (The Lifetime Planner)
- **Tone**: Celebratory, bright
- **Instrument**: Kalimba, wind chimes
- **Interval**: Major sixth (joy)
- **Entry**: Confetti-like cascade

### Alex (The Chief of Staff)
- **Tone**: Clean, efficient
- **Instrument**: Clean piano, minimal synth
- **Interval**: Perfect fourth (resolution)
- **Entry**: Crisp, clean note

### Nayan (The Sage)
- **Tone**: Deep, contemplative
- **Instrument**: Deep pad, singing bowl
- **Interval**: Perfect octave (spaciousness)
- **Entry**: Slow, resonant tone

---

## Conversation Sounds

### Voice States

| State | Sound | Character |
|-------|-------|-----------|
| **User speaking** | None | Let them talk |
| **Ferni listening** | Soft ambient bed | Presence |
| **Ferni thinking** | Subtle processing | Brief |
| **Ferni speaking** | Voice only | Clear |

### Transitions

| Transition | Sound | Duration |
|------------|-------|----------|
| **User finishes → Ferni thinks** | Soft intake | 150ms |
| **Ferni thinks → Ferni speaks** | Slight release | 100ms |
| **Ferni finishes → Listening** | Soft settle | 200ms |

### Persona Handoffs

| Phase | Sound | Duration |
|-------|-------|----------|
| **Outgoing persona farewell** | Gentle descend | 300ms |
| **Transition** | Soft whoosh | 200ms |
| **Incoming persona arrival** | Characteristic tone | 400ms |

---

## Emotional Sounds

### Celebration Moments
- **Small win**: Light chime
- **Streak milestone**: Warm cascade
- **Big achievement**: Full chord with sustain
- **Habit completed**: Satisfying ping

### Support Moments
- **Detecting concern**: Soft, protective tone
- **Entering protective mode**: Warm embrace sound
- **After vulnerability**: Gentle holding sound

### Ambient States
- **Idle**: Very soft breathing pad
- **Night mode**: Deeper, slower ambient
- **Deep conversation**: Minimal, respectful

---

## Notification Sounds

### Priority Levels

| Priority | Sound | When |
|----------|-------|------|
| **Gentle reminder** | Soft single note | Check-ins |
| **Standard** | Two-note rise | Regular notifications |
| **Important** | Three-note phrase | Commitments, milestones |
| **Celebration** | Warm flourish | Achievements |

### Time-of-Day Adaptation
- **Morning (6-9am)**: Brighter, energizing
- **Day (9am-6pm)**: Neutral, clear
- **Evening (6-10pm)**: Warmer, softer
- **Night (10pm-6am)**: Very soft, minimal

---

## Technical Specifications

### File Formats
- **Primary**: WAV (48kHz, 16-bit)
- **Compressed**: AAC (256kbps)
- **Fallback**: MP3 (192kbps)

### Loudness Standards
- **UI sounds**: -24 LUFS (subtle)
- **Notifications**: -18 LUFS (noticeable)
- **Celebrations**: -16 LUFS (present but not loud)

### Duration Guidelines
- **Micro-feedback**: 50-100ms
- **UI feedback**: 100-200ms
- **Transitions**: 200-400ms
- **Celebrations**: 300-800ms
- **Ambient loops**: 10-30 seconds

### Latency Requirements
- **UI feedback**: <50ms
- **Voice state changes**: <100ms
- **Notifications**: <200ms

---

## Accessibility

### Users with Hearing Impairments
- All sound cues have visual equivalents
- Haptic feedback mirrors audio feedback
- Sound is never the only signal

### Users with Sensory Sensitivity
- All sounds can be disabled
- Volume controls for each category
- "Minimal sound" mode available

### Preferences
- UI sounds: On/Off
- Notification sounds: On/Off
- Celebration sounds: On/Off
- Ambient sounds: On/Off
- Master volume: 0-100%

---

## Sound Don'ts

| Don't | Why |
|-------|-----|
| **Jarring beeps** | Feels robotic, not human |
| **Gamified sounds** | Ferni isn't a game |
| **Attention-grabbing alerts** | Respect the user's space |
| **Synthetic voices** | We use real, warm TTS |
| **Silence during speaking** | Some presence helps |
| **Identical sounds** | Each action needs its own character |

---

## Implementation Notes

### Sound Engine
- Use Web Audio API for precise timing
- Implement sound sprites for efficiency
- Cache frequently used sounds
- Handle audio context properly

### State Management
```javascript
// Sound configuration
const soundConfig = {
    enabled: true,
    volume: 0.7,
    categories: {
        ui: true,
        notifications: true,
        celebrations: true,
        ambient: false
    }
};
```

### Circadian Integration
```javascript
function getSoundVariant(soundName, hour) {
    const period = getCircadianPeriod(hour);
    return `${soundName}_${period}`; // e.g., "confirm_night"
}
```

---

## Production Process

### Phase 1: Core UI Sounds
1. Tap/select feedback
2. Confirm/cancel
3. Navigation transitions
4. Input sounds

### Phase 2: Persona Signatures
1. Each persona entry sound
2. Handoff transitions
3. Characteristic accents

### Phase 3: Emotional Sounds
1. Celebration system
2. Support sounds
3. Ambient beds

### Phase 4: Polish
1. Time-of-day variants
2. Volume balancing
3. User testing
4. Accessibility verification

---

## Success Criteria

After implementation:
- ✅ Sound feels warm, not synthetic
- ✅ Each persona has distinct character
- ✅ Celebrations feel earned
- ✅ Nothing is jarring or annoying
- ✅ Silence is comfortable
- ✅ Users feel welcomed, not bombarded

---

*The best sound design is felt, not heard.*
