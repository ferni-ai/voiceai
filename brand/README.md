# Ferni Brand Assets

> **We believe in making AI human, and the decisions we make will reflect that.**

This directory contains Ferni's brand **ASSETS** (logos, icons, favicons, social graphics).

📚 **For brand DOCUMENTATION**, see [`design-system/brand/`](../design-system/brand/README.md)

---

## Quick Reference

### Primary Colors

| Name | Hex | Use |
|------|-----|-----|
| Ferni Sage | `#4a6741` | Primary brand, Ferni persona |
| Cedar Brown | `#9a7b5a` | Secondary, grounding |
| Ocean Teal | `#3a6b73` | Peter (research) |
| Slate Blue | `#5a6b8a` | Alex (communications) |
| Rose | `#a67a6a` | Maya (wellness) |
| Coral | `#c4856a` | Jordan (celebrations) |
| Warm Gray | `#8a7a6a` | Nayan (wisdom) |

### Typography

- **Display**: Playfair Display (headings, quotes)
- **Body**: Inter (UI, body text)

### Voice & Tone

- Warm, not corporate
- Confident, not arrogant
- Supportive, not pushy
- Personal, not clinical

---

## Assets in This Directory

### Logos (`logos/`)

| File | Description |
|------|-------------|
| `ferni-logo.svg` | Primary logo (SVG) |
| `ferni-logo-*.png` | PNG exports at various sizes |
| `ferni-logo-dark.svg` | Dark mode variant |
| `ferni-logo-simple.svg` | Simplified logo |
| `ferni-text-logo.svg` | Text-only wordmark |
| `logo-wordmark-*.svg` | Horizontal/stacked wordmarks |
| `ferni-logo.lottie.json` | Animated logo (Lottie) |

### App Icons (`icons/`)

| File | Description |
|------|-------------|
| `app-icon-*.svg` | Source SVG icons |
| `png/ios-*.png` | iOS app icons (all sizes) |
| `png/android-*.png` | Android app icons (all sizes) |
| `png/orb-*.png` | Alternative orb-style icons |

### Favicons (`favicons/`)

| File | Description |
|------|-------------|
| `favicon-16.svg` | 16x16 favicon |
| `favicon-32.svg` | 32x32 favicon |
| `favicon-192.svg` | 192x192 favicon |

### Social Media (`social/`)

| File | Description |
|------|-------------|
| `facebook-cover-1200x630.svg` | Facebook cover |
| `twitter-header-1500x500.svg` | Twitter/X header |
| `linkedin-banner-1584x396.svg` | LinkedIn banner |
| `instagram-post-1080.svg` | Instagram post |
| `youtube-banner-2560x1440.svg` | YouTube banner |
| `profile-400.svg` | Profile picture |

### Design Tokens

| File | Description |
|------|-------------|
| `ferni-design-tokens.css` | CSS custom properties for all design tokens |
| `brand-book.html` | Interactive brand reference guide |

---

## Brand Documentation

All brand guidelines and documentation live in the design system:

| Document | Location |
|----------|----------|
| **Core Brand** | [`design-system/brand/FERNI-BRAND-GUIDELINES.md`](../design-system/brand/FERNI-BRAND-GUIDELINES.md) |
| **Screen Design** | [`design-system/brand/FERNI-SCREEN-GUIDELINES.md`](../design-system/brand/FERNI-SCREEN-GUIDELINES.md) |
| **Better Than Human EQ** | [`design-system/brand/BETTER-THAN-HUMAN.md`](../design-system/brand/BETTER-THAN-HUMAN.md) |
| **Voice Guide** | [`design-system/brand/BRAND-VOICE-GUIDE.md`](../design-system/brand/BRAND-VOICE-GUIDE.md) |
| **Universe Bible** | [`design-system/brand/FERNI-UNIVERSE-BIBLE.md`](../design-system/brand/FERNI-UNIVERSE-BIBLE.md) |
| **Sonic Identity** | [`design-system/brand/FERNI-SONIC-IDENTITY.md`](../design-system/brand/FERNI-SONIC-IDENTITY.md) |
| **Full Index** | [`design-system/brand/README.md`](../design-system/brand/README.md) |

---

## Usage

### In Frontend Code

Design tokens are available via CSS variables:

```css
color: var(--ferni-sage);
background: var(--color-bg-primary);
font-family: var(--font-display);
```

### In Design Tools

Export assets from `logos/` and `icons/` directories. See `brand-book.html` for interactive reference.

---

## Related Documentation

| Doc | Location |
|-----|----------|
| Brand Guidelines (Full) | [`design-system/brand/`](../design-system/brand/README.md) |
| Frontend Design Standards | [`frontend-typescript/CLAUDE.md`](../frontend-typescript/CLAUDE.md) |
| Design System Architecture | [`docs/architecture/CINEMATIC-DESIGN-SYSTEM.md`](../docs/architecture/CINEMATIC-DESIGN-SYSTEM.md) |

---

*Last Updated: December 2024*
