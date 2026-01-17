# Window Avatar Implementation Plan

> Practical guide for implementing the Window Avatar vision

---

## Quick Reference: Where Things Live

| Concept | Current File | What to Modify |
|---------|--------------|----------------|
| Lid overlay system | `apps/web/src/ui/ferni-expressions.ui.ts` | Add mouth animation |
| Speaking state | `apps/web/src/ui/presence.ui.ts` | Connect to lid |
| Voice volume | `apps/web/src/ui/presence.ui.ts:657` | Feed to mouth |
| Avatar styles | `apps/web/src/styles/inline-styles.css:3544` | Mouth CSS |
| iOS avatar | `apps/ios-native/` | New SwiftUI component |
| Android avatar | (to create) | New Compose component |
| Design tokens | `design-system/tokens/motion.json` | Mouth animation params |

---

## Phase 1: Speaking Mouth Animation

### Step 1: Add Mouth State to Expressions System

**File:** `apps/web/src/ui/ferni-expressions.ui.ts`

```typescript
// Add to state section
let mouthOpenAmount: number = 0;
let targetMouthOpen: number = 0;
const MOUTH_SMOOTHING = 0.15;

// Add mouth animation function
export function setMouthOpen(amount: number): void {
  targetMouthOpen = clamp(amount, 0, 1);
}

function updateMouth(): void {
  // Smooth toward target
  mouthOpenAmount += (targetMouthOpen - mouthOpenAmount) * MOUTH_SMOOTHING;
  
  // Generate path
  const bottomLid = lidOverlay?.querySelector('.lid-bottom');
  if (bottomLid) {
    const path = generateMouthPath(mouthOpenAmount, currentExpression);
    bottomLid.setAttribute('d', path);
  }
  
  // Continue animation loop
  if (Math.abs(targetMouthOpen - mouthOpenAmount) > 0.001) {
    requestAnimationFrame(updateMouth);
  }
}

function generateMouthPath(openAmount: number, emotion: EmotionalExpression): string {
  // Base: "M 0,100 Q 50,110 100,100 L 100,100 L 0,100 Z"
  // openAmount 0 = flat at bottom (110)
  // openAmount 1 = curved up significantly (85)
  
  const baseY = 100;
  const controlY = 110 - (openAmount * 25); // 110 → 85
  
  // Emotion modifiers
  const emotionMod = MOUTH_EMOTION_MODIFIERS[emotion] ?? { curve: 0, asymmetry: 0 };
  const leftY = baseY + emotionMod.asymmetry * 3;
  const rightY = baseY - emotionMod.asymmetry * 3;
  
  return `M 0,${leftY} Q 50,${controlY + emotionMod.curve * 5} 100,${rightY} L 100,100 L 0,100 Z`;
}

const MOUTH_EMOTION_MODIFIERS: Record<string, { curve: number; asymmetry: number }> = {
  neutral: { curve: 0, asymmetry: 0 },
  happy: { curve: -3, asymmetry: 0 },       // Smile up
  delighted: { curve: -5, asymmetry: 0 },   // Bigger smile
  sad: { curve: 3, asymmetry: 0 },          // Frown down
  skeptical: { curve: 1, asymmetry: 2 },    // Asymmetric
  curious: { curve: 0, asymmetry: 1 },      // Slight tilt
  surprised: { curve: 0, asymmetry: 0 },    // Round/open
  worried: { curve: 2, asymmetry: 0.5 },    // Compressed frown
};
```

### Step 2: Connect Voice Volume to Mouth

**File:** `apps/web/src/ui/presence.ui.ts`

```typescript
// In the voice pulse section (~line 657)
import { setMouthOpen } from './ferni-expressions.ui.js';

// Inside the animate() function in startVoicePulse():
const animate = () => {
  if (!avatarContainer || !isSpeaking) {
    stopVoicePulse();
    setMouthOpen(0); // Close mouth when done
    return;
  }
  
  // Existing smoothing logic...
  if (currentVoiceVolume > smoothedVoiceVolume) {
    smoothedVoiceVolume += (currentVoiceVolume - smoothedVoiceVolume) * config.smoothingUp;
  } else {
    smoothedVoiceVolume += (currentVoiceVolume - smoothedVoiceVolume) * config.smoothingDown;
  }
  
  // NEW: Update mouth opening based on volume
  setMouthOpen(smoothedVoiceVolume);
  
  // ... rest of existing code
};
```

