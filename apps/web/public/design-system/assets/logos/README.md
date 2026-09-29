# Ferni Logo Assets

This directory contains all official Ferni logo files in various formats.

## The Ferni Orb

The logo is the Ferni orb: a Ferni Sage circle with two opaque white eyes —
no pupils, no iris (white catchlights are fine). Full rules, variants and
sizes: [`design-system/LOGO.md`](../../LOGO.md).

## File Structure

```
logos/
├── ferni-logo.svg              # Primary logo (static, default)
├── ferni-logo-expressive.svg   # Animated logo with CSS expressions
├── ferni-logo.lottie.json      # Lottie animation for mobile apps
├── README.md                   # This file
└── *.png                       # Generated PNG sizes (pnpm icons:regenerate)
```

## Logo Variants

### Static Logo (ferni-logo.svg)
Use for: print, static web, favicons, app icons

The default state shows the orb with both eyes open - no mouth visible.

### Animated Logo (ferni-logo-expressive.svg)
Use for: web UI, emotional feedback, interactive elements

Supports CSS-triggered expressions:
- zen - Default, peaceful state (no mouth)
- happy - Eyes lift, smile appears
- excited - Eyes lift more, bigger smile
- curious - Eyes tilt
- sad - Concerned expression
- surprised - Eyes widen
- thinking - Contemplative look
- speaking - Mouth animates
- listening - Attentive look

### Lottie Animation (ferni-logo.lottie.json)
Use for: iOS, Android, React Native, web (via lottie-web)

A 3-second intro animation sequence:
1. Logo scales in with spring bounce
2. Eyes "wake up" and look around
3. Mouth briefly appears with smile
4. Returns to zen state

## Color Reference

| Element | Color | Hex |
|---------|-------|-----|
| Orb | Ferni Sage | #4a6741 |
| Eyes | White | #ffffff |
| Catchlights | White | #ffffff |
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

```bash
pnpm icons:regenerate
```
