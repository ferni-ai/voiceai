# Ferni Avatar Icons

> The official Ferni avatar design system for favicons, app icons, and brand materials.

## Design Elements

The Ferni avatar consists of these key elements:

| Element | Color | Purpose |
|---------|-------|---------|
| **Main Circle** | Gradient `#3d5a35` → `#4a6741` | The sage green avatar body |
| **Shine Overlay** | White 18% opacity | 3D depth/highlight effect |
| **"FE" Text** | White, 800 weight | Ferni's initials |
| **Outer Ring** | `#4a6741` at 35% opacity | Presence/connection indicator |
| **Heart Badge** | Sage gradient + white heart | Connection status indicator |
| **Background** | `#F5F1E8` (Paper Cream) | App icon backgrounds |

## File Variants

### Brand Source Files (`/brand/`)

| File | Size | Use Case |
|------|------|----------|
| `ferni-avatar.svg` | 120×120 | Full avatar with ring + badge |
| `ferni-avatar-simple.svg` | 120×120 | Avatar with ring, no badge |
| `ferni-avatar-minimal.svg` | 100×100 | Circle only, no ring/badge |
| `ferni-favicon.svg` | 32×32 | Favicon-optimized |

### Web Icons (`/apps/web/public/icons/`)

| File | Size | Platform |
|------|------|----------|
| `favicon.svg` | 32×32 | Browser favicon |
| `favicon-16.svg` | 16×16 | Small favicon |
| `favicon-32.svg` | 32×32 | Standard favicon |
| `apple-touch-icon.svg` | 180×180 | iOS home screen |
| `android-chrome-192.svg` | 192×192 | Android (small) |
| `android-chrome-512.svg` | 512×512 | Android (large) |
| `icon-base.svg` | 512×512 | Base app icon |
| `icon-1024.svg` | 1024×1024 | App Store submission |
| `maskable-icon.svg` | 512×512 | PWA maskable icon (safe area) |
| `safari-pinned-tab.svg` | 16×16 | Safari pinned tab (monochrome) |
| `mstile-150.svg` | 150×150 | Windows tiles |
| `og-image.svg` | 1200×630 | Social media preview |

## Usage Guidelines

### When to Use Each Variant

```
16px-32px:    Use favicon variants (no ring, no badge)
48px-120px:   Use simple variant (ring, no badge)
180px+:       Use full variant (ring + badge)
Social:       Use og-image variant (1200×630)
Safari Tab:   Use safari-pinned-tab (monochrome only)
PWA:          Use maskable-icon (has safe area padding)
```

### Generating PNG Files

To generate PNG files from SVG sources:

```bash
# Using Inkscape (recommended)
inkscape --export-type=png --export-width=192 android-chrome-192.svg

# Using ImageMagick
convert -background transparent favicon.svg -resize 32x32 favicon-32x32.png

# Using rsvg-convert (fastest)
rsvg-convert -w 192 -h 192 android-chrome-192.svg -o android-chrome-192x192.png
```

### Web Implementation

The icons are referenced in `/apps/web/index.html`:

```html
<!-- Favicon -->
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32x32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16x16.png" />

<!-- Apple Touch Icon -->
<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />

<!-- Safari Pinned Tab (must be monochrome) -->
<link rel="mask-icon" href="/icons/safari-pinned-tab.svg" color="#4a6741" />

<!-- Open Graph -->
<meta property="og:image" content="/icons/og-image.png" />
```

## Color Reference

| Name | Hex | CSS Variable | Use |
|------|-----|--------------|-----|
| Primary Sage | `#4a6741` | `--color-ferni` | Avatar, ring |
| Secondary Sage | `#3d5a35` | `--persona-secondary` | Gradient dark end |
| Light Sage | `#5a8060` | - | Badge gradient light |
| Paper Cream | `#F5F1E8` | `--color-bg-secondary` | Icon backgrounds |
| Natural Ink | `#2C2520` | `--color-text-primary` | Shadows |

## Design Principles

1. **Simplify at small sizes**: Remove ring/badge below 48px
2. **Maintain contrast**: FE text must be legible at all sizes
3. **Keep proportions**: Avatar circle is ~68% of total icon area
4. **Safe areas**: Maskable icons must work with any mask shape
5. **Monochrome fallback**: Safari pinned tab must be pure black

## Testing

Verify icons at common sizes:

- [ ] 16×16 favicon in browser tab
- [ ] 32×32 favicon in bookmark bar
- [ ] 180×180 on iOS home screen
- [ ] 192×192 on Android home screen
- [ ] 512×512 in PWA install prompt
- [ ] 1200×630 in social media preview

## Related Files

- `/brand/FERNI-BRAND-GUIDELINES.md` - Full brand guidelines
- `/design-system/tokens/colors.json` - Color tokens
- `/apps/web/manifest.json` - PWA manifest with icon references

