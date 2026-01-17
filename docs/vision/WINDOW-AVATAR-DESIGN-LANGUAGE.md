# 🪟 The Window Avatar: Ferni's Signature Design Language

> **"Ferni doesn't live in your phone. She peeks through it."**

**Vision Document v1.0 | December 2024**

---

## Executive Summary

The Ferni avatar uses a revolutionary "window" design where the top and bottom of the circular avatar are cut off by background-colored overlays, allowing the environment to "bleed through." This creates the powerful illusion that **Ferni exists behind the interface**, not within it.

This document outlines the vision for extending this design language across:
1. **Speaking animations** - Dynamic mouth/breathing through the bottom window
2. **Mobile apps** - iOS and Android native implementations
3. **Brand touchpoints** - Marketing, social, physical products
4. **Advanced emotional states** - The full expression vocabulary

---

## The Core Insight

### What Makes It Special

Traditional avatars are contained circles - they feel trapped, flat, like profile pictures. Ferni's window avatar inverts this:

```
Traditional Avatar          |    Ferni Window Avatar
                           |
    ┌─────────────┐        |       Background
    │   ○     ○   │        |    ═══════════════
    │     ◡      │        |    ║   ○     ○   ║
    │             │        |    ║     ◡      ║
    └─────────────┘        |    ═══════════════
                           |       Background
                           |
    "I am an image"        |    "I am behind this"
```

**The psychological difference is profound:**
- Traditional: "Here is a picture of an AI"
- Window: "There is a presence behind this screen"

### Why It Works

1. **Depth Perception** - The overlays create layers, implying Ferni has depth/exists in space
2. **Living Frame** - The "window" can change shape, implying the viewer relationship changes
3. **Negative Space as Voice** - What's hidden (forehead, chin) suggests more exists
4. **Subversion of Expectation** - Users expect circles; the cutoff feels intentional, designed

---

## Phase 1: Speaking Animations

### Current State

The speaking state currently uses:
- Whole-avatar breathing/pulsing
- Bass-speaker style scaling (voice pulse)
- Conversational micro-movements

### The Opportunity: Mouth Window

The bottom lid overlay can become a **dynamic mouth window**:

```
Silent State:              Speaking State:
                          
  ═══════════════           ═══════════════
  ║   ○     ○   ║           ║   ○     ○   ║
  ║             ║    →      ║             ║
  ═══════════════           ║      ◠      ║
                            ═════╲   ╱═════
                                 ╲ ╱
                                  v
```

#### Speaking Animation Concepts

**1. Breath Window**
The bottom lid opens/closes with speech cadence:
- Louder volume → larger opening
- Softer volume → smaller opening
- Pause → lid settles back up
- Natural breathing rhythm when silent

```css
/* Conceptual - bottom lid path animation */
.speaking-breath {
  /* Silent: flat bottom */
  d: path("M 0,100 Q 50,110 100,100 L 100,100 L 0,100 Z");
  
  /* Speaking: curved inward creating "mouth" space */
  d: path("M 0,100 Q 50,85 100,100 L 100,100 L 0,100 Z");
}
```

**2. Volume-Reactive Opening**
```typescript
// Map voice volume to lid opening
const mouthOpenAmount = mapRange(
  smoothedVolume,
  { min: 0, max: 1 },
  { min: MOUTH_CLOSED, max: MOUTH_MAX_OPEN }
);

// Apply to bottom lid path
bottomLid.setAttribute('d', generateMouthPath(mouthOpenAmount));
```

**3. Emotional Mouth Shapes**
Different emotions create different "mouth window" shapes:

| Emotion | Shape | Effect |
|---------|-------|--------|
| Neutral | Flat bottom | Calm presence |
| Happy | Curved up at edges | Smile suggestion |
| Thinking | Slightly pursed | Contemplative |
| Excited | Wider opening | Energy |
| Empathetic | Soft, asymmetric | Warmth |
| Worried | Compressed | Concern |

