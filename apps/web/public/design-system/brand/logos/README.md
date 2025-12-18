# Ferni Logo Assets

This directory contains all official Ferni logo files in various formats.

## 🪨 Three Stones Concept

The Ferni logo represents "three stones" - concentric circles that symbolize:
- **Outer stone (sage green)** - Grounding, stability, the earth
- **Middle stone (white)** - Clarity, openness, presence
- **Inner stone (iris/pupil)** - Awareness, wisdom, the soul

## File Structure

```
logos/
├── ferni-logo.svg              # Primary logo (static, default)
├── ferni-logo-expressive.svg   # Animated logo with CSS expressions
├── ferni-logo.lottie.json      # Lottie animation for mobile apps
├── logo-preview.html           # Interactive preview page
├── README.md                   # This file
└── generated/                  # Generated PNG assets (various sizes)
```

## Logo Variants

### Static Logo (ferni-logo.svg)
Use for: print, static web, favicons, app icons

The default state shows three concentric circles - no mouth visible.

### Animated Logo (ferni-logo-expressive.svg)
Use for: web UI, emotional feedback, interactive elements

Supports CSS-triggered expressions:
- zen - Default, peaceful state (no mouth)
- happy - Eye up, smile appears
- excited - Eye up more, bigger smile
- curious - Eye looks around
- sad - Concerned expression
- surprised - Wide eye, eyebrows up
- thinking - Contemplative look
- speaking - Mouth animates
- listening - Attentive look

### Lottie Animation (ferni-logo.lottie.json)
Use for: iOS, Android, React Native, web (via lottie-web)

A 3-second intro animation sequence:
1. Logo scales in with spring bounce
2. Eye "wakes up" and looks around
3. Mouth briefly appears with smile
4. Returns to zen state

## Color Reference

| Element | Color | Hex |
|---------|-------|-----|
| Outer stone | Sage green | #4a6741 |
| Eye white | White | #ffffff |
| Iris | Light sage | #5a8060 |
| Pupil | Natural ink | #2c2520 |
| Catchlight | White | #ffffff |
| Mouth stroke | White | #ffffff |

## Size Guidelines

| Context | Size | File |
|---------|------|------|
| Favicon | 16-32px | Use SVG or generated PNGs |
| Navigation | 24-32px | Use SVG |
| Header/Hero | 48-96px | Use SVG |
| Splash screen | 120-200px | Use Lottie animation |
| App icon | 1024px | Use generated PNG |

## Generating Assets

Run the logo PNG generator:
```bash
node scripts/generate-logo-pngs.js
```

This generates all required sizes for:
- Favicons (16, 32, 48, 180, 192, 512px)
- App icons (iOS/Android/Electron)
- Design system assets
- Marketing materials

## Preview

Open logo-preview.html in a browser to see all logo states and expressions interactively.
