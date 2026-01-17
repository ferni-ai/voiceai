# Ferni Favicons

> **LUXO STYLE**: All Ferni eyes are opaque white ellipses with NO pupils. Expression is conveyed through eye shape only.

## Quick Start

```bash
# Install dependencies
pnpm add -D sharp png-to-ico gifencoder canvas

# Generate all favicons
pnpm tsx scripts/generate-favicons.ts

# Generate only the animated GIF
pnpm tsx scripts/generate-favicons.ts --gif-only

# Output to custom directory
pnpm tsx scripts/generate-favicons.ts --output apps/website/ferni-website/images
```

## Source Files

| File | Description |
|------|-------------|
| `ferni-favicon-neutral.svg` | Standard favicon, neutral expression |
| `ferni-favicon-smile.svg` | Smiling expression (curved eyes) |
| `ferni-favicon-wink.svg` | Winking expression (one eye curved) |
| `ferni-favicon-animated-smile.svg` | Animated SVG with breathing + smile |

## Generated Outputs

The script generates favicons for all platforms:

### Browser Favicons
| File | Size | Purpose |
|------|------|---------|
| `favicon.ico` | 16, 32, 48 | Multi-resolution ICO for legacy browsers |
| `favicon-16x16.png` | 16×16 | Modern browsers |
| `favicon-32x32.png` | 32×32 | Standard favicon |
| `favicon-48x48.png` | 48×48 | High DPI displays |
| `favicon-animated.svg` | - | Animated favicon with breathing |

### Apple Touch Icons
| File | Size | Device |
|------|------|--------|
| `apple-touch-icon.png` | 180×180 | Default |
| `apple-touch-icon-120x120.png` | 120×120 | iPhone |
| `apple-touch-icon-152x152.png` | 152×152 | iPad |
| `apple-touch-icon-167x167.png` | 167×167 | iPad Pro |
| `apple-touch-icon-180x180.png` | 180×180 | iPhone 6+ |

### Android / PWA Icons
| File | Size | Purpose |
|------|------|---------|
| `android-chrome-192x192.png` | 192×192 | Home screen icon |
| `android-chrome-512x512.png` | 512×512 | Splash screen |
| `maskable-icon-192x192.png` | 192×192 | Adaptive icon |
| `maskable-icon-512x512.png` | 512×512 | Large adaptive |

### Windows
| File | Size | Purpose |
|------|------|---------|
| `mstile-150x150.png` | 150×150 | Windows tile |

### Animated GIFs
| File | Size | Purpose |
|------|------|---------|
| `ferni-smile.gif` | 64×64 | Tab animation, social |
| `ferni-smile-large.gif` | 256×256 | Marketing, presentations |

## HTML Implementation

### Web App (`apps/web/index.html`)

```html
<!-- Favicon - ICO for legacy, SVG for modern -->
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/svg+xml" href="/favicon-animated.svg" media="(prefers-reduced-motion: no-preference)">

<!-- PNG fallbacks -->
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16x16.png">

<!-- Apple Touch -->
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-180x180.png">

<!-- Safari Pinned Tab -->
<link rel="mask-icon" href="/icons/safari-pinned-tab.svg" color="#4a6741">

<!-- PWA Manifest -->
<link rel="manifest" href="/manifest.json">

<!-- Microsoft -->
<meta name="msapplication-TileImage" content="/icons/mstile-150x150.png">
<meta name="msapplication-TileColor" content="#4a6741">
```

### Website (`apps/website/ferni-website`)

Same structure, just adjust paths:

```html
<link rel="icon" href="/images/favicon.ico" sizes="any">
<link rel="icon" type="image/svg+xml" href="/images/favicon.svg">
```

## Expression Guidelines

### Neutral (Default)
- Standard vertical ellipse eyes
- Use for: browser tabs, bookmarks, general branding

### Smile
- Eyes squint into curved lines (anime-style happy)
- Use for: loading states, success messages, celebrations

### Wink
- One eye open, one curved into a wink
- Use for: playful interactions, easter eggs

## Animated SVG Behavior

The animated favicon (`favicon-animated.svg`) includes:

1. **Breathing**: Gentle 4s scale pulse (1.0 → 1.015 → 1.0)
2. **Blink/Smile**: Every 6s, eyes squint into a smile
3. **Sparkle**: Eye highlights intensify during smile

All animations respect `prefers-reduced-motion: reduce`.

## Brand Colors

| Name | Hex | CSS Variable |
|------|-----|--------------|
| Ferni Green Light | `#4a6741` | `--color-ferni` |
| Ferni Green Dark | `#3a5731` | `--color-ferni-dark` |
| Paper Cream | `#F5F1E8` | `--color-background-primary` |
| Natural Ink | `#2C2520` | `--color-text-primary` |

## Testing

1. **Browser DevTools**: Check favicon loads in Network tab
2. **Favicon Checker**: https://realfavicongenerator.net/favicon_checker
3. **PWA Testing**: Add to home screen on iOS/Android
4. **Windows Tile**: Pin site in Edge to test MS tile

## Regenerating

After modifying any source SVG:

```bash
# Regenerate all formats
pnpm tsx scripts/generate-favicons.ts

# Verify outputs
ls -la apps/web/public/icons/

# Commit changes
git add brand/favicons apps/web/public/icons
git commit -m "chore: regenerate favicons"
```