### Step 3: Add Mouth CSS Animation Support

**File:** `apps/web/src/styles/inline-styles.css`

```css
/* Add after .avatar-lid-overlay .lid-bottom (around line 3558) */

/* Speaking mouth transitions */
.avatar-lid-overlay .lid-bottom {
  fill: var(--color-background-primary, #1a1612);
  /* Smooth path morphing */
  transition: d 0.08s cubic-bezier(0.16, 1, 0.3, 1);
}

/* When speaking, ensure smooth animation */
#coach.is-speaking .avatar-lid-overlay .lid-bottom {
  transition: d 0.05s linear; /* Faster for voice reactivity */
}

/* Reduced motion: disable mouth animation */
@media (prefers-reduced-motion: reduce) {
  .avatar-lid-overlay .lid-bottom {
    transition: none;
  }
}
```

### Step 4: Design Tokens for Mouth Animation

**File:** `design-system/tokens/motion.json`

```json
{
  "windowAvatar": {
    "mouth": {
      "smoothing": 0.15,
      "minOpen": 0,
      "maxOpen": 1,
      "transitionMs": {
        "idle": 200,
        "speaking": 80
      },
      "volumeScale": {
        "min": 0.3,
        "max": 1.0,
        "description": "Maps 0-1 volume to mouth open range"
      }
    },
    "lid": {
      "top": {
        "default": 0.12,
        "surprised": 0.06,
        "sleepy": 0.20
      },
      "bottom": {
        "default": 0.12,
        "speakingMax": 0.35
      }
    }
  }
}
```

---

## Phase 2: iOS Implementation

### Create SwiftUI Component

**File:** `apps/ios-native/Ferni/UI/Avatar/FerniWindowAvatar.swift`

```swift
import SwiftUI

struct FerniWindowAvatar: View {
    var size: CGFloat = 120
    var mood: AvatarMood = .neutral
    @Binding var isSpeaking: Bool
    @Binding var volume: CGFloat
    
    @State private var animatedVolume: CGFloat = 0
    
    // Window cutoff amounts
    private let topCutoff: CGFloat = 0.12
    private var bottomCutoff: CGFloat {
        let base: CGFloat = 0.12
        let speakingAddition = animatedVolume * 0.23 // 0.12 + 0.23 = 0.35 max
        return isSpeaking ? base + speakingAddition : base
    }
    
    var body: some View {
        ZStack {
            // Avatar face (the "behind")
            AvatarFace(size: size, mood: mood)
            
            // Top window mask
            WindowMask(
                edge: .top,
                cutoff: topCutoffForMood,
                curve: curveForMood(edge: .top)
            )
            
            // Bottom window mask (animated for speaking)
            WindowMask(
                edge: .bottom,
                cutoff: bottomCutoff,
                curve: curveForMood(edge: .bottom)
            )
            .animation(.spring(response: 0.08, dampingFraction: 0.8), value: animatedVolume)
        }
        .frame(width: size, height: size)
        .onChange(of: volume) { newVolume in
            // Smooth volume changes
            withAnimation(.linear(duration: 0.05)) {
                animatedVolume = newVolume
            }
        }
        .onChange(of: isSpeaking) { speaking in
            if !speaking {
                withAnimation(.easeOut(duration: 0.2)) {
                    animatedVolume = 0
                }
            }
        }
    }
    
    private var topCutoffForMood: CGFloat {
        switch mood {
        case .surprised: return 0.06
        case .sleepy: return 0.20
        case .thinking: return 0.14
        default: return topCutoff
        }
    }
    
    private func curveForMood(edge: WindowEdge) -> CGFloat {
        guard edge == .bottom else { return 0 }
        
        switch mood {
        case .happy, .delighted: return -0.3  // Smile up
        case .sad: return 0.2                 // Frown down
        case .skeptical: return 0.1
        default: return 0
        }
    }
}

// MARK: - Window Mask

struct WindowMask: View {
    let edge: WindowEdge
    let cutoff: CGFloat
    var curve: CGFloat = 0
    var asymmetry: CGFloat = 0
    
    @Environment(\.colorScheme) var colorScheme
    
    var body: some View {
        GeometryReader { geo in
            Path { path in
                generatePath(in: geo.size, path: &path)
            }
            .fill(backgroundColor)
        }
    }
    
    private func generatePath(in size: CGSize, path: inout Path) {
        let w = size.width
        let h = size.height
        
        switch edge {
        case .top:
            let controlY = h * cutoff + curve * 20
            path.move(to: CGPoint(x: 0, y: asymmetry * 5))
            path.addQuadCurve(
                to: CGPoint(x: w, y: -asymmetry * 5),
                control: CGPoint(x: w/2, y: controlY)
            )
            path.addLine(to: CGPoint(x: w, y: 0))
            path.addLine(to: CGPoint(x: 0, y: 0))
            path.closeSubpath()
            
        case .bottom:
            let controlY = h - (h * cutoff) + curve * 20
            path.move(to: CGPoint(x: 0, y: h + asymmetry * 5))
            path.addQuadCurve(
                to: CGPoint(x: w, y: h - asymmetry * 5),
                control: CGPoint(x: w/2, y: controlY)
            )
            path.addLine(to: CGPoint(x: w, y: h))
            path.addLine(to: CGPoint(x: 0, y: h))
            path.closeSubpath()
        }
    }
    
    private var backgroundColor: Color {
        Color(colorScheme == .dark ? "BackgroundPrimary" : "PaperCream")
    }
}

enum WindowEdge {
    case top, bottom
}
```

