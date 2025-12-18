# Ferni Logo Design System

## Three Stones Logo 🪨

The Ferni logo represents **balance, wisdom, and presence** through the metaphor of zen stacked stones.

---

## Logo Assets

### SVG Sources (Canonical)

| File                                 | Description                           |
| ------------------------------------ | ------------------------------------- |
| `assets/logos/ferni-logo.svg`        | Primary logo with iris and catchlight |
| `assets/logos/ferni-logo-simple.svg` | Simplified 3-circle version           |
| `assets/logos/ferni-logo-dark.svg`   | Lighter variant for dark backgrounds  |

### PNG Exports

All PNGs are generated from SVG sources at these sizes:

```
16, 32, 48, 64, 96, 128, 180, 192, 256, 300, 512, 1024
```

Naming convention: `ferni-logo-{size}.png`, `ferni-logo-simple-{size}.png`, `ferni-logo-dark-{size}.png`

### Regenerating PNGs

```bash
node scripts/generate-logo-pngs.js
```

---

## Logo Structure

```svg
<!-- Three Stones Logo -->
<svg viewBox="0 0 100 100">
  <!-- Outer Stone: Sage Green Body -->
  <circle cx="50" cy="50" r="45" fill="#4a6741"/>

  <!-- Middle Stone: White Eye -->
  <circle cx="50" cy="50" r="18" fill="white"/>

  <!-- Iris: Light Sage (optional at small sizes) -->
  <circle cx="50" cy="50" r="12" fill="#5a8060"/>

  <!-- Inner Stone: Dark Pupil -->
  <circle cx="50" cy="50" r="6" fill="#2c2520"/>

  <!-- Catchlight: Life Spark (optional at small sizes) -->
  <circle cx="47" cy="47" r="2" fill="white" opacity="0.9"/>
</svg>
```

---

## Color Tokens

| Element     | Color           | Token                       |
| ----------- | --------------- | --------------------------- |
| Outer Stone | `#4a6741`       | `--persona-ferni-primary`   |
| Eye White   | `#FFFFFF`       | `white`                     |
| Iris        | `#5a8060`       | `--persona-ferni-secondary` |
| Pupil       | `#2c2520`       | `--color-ink`               |
| Catchlight  | `#FFFFFF` @ 90% | `white`                     |

---

## Size Guidelines

| Size     | Use Case          | Simplification             |
| -------- | ----------------- | -------------------------- |
| 16-24px  | Favicon, tab icon | 3 circles only             |
| 32-48px  | Small UI, lists   | May omit catchlight        |
| 64-128px | App icons, cards  | Full detail                |
| 192px+   | Hero, marketing   | Full detail with animation |

---

## Animated Logo (Expressive)

For interactive contexts, the logo can show expressions by revealing a simple line mouth.

### Expression Classes

Add these classes to the SVG element:

| Class        | Effect                          |
| ------------ | ------------------------------- |
| `.happy`     | Eye rises, smile appears        |
| `.excited`   | Bouncy eye, wide grin           |
| `.curious`   | Tilted eye, small smile         |
| `.sad`       | Soft eye, frown (flipped smile) |
| `.surprised` | Wide eye, small o mouth         |
| `.thinking`  | Wandering eye, no mouth         |
| `.chuckle`   | Squinty eye, wobbly smile       |
| `.speaking`  | Animated mouth line             |
| `.listening` | Gentle eye pulse                |

### Animation CSS

```css
.ferni-logo {
  --duration-normal: 400ms;
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}

.eye-group {
  transform-origin: 50px 50px;
  transition: transform var(--duration-normal) var(--ease-spring);
}

.mouth {
  stroke: white;
  stroke-width: 4;
  stroke-linecap: round;
  fill: none;
  opacity: 0;
  transition: opacity var(--duration-normal) ease;
}

.ferni-logo.happy .eye-group {
  transform: translateY(-12px);
}
.ferni-logo.happy .mouth {
  opacity: 1;
}
```

---

## Usage Examples

### HTML (Static Logo)

```html
<img src="/logos/ferni-logo.svg" alt="Ferni" width="48" height="48" />
```

### HTML (Inline SVG for Animation)

```html
<svg class="ferni-logo" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="45" fill="#4a6741" />
  <g class="eye-group">
    <circle cx="50" cy="50" r="18" fill="white" />
    <circle cx="50" cy="50" r="12" fill="#5a8060" />
    <circle cx="50" cy="50" r="6" fill="#2c2520" />
    <circle cx="47" cy="47" r="2" fill="white" opacity="0.9" />
  </g>
  <path class="mouth" d="M 35 68 Q 50 78 65 68" />
</svg>
```

### JavaScript (Toggle Expression)

```javascript
const logo = document.querySelector('.ferni-logo');

// Set expression
logo.classList.add('happy');

// Clear expression (back to zen)
logo.className = 'ferni-logo';
```

---

## Favicon

Use the simplified version for favicons:

```html
<link
  rel="icon"
  type="image/svg+xml"
  href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='45' fill='%234a6741'/><circle cx='50' cy='50' r='18' fill='white'/><circle cx='50' cy='50' r='8' fill='%232c2520'/></svg>"
/>
```

---

## File Locations

```
brand/logos/
├── ferni-logo.svg              # Primary SVG
├── ferni-logo-simple.svg       # Simplified SVG
├── ferni-logo-dark.svg         # Dark background variant
├── ferni-logo-stones.svg       # Static three stones
├── ferni-logo-expressive.svg   # Animated version with CSS
├── ferni-logo-animated.svg     # Full animation system
├── logo-preview.html           # Interactive preview
└── *.png                       # Generated PNGs

design-system/assets/logos/
├── *.svg                       # SVG copies
└── *.png                       # All size variants

apps/web/public/
├── logo.svg                    # App logo
├── logo-icon.svg               # App icon
└── icons/                      # Favicons & PWA icons
```

---

## Migration Notes

### From Old "FE" Logo

The previous logo used an "FE" monogram. When migrating:

1. Replace all `FE` text references with the three stones SVG
2. Update favicon data URIs to use the new inline SVG
3. Regenerate all PNG assets using `generate-logo-pngs.js`
4. Update any hardcoded logo dimensions (new logo is circular, not square)

### Impact Areas

- [x] Brand guidelines updated
- [x] Design system logos updated
- [x] Favicons updated
- [x] iOS/Android app icons updated
- [x] Electron app icons updated
- [x] Landing page favicon updated
- [ ] Frontend app animated logo component
- [ ] Marketing materials review
