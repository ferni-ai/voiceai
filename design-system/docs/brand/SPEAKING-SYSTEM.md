# Ferni Speaking System

> **Three layers working in harmony to convey speech without a mouth**

The speaking system is how Ferni expresses voice across all platforms. Like Pixar's WALL-E and Luxo Jr., we don't need a literal mouth to communicate—we use the **whole body**.

---

## The Three Layers

### 1. Body Pulse (PRIMARY)
**Role:** Most visible indicator, like a bass speaker cone

The avatar's body compresses and stretches with voice volume. When Ferni speaks louder, the body stretches taller and squashes narrower. This is the Pixar "squash & stretch" principle applied to voice.

| Parameter | Value | Description |
|-----------|-------|-------------|
| Max Scale Y | 1.08 | +8% stretch when loud |
| Min Scale X | 0.97 | -3% squash when loud |
| Squash Ratio | 0.4 | Horizontal compression relative to vertical stretch |
| Eye Squint | 15% | Eyes squint slightly when speaking loud |

**Why it works:** The body pulse feels like breathing, like life. It's the most visible change and communicates "I'm speaking" even in peripheral vision.

---

### 2. Halo Pulse (AMBIENT)
**Role:** Sound waves emanating, peripheral awareness

The presence ring (halo) around Ferni pulses outward with voice, like sound waves from a speaker. Secondary wave rings appear at higher volumes, creating a "radiating voice" effect.

| Parameter | Value | Description |
|-----------|-------|-------------|
| Max Scale | 1.015 | +1.5% scale at max volume |
| Min Opacity | 0.3 | Idle opacity |
| Max Opacity | 0.5 | +20% opacity when speaking |
| Wave Count | 2 | Secondary rings for loud speech |
| Wave Scale Increment | +4% | Each wave slightly larger |
| Wave Opacity Decay | 50% | Each wave more transparent |

**Why it works:** The halo creates ambient awareness—you sense Ferni is speaking even when not looking directly. Like a lamp's glow intensifying.

---

### 3. Lid Mouth (DETAIL)
**Role:** Articulation detail, subtle "mouth" opening

The bottom lid (the cream-colored mask over the avatar) opens with voice volume, creating a subtle "speaking" effect. The top lid slightly closes, like eyes narrowing with effort.

| Parameter | Value | Description |
|-----------|-------|-------------|
| Top Lid Y (closed) | -10 | Neutral position |
| Top Lid Y (open) | 15 | Closes slightly when speaking |
| Bottom Lid Y (closed) | 110 | Neutral position (invisible) |
| Bottom Lid Y (open) | 70 | Opens to reveal green orb |

**Why it works:** The lid mouth adds subconscious "talking" detail. Your brain registers the movement as speech articulation without needing to see an actual mouth.

---

## How They Work Together

```
Volume: ────────████████████████░░░░░░░░░░░░░░░░░░░░░░
              0%              50%             100%

Body:   ▪────────●────────────●────────────────────●
        1.0      1.02         1.05                1.08
        (idle)   (whisper)    (normal)           (loud)

Halo:   ○────────◉────────────◉────────────────────◉
        0.3      0.35         0.4                 0.5
        (idle)   (whisper)    (normal)           (loud)

Lid:    ═────────≡────────────≡────────────────────≈
        Y:110    Y:100        Y:85                Y:70
        (closed) (slight)     (medium)           (open)
```

### Timing & Smoothing

| Action | Duration | Easing |
|--------|----------|--------|
| Attack (volume up) | ~80ms | `smoothingAttack: 0.25` |
| Release (volume down) | ~200ms | `smoothingRelease: 0.08` |
| Phrase rhythm | 450ms | Natural speech cadence |
| Wave phase offset | 100ms | Secondary waves lag |

**Key insight:** Attack is FAST (responsive), release is SLOW (organic). This creates the "bass speaker" feel.

---

## Platform Implementation

### Web (TypeScript)