### Usage in iOS App

```swift
struct ConversationView: View {
    @StateObject var voiceAgent = VoiceAgentViewModel()
    
    var body: some View {
        VStack {
            FerniWindowAvatar(
                size: 160,
                mood: voiceAgent.currentMood,
                isSpeaking: $voiceAgent.isSpeaking,
                volume: $voiceAgent.currentVolume
            )
            
            // ... rest of UI
        }
    }
}
```

---

## Phase 3: Android Implementation

### Create Compose Component

**File:** `apps/android-native/app/src/main/java/ai/ferni/ui/avatar/FerniWindowAvatar.kt`

```kotlin
package ai.ferni.ui.avatar

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.unit.dp

@Composable
fun FerniWindowAvatar(
    modifier: Modifier = Modifier,
    size: Float = 120f,
    mood: AvatarMood = AvatarMood.Neutral,
    isSpeaking: Boolean = false,
    volume: Float = 0f
) {
    val topCutoff = remember(mood) { topCutoffForMood(mood) }
    
    val animatedVolume by animateFloatAsState(
        targetValue = if (isSpeaking) volume else 0f,
        animationSpec = spring(
            stiffness = Spring.StiffnessHigh,
            dampingRatio = Spring.DampingRatioMediumBouncy
        )
    )
    
    val bottomCutoff = 0.12f + (animatedVolume * 0.23f)
    val bottomCurve = curveForMood(mood)
    
    val backgroundColor = MaterialTheme.colorScheme.background
    
    Box(modifier = modifier.size(size.dp)) {
        // Avatar face layer
        AvatarFace(
            size = size,
            mood = mood
        )
        
        // Window masks
        Canvas(modifier = Modifier.fillMaxSize()) {
            // Top mask
            drawWindowMask(
                edge = WindowEdge.Top,
                cutoff = topCutoff,
                curve = 0f,
                color = backgroundColor
            )
            
            // Bottom mask (animated)
            drawWindowMask(
                edge = WindowEdge.Bottom,
                cutoff = bottomCutoff,
                curve = bottomCurve,
                color = backgroundColor
            )
        }
    }
}

private fun DrawScope.drawWindowMask(
    edge: WindowEdge,
    cutoff: Float,
    curve: Float,
    color: Color
) {
    val path = Path().apply {
        when (edge) {
            WindowEdge.Top -> {
                val controlY = size.height * cutoff + curve * 20
                moveTo(0f, 0f)
                quadraticBezierTo(
                    size.width / 2, controlY,
                    size.width, 0f
                )
                lineTo(size.width, 0f)
                lineTo(0f, 0f)
                close()
            }
            WindowEdge.Bottom -> {
                val controlY = size.height - (size.height * cutoff) + curve * 20
                moveTo(0f, size.height)
                quadraticBezierTo(
                    size.width / 2, controlY,
                    size.width, size.height
                )
                lineTo(size.width, size.height)
                lineTo(0f, size.height)
                close()
            }
        }
    }
    drawPath(path, color)
}

private fun topCutoffForMood(mood: AvatarMood): Float = when (mood) {
    AvatarMood.Surprised -> 0.06f
    AvatarMood.Sleepy -> 0.20f
    AvatarMood.Thinking -> 0.14f
    else -> 0.12f
}

private fun curveForMood(mood: AvatarMood): Float = when (mood) {
    AvatarMood.Happy, AvatarMood.Delighted -> -0.3f
    AvatarMood.Sad -> 0.2f
    AvatarMood.Skeptical -> 0.1f
    else -> 0f
}

enum class WindowEdge { Top, Bottom }

enum class AvatarMood {
    Neutral, Happy, Delighted, Sad, Surprised, Sleepy, Thinking, Skeptical, Curious
}
```

