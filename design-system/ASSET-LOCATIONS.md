# Ferni Design System Asset Locations

> **Single Source of Truth** - All design assets are consolidated in this design-system folder.

## Quick Reference

| Asset Type | Canonical Location | Notes |
|------------|-------------------|-------|
| **Design Tokens** | `tokens/*.json` | JSON source files for all tokens |
| **Generated CSS** | `dist/tokens.css` | Auto-generated from tokens - DO NOT EDIT |
| **Logos** | `assets/logos/` | All logo variants (SVG, PNG, Lottie) |
| **Favicons** | `assets/favicons/` | Multi-size favicon set |
| **App Icons** | `assets/icons/` | iOS/Android app icons |
| **Social Templates** | `assets/social/` | Platform-specific templates |
| **Sounds** | `assets/sounds/` | Audio assets |
| **Brand Guidelines** | `docs/brand/` | All brand documentation |

## Folder Structure

```
design-system/
├── tokens/                    # SOURCE OF TRUTH - JSON token files
│   ├── colors.json           # Color palette definitions
│   ├── animation.json        # Animation timing/easing
│   ├── personas.json         # Persona definitions
│   ├── expressions.json      # Avatar expressions
│   └── ...                   # Other token files
│
├── dist/                      # GENERATED - Build outputs
│   ├── tokens.css            # Generated CSS variables
│   ├── tokens.ts             # Generated TypeScript
│   └── tailwind.config.js    # Generated Tailwind theme
│
├── assets/                    # STATIC ASSETS
│   ├── logos/                # All logo variants
│   │   ├── ferni-logo.svg
│   │   ├── ferni-logo-dark.svg
│   │   ├── logo-wordmark-*.svg
│   │   ├── personas/         # Per-persona avatar logos
│   │   └── *.png             # Rasterized versions
│   ├── favicons/             # Favicon set
│   │   ├── favicon-16.svg
│   │   ├── favicon-32.svg
│   │   └── favicon-192.svg
│   ├── icons/                # App icons
│   │   ├── app-icon-*.svg
│   │   └── png/              # Rasterized app icons
│   ├── social/               # Social media templates
│   │   ├── facebook-cover-*.svg
│   │   ├── instagram-post-*.svg
│   │   └── twitter-header-*.svg
│   └── sounds/               # Audio assets
│
├── docs/                      # DOCUMENTATION
│   └── brand/                # Brand guidelines
│       ├── FERNI-BRAND-GUIDELINES.md
│       ├── BETTER-THAN-HUMAN.md
│       └── ...
│
├── brand/                     # DEPRECATED - Being cleaned up
│   └── (files migrated to docs/brand/)
│
└── playground/                # Interactive demos
```

## Token Generation Pipeline

```
tokens/*.json  →  build scripts  →  dist/tokens.css  →  apps consume
                                  →  dist/tokens.ts
                                  →  dist/tailwind.config.js
```

### Build Commands

```bash
pnpm tokens:sync       # Regenerate all outputs from JSON sources
pnpm tokens:check      # Validate no drift between source and outputs
pnpm tokens:version    # Display current token version
```

## Where Things Live (vs Where They DON'T)

### Correct Locations

| Use Case | Get Assets From |
|----------|-----------------|
| Need logo SVG | `design-system/assets/logos/ferni-logo.svg` |
| Need favicon | `design-system/assets/favicons/favicon-32.svg` |
| Need CSS variables | `design-system/dist/tokens.css` |
| Need animation timing | `design-system/tokens/animation.json` |
| Need brand guidelines | `design-system/docs/brand/FERNI-BRAND-GUIDELINES.md` |

### Deprecated Locations (DO NOT USE)

| Deprecated Path | Use Instead |
|-----------------|-------------|
| `brand/logos/` | `design-system/assets/logos/` |
| `brand/favicons/` | `design-system/assets/favicons/` |
| `brand/master-tokens.css` | `design-system/dist/tokens.css` |
| `design-system/docs/brand/*.md` | `design-system/docs/brand/*.md` |

## Integration Guide

### Web App (apps/web)

```typescript
// Import generated constants
import { DURATION, EASING } from '@design-system/animation-constants.generated';

// Reference CSS variables
color: var(--color-ferni);
transition: all var(--duration-normal) var(--easing-smooth);
```

### Landing Page (apps/website)

```javascript
// Uses generated Tailwind config
import tailwindConfig from 'design-system/dist/tailwind.config.js';
```

### iOS App (apps/ios-native)

Tokens sync via:
```bash
pnpm tokens:sync  # Generates Swift-compatible exports
```

## Adding New Assets

1. **Logos**: Add to `assets/logos/`
2. **Icons**: Add to `assets/icons/`
3. **Sounds**: Add to `assets/sounds/`
4. **New Token Types**: Add JSON to `tokens/`, update build scripts

## Maintenance

- Run `pnpm tokens:check` before committing to detect drift
- Never edit files in `dist/` directly
- Keep `brand/` folder minimal (documentation only)
- All visual assets belong in `assets/`
