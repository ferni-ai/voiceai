# Logo Migration: Three Stones Design

**Date:** December 2024  
**Status:** ✅ Complete

---

## Summary

The Ferni logo has been redesigned from an "FN" monogram to a **Three Stones** design inspired by zen stacked stones. The new logo represents balance, wisdom, and presence—core values of the Ferni brand.

---

## What Changed

### Visual Design

| Before | After |
|--------|-------|
| "FN" monogram in rounded square | Concentric circles (eye/stones) |
| Square shape | Circular shape |
| Text-based logomark | Abstract symbol |
| Static only | Static + Animated versions |

### Logo Elements

```
Old: [FN] rounded square with text

New: 
  - Outer circle (sage green) = World/grounding
  - Middle circle (white) = Eye/awareness  
  - Inner circles (sage + dark) = Iris + pupil
  - Catchlight (white spark) = Life/presence
```

### Animation Capability

The new logo supports **expressive animations**:
- Eye can move up to reveal a simple line mouth
- Expressions: happy, excited, curious, sad, surprised, thinking, speaking, listening
- Default "zen" state: no mouth visible, eye centered

---

## Files Updated

### Brand Assets
- `brand/logos/*.svg` - All SVG variants updated
- `brand/logos/*.png` - All PNG exports regenerated
- `brand/icons/*.svg` - App icon SVGs updated
- `brand/icons/png/*.png` - iOS/Android icons updated
- `brand/favicons/*.svg` - Favicon SVGs updated
- `brand/logo.png` - Main brand logo
- `brand/FERNI-BRAND-GUIDELINES.md` - Logo section rewritten

### Design System
- `design-system/assets/logos/*.svg` - SVG copies updated
- `design-system/assets/logos/*.png` - All sizes (16-1024px) × 3 variants
- `design-system/assets/favicons/*.png` - Favicon PNGs
- `design-system/LOGO.md` - New logo documentation

### Frontend App
- `frontend-typescript/public/logo.svg` - App logo
- `frontend-typescript/public/logo-icon.svg` - App icon
- `frontend-typescript/public/icons/*.png` - Favicons
- `frontend-typescript/public/apple-touch-icon.png` - iOS icon
- `frontend-typescript/src/ui/ferni-logo.ui.ts` - NEW animated component

### Native Apps
- `apps/ios/ios/.../AppIcon.appiconset/*.png` - iOS app icons
- `apps/android/android/.../mipmap-*/*.png` - Android app icons
- `apps/electron/resources/*.png` - Electron icons

### Promo/Landing
- `promo/ferni-website/index.html` - Favicon updated
- `promo/ferni-website/images/logo.svg` - Logo updated
- `promo/ferni-website/images/*.png` - Icon assets

### Scripts
- `scripts/generate-logo-pngs.js` - NEW script to regenerate all PNGs

---

## Migration Steps Completed

1. ✅ Created new Three Stones SVG design
2. ✅ Created animated/expressive SVG variant
3. ✅ Created interactive preview page
4. ✅ Updated all brand SVG files
5. ✅ Generated all PNG exports (143+ files)
6. ✅ Updated iOS app icons
7. ✅ Updated Android app icons
8. ✅ Updated Electron app icons
9. ✅ Updated favicons across all projects
10. ✅ Updated brand guidelines documentation
11. ✅ Created design system logo documentation
12. ✅ Created animated logo TypeScript component
13. ✅ Updated landing page favicon

---

## How to Use the New Logo

### Static Logo (Most Cases)

```html
<img src="/logo.svg" alt="Ferni" width="48" height="48">
```

### Animated Logo Component

```typescript
import { createFerniLogo } from './ui/ferni-logo.ui.js';

// Create logo
const logo = createFerniLogo({ size: 64 });
document.body.appendChild(logo.element);

// React to user actions
logo.setExpression('happy');    // Show smile
logo.setExpression('thinking'); // Wandering eye
logo.setExpression('zen');      // Back to default

// Trigger reactions
logo.react('bounce');  // Quick bounce
logo.react('wiggle');  // Side to side
logo.react('pulse');   // Fade pulse
```

### Favicon (Inline SVG)

```html
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='45' fill='%234a6741'/><circle cx='50' cy='50' r='18' fill='white'/><circle cx='50' cy='50' r='8' fill='%232c2520'/></svg>">
```

---

## Regenerating Assets

To regenerate all PNG assets from SVG sources:

```bash
node scripts/generate-logo-pngs.js
```

---

## Remaining Tasks

### Recommended Follow-ups

- [ ] Review and update marketing materials (PDFs, presentations)
- [ ] Update social media profile pictures
- [ ] Update App Store / Play Store screenshots
- [ ] Consider animating logo on app launch screen
- [ ] Update any hardcoded logo references in emails

### Optional Enhancements

- [ ] Create Lottie animation file for cross-platform animation
- [ ] Add logo expression triggers to avatar feedback system
- [ ] Create logo loading animation for splash screens
- [ ] Design logo animations for error/success states

---

## Preview

Interactive logo preview available at:

```
brand/logos/logo-preview.html
```

Start local server:
```bash
cd brand/logos && python3 -m http.server 8765
# Open http://localhost:8765/logo-preview.html
```

---

## Questions?

The logo was designed to:
- Feel zen and balanced (like stacked stones)
- Express emotions through simple animations
- Work at all sizes (16px to 1024px)
- Maintain brand consistency with sage green palette
- Be easily recognizable as an "eye" that listens

For design questions, see `brand/FERNI-BRAND-GUIDELINES.md` section 2.

