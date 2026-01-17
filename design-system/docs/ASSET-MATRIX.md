# 📱 Complete Asset Matrix

> **Every icon, favicon, and image size needed for all platforms.**

**Version**: 1.0.0  
**Created**: January 2026  
**Status**: Planning

---

## Overview

This document specifies every asset size needed for Ferni across all platforms. The goal is to generate these automatically from master SVG files.

### Master Files

| Asset | Master File | Format |
|-------|-------------|--------|
| App Icon | `assets/icons/app-icon-master.svg` | SVG |
| Favicon | `assets/favicons/favicon-master.svg` | SVG |
| Logo | `assets/logos/ferni-logo-master.svg` | SVG |
| Avatar | `assets/logos/ferni-avatar-master.svg` | SVG |

---

## Favicons

### Browser Requirements

| Size | Format | Purpose | Status |
|------|--------|---------|--------|
| 16x16 | PNG | Browser tab | ✅ |
| 16x16 | SVG | Modern browsers | ✅ |
| 32x32 | PNG | Browser tab @2x | ✅ |
| 32x32 | SVG | Modern browsers @2x | ✅ |
| 48x48 | PNG | Windows | ✅ |
| 96x96 | PNG | Google TV | ✅ |
| 144x144 | PNG | Windows 8.1 tiles | ✅ |
| 192x192 | PNG | Android Chrome | ✅ |
| 192x192 | SVG | Android Chrome | ✅ |
| 256x256 | PNG | Windows 8.1 | ✅ |
| 512x512 | PNG | PWA | ✅ |

### Missing Favicons (Need to Create)

| Size | Format | Purpose | Priority |
|------|--------|---------|----------|
| favicon.ico | ICO | Legacy browsers | P1 |
| safari-pinned-tab.svg | SVG (monochrome) | Safari pinned tabs | P1 |
| mask-icon.svg | SVG (monochrome) | macOS Touch Bar | P2 |
| favicon.svg | SVG | Modern single file | P1 |

### ICO File Contents

The `favicon.ico` should contain multiple sizes:
- 16x16
- 32x32
- 48x48

### Safari Pinned Tab Requirements

```xml
<!-- Must be single color, typically black -->
<svg viewBox="0 0 16 16">
  <!-- Single path, no gradients, no colors -->
  <path d="..." fill="black"/>
</svg>
```

---

## App Icons - iOS

### iPhone Icons

| Size | Scale | Pixels | Purpose | Status |
|------|-------|--------|---------|--------|
| 20pt | @2x | 40x40 | Notification | ❌ |
| 20pt | @3x | 60x60 | Notification | ✅ |
| 29pt | @2x | 58x58 | Settings | ✅ |
| 29pt | @3x | 87x87 | Settings | ❌ |
| 40pt | @2x | 80x80 | Spotlight | ❌ |
| 40pt | @3x | 120x120 | Spotlight | ❌ |
| 60pt | @2x | 120x120 | App | ❌ |
| 60pt | @3x | 180x180 | App | ❌ |

### iPad Icons

| Size | Scale | Pixels | Purpose | Status |
|------|-------|--------|---------|--------|
| 20pt | @1x | 20x20 | Notification | ❌ |
| 20pt | @2x | 40x40 | Notification | ❌ |
| 29pt | @1x | 29x29 | Settings | ✅ |
| 29pt | @2x | 58x58 | Settings | ✅ |
| 40pt | @1x | 40x40 | Spotlight | ❌ |
| 40pt | @2x | 80x80 | Spotlight | ❌ |
| 76pt | @1x | 76x76 | App | ✅ |
| 76pt | @2x | 152x152 | App | ❌ |
| 83.5pt | @2x | 167x167 | iPad Pro | ✅ |

### App Store

| Size | Purpose | Status |
|------|---------|--------|
| 1024x1024 | App Store listing | ❌ |

### Complete iOS Asset Catalog

```
AppIcon.appiconset/
├── Contents.json
├── Icon-App-20x20@2x.png
├── Icon-App-20x20@3x.png
├── Icon-App-29x29@1x.png
├── Icon-App-29x29@2x.png
├── Icon-App-29x29@3x.png
├── Icon-App-40x40@1x.png
├── Icon-App-40x40@2x.png
├── Icon-App-40x40@3x.png
├── Icon-App-60x60@2x.png
├── Icon-App-60x60@3x.png
├── Icon-App-76x76@1x.png
├── Icon-App-76x76@2x.png
├── Icon-App-83.5x83.5@2x.png
└── Icon-App-1024x1024@1x.png
```