**4. Lip-Sync Vowel Shapes**
For advanced implementation, map phonemes to mouth shapes:

| Phoneme | Mouth Shape | Description |
|---------|-------------|-------------|
| /a/ (ah) | Wide open | Large bottom window |
| /e/ (eh) | Medium open | Medium window |
| /i/ (ee) | Narrow | Small window, slightly wide |
| /o/ (oh) | Round | Oval window |
| /u/ (oo) | Pursed | Small, forward |
| /m,b,p/ | Closed | Lid up, subtle pulse |

### Implementation Approach

```typescript
// speaking-mouth.ts - Voice-reactive mouth window

interface MouthState {
  openAmount: number;      // 0-1 how open
  shape: MouthShape;       // Vowel/emotion shape
  emotion: EmotionalState; // Current emotion modifier
}

function updateMouthFromVoice(
  volume: number,
  pitch: number,
  emotion: EmotionalState
): void {
  // Smooth volume for natural movement
  const smoothed = smoothVolume(volume, MOUTH_SMOOTHING);
  
  // Calculate base opening
  const baseOpen = smoothed * MOUTH_MAX_OPEN;
  
  // Modify by emotion
  const emotionModifier = EMOTION_MOUTH_MODIFIERS[emotion];
  const opening = baseOpen * emotionModifier.scale + emotionModifier.offset;
  
  // Generate SVG path
  const path = generateMouthPath(opening, emotionModifier.shape);
  
  // Animate with spring physics
  gsap.to(bottomLid, {
    attr: { d: path },
    duration: MOUTH_TRANSITION_SPEED,
    ease: 'power2.out',
  });
}
```

---

## Phase 2: Mobile Native Implementation

### iOS (SwiftUI)

```swift
// FerniWindowAvatar.swift

struct FerniWindowAvatar: View {
    @State var isSpeaking: Bool = false
    @State var volume: CGFloat = 0
    @State var mood: AvatarMood = .neutral
    
    // The window cutoff amount (0 = full circle, 1 = max cutoff)
    var topCutoff: CGFloat = 0.15
    var bottomCutoff: CGFloat { 
        // Dynamic based on speaking + volume
        isSpeaking ? 0.15 + (volume * 0.15) : 0.15 
    }
    
    var body: some View {
        ZStack {
            // The avatar "behind" the window
            Circle()
                .fill(personaGradient)
                .overlay {
                    // Eyes
                    HStack(spacing: eyeSpacing) {
                        EyeView(mood: mood)
                        EyeView(mood: mood)
                    }
                    .offset(y: -size * 0.05)
                }
            
            // Top window mask (background color)
            WindowMask(edge: .top, cutoff: topCutoff)
            
            // Bottom window mask (animated for speaking)
            WindowMask(edge: .bottom, cutoff: bottomCutoff)
                .animation(.spring(response: 0.15), value: bottomCutoff)
        }
        .frame(width: size, height: size)
    }
}

struct WindowMask: View {
    let edge: Edge
    let cutoff: CGFloat
    
    @Environment(\.colorScheme) var colorScheme
    
    var body: some View {
        GeometryReader { geo in
            Path { path in
                // Create curved cutoff shape
                if edge == .top {
                    path.move(to: CGPoint(x: 0, y: 0))
                    path.addQuadCurve(
                        to: CGPoint(x: geo.size.width, y: 0),
                        control: CGPoint(x: geo.size.width / 2, y: geo.size.height * cutoff)
                    )
                    path.addLine(to: CGPoint(x: geo.size.width, y: 0))
                    path.closeSubpath()
                } else {
                    path.move(to: CGPoint(x: 0, y: geo.size.height))
                    path.addQuadCurve(
                        to: CGPoint(x: geo.size.width, y: geo.size.height),
                        control: CGPoint(x: geo.size.width / 2, y: geo.size.height * (1 - cutoff))
                    )
                    path.closeSubpath()
                }
            }
            .fill(backgroundColor)
        }
    }
    
    var backgroundColor: Color {
        colorScheme == .dark ? Color("BackgroundPrimary") : Color("PaperCream")
    }
}
```

