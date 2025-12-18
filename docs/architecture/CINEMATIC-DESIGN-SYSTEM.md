# 🎬 Cinematic Design System

**Inspired by Google Labs Flow** - Premium, immersive, movie-like experiences for Ferni.

> ⚡ **Live Demo:** Visit `/cinematic-demo/` on the promo website to see these tokens in action.

---

## What's New

Based on analysis of [Google Labs Flow](https://labs.google/flow/about), these additions elevate Ferni's design system to the next level of professional polish.

### ✅ Brand Alignment

All cinematic tokens are available in two variants:

1. **Pure Cinematic** (`--color-cinematic-*`) - Cold blacks for maximum video contrast
2. **Ferni Warm Cinematic** (`--color-ferni-cinematic-*`) - Warm browns/creams aligned to Ferni's zen aesthetic

**Recommended:** Use the `--color-ferni-cinematic-*` variants to maintain brand consistency.

### New Token Categories

| Category | Tokens Added | Purpose |
|----------|--------------|---------|
| **Hero Typography** | `--text-7xl` to `--text-hero` | Massive viewport-spanning text |
| **Cinematic Colors** | `--color-cinematic-*` | True black/dark backgrounds |
| **Glass Buttons** | `--glass-btn-*` | Premium frosted glass CTAs |
| **Cinematic Shadows** | `--shadow-cinematic-*` | Dramatic depth on dark backgrounds |
| **Letter Spacing** | `--tracking-hero`, `--tracking-cinematic` | Tighter tracking for massive text |
| **Line Heights** | `--leading-hero`, `--leading-cinematic` | Compressed line heights for display |
| **Transitions** | `--transition-cinematic`, `--transition-hero` | Smooth premium motion |

---

## Usage Examples

### 1. Massive Hero Typography

```html
<section class="section-cinematic">
  <h1 class="text-hero">Ferni</h1>
  <p class="text-hero-sm">Your AI Life Coach</p>
</section>
```

```css
/* Custom usage */
.hero-title {
  font-size: var(--text-hero);           /* clamp(4rem, 18vw, 20rem) */
  font-weight: 800;
  line-height: var(--leading-hero);      /* 0.9 */
  letter-spacing: var(--tracking-hero);  /* -0.04em */
}
```

### 2. Video Hero Background

```html
<div class="hero-video-container">
  <video class="hero-video" autoplay muted loop playsinline>
    <source src="/videos/hero.mp4" type="video/mp4">
  </video>
  <div class="hero-video-overlay"></div>
</div>

<section class="section-cinematic">
  <h1 class="text-hero text-glow">Ferni</h1>
  <a href="#" class="btn-glass">Get Started</a>
</section>
```

### 3. Premium Glass Button (Google Flow Style)

```html
<a href="#" class="btn-glass">
  Create with Ferni
</a>
```

```css
/* Already styled, but customizable */
.btn-glass {
  background: var(--glass-btn-bg);
  backdrop-filter: blur(var(--glass-btn-blur));
  border: var(--glass-btn-border);
}
```

### 4. Cinematic Dark Section

```html
<section class="bg-cinematic">
  <div class="container">
    <h2>Start Creating</h2>
    <p style="color: var(--color-cinematic-text-muted)">
      180 monthly credits free of charge
    </p>
  </div>
</section>
```

### 5. Text Portal/Mask Effect

```html
<!-- Text that reveals video through it -->
<h1 class="text-mask-video" style="background-image: url('/videos/hero-poster.jpg')">
  Flow
</h1>
```

### 6. Scroll-Driven Animations (Modern CSS)

```html
<!-- These animate automatically as they enter the viewport -->
<div class="scroll-fade-in">Content fades in on scroll</div>
<div class="scroll-slide-up">Content slides up on scroll</div>
<div class="scroll-scale-in">Content scales in on scroll</div>
```

---

## New CSS Variables Reference

### Typography

```css
/* Massive hero sizes */
--text-7xl: 6rem;                           /* 96px */
--text-8xl: 9rem;                           /* 144px */
--text-9xl: 12rem;                          /* 192px */
--text-10xl: 16rem;                         /* 256px */
--text-hero: clamp(4rem, 18vw, 20rem);      /* Responsive */
--text-hero-sm: clamp(2.5rem, 12vw, 10rem); /* Smaller responsive */

/* Tighter tracking for massive text */
--tracking-cinematic: -0.05em;
--tracking-hero: -0.04em;
--tracking-display: -0.03em;

/* Compressed line heights */
--leading-cinematic: 0.85;
--leading-hero: 0.9;
--leading-display: 0.95;
```

### Cinematic Colors

```css
/* Pure blacks for video/hero sections (Google Flow style) */
--color-cinematic-black: #0a0a0a;
--color-cinematic-dark: #121212;
--color-cinematic-deep: #1a1a1a;
--color-cinematic-surface: #222222;

/* FERNI BRAND WARM CINEMATIC (Recommended) */
--color-ferni-cinematic-black: #1a1614;      /* Warm black with brown */
--color-ferni-cinematic-dark: #2c2520;       /* Natural Ink */
--color-ferni-cinematic-deep: #3a332e;       /* Warm deep */
--color-ferni-cinematic-surface: #4a4038;    /* Warm surface */
--color-ferni-cinematic-elevated: #584840;   /* Warm elevated */

/* Text colors on dark backgrounds */
--color-cinematic-text: #ffffff;
--color-cinematic-text-secondary: rgba(255, 255, 255, 0.8);
--color-cinematic-text-muted: rgba(255, 255, 255, 0.6);

/* FERNI BRAND TEXT (Recommended) */
--color-ferni-cinematic-text: #F5F1E8;           /* Paper Cream */
--color-ferni-cinematic-text-secondary: #E8E0D5; /* Sand */
--color-ferni-cinematic-text-muted: rgba(245, 241, 232, 0.6);
--color-ferni-cinematic-text-accent: #C4A265;    /* Warm Amber */

/* Overlays for video backgrounds */
--color-cinematic-overlay-vignette: radial-gradient(circle at center, transparent 30%, rgba(0, 0, 0, 0.4) 100%);
--color-ferni-overlay-vignette: radial-gradient(circle at center, transparent 30%, rgba(44, 37, 32, 0.5) 100%);
```

### Glassmorphism Buttons

```css
/* Google Flow style glass button (pure white tint) */
--glass-btn-bg: rgba(255, 255, 255, 0.08);
--glass-btn-bg-hover: rgba(255, 255, 255, 0.14);
--glass-btn-blur: 24px;
--glass-btn-border: 1px solid rgba(255, 255, 255, 0.12);

/* FERNI BRAND GLASS (Recommended - warm cream tint) */
--ferni-glass-btn-bg: rgba(245, 241, 232, 0.06);
--ferni-glass-btn-bg-hover: rgba(245, 241, 232, 0.12);
--ferni-glass-btn-border: 1px solid rgba(245, 241, 232, 0.1);
--ferni-glass-btn-border-hover: 1px solid rgba(245, 241, 232, 0.2);

/* FERNI PRIMARY GLASS (Forest Green glow) */
--ferni-glass-primary-bg: rgba(61, 90, 69, 0.15);
--ferni-glass-primary-bg-hover: rgba(61, 90, 69, 0.25);
--ferni-glass-primary-glow: 0 0 40px rgba(61, 90, 69, 0.25);

/* Light mode glass */
--glass-light-btn-bg: rgba(0, 0, 0, 0.04);
--glass-light-btn-border: 1px solid rgba(0, 0, 0, 0.08);
```

### Cinematic Shadows

```css
/* Dramatic depth on dark backgrounds */
--shadow-cinematic-sm: 0 4px 16px rgba(0, 0, 0, 0.4);
--shadow-cinematic-md: 0 8px 32px rgba(0, 0, 0, 0.5);
--shadow-cinematic-lg: 0 16px 64px rgba(0, 0, 0, 0.6);
--shadow-cinematic-xl: 0 32px 128px rgba(0, 0, 0, 0.7);

/* Glow effects */
--shadow-glow-white: 0 0 40px rgba(255, 255, 255, 0.15);
--shadow-glow-accent: 0 0 60px rgba(74, 103, 65, 0.3);
```

### Transitions

```css
/* Premium motion */
--duration-cinematic: 800ms;
--duration-dramatic: 1200ms;
--ease-cinematic: cubic-bezier(0.16, 1, 0.3, 1);
--ease-dramatic: cubic-bezier(0.7, 0, 0.3, 1);
--transition-cinematic: all 800ms cubic-bezier(0.16, 1, 0.3, 1);
--transition-hero: all 1200ms cubic-bezier(0.25, 0.1, 0.25, 1);
```

---

## Utility Classes

### Typography

| Class | Description |
|-------|-------------|
| `.text-hero` | Massive responsive hero text |
| `.text-hero-sm` | Smaller responsive hero text |
| `.text-glow` | White glow effect on text |
| `.text-gradient-light` | White-to-transparent gradient text |

### Backgrounds

| Class | Description |
|-------|-------------|
| `.bg-cinematic` | True black background with white text |
| `.bg-cinematic-deep` | Slightly lighter cinematic dark |
| `.section-cinematic` | Full viewport cinematic section |

### Video Hero

| Class | Description |
|-------|-------------|
| `.hero-video-container` | Fixed full-bleed video container |
| `.hero-video` | Video element styling |
| `.hero-video-overlay` | Vignette overlay for readability |

### Buttons

| Class | Description |
|-------|-------------|
| `.btn-glass` | Premium frosted glass button |

### Effects

| Class | Description |
|-------|-------------|
| `.portal-mask` | Circular reveal mask (hover to expand) |
| `.scroll-fade-in` | Fade in on scroll (CSS Scroll Timeline) |
| `.scroll-slide-up` | Slide up on scroll |
| `.scroll-scale-in` | Scale in on scroll |

### Navigation

| Class | Description |
|-------|-------------|
| `.nav-minimal` | Ultra-clean transparent navigation |
| `.nav-minimal.scrolled` | Blurred background on scroll |

---

## Files Updated

| File | Changes |
|------|---------|
| `apps/web/public/design-system/cinematic.css` | **NEW** - Complete cinematic utilities + Ferni brand variants |
| `apps/web/public/design-system/tokens.css` | Added hero typography tokens |
| `apps/website/ferni-website/src/css/tokens.css` | Added all cinematic tokens + Ferni warm variants |
| `apps/website/ferni-website/src/css/cinematic-demo.css` | **NEW** - Demo page styles |
| `apps/website/ferni-website/src/pages/cinematic-demo.njk` | **NEW** - Live demo page |
| `design-system/tokens/typography.json` | Added `7xl`-`hero` sizes, new line heights, letter spacing |

---

## Brand-Aligned Utility Classes

### Ferni Warm Backgrounds (Use Instead of Pure Black)

```html
<!-- Warm cinematic backgrounds -->
<section class="bg-ferni-cinematic">...</section>
<section class="bg-ferni-cinematic-warm">...</section>
<section class="bg-ferni-cinematic-gradient">...</section>

<!-- Full hero section -->
<section class="section-ferni-hero">...</section>
```

### Ferni Glass Buttons

```html
<!-- Warm cream glass button -->
<a href="#" class="btn-ferni-glass">Secondary Action</a>

<!-- Forest green primary glass -->
<a href="#" class="btn-ferni-glass-primary">Primary Action</a>
```

### Ferni Text Colors on Dark

```html
<h1 class="text-ferni-cream">Headline</h1>
<p class="text-ferni-muted">Body text</p>
<span class="text-ferni-amber">Accent text</span>
```

### Ferni Text Gradients

```html
<!-- Warm amber gradient -->
<h1 class="text-gradient-ferni">Gradient Headline</h1>

<!-- Sage green gradient -->
<h1 class="text-gradient-ferni-sage">Sage Headline</h1>
```

### Ferni Text Glow

```html
<h1 class="text-glow-ferni">Warm Glow</h1>
<h1 class="text-glow-sage">Sage Glow</h1>
```

### Ferni Eyebrow Badge

```html
<span class="ferni-eyebrow">
  <span>✦</span>
  Your AI Life Coach
</span>
```

---

## Import the Cinematic CSS

For the frontend app:
```html
<link rel="stylesheet" href="/design-system/cinematic.css">
```

For the promo website, the tokens are already in `tokens.css`.

---

## Design Comparison: Before → After

| Element | Before (Ferni) | After (Cinematic + Brand-Aligned) |
|---------|----------------|-----------------------------------|
| Max font size | 60px (3.75rem) | 320px+ responsive (`clamp()`) |
| Hero typography | Fixed sizes | `clamp(4rem, 18vw, 20rem)` |
| Dark backgrounds | Warm browns | Warm cinematic (#1a1614 - #2c2520) |
| Button style | Solid colors | Frosted glassmorphism with cream/sage tints |
| Scroll animations | Basic CSS | CSS Scroll Timeline + staggered reveals |
| Letter spacing | -0.03em max | -0.05em for cinematic heroes |
| Line height | 1.0 minimum | 0.85 for massive text |
| Text effects | None | Gradients (cream→amber, cream→sage) |
| Glow effects | None | Warm glows on dark backgrounds |

### Brand Alignment Notes

✅ **Warm blacks** (#1a1614) instead of cold pure black (#0a0a0a)  
✅ **Paper Cream text** (#F5F1E8) instead of pure white (#ffffff)  
✅ **Warm Amber accents** (#C4A265) for highlights  
✅ **Forest Green glows** for primary buttons  
✅ **Warm vignettes** using Natural Ink (#2C2520)

---

## Reference

- [Google Labs Flow](https://labs.google/flow/about) - Inspiration source
- Font: Google uses Google Sans (proprietary), Ferni uses Plus Jakarta Sans (similar)