---

## App Icons - Android

### Adaptive Icons

Android 8.0+ uses adaptive icons with foreground and background layers.

| Layer | File | Purpose |
|-------|------|---------|
| Foreground | `ic_launcher_foreground.xml` | Main icon shape |
| Background | `ic_launcher_background.xml` | Background color/pattern |

### Legacy Icons

| Density | DPI | Size | Status |
|---------|-----|------|--------|
| mdpi | 160 | 48x48 | ❌ |
| hdpi | 240 | 72x72 | ❌ |
| xhdpi | 320 | 96x96 | ❌ |
| xxhdpi | 480 | 144x144 | ❌ |
| xxxhdpi | 640 | 192x192 | ❌ |

### Play Store

| Size | Purpose | Status |
|------|---------|--------|
| 512x512 | Play Store icon | ✅ |
| 1024x500 | Feature graphic | ❌ |

### Complete Android Asset Structure

```
res/
├── mipmap-mdpi/
│   └── ic_launcher.png (48x48)
├── mipmap-hdpi/
│   └── ic_launcher.png (72x72)
├── mipmap-xhdpi/
│   └── ic_launcher.png (96x96)
├── mipmap-xxhdpi/
│   └── ic_launcher.png (144x144)
├── mipmap-xxxhdpi/
│   └── ic_launcher.png (192x192)
└── mipmap-anydpi-v26/
    ├── ic_launcher.xml (adaptive icon)
    └── ic_launcher_round.xml (round adaptive)
```

---

## PWA Icons

### Web App Manifest

```json
{
  "icons": [
    {
      "src": "/icons/icon-72x72.png",
      "sizes": "72x72",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-96x96.png",
      "sizes": "96x96",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-128x128.png",
      "sizes": "128x128",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-144x144.png",
      "sizes": "144x144",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-152x152.png",
      "sizes": "152x152",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-384x384.png",
      "sizes": "384x384",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

### PWA Icon Status

| Size | Status |
|------|--------|
| 72x72 | ❌ |
| 96x96 | ✅ |
| 128x128 | ❌ |
| 144x144 | ✅ |
| 152x152 | ❌ |
| 192x192 | ✅ |
| 384x384 | ❌ |
| 512x512 | ✅ |

---

## Social & Marketing

### Open Graph Images

| Type | Size | Format | Purpose | Status |
|------|------|--------|---------|--------|
| Default | 1200x630 | PNG/JPG | General sharing | ❌ |
| Square | 1200x1200 | PNG/JPG | Some platforms | ❌ |
| Twitter | 1200x600 | PNG/JPG | Twitter cards | ❌ |

### Social Media Profiles

| Platform | Size | Purpose | Status |
|----------|------|---------|--------|
| Twitter | 400x400 | Profile | ❌ |
| LinkedIn | 300x300 | Profile | ❌ |
| Instagram | 320x320 | Profile | ❌ |
| Facebook | 180x180 | Profile | ❌ |

### App Store Screenshots

| Platform | Size | Purpose |
|----------|------|---------|
| iOS 6.5" | 1284x2778 | iPhone 14 Pro Max |
| iOS 5.5" | 1242x2208 | iPhone 8 Plus |
| iPad 12.9" | 2048x2732 | iPad Pro |
| Android Phone | 1080x1920 | Standard |
| Android Tablet | 1920x1200 | Tablet |

---

## Logo Variations

### Horizontal Logo

| Context | Width | Format | Status |
|---------|-------|--------|--------|
| Full color light BG | Various | SVG | ✅ |
| Full color dark BG | Various | SVG | ✅ |
| Monochrome | Various | SVG | ❌ |
| Reversed (white) | Various | SVG | ❌ |

### Logomark Only

| Context | Size | Format | Status |
|---------|------|--------|--------|
| Full color | 32-512px | SVG/PNG | ✅ |
| Monochrome | 32-512px | SVG/PNG | ❌ |
| White | 32-512px | SVG/PNG | ❌ |

### Minimum Sizes

| Format | Minimum Width |
|--------|---------------|
| Full logo (digital) | 120px |
| Logomark (digital) | 32px |
| Full logo (print) | 1 inch |
| Logomark (print) | 0.25 inch |

---

## Asset Generation Script

### Requirements

```bash
npm install sharp svgo @aspect/pngquant-bin
```

### Script: `build-assets.js`

```javascript
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const MASTER_FILES = {
  appIcon: 'assets/icons/app-icon-master.svg',
  favicon: 'assets/favicons/favicon-master.svg',
  logo: 'assets/logos/ferni-logo-master.svg'
};