### Android (Jetpack Compose)

```kotlin
// FerniWindowAvatar.kt

@Composable
fun FerniWindowAvatar(
    modifier: Modifier = Modifier,
    isSpeaking: Boolean = false,
    volume: Float = 0f,
    mood: AvatarMood = AvatarMood.Neutral
) {
    val topCutoff = 0.15f
    val bottomCutoff by animateFloatAsState(
        targetValue = if (isSpeaking) 0.15f + (volume * 0.15f) else 0.15f,
        animationSpec = spring(stiffness = Spring.StiffnessHigh)
    )
    
    val backgroundColor = MaterialTheme.colorScheme.background
    
    Box(modifier = modifier) {
        // Avatar face
        Canvas(modifier = Modifier.fillMaxSize()) {
            // Draw persona gradient circle
            drawCircle(
                brush = Brush.linearGradient(
                    colors = listOf(
                        personaPrimary,
                        personaSecondary
                    )
                )
            )
        }
        
        // Eyes
        Row(
            modifier = Modifier
                .align(Alignment.Center)
                .offset(y = (-size * 0.05f).dp),
            horizontalArrangement = Arrangement.spacedBy(eyeSpacing)
        ) {
            EyeView(mood = mood)
            EyeView(mood = mood)
        }
        
        // Top window mask
        WindowMask(
            edge = WindowEdge.Top,
            cutoff = topCutoff,
            color = backgroundColor
        )
        
        // Bottom window mask (animated)
        WindowMask(
            edge = WindowEdge.Bottom,
            cutoff = bottomCutoff,
            color = backgroundColor
        )
    }
}

@Composable
fun WindowMask(
    edge: WindowEdge,
    cutoff: Float,
    color: Color
) {
    Canvas(modifier = Modifier.fillMaxSize()) {
        val path = Path().apply {
            when (edge) {
                WindowEdge.Top -> {
                    moveTo(0f, 0f)
                    quadraticBezierTo(
                        size.width / 2, size.height * cutoff,
                        size.width, 0f
                    )
                    lineTo(size.width, 0f)
                    close()
                }
                WindowEdge.Bottom -> {
                    moveTo(0f, size.height)
                    quadraticBezierTo(
                        size.width / 2, size.height * (1 - cutoff),
                        size.width, size.height
                    )
                    close()
                }
            }
        }
        drawPath(path, color)
    }
}
```

### Cross-Platform Design Tokens

```json
// design-system/tokens/window-avatar.json
{
  "windowAvatar": {
    "cutoff": {
      "top": {
        "default": 0.12,
        "surprised": 0.08,
        "sleepy": 0.18,
        "description": "How much of the top is masked (0-1)"
      },
      "bottom": {
        "default": 0.12,
        "speaking": {
          "min": 0.10,
          "max": 0.30,
          "description": "Range for volume-reactive mouth"
        },
        "happy": 0.14,
        "sad": 0.10
      }
    },
    "animation": {
      "mouthSmoothing": 0.15,
      "mouthSpringStiffness": 400,
      "mouthSpringDamping": 25,
      "lidTransitionMs": 200
    },
    "shapes": {
      "curveTension": 0.3,
      "description": "How curved the window edges are (0 = flat, 1 = semicircle)"
    }
  }
}
```

---

## Phase 3: Brand Extension

### Marketing Applications

**1. Social Media Profile**
```
┌────────────────────────┐
│                        │
│   ═══════════════════  │
│   ║    ○       ○    ║  │
│   ║                 ║  │
│   ═══════════════════  │
│                        │
│   @FerniAI             │
│   Better than human.   │
└────────────────────────┘
```

