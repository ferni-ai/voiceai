# Speaking System Implementation Guide

> **Cross-platform implementation of Ferni's three-layer speaking animation**

This guide covers how to implement the speaking system on Web, iOS, and Android while maintaining visual consistency.

---

## Overview

The speaking system uses **three synchronized animation layers** to convey speech without a mouth:

| Layer | Role | Contribution |
|-------|------|--------------|
| **Body Pulse** | PRIMARY | Most visible, squash/stretch with volume |
| **Halo Pulse** | AMBIENT | Peripheral awareness, sound waves |
| **Lid Mouth** | DETAIL | Articulation, subtle mouth opening |

---

## Design Token Reference

All platforms should use the same values from `design-system/tokens/animation.json`:

```json
{
  "speakingSystem": {
    "layers": {
      "body": {
        "maxScaleY": 1.08,
        "minScaleX": 0.97,
        "squashRatio": 0.4,
        "eyeSquintMax": 0.15
      },
      "halo": {
        "maxScale": 1.015,
        "minOpacity": 0.3,
        "maxOpacity": 0.5,
        "waveCount": 2,
        "waveScaleIncrement": 0.04,
        "waveOpacityDecay": 0.5
      },
      "lidMouth": {
        "bottomYClosed": 110,
        "bottomYOpen": 70,
        "topYClosed": -10,
        "topYOpen": 15
      }
    }
  }
}
```

---

## Implementation Files

| Platform | File | Status |
|----------|------|--------|
| **Web** | `apps/web/src/ui/speaking-system.ui.ts` | ✅ Complete |
| **iOS** | `apps/ios-native/Ferni/UI/SpeakingSystem/FerniSpeakingAvatar.swift` | ✅ Complete |
| **Android** | `apps/android-native/app/.../ui/speaking/FerniSpeakingAvatar.kt` | ✅ Complete |
| **Brand Docs** | `design-system/docs/brand/SPEAKING-SYSTEM.md` | ✅ Complete |

---

## Web Implementation

### TypeScript

```typescript
import { speakingSystem } from './ui/speaking-system.ui.js';

// Initialize (call after DOM ready)
speakingSystem.init();

// Start speaking
speakingSystem.start();

// Update with voice volume (0-1)
speakingSystem.updateVolume(audioLevel);

// Stop speaking
speakingSystem.stop();
```

### CSS Variables

The system sets these CSS variables on `.avatar-container`:

```css
--speaking-scale-x: 0.97;  /* At max volume */
--speaking-scale-y: 1.08;  /* At max volume */
```

### Required DOM Structure

```html
<div class="avatar-container">
  <div class="speaking-halo-waves">
    <div class="speaking-halo-wave speaking-halo-wave-1"></div>
    <div class="speaking-halo-wave speaking-halo-wave-2"></div>
  </div>
  <div id="avatarRing"></div>
  <div id="coachAvatar">
    <!-- Avatar content + lid overlay -->
  </div>
</div>
```

---

## iOS Implementation

### SwiftUI

```swift
struct ContentView: View {
    @State private var volume: CGFloat = 0.0
    
    var body: some View {
        FerniSpeakingAvatar(
            size: 140,
            volume: $volume,
            primaryColor: .ferniGreen,
            secondaryColor: .ferniDarkGreen
        )
    }
}

// Update volume from audio analysis
func onAudioLevel(_ level: Float) {
    volume = CGFloat(level)
}
```

### Key Components

- `FerniSpeakingAvatar` - Main composable view
- `LidShape` - Animatable path for lid overlay
- Uses `interactiveSpring` for smooth, bouncy animation

---

## Android Implementation

### Jetpack Compose

```kotlin
@Composable
fun SpeakingScreen() {
    var volume by remember { mutableFloatStateOf(0f) }
    
    FerniSpeakingAvatar(
        size = 140.dp,
        volume = volume,
        primaryColor = FerniGreen,
        secondaryColor = FerniDarkGreen
    )
}

// Update volume from audio analysis
fun onAudioLevel(level: Float) {
    volume = level
}
```

### Key Components

- `FerniSpeakingAvatar` - Main composable
- `HaloLayer` - Canvas drawing for halo + waves
- `BodyLayer` - Squash/stretch with `graphicsLayer`
- `LidOverlay` - `Path.quadraticBezierTo` for lid curves
- Uses `animateFloatAsState` with spring spec

---

## Volume Smoothing

All platforms should smooth volume changes to avoid jitter:

### Algorithm