const OUTPUT_SIZES = {
  favicons: [16, 32, 48, 96, 144, 192, 256, 512],
  iosIcons: [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024],
  androidIcons: [48, 72, 96, 144, 192, 512],
  pwaIcons: [72, 96, 128, 144, 152, 192, 384, 512]
};

async function generateIcons(masterPath, sizes, outputDir, prefix = 'icon') {
  const svg = fs.readFileSync(masterPath);
  
  for (const size of sizes) {
    await sharp(svg)
      .resize(size, size)
      .png()
      .toFile(path.join(outputDir, `${prefix}-${size}.png`));
    
    console.log(`Generated ${prefix}-${size}.png`);
  }
}

async function generateICO(masterPath, outputPath) {
  // Generate ICO with multiple sizes embedded
  const sizes = [16, 32, 48];
  const pngBuffers = [];
  
  const svg = fs.readFileSync(masterPath);
  
  for (const size of sizes) {
    const buffer = await sharp(svg)
      .resize(size, size)
      .png()
      .toBuffer();
    pngBuffers.push({ size, buffer });
  }
  
  // Use png-to-ico or similar library
  // const ico = await pngToIco(pngBuffers);
  // fs.writeFileSync(outputPath, ico);
}

async function main() {
  // Generate favicons
  await generateIcons(
    MASTER_FILES.favicon,
    OUTPUT_SIZES.favicons,
    'dist/favicons',
    'favicon'
  );
  
  // Generate iOS icons
  await generateIcons(
    MASTER_FILES.appIcon,
    OUTPUT_SIZES.iosIcons,
    'dist/ios',
    'icon'
  );
  
  // Generate Android icons
  await generateIcons(
    MASTER_FILES.appIcon,
    OUTPUT_SIZES.androidIcons,
    'dist/android',
    'ic_launcher'
  );
  
  // Generate PWA icons
  await generateIcons(
    MASTER_FILES.appIcon,
    OUTPUT_SIZES.pwaIcons,
    'dist/pwa',
    'icon'
  );
  
  console.log('Asset generation complete!');
}

main().catch(console.error);
```

### NPM Scripts

```json
{
  "scripts": {
    "assets:generate": "node build-assets.js",
    "assets:optimize": "imagemin dist/**/*.png --out-dir=dist",
    "assets:all": "npm run assets:generate && npm run assets:optimize"
  }
}
```

---

## Checklist

### Favicons

- [ ] Generate favicon.ico (multi-size)
- [ ] Create safari-pinned-tab.svg (monochrome)
- [ ] Create mask-icon.svg (monochrome)
- [ ] Create single favicon.svg

### iOS

- [ ] Generate all iPhone icon sizes
- [ ] Generate all iPad icon sizes
- [ ] Create 1024x1024 App Store icon
- [ ] Create Contents.json for asset catalog

### Android

- [ ] Generate all density icons
- [ ] Create adaptive icon foreground
- [ ] Create adaptive icon background
- [ ] Create Play Store feature graphic

### PWA

- [ ] Generate all manifest icon sizes
- [ ] Update manifest.json with paths
- [ ] Test on various devices

### Marketing

- [ ] Create default OG image
- [ ] Create social profile images
- [ ] Create app store screenshots

---

## Verification

### Testing Commands

```bash
# Check all favicon sizes exist
ls -la dist/favicons/

# Verify PNG optimization
du -sh dist/**/*.png

# Test manifest.json validity
npx pwa-asset-generator --help
```

### Visual QA Checklist

- [ ] Icons display correctly at all sizes
- [ ] No pixelation at small sizes
- [ ] Colors match brand guidelines
- [ ] Transparent areas render correctly
- [ ] Icons are recognizable at 16x16

---

**© 2026 Ferni. Every pixel matters.**

*"A great icon is instantly recognizable at any size."*
