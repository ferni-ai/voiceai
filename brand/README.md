# VoiceAI Brand Assets

Your complete brand identity package, designed to match your avatar aesthetic.

## 📁 Directory Structure

```
brand/
├── logos/
│   ├── logo-primary.svg          # Main logo (gradient orb + sound waves)
│   ├── logo-dark-bg.svg          # Enhanced glow for dark backgrounds
│   ├── logo-light-bg.svg         # Drop shadow for light backgrounds
│   ├── logo-monochrome-dark.svg  # White logo for dark backgrounds
│   ├── logo-monochrome-light.svg # Dark logo for light backgrounds
│   ├── logo-wordmark-horizontal.svg  # Logo + "VoiceAI" text
│   └── logo-wordmark-stacked.svg     # Stacked version
│
├── icons/
│   ├── app-icon-1024.svg         # Master app icon (iOS/Android)
│   ├── app-icon-ios-simple.svg   # Simplified for small sizes
│   ├── app-icon-android.svg      # Android adaptive foreground
│   └── app-icon-android-background.svg  # Android adaptive background
│
├── favicons/
│   ├── favicon-16.svg            # Browser tab favicon
│   ├── favicon-32.svg            # High-DPI favicon
│   └── favicon-192.svg           # PWA icon
│
├── brand-tokens.css              # CSS custom properties
└── README.md                     # This file
```

## 🎨 Brand Colors

### Primary Palette

| Color | Hex | Usage |
|-------|-----|-------|
| **Purple 500** | `#8b5cf6` | Primary brand, logos, CTAs |
| **Indigo 500** | `#6366f1` | Gradients, secondary elements |
| **Purple 700** | `#7c3aed` | Dark variant, pressed states |
| **Purple 300** | `#d8b4fe` | Light variant, highlights |

### The Orb Gradient

```css
background: linear-gradient(145deg, #6366f1 0%, #8b5cf6 100%);
```

This is the signature gradient used in the avatar and logo.

### Persona Colors

Each AI persona has their own color accent:

| Persona | Primary | Secondary | Use |
|---------|---------|-----------|-----|
| Ferni | `#8b5cf6` | `#6366f1` | Default/General |
| Jack Bogle | `#ef4444` | `#dc2626` | Investment wisdom |
| Peter Lynch | `#10b981` | `#059669` | Stock research |
| Alex | `#06b6d4` | `#0891b2` | Communications |
| Maya | `#a78bfa` | `#8b5cf6` | Financial planning |
| Jordan | `#ec4899` | `#db2777` | Life events |

## 📐 Logo Usage

### Clear Space

Maintain clear space around the logo equal to the radius of the orb.

```
     [clear space]
        ↓
    ┌───────────┐
    │   ╭───╮   │ ← [clear space]
    │   │ ● │   │
    │   ╰───╯   │
    └───────────┘
        ↑
     [clear space]
```

### Minimum Size

- **Logo only**: 24px minimum
- **With wordmark**: 120px minimum width

### Don'ts

- ❌ Don't stretch or distort
- ❌ Don't change the gradient colors
- ❌ Don't add effects (drop shadows, outlines)
- ❌ Don't use on busy backgrounds without proper contrast

## 📱 App Icon Guidelines

### iOS Requirements

- Use `app-icon-1024.svg` as master
- Export at: 1024×1024, 180×180, 120×120, 87×87, 80×80, 60×60, 58×58, 40×40, 29×29, 20×20
- iOS applies rounded corners automatically - DO NOT add them

### Android Requirements

- Use `app-icon-android.svg` (foreground) + `app-icon-android-background.svg`
- Android adaptive icons need 108dp with 72dp safe zone
- Export foreground at 512×512 for adaptive icons

## 🌐 Favicon Usage

```html
<!-- In your HTML head -->
<link rel="icon" type="image/svg+xml" href="/brand/favicons/favicon-32.svg">
<link rel="icon" sizes="16x16" href="/brand/favicons/favicon-16.svg">
<link rel="apple-touch-icon" href="/brand/favicons/favicon-192.svg">
```

## 🎯 CSS Integration

Import the brand tokens in your CSS:

```css
@import './brand/brand-tokens.css';

/* Use the variables */
.my-button {
  background: var(--gradient-orb);
  color: var(--text-primary);
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-glow-purple);
}
```

## 🔄 Converting SVG to Other Formats

### To PNG (for app stores)

Using Inkscape:
```bash
inkscape -w 1024 -h 1024 app-icon-1024.svg -o app-icon-1024.png
```

Using ImageMagick:
```bash
convert -background none -density 300 app-icon-1024.svg app-icon-1024.png
```

### To ICO (for Windows)

```bash
convert favicon-32.svg -define icon:auto-resize=256,128,64,48,32,16 favicon.ico
```

## 📄 License

These brand assets are proprietary to VoiceAI. Do not redistribute without permission.

---

*Last updated: December 2024*