```typescript
// From presence.ui.ts - Body Pulse
const scaleY = 1 + (volume * 0.08);  // Max 1.08
const scaleX = 1 - (volume * 0.03);  // Min 0.97
avatarContainer.style.transform = `scaleX(${scaleX}) scaleY(${scaleY})`;

// From speaking-mouth.ui.ts - Lid Mouth
const bottomY = 110 - (volume * 40);  // 110 → 70
lidBottom.setAttribute('d', `M 0,100 Q 50,${bottomY} 100,100 L 100,100 L 0,100 Z`);

// Halo (add secondary waves)
presenceRing.style.transform = `scale(${1 + volume * 0.015})`;
presenceRing.style.opacity = `${0.3 + volume * 0.2}`;
```

### iOS (SwiftUI)

```swift
struct SpeakingAvatar: View {
    @Binding var volume: CGFloat  // 0.0 - 1.0
    
    var body: some View {
        ZStack {
            // Layer 1: Halo with waves
            ForEach(0..<3) { i in
                Circle()
                    .stroke(Color.ferni, lineWidth: 1.5)
                    .scaleEffect(1 + volume * (0.015 + CGFloat(i) * 0.04))
                    .opacity(Double(0.3 + volume * 0.2) * pow(0.5, Double(i)))
            }
            
            // Layer 2: Body with squash/stretch
            AvatarBody()
                .scaleEffect(x: 1 - volume * 0.03, y: 1 + volume * 0.08)
            
            // Layer 3: Lid mouth
            LidOverlay(bottomY: 110 - volume * 40)
        }
    }
}
```

### Android (Jetpack Compose)

```kotlin
@Composable
fun SpeakingAvatar(volume: Float) {  // 0f - 1f
    val scaleX by animateFloatAsState(1f - volume * 0.03f)
    val scaleY by animateFloatAsState(1f + volume * 0.08f)
    val haloScale by animateFloatAsState(1f + volume * 0.015f)
    val haloAlpha by animateFloatAsState(0.3f + volume * 0.2f)
    
    Box(contentAlignment = Alignment.Center) {
        // Layer 1: Halo waves
        repeat(3) { i ->
            Canvas(modifier = Modifier.fillMaxSize()) {
                drawCircle(
                    color = FerniGreen.copy(alpha = haloAlpha * (0.5f.pow(i))),
                    style = Stroke(1.5.dp.toPx()),
                    radius = size.minDimension / 2 * (haloScale + i * 0.04f)
                )
            }
        }
        
        // Layer 2: Body
        AvatarBody(
            modifier = Modifier.graphicsLayer {
                this.scaleX = scaleX
                this.scaleY = scaleY
            }
        )
        
        // Layer 3: Lid mouth
        LidOverlay(bottomY = 110f - volume * 40f)
    }
}
```

---

## Design Principles

### DO ✅

- **Combine all three layers** — Each adds to the whole
- **Keep body pulse dominant** — It's the PRIMARY signal
- **Smooth the transitions** — Fast attack, slow release
- **Respect the volume curve** — Louder = more effect
- **Maintain Pixar timing** — Squash/stretch feels organic

### DON'T ❌

- **Use just one layer** — The magic is in the combination
- **Make halo too dramatic** — It's AMBIENT, not primary
- **Animate linearly** — Always ease, never linear
- **Forget the squash** — Without horizontal squash, stretch looks wrong
- **Ignore low volumes** — Even whispers should have subtle movement

---

## Testing Checklist

- [ ] Body stretches taller when volume increases
- [ ] Body squashes narrower when stretching
- [ ] Halo pulses outward with voice
- [ ] Secondary halo waves appear at high volume
- [ ] Bottom lid opens with volume
- [ ] Top lid slightly closes with volume
- [ ] Attack is fast, release is slow
- [ ] Works at all volume levels (whisper to shout)
- [ ] Looks natural during pauses in speech
- [ ] Combined effect clearly says "speaking"

---

## References

- **Playground demo:** `design-system/playground/ferni-speaking-system.html`
- **Design tokens:** `design-system/tokens/animation.json` → `speakingSystem`
- **Web implementation:** `apps/web/src/ui/presence.ui.ts`, `speaking-mouth.ui.ts`
- **iOS implementation:** `apps/ios-native/...` (TBD)
- **Android implementation:** `apps/android-native/...` (TBD)

---

## Inspiration

> "The illusion of life." — Frank Thomas & Ollie Johnston

WALL-E doesn't have a mouth, but you always know when he's "speaking" through his body language, eye movements, and sounds. Luxo Jr. communicates purely through motion. Ferni does the same—the speaking system is our voice made visible.