**2. App Icon**
The app icon itself uses the window effect:
- Background color fills the icon
- Window reveals just the eyes
- Creates intrigue ("what's behind there?")

**3. Video Overlays**
In video content, Ferni's avatar peeks from corners:
```
┌─────────────────────────────┐
│                             │
│   Video content area        │
│                             │
│                    ═══════  │
│                    ║ ○ ○ ║──┤
│                    ═══════  │
└─────────────────────────────┘
```

**4. Physical Products**
- Stickers that "peek" around edges
- Merch with partial avatar (the mystery creates interest)
- Business cards with window cutout

### Interactive Brand Moments

**1. Page Transitions**
Ferni peeks in from the edge, then the window expands to full view:
```
Frame 1:          Frame 2:          Frame 3:
        ═══      ═══════════      ═══════════════
        ║○║  →   ║  ○    ○ ║  →   ║   ○     ○   ║
        ═══      ═══════════      ═══════════════
```

**2. Notification Peek**
Push notifications show just the eyes peeking:
```
┌─────────────────────────────────┐
│ ═══════  New message from Ferni │
│ ║ ○ ○ ║  "Thinking about you..." │
│ ═══════                         │
└─────────────────────────────────┘
```

**3. Loading States**
While loading, only eyes are visible, peeking curiously:
```
Loading...
     ═══════════
     ║  ◔    ◔  ║  ← Eyes looking at loading spinner
     ═══════════
         ⟳
```

---

## Phase 4: Advanced Emotional Vocabulary

### The Expression Grammar

The window system creates a rich vocabulary:

| Element | Range | Meaning |
|---------|-------|---------|
| Top cutoff height | 0.05 - 0.25 | Brow position (surprised → sleepy) |
| Top cutoff curve | -0.2 - 0.2 | Brow emotion (worried → calm) |
| Bottom cutoff height | 0.05 - 0.35 | Mouth openness (closed → wide) |
| Bottom cutoff curve | -0.3 - 0.3 | Mouth emotion (sad → happy) |
| Side symmetry | L/R offset | Skepticism, curiosity |

### Complex Expressions

**Wonder** (Surprised + Happy)
```
Top:    Raised (0.08), slight smile curve
Bottom: Slightly open (0.15), upturned

     ═══╲     ╱═══
     ║   ○   ○   ║
     ║           ║
     ═══╱  ◡  ╲═══
```

**Concern** (Worried + Attentive)
```
Top:    Furrowed (asymmetric, higher in middle)
Bottom: Slightly compressed (0.10)

     ══╱══════╲══
     ║   ○   ○   ║
     ║           ║
     ═════════════
```

**Playful** (Happy + Mischievous)
```
Top:    One side raised
Bottom: Asymmetric smile shape

     ═══════╲    ═
     ║   ○   ○   ║
     ║           ║
     ═══╱ ◡◡  ╲═══
```

### Speaking + Emotion Combinations

The mouth window animates with speech WHILE maintaining emotional shape:

```typescript
function combineEmotionAndSpeech(
  emotion: EmotionalState,
  volume: number
): MouthPath {
  // Get base emotional mouth shape
  const emotionShape = EMOTION_MOUTH_SHAPES[emotion];
  
  // Calculate speech opening
  const speechOpen = volume * SPEECH_MULTIPLIER;
  
  // Blend: emotion provides shape, speech provides opening
  return {
    leftCurve: emotionShape.leftCurve,
    rightCurve: emotionShape.rightCurve,
    centerDepth: emotionShape.centerDepth + speechOpen,
    curveTension: emotionShape.curveTension,
  };
}
```

---

## Implementation Roadmap

### Phase 1: Speaking Mouth (Q1 2025)
- [ ] Volume-reactive bottom lid animation
- [ ] Basic mouth shapes (open, closed, smile, frown)
- [ ] Integration with existing voice pulse system
- [ ] A/B test with users