---

## Testing Plan

### Unit Tests

```typescript
// apps/web/src/ui/__tests__/ferni-expressions.test.ts

describe('Mouth Path Generation', () => {
  it('generates flat path when closed', () => {
    const path = generateMouthPath(0, 'neutral');
    expect(path).toContain('Q 50,110'); // Control point at bottom
  });
  
  it('generates open path when volume high', () => {
    const path = generateMouthPath(1, 'neutral');
    expect(path).toContain('Q 50,85'); // Control point higher
  });
  
  it('applies emotion modifiers', () => {
    const happyPath = generateMouthPath(0.5, 'happy');
    const sadPath = generateMouthPath(0.5, 'sad');
    // Happy should curve up (lower Y), sad should curve down (higher Y)
    expect(getControlY(happyPath)).toBeLessThan(getControlY(sadPath));
  });
});

describe('Mouth Animation', () => {
  it('smooths rapid volume changes', async () => {
    setMouthOpen(1);
    await wait(10);
    // Should not jump immediately
    expect(getMouthOpenAmount()).toBeLessThan(0.5);
    
    await wait(100);
    // Should approach target
    expect(getMouthOpenAmount()).toBeGreaterThan(0.8);
  });
});
```

### Visual Regression Tests

```typescript
// e2e/window-avatar.spec.ts

test.describe('Window Avatar Speaking', () => {
  test('mouth opens when speaking', async ({ page }) => {
    await page.goto('/');
    await connectToAgent(page);
    
    // Trigger speaking state
    await triggerSpeaking(page, { volume: 0.8 });
    
    // Screenshot mouth area
    await expect(page.locator('.avatar-lid-overlay')).toHaveScreenshot(
      'mouth-open.png'
    );
  });
  
  test('mouth closes smoothly after speaking', async ({ page }) => {
    await page.goto('/');
    await triggerSpeaking(page, { volume: 0.8 });
    await stopSpeaking(page);
    
    // Wait for animation
    await page.waitForTimeout(300);
    
    await expect(page.locator('.avatar-lid-overlay')).toHaveScreenshot(
      'mouth-closed.png'
    );
  });
});
```

---

## Rollout Strategy

### Feature Flag

```typescript
// data/feature-flags.json
{
  "windowAvatarMouth": {
    "enabled": false,
    "description": "Voice-reactive mouth animation on avatar",
    "rolloutPercent": 0,
    "allowedUsers": ["internal"]
  }
}
```

### Gradual Rollout

1. **Week 1:** Internal testing only (`allowedUsers: ["internal"]`)
2. **Week 2:** 10% of users (`rolloutPercent: 10`)
3. **Week 3:** 50% of users, gather feedback
4. **Week 4:** 100% rollout if metrics positive

### Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Animation smoothness | 60fps | Performance monitor |
| User engagement | +5% session time | Analytics |
| Positive sentiment | >4.0/5 rating | In-app survey |
| Bug reports | <3 per week | Support tickets |
| Battery impact | <2% increase | Device monitoring |

---

## Next Steps

1. **Implement Phase 1** - Web speaking mouth (2-3 days)
2. **User testing** - A/B test with 10% of users (1 week)
3. **Iterate on timing** - Adjust smoothing, max open (3 days)
4. **iOS implementation** - Port to SwiftUI (1 week)
5. **Android implementation** - Port to Compose (1 week)
6. **Brand assets** - Create marketing materials (ongoing)

---

*Questions? Ping #design-system or #avatar-team*
