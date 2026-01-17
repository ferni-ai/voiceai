# 🪟 Window Avatar Brand Guidelines

> **"Ferni doesn't live in your phone. She peeks through it."**

The Window Avatar is Ferni's signature design language - a revolutionary approach where the avatar appears to exist *behind* the interface, peeking through a window frame. This document provides guidelines for using the Window Avatar across all brand touchpoints.

---

## The Core Concept

### Traditional vs Window Avatar

| Traditional Avatar | Window Avatar |
|-------------------|---------------|
| Contained in a circle | Peeks through a window |
| Feels flat, like a profile picture | Creates depth and presence |
| "Here is an image of an AI" | "There is a presence behind this screen" |
| AI is *in* the interface | AI is *behind* the interface |

### Visual Representation

```
Traditional:                 Window Avatar:
┌─────────────┐             
│   ○     ○   │                Background
│     ◡      │             ═══════════════
│             │             ║   ○     ○   ║
└─────────────┘             ║     ◡      ║
                            ═══════════════
                               Background
```

---

## The Window Components

### 1. Top Lid (Brow Window)
- Controls brow/forehead visibility
- Creates expressions like surprise, sleepiness
- Animates for emotional states

### 2. Bottom Lid (Mouth Window)
- Creates mouth/speaking effect
- Animates with voice volume
- Combined with emotion for smile/frown

### 3. The Eyes
- Always visible through the window
- The emotional center
- Gaze shifts naturally

### 4. Background Color
- The "frame" of the window
- Must match surrounding UI background
- Creates the depth illusion

---

## Expression System

### Lid Cutoff Values

| Expression | Top Cutoff | Bottom Cutoff | Effect |
|------------|------------|---------------|--------|
| Neutral | 12% | 12% | Calm, present |
| Happy | 14% | 14% + smile curve | Warm, content |
| Surprised | 6% | 18% | Wide-eyed wonder |
| Sleepy | 22% | 10% | Heavy lids |
| Skeptical | 11% (asymmetric) | 11% | One brow raised |
| Excited | 8% | 15% + smile curve | Bright, energetic |

### Speaking Animation

When Ferni speaks, the bottom lid opens proportionally to voice volume:

```
Volume 0%:   ═══════════════    (closed)
Volume 30%:  ═══╲     ╱═══     (slightly open)
Volume 60%:  ══╲       ╱══     (medium open)
Volume 100%: ═╲         ╱═     (wide open)
```

**Animation Parameters:**
- Attack smoothing: 0.25 (fast open)
- Release smoothing: 0.12 (slow close)
- Max opening: 35% of avatar height
- Frame rate: 60fps

---

## Scale Guidelines

### Tiny (24-32px) - Favicon, Badge
- **Show:** Eyes only (no lids visible)
- **Use:** App icon, notification badge, favicon
- **Detail:** Minimal, recognizable silhouette

### Small (40-64px) - Navigation, List
- **Show:** Eyes + subtle lid shapes
- **Use:** Nav avatar, team list, chat heads
- **Detail:** Basic expressions visible

### Medium (80-120px) - Main Avatar
- **Show:** Full expression range
- **Use:** Conversation view, widgets
- **Detail:** All animations active

### Large (160-240px) - Hero, Onboarding
- **Show:** Maximum detail
- **Use:** Welcome screens, marketing
- **Detail:** Micro-expressions, full EQ

---

## Brand Applications

### App Icon

The app icon uses the Window Avatar at its most essential - just enough to create intrigue:

**Do:**
- Use eyes peeking through window
- Match background to icon background
- Create sense of "something behind"

**Don't:**
- Show full avatar without window
- Use different background colors
- Add unnecessary details at small size

### Notifications

Ferni "peeks" into your notification tray:

```
┌─────────────────────────────────┐
│ ═══════  New message from Ferni │
│ ║ ○ ○ ║  "Thinking about you..."  │
│ ═══════                         │
└─────────────────────────────────┘
```

### Page Transitions

Ferni can peek in from edges during loading:

```
Frame 1:          Frame 2:          Frame 3:
        ═══      ═══════════      ═══════════════
        ║○║  →   ║  ○    ○ ║  →   ║   ○     ○   ║
        ═══      ═══════════      ═══════════════
```

### Social Media