```
// Fast attack, slow release
if (currentVolume > smoothedVolume) {
    smoothedVolume += (currentVolume - smoothedVolume) * 0.25;  // Attack
} else {
    smoothedVolume += (currentVolume - smoothedVolume) * 0.08;  // Release
}
```

### Platform-Specific

| Platform | Smoothing Method |
|----------|------------------|
| Web | Manual in `requestAnimationFrame` loop |
| iOS | `interactiveSpring(response: 0.08)` |
| Android | `spring(dampingRatio: Medium, stiffness: Low)` |

---

## Testing Checklist

Use this checklist when implementing on any platform:

### Body Pulse
- [ ] Avatar stretches taller (+8% max) when volume increases
- [ ] Avatar squashes narrower (-3% max) when stretching
- [ ] Inverse relationship maintained (stretch Y → squash X)
- [ ] Eyes squint slightly (15% max) at high volume

### Halo Pulse
- [ ] Primary ring scales up to 1.015x at max volume
- [ ] Primary ring opacity increases (0.3 → 0.5)
- [ ] Two secondary waves appear at higher volumes
- [ ] Each wave is progressively larger and more transparent
- [ ] Waves are only visible when speaking (fade to 0 when idle)

### Lid Mouth
- [ ] Bottom lid Y moves from 110 → 70 with volume
- [ ] Top lid Y moves from -10 → 15 with volume (slight close)
- [ ] Smooth transitions, no jittering
- [ ] Returns to neutral (invisible) when idle

### Overall
- [ ] Attack is fast (responsive to volume spikes)
- [ ] Release is slow (organic decay)
- [ ] All three layers work together harmoniously
- [ ] Body is the most noticeable change
- [ ] Looks natural during speech pauses
- [ ] Works at all volume levels (whisper to shout)

---

## Debugging

### Web
```javascript
// Enable debug logging
localStorage.setItem('LOG_LEVEL', 'debug');

// Check speaking system state
window.speakingSystem = speakingSystem;
console.log(speakingSystem.isActive, speakingSystem.currentVolume);
```

### iOS
```swift
// Use Preview with slider
FerniSpeakingAvatar_Previews
```

### Android
```kotlin
// Use @Preview composable
FerniSpeakingAvatarPreview()
```

---

## Audio Integration

### Web (LiveKit)
```typescript
// In presence.ui.ts or audio handler
room.on('trackSubscribed', (track) => {
    if (track.kind === 'audio') {
        const analyser = createAudioAnalyser(track);
        analyser.on('level', (level) => {
            speakingSystem.updateVolume(level);
        });
    }
});
```

### iOS (AVAudioEngine)
```swift
let audioEngine = AVAudioEngine()
let inputNode = audioEngine.inputNode

inputNode.installTap(onBus: 0, bufferSize: 1024, format: nil) { buffer, _ in
    let level = self.calculateRMS(buffer)
    DispatchQueue.main.async {
        self.volume = CGFloat(level)
    }
}
```

### Android (AudioRecord)
```kotlin
val audioRecord = AudioRecord(...)
val buffer = ShortArray(bufferSize)

while (isRecording) {
    audioRecord.read(buffer, 0, bufferSize)
    val level = calculateRMS(buffer)
    withContext(Dispatchers.Main) {
        volume = level
    }
}
```

---

## Performance Considerations

### Web
- Use `requestAnimationFrame` for animation loop
- Set `will-change: transform` on animated elements
- Use CSS variables for values that change frequently

### iOS
- Use `@State` for volume to trigger view updates
- `interactiveSpring` is GPU-accelerated
- Avoid re-creating Path objects unnecessarily

### Android
- Use `graphicsLayer` for scale transforms (GPU-accelerated)
- `animateFloatAsState` handles frame interpolation
- Avoid recomposition by using `remember` for static values

---

## Future Enhancements

1. **Phoneme-based articulation** - Map specific sounds to lid shapes
2. **Emotion modifiers** - Happy speaking vs sad speaking lid positions
3. **Audio reactive halo colors** - Frequency-based color shifts
4. **Particle effects** - Sound particles emanating during loud speech

---

## Resources

- **Design Tokens**: `design-system/tokens/animation.json`
- **Brand Guide**: `design-system/docs/brand/SPEAKING-SYSTEM.md`
- **Interactive Demo**: `design-system/playground/ferni-speaking-system.html`
- **Pixar Principles**: `design-system/tokens/animation.json` → `pixarPrinciples`