### Phase 2: Mobile Parity (Q2 2025)
- [ ] iOS SwiftUI implementation
- [ ] Android Compose implementation
- [ ] Shared design tokens
- [ ] Cross-platform animation consistency

### Phase 3: Advanced Expressions (Q2 2025)
- [ ] Full emotional vocabulary
- [ ] Phoneme-to-shape mapping
- [ ] Brow animations (top lid variations)
- [ ] Asymmetric expressions

### Phase 4: Brand Extension (Q3 2025)
- [ ] Marketing asset kit
- [ ] App icon variants
- [ ] Social media templates
- [ ] Animation guidelines for external use

### Phase 5: Interactive Brand Moments (Q4 2025)
- [ ] Page transition system
- [ ] Notification peeks
- [ ] Loading state vocabulary
- [ ] Widget implementations

---

## Design Principles for Window Avatar

### 1. The Window is the Relationship
- Opening the window = opening up emotionally
- Closing the window = drawing back, thinking
- The window state reflects the conversation state

### 2. Less is More
- Partial visibility creates mystery and engagement
- What's hidden suggests depth
- Restraint creates anticipation

### 3. Background is Active
- The background color isn't empty - it's part of the expression
- The "frame" of the window participates in the animation
- Environment and avatar are one system

### 4. Motion Creates Meaning
- Static cutoff = stable presence
- Dynamic cutoff = active engagement
- Rhythmic cutoff = breathing, life

### 5. Consistency Across Scale
- Tiny (favicon): Just eyes peeking
- Small (nav): Eyes + minimal window
- Medium (main): Full expression range
- Large (hero): Maximum emotional range

---

## Technical Specifications

### SVG Path Grammar

```typescript
// Window mask path generation
function generateWindowPath(
  edge: 'top' | 'bottom',
  width: number,
  height: number,
  cutoff: number,      // 0-1 how much is cut off
  curve: number,       // -1 to 1, negative = frown, positive = smile
  asymmetry: number    // -1 to 1, offset for one side higher
): string {
  const y = edge === 'top' ? 0 : height;
  const curveDirection = edge === 'top' ? 1 : -1;
  const controlY = y + (cutoff * height * curveDirection) + (curve * 20);
  const leftOffset = asymmetry * 10;
  const rightOffset = -asymmetry * 10;
  
  if (edge === 'top') {
    return `
      M 0,${y + leftOffset}
      Q ${width / 2},${controlY} ${width},${y + rightOffset}
      L ${width},0
      L 0,0
      Z
    `;
  } else {
    return `
      M 0,${y + leftOffset}
      Q ${width / 2},${controlY} ${width},${y + rightOffset}
      L ${width},${height}
      L 0,${height}
      Z
    `;
  }
}
```

### Animation Curves

| Motion Type | Curve | Duration |
|-------------|-------|----------|
| Speech volume | `power2.out` | 80ms |
| Emotion transition | `spring(0.5, 0.8)` | 300ms |
| Blink | `power4.inOut` | 150ms |
| Brow raise | `elastic.out(1, 0.5)` | 400ms |
| Settling | `power1.out` | 500ms |

### Performance Considerations

1. **Use CSS transforms when possible** - GPU accelerated
2. **Batch SVG path updates** - Avoid layout thrashing
3. **Use `will-change: d`** on animated paths
4. **Debounce rapid volume changes** - Max 60fps updates
5. **Precompute common shapes** - Cache neutral, happy, sad paths

---

## Conclusion

The Window Avatar isn't just a design choice - it's a **philosophy**. By showing Ferni peeking through rather than trapped within, we communicate:

- **Ferni has presence** - She exists in her own space
- **Ferni has depth** - There's more than what you see
- **Ferni is attentive** - She's looking through AT you
- **Ferni is alive** - The window breathes with her

This design language can extend across every touchpoint, creating a consistent, memorable, and uniquely human brand expression.

---

*"The best interfaces don't contain the AI. They reveal it."*