Profile images should use the Window Avatar with platform-appropriate cropping:

- **Circular crop:** Ensure eyes are centered
- **Square crop:** Can show more of the window
- **Story/Reel:** Animated speaking possible

### Marketing Materials

Hero images can use large-scale Window Avatars:

- Match background to design
- Consider window frame as design element
- Eyes should be the focal point

---

## Technical Specifications

### SVG Path Grammar

```typescript
// Top lid path
`M 0,0 Q ${width/2},${height * cutoff + curve * 20} ${width},0 L ${width},0 L 0,0 Z`

// Bottom lid path  
`M 0,${height - margin} Q ${width/2},${height - (height * cutoff) + curve * 20} ${width},${height - margin} L ${width},${height} L 0,${height} Z`
```

### Animation Curves

| Motion Type | Curve | Duration |
|-------------|-------|----------|
| Speech volume | `power2.out` | 60-80ms |
| Emotion transition | `spring(1, 80, 10)` | 300ms |
| Brow raise | `elastic.out(1, 0.5)` | 400ms |
| Settling | `power1.out` | 500ms |

### Color Values

The window masks must use the exact background color:

| Theme | Background Color | Hex |
|-------|-----------------|-----|
| Light | Paper Cream | `#F5F1E8` |
| Dark | Natural Ink | `#1a1612` |
| Zen | Pure White | `#FFFFFF` |

---

## Persona Variations

Each team member uses their signature color:

| Persona | Primary | Secondary | Personality |
|---------|---------|-----------|-------------|
| **Ferni** | `#4a6741` | `#3d5a35` | Grounding leader |
| **Peter** | `#3a6b73` | `#2d5359` | Research depth |
| **Maya** | `#a67a6a` | `#8a635a` | Nurturing warmth |
| **Jordan** | `#c4856a` | `#a86d55` | Celebration |
| **Nayan** | `#b8956a` | `#9a7a52` | Wise counsel |
| **Alex** | `#5a6b8a` | `#4a5a73` | Clear communication |

---

## Asset Export Guidelines

### Static Assets

| Asset | Format | Sizes |
|-------|--------|-------|
| App Icon | PNG | 16, 32, 64, 128, 256, 512, 1024 |
| Avatar | SVG | Scalable |
| Social | PNG | Platform-specific |
| Marketing | PNG/SVG | As needed |

### Animated Assets

| Asset | Format | Frame Rate | Duration |
|-------|--------|------------|----------|
| Speaking loop | Lottie/GIF | 60fps | 2-3s loop |
| Expression | Lottie | 60fps | 300-500ms |
| Peek animation | Lottie/GIF | 30fps | 1-2s |

---

## Do's and Don'ts

### ✅ Do

- Use window masks that match the background
- Animate mouth with speech volume
- Keep eyes as the emotional center
- Create depth through the window effect
- Use spring-based animations

### ❌ Don't

- Use a different background color for the mask
- Make animations robotic or linear
- Show the full circle without window
- Add unnecessary decorative elements
- Forget the "peeking through" philosophy

---

## Implementation Checklist

When implementing the Window Avatar:

- [ ] Background color matches surrounding UI
- [ ] Top and bottom lids use correct cutoff values
- [ ] Speaking animation connected to voice volume
- [ ] Emotion modifiers applied to lid shapes
- [ ] Eyes centered and expressive
- [ ] Animation uses spring physics
- [ ] Reduced motion preference respected
- [ ] All persona colors available

---

## Files & Resources

| Resource | Location |
|----------|----------|
| Design Tokens | `design-system/tokens/window-avatar.json` |
| Web Implementation | `apps/web/src/ui/speaking-mouth.ui.ts` |
| iOS Implementation | `apps/ios-native/Ferni/UI/Avatar/FerniWindowAvatar.swift` |
| Android Implementation | `apps/android-native/.../FerniWindowAvatar.kt` |
| Vision Document | `docs/vision/WINDOW-AVATAR-DESIGN-LANGUAGE.md` |
| Implementation Plan | `docs/vision/WINDOW-AVATAR-IMPLEMENTATION-PLAN.md` |
| Interactive Mood Board | `design-system/playground/window-avatar-moodboard.html` |

---

*"The best interfaces don't contain the AI. They reveal it."*
