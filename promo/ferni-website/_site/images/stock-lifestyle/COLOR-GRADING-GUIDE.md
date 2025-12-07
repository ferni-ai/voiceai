# Ferni Image Color Grading Guide

> How to make any stock photo feel like it belongs on ferni.ai

---

## 🎨 The Ferni Look

**In one sentence:** Warm, soft, film-like — like a memory bathed in golden hour light.

**Visual References:**
- Kodak Portra 400 film stock
- Golden hour photography
- Wes Anderson's warm palette scenes
- Apple's lifestyle photography (but warmer)

---

## ⚡ Quick CSS Filter (Easiest Method)

Add this class to any `<img>` tag:

```html
<img src="photo.jpg" class="ferni-filter" alt="...">
```

```css
.ferni-filter {
  filter: sepia(12%) saturate(0.92) contrast(0.95) brightness(1.02);
}
```

**That's it!** This single filter handles 90% of cases.

---

## 📊 Detailed Color Grading Specs

### For Lightroom / Camera Raw

| Adjustment | Value | Why |
|------------|-------|-----|
| **Temperature** | +12 to +18 | Warm shift (away from blue) |
| **Tint** | +5 to +8 | Slight magenta (away from green) |
| **Exposure** | +0.1 to +0.2 | Slight lift |
| **Contrast** | -8 to -12 | Softer, less harsh |
| **Highlights** | -10 | Protect bright areas |
| **Shadows** | +15 to +20 | Lift shadows (no pure black) |
| **Whites** | -5 | Keep creamy, not blown |
| **Blacks** | +10 to +15 | Lifted blacks = film look |
| **Vibrance** | -8 to -12 | Slightly muted |
| **Saturation** | -5 | Not oversaturated |

### Tone Curve (Lightroom)

```
Point 1: Input 0, Output 15      (Lift blacks)
Point 2: Input 64, Output 68     (Slight midtone lift)  
Point 3: Input 192, Output 188   (Protect highlights)
Point 4: Input 255, Output 250   (Soft rolloff)
```

### Color Grading / Split Toning

| Area | Hue | Saturation |
|------|-----|------------|
| **Shadows** | 35° (Orange-brown) | 8-12% |
| **Midtones** | 40° (Amber) | 5-8% |
| **Highlights** | 45° (Cream) | 3-5% |

### HSL Adjustments

| Color | Hue | Saturation | Luminance |
|-------|-----|------------|-----------|
| **Orange** | +5 | -10 | +5 |
| **Yellow** | +10 | -15 | +10 |
| **Blue** | -20 | -30 | -5 |
| **Aqua** | -15 | -25 | -5 |

The goal: **Push blues toward teal, desaturate them, and warm everything else.**

### Grain

| Setting | Value |
|---------|-------|
| Amount | 15-25 |
| Size | 25-35 |
| Roughness | 50 |

---

## 🖼️ Photoshop Method

### Quick Action

1. **Curves Adjustment Layer:**
   - RGB: Lift shadow point to Output 15
   - Red: Slight S-curve, lift shadows
   - Blue: Invert S-curve (reduce in highlights, add in shadows)

2. **Hue/Saturation:**
   - Master Saturation: -8
   - Blues: Saturation -40

3. **Photo Filter:**
   - Warming Filter (85) at 12% opacity

4. **Solid Color Layer:**
   - Color: #F5F1E8 (Paper Cream)
   - Blend Mode: Soft Light
   - Opacity: 5-8%

### Export as Action
Save as "Ferni Grade" action for one-click application.

---

## 📱 Mobile Apps

### VSCO Settings
- Filter: A6 or C1 (base)
- Temperature: +2
- Saturation: -1
- Fade: +2
- Grain: +2

### Snapseed
- Tune Image: Warmth +15, Saturation -10, Ambiance +5
- Vintage: Style 3, Brightness +20, Saturation -10
- Grainy Film: Style 1, Grain +30

### Lightroom Mobile
Use the same settings as desktop Lightroom above.

---

## 🎬 Video Color Grading (DaVinci Resolve / Premiere)

### LUT Approach
Create a custom LUT with these values:
- Lift: RGB (0.06, 0.04, 0.02) — warm shadows
- Gamma: RGB (1.0, 0.98, 0.95) — slightly warm mids
- Gain: RGB (0.98, 0.96, 0.92) — cream highlights

### Node Structure (DaVinci)
1. **Node 1:** Color space transform to log
2. **Node 2:** Primary correction (warm up)
3. **Node 3:** Secondaries (desaturate blues)
4. **Node 4:** Film grain overlay
5. **Node 5:** Soft vignette

---

## ✅ Before/After Checklist

Run through this checklist for every image:

- [ ] **No blue cast** — Shadows should be warm brown, not cool gray
- [ ] **Lifted blacks** — No true black (#000), shadows should be around #2C2520
- [ ] **Soft contrast** — Not punchy or harsh
- [ ] **Cream highlights** — Whites should feel warm, not pure white
- [ ] **Muted saturation** — Not Instagram-vibrant
- [ ] **Consistent warmth** — All images should feel like the same "world"

---

## 🚫 What to Avoid

| Don't | Why |
|-------|-----|
| Cool blue tones | Brand violation — never cool/corporate |
| High contrast | Feels harsh, not inviting |
| Oversaturation | Looks cheap, not premium |
| Pure black shadows | Loses the film/warm feel |
| Orange skin tones | Too much warmth becomes unnatural |
| Green tint | Makes people look sick |

---

## 📦 Batch Processing

### ImageMagick (Command Line)

```bash
# Apply Ferni grade to all images in folder
for img in *.jpg; do
  convert "$img" \
    -modulate 102,92,100 \
    -colorize 3,1,0 \
    -contrast-stretch 2%x1% \
    -unsharp 0.5x0.5+0.5+0.008 \
    "graded_$img"
done
```

### Node.js Script (Sharp)

```javascript
const sharp = require('sharp');
const fs = require('fs');

async function ferniGrade(inputPath, outputPath) {
  await sharp(inputPath)
    .modulate({
      brightness: 1.02,
      saturation: 0.92,
    })
    .tint({ r: 255, g: 248, b: 240 }) // Warm tint
    .sharpen({ sigma: 0.5 })
    .toFile(outputPath);
}
```

---

## 🎯 Reference Images

These images nail the Ferni aesthetic:

1. **Kodak Portra 400 portraits** — The gold standard for warm film
2. **Apple "Shot on iPhone" campaign** — Clean but warm
3. **Kinfolk magazine photography** — Earthy, minimal, warm
4. **Cereal magazine** — Soft, contemplative, muted

---

## 📋 Quick Reference Card

```
FERNI IMAGE FORMULA
═══════════════════════════════════════
Temperature:  +15 (warmer)
Tint:         +6 (toward magenta)
Exposure:     +0.15
Contrast:     -10
Shadows:      +18 (lift)
Blacks:       +12 (lift)
Saturation:   -8 (muted)
Blues:        -30 saturation
Grain:        20 amount
═══════════════════════════════════════
CSS: sepia(12%) saturate(0.92) contrast(0.95)
═══════════════════════════════════════
```

---

*Last updated: December 2024*

