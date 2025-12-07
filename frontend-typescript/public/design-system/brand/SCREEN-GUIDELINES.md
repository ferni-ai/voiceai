# Ferni Screen Guidelines
## Digital Brand Standards & Design System

**Version 1.0 | December 2024**

---

<div align="center">

# FN

**Your personal AI life coach.**

</div>

---

# Contents

1. [Brand Foundation](#1-brand-foundation)
2. [Logo System](#2-logo-system)
3. [Color System](#3-color-system)
4. [Typography System](#4-typography-system)
5. [Grid & Spacing](#5-grid--spacing)
6. [Photography & Video](#6-photography--video)
7. [Iconography](#7-iconography)
8. [Component Library](#8-component-library)
9. [Animation & Motion](#9-animation--motion)
10. [Page Templates](#10-page-templates)
11. [Voice & Copy](#11-voice--copy)
12. [Accessibility](#12-accessibility)
13. [Implementation](#13-implementation)

---

# 1. Brand Foundation

## 1.1 Brand Essence

Ferni exists in the quiet moments—the 2am worry, the commute contemplation, the space before a big decision. We're not replacing human connection. We're filling the gaps.

### Core Promise
> **"Finally, someone who actually listens."**

### Brand Pillars

| Pillar | Description |
|--------|-------------|
| **Presence** | Fully attentive, never distracted |
| **Warmth** | Like a trusted friend, not a cold machine |
| **Wisdom** | Thoughtful guidance without judgment |
| **Grounding** | Calm, stable, reliable presence |

## 1.2 Design Philosophy

Our visual language draws from:

**Japanese Zen** — Clean, uncluttered, purposeful  
**Scandinavian Hygge** — Warm, inviting, human  
**Apple Precision** — Premium, polished, considered  
**Studio Ghibli Heart** — Emotional, authentic, magical

### Design Principles

1. **Breathe** — Generous whitespace creates calm
2. **Ground** — Earth tones connect to nature
3. **Focus** — Every element earns its place
4. **Delight** — Subtle moments of surprise
5. **Trust** — Consistency builds confidence

---

# 2. Logo System

## 2.1 Logo Construction

The Ferni logo consists of two elements:

```
┌─────────────────────────────────────────┐
│                                         │
│    ┌──────┐                             │
│    │  FN  │   Ferni                     │
│    └──────┘                             │
│                                         │
│    Logomark    Wordmark                 │
│                                         │
└─────────────────────────────────────────┘
```

### Logomark
- **Shape**: Rounded square (24px radius at 64px)
- **Monogram**: "FN" in Plus Jakarta Sans Bold
- **Background**: Ferni Sage (#4a6741)
- **Text**: White (#FFFFFF)

### Wordmark
- **Font**: Plus Jakarta Sans
- **Weight**: 700 (Bold)
- **Tracking**: -0.02em

## 2.2 Logo Versions

| Version | File Name | Use Case |
|---------|-----------|----------|
| **Full Color** | `logo-primary.svg` | Default usage |
| **Reverse** | `logo-dark-bg.svg` | Dark backgrounds |
| **Monochrome Dark** | `logo-mono-dark.svg` | Single color (dark) |
| **Monochrome Light** | `logo-mono-light.svg` | Single color (light) |
| **Logomark Only** | `logomark.svg` | App icons, favicons |

## 2.3 Clear Space

Minimum clear space = 0.5× logomark height

```
        ←─ 0.5x ─→
        ┌────────────────────┐
    ↑   │                    │
   0.5x │    ┌──────┐        │
    ↓   │    │  FN  │ Ferni  │
        │    └──────┘        │
        │                    │
        └────────────────────┘
```

## 2.4 Minimum Sizes

| Context | Minimum Width |
|---------|---------------|
| **Full logo (digital)** | 120px |
| **Logomark only (digital)** | 32px |
| **Full logo (print)** | 1 inch / 25mm |
| **Logomark only (print)** | 0.25 inch / 6mm |

## 2.5 Logo Don'ts

❌ Don't stretch or distort  
❌ Don't rotate  
❌ Don't add drop shadows or effects  
❌ Don't place on busy backgrounds  
❌ Don't change the logomark shape  
❌ Don't use unapproved colors  
❌ Don't outline or stroke  

---

# 3. Color System

## 3.1 Primary Palette

### Background Colors

| Name | Hex | RGB | HSL |
|------|-----|-----|-----|
| **Paper Cream** | `#F5F1E8` | 245, 241, 232 | 42°, 37%, 94% |
| **Sand** | `#E8E0D5` | 232, 224, 213 | 35°, 28%, 87% |
| **Elevated** | `#FFFDFB` | 255, 253, 251 | 30°, 100%, 99% |

**Usage:**
- `Paper Cream` — Primary page background
- `Sand` — Secondary backgrounds, alternating sections
- `Elevated` — Cards, modals, elevated surfaces

### Text Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Natural Ink** | `#2C2520` | 44, 37, 32 | Headlines, primary text |
| **Secondary** | `#5C544A` | 92, 84, 74 | Body copy |
| **Muted** | `#756A5E` | 117, 106, 94 | Captions, metadata |
| **Dimmed** | `#A89D90` | 168, 157, 144 | Placeholder, disabled |

### Accent Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Forest Green** | `#3D5A45` | 61, 90, 69 | Primary CTAs, links |
| **Warm Amber** | `#C4A265` | 196, 162, 101 | Highlights, emphasis |

## 3.2 Persona Colors

Each AI specialist has a unique, earthy color identity:

| Persona | Role | Primary | Secondary |
|---------|------|---------|-----------|
| **Ferni** | Life Coach | `#4a6741` | `#3d5a35` |
| **Jack** | Sage & Mentor | `#9a7b5a` | `#7d6348` |
| **Peter** | Research | `#3a6b73` | `#2d5359` |
| **Alex** | Communications | `#5a6b8a` | `#4a5a73` |
| **Maya** | Habits & Routines | `#a67a6a` | `#8a635a` |
| **Jordan** | Event Planner | `#c4856a` | `#a86d55` |

### Persona Color Properties

Each persona color includes:

```css
--persona-primary: #4a6741;      /* Main color */
--persona-secondary: #3d5a35;    /* Darker shade */
--persona-glow: rgba(74, 103, 65, 0.25);  /* Glow effect */
--persona-tint: rgba(74, 103, 65, 0.04);  /* Background tint */
```

## 3.3 Border Colors

| Name | Value | Usage |
|------|-------|-------|
| **Subtle** | `rgba(44, 37, 32, 0.05)` | Dividers |
| **Medium** | `rgba(44, 37, 32, 0.10)` | Card borders |
| **Strong** | `rgba(44, 37, 32, 0.18)` | Input borders, focus |

## 3.4 Semantic Colors

| State | Color | Background |
|-------|-------|------------|
| **Success** | `#4a7352` | `rgba(74, 115, 82, 0.1)` |
| **Error** | `#a65a52` | `rgba(166, 90, 82, 0.1)` |
| **Warning** | `#a6854a` | `rgba(166, 133, 74, 0.1)` |
| **Info** | `#5a6b8a` | `rgba(90, 107, 138, 0.1)` |

## 3.5 Gradient Usage

**Primary gradient (rare):**
```css
background: linear-gradient(135deg, #3D5A45 0%, #4a6741 100%);
```

**Text gradient (hero only):**
```css
background: linear-gradient(135deg, #7A8B6E 0%, #B8A88A 100%);
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
```

## 3.6 Color Don'ts

❌ Never use saturated blues or purples  
❌ Never use neon or fluorescent colors  
❌ Never use cool gray tones  
❌ Never use black (#000000) for text  
❌ Never apply gradients to body text  

---

# 4. Typography System

## 4.1 Font Stack

### Display Font: Plus Jakarta Sans
**Use for:** Headlines, display text, navigation, buttons

```css
font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
```

**Weights:** 400, 500, 600, 700, 800

### Body Font: Inter
**Use for:** Body text, paragraphs, UI elements

```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
```

**Weights:** 300, 400, 500, 600, 700

### Accent Font: Sora
**Use for:** Special callouts, numbers, accent text

```css
font-family: 'Sora', sans-serif;
```

**Weights:** 400, 500, 600, 700

### Monospace: JetBrains Mono
**Use for:** Code blocks, technical content

```css
font-family: 'JetBrains Mono', 'SF Mono', monospace;
```

## 4.2 Type Scale

### Display Sizes (Hero Headlines)

| Token | Desktop | Tablet | Mobile | Weight | Line Height |
|-------|---------|--------|--------|--------|-------------|
| **display-xl** | 96px | 72px | 48px | 800 | 1.0 |
| **display-lg** | 80px | 56px | 40px | 800 | 1.0 |
| **display-md** | 64px | 48px | 36px | 700 | 1.05 |
| **display-sm** | 48px | 40px | 32px | 700 | 1.1 |

### Headline Sizes

| Token | Size | Weight | Line Height | Letter Spacing |
|-------|------|--------|-------------|----------------|
| **h1** | 40px | 700 | 1.2 | -0.015em |
| **h2** | 32px | 600 | 1.25 | -0.01em |
| **h3** | 24px | 600 | 1.3 | -0.01em |
| **h4** | 20px | 600 | 1.35 | 0 |
| **h5** | 18px | 600 | 1.4 | 0 |
| **h6** | 16px | 600 | 1.4 | 0 |

### Body Sizes

| Token | Size | Weight | Line Height |
|-------|------|--------|-------------|
| **body-xl** | 22px | 400 | 1.65 |
| **body-lg** | 20px | 400 | 1.6 |
| **body-md** | 17px | 400 | 1.6 |
| **body-sm** | 15px | 400 | 1.5 |
| **body-xs** | 13px | 400 | 1.5 |

### UI Sizes

| Token | Size | Weight | Letter Spacing | Use |
|-------|------|--------|----------------|-----|
| **button-lg** | 18px | 600 | -0.01em | Large buttons |
| **button-md** | 16px | 600 | -0.01em | Default buttons |
| **button-sm** | 14px | 600 | 0 | Small buttons |
| **caption** | 13px | 500 | 0.01em | Captions |
| **label** | 12px | 600 | 0.02em | Form labels |
| **overline** | 11px | 700 | 0.1em | Eyebrows |

## 4.3 Typography Examples

### Hero Treatment (Inspired by Apple/Google Flow)

```html
<p class="overline">Introducing Ferni</p>
<h1 class="display-xl">
  Finally, someone<br>
  <span class="text-gradient">who actually listens.</span>
</h1>
<p class="body-lg">
  Six AI specialists. One seamless conversation.
</p>
```

**Specifications:**
- Overline: 11px, 700 weight, 0.1em tracking, muted color
- Headline: 96px, 800 weight, -0.03em tracking
- Tagline: 20px, 400 weight, secondary color

### Section Headlines

```html
<p class="eyebrow">It remembers</p>
<h2 class="display-sm">
  They remember.<br>
  So you don't have to.
</h2>
```

---

# 5. Grid & Spacing

## 5.1 Spacing Scale

Based on 4px base unit:

| Token | Value | Use Case |
|-------|-------|----------|
| `space-1` | 4px | Icon gaps, tight spacing |
| `space-2` | 8px | Related elements |
| `space-3` | 12px | Small internal gaps |
| `space-4` | 16px | Standard element gap |
| `space-5` | 20px | Medium spacing |
| `space-6` | 24px | Card padding |
| `space-8` | 32px | Large gaps |
| `space-10` | 40px | Section internal |
| `space-12` | 48px | Content blocks |
| `space-16` | 64px | Hero elements |
| `space-20` | 80px | Section spacing |
| `space-24` | 96px | Major sections |
| `space-32` | 128px | Hero sections |

## 5.2 Layout Grid

### Desktop (≥1200px)

```
┌─────────────────────────────────────────────────────────────┐
│  48px  │                    1200px                    │  48px  │
│ margin │              max-width container             │ margin │
├────────┼─────────────────────────────────────────────┼────────┤
│        │  col │ 24px │ col │ 24px │ ... │ 24px │ col │        │
│        │      │gutter│     │gutter│     │gutter│     │        │
│        │      12 columns, 24px gutters               │        │
└────────┴─────────────────────────────────────────────┴────────┘
```

- **Container max-width:** 1200px
- **Columns:** 12
- **Gutter:** 24px
- **Margin:** 48px (minimum)

### Tablet (768px - 1199px)

- **Container:** 100% - 48px
- **Columns:** 8
- **Gutter:** 20px
- **Margin:** 24px

### Mobile (< 768px)

- **Container:** 100% - 32px
- **Columns:** 4
- **Gutter:** 16px
- **Margin:** 16px

## 5.3 Section Spacing

| Section Type | Padding (Desktop) | Padding (Mobile) |
|--------------|-------------------|------------------|
| **Hero** | 0 (full viewport) | 0 |
| **Major Section** | 120px top/bottom | 80px |
| **Minor Section** | 80px top/bottom | 48px |
| **Content Block** | 48px top/bottom | 32px |

## 5.4 Component Spacing

| Component | Internal Padding | Gap to Siblings |
|-----------|------------------|-----------------|
| **Card** | 32px | 24px |
| **Button** | 16px 32px | 16px |
| **Input** | 16px 20px | 24px |
| **Nav Item** | 12px 16px | 8px |

---

# 6. Photography & Video

## 6.1 Photography Style

### Mood & Tone

**Feel:** Warm, natural, intimate, authentic  
**Light:** Golden hour, soft diffused, never harsh  
**Setting:** Natural environments, cozy interiors  
**Subjects:** Real people, genuine expressions

### Color Treatment

```
┌─────────────────────────────────────────┐
│                                         │
│  ● Warm color grading throughout        │
│  ● Lifted shadows (never pure black)    │
│  ● Soft, natural saturation             │
│  ● Subtle film grain                    │
│  ● Paper Cream highlight bias           │
│                                         │
└─────────────────────────────────────────┘
```

### Subject Guidelines

**Do:**
- People in contemplative moments
- Natural landscapes (meadows, forests)
- Soft, genuine smiles
- Back-to-camera compositions
- Golden hour lighting

**Don't:**
- Stock photo poses
- Corporate settings
- Harsh studio lighting
- Cool blue tones
- Over-saturated colors

## 6.2 Video Guidelines

### Hero Videos

**Format:** MP4 (H.264), WebM (VP9)  
**Resolution:** 4K (3840×2160) master, 1080p delivery  
**Frame Rate:** 24fps (cinematic), 30fps (UI)  
**Duration:** 10-15 seconds (seamless loop)  
**Audio:** None (ambient only if required)

### Video Style

| Attribute | Specification |
|-----------|---------------|
| **Motion** | Slow, deliberate, contemplative |
| **Camera** | Smooth dolly/crane, minimal handheld |
| **Transitions** | Gentle fades, no hard cuts |
| **Color** | Match photography treatment |
| **Pacing** | Meditative, breathing room |

### Video Types

| Type | Duration | Use Case |
|------|----------|----------|
| **Hero Loop** | 10-15s | Landing page background |
| **Feature Micro** | 5-8s | Feature section accents |
| **Brand Film** | 60-90s | About/story page |
| **Testimonial** | 45-60s | Social proof |

## 6.3 Image Specifications

| Asset Type | Dimensions | Format | Max Size |
|------------|------------|--------|----------|
| **Hero (desktop)** | 1920×1080 | WebP/JPG | 200KB |
| **Hero (mobile)** | 750×1334 | WebP/JPG | 100KB |
| **Card thumbnail** | 600×400 | WebP/JPG | 50KB |
| **Avatar** | 200×200 | WebP/PNG | 20KB |
| **OG Image** | 1200×630 | JPG | 100KB |
| **Favicon** | 32×32 | SVG/PNG | 5KB |

---

# 7. Iconography

## 7.1 Icon Style

### Specifications

| Property | Value |
|----------|-------|
| **Style** | Outlined (not filled) |
| **Stroke Weight** | 1.5px (16px), 2px (24px+) |
| **Corner Radius** | 2px |
| **Grid** | 24×24px base |
| **Padding** | 2px internal |

### Icon Sizes

| Size | Use Case |
|------|----------|
| **16px** | Inline text, dense UI |
| **20px** | Buttons, list items |
| **24px** | Standard icons |
| **32px** | Feature highlights |
| **48px** | Large callouts |

## 7.2 Icon Colors

| State | Color |
|-------|-------|
| **Default** | `#5C544A` (Secondary) |
| **Hover** | `#2C2520` (Natural Ink) |
| **Active** | `#3D5A45` (Forest Green) |
| **Disabled** | `#A89D90` (Dimmed) |
| **Inverse** | `#F5F1E8` (Paper Cream) |

## 7.3 Icon Library

Use [Lucide Icons](https://lucide.dev/) as base, customized to match stroke weight.

**Core Icons:**
- Navigation: menu, x, chevron-right, arrow-right
- Actions: play, pause, phone, mail, send
- UI: check, info, alert-circle, loader
- Features: brain, users, zap, clock, calendar

---

# 8. Component Library

## 8.1 Buttons

### Primary Button

```css
.btn-primary {
  background: #3D5A45;
  color: #FFFFFF;
  padding: 16px 32px;
  border-radius: 9999px;
  font-family: 'Plus Jakarta Sans';
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
  border: none;
  cursor: pointer;
  transition: all 200ms ease-out;
}

.btn-primary:hover {
  background: #4a6d52;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(61, 90, 69, 0.2);
}

.btn-primary:active {
  transform: scale(0.98);
}
```

### Secondary Button (Outline)

```css
.btn-secondary {
  background: transparent;
  color: #2C2520;
  padding: 16px 32px;
  border-radius: 9999px;
  border: 1.5px solid rgba(44, 37, 32, 0.2);
  font-family: 'Plus Jakarta Sans';
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 200ms ease-out;
}

.btn-secondary:hover {
  border-color: #2C2520;
  background: rgba(44, 37, 32, 0.03);
}
```

### Ghost Button

```css
.btn-ghost {
  background: transparent;
  color: #5C544A;
  padding: 12px 20px;
  border: none;
  font-weight: 500;
  cursor: pointer;
  transition: color 200ms;
}

.btn-ghost:hover {
  color: #2C2520;
}
```

### Button Sizes

| Size | Padding | Font Size | Min Height |
|------|---------|-----------|------------|
| **Large** | 20px 40px | 18px | 56px |
| **Default** | 16px 32px | 16px | 48px |
| **Small** | 12px 24px | 14px | 40px |

## 8.2 Cards

### Standard Card

```css
.card {
  background: #FFFDFB;
  border: 1px solid rgba(44, 37, 32, 0.08);
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 2px 8px rgba(44, 37, 32, 0.04);
  transition: all 300ms ease-out;
}

.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(44, 37, 32, 0.08);
}
```

### Feature Card

```css
.card-feature {
  background: linear-gradient(135deg, #F5F1E8 0%, #FFFDFB 100%);
  border-radius: 24px;
  padding: 48px;
  border: none;
}
```

### Persona Card

```css
.card-persona {
  --persona-color: #4a6741;
  
  background: #FFFDFB;
  border-radius: 20px;
  padding: 40px;
  text-align: center;
  border: 1px solid rgba(44, 37, 32, 0.06);
}

.card-persona .avatar {
  width: 80px;
  height: 80px;
  background: var(--persona-color);
  border-radius: 50%;
  margin: 0 auto 24px;
  box-shadow: 0 8px 30px color-mix(in srgb, var(--persona-color) 25%, transparent);
}
```

## 8.3 Form Elements

### Input Field

```css
.input {
  width: 100%;
  background: #FFFDFB;
  border: 1.5px solid rgba(44, 37, 32, 0.12);
  border-radius: 12px;
  padding: 16px 20px;
  font-family: 'Inter';
  font-size: 16px;
  color: #2C2520;
  transition: all 200ms ease-out;
}

.input::placeholder {
  color: #A89D90;
}

.input:focus {
  outline: none;
  border-color: #3D5A45;
  box-shadow: 0 0 0 3px rgba(61, 90, 69, 0.1);
}
```

### Label

```css
.label {
  display: block;
  font-family: 'Inter';
  font-size: 13px;
  font-weight: 600;
  color: #5C544A;
  letter-spacing: 0.02em;
  margin-bottom: 8px;
}
```

## 8.4 Navigation

### Desktop Navigation

```css
.nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  padding: 16px 0;
  background: rgba(245, 241, 232, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(44, 37, 32, 0.05);
  transition: all 300ms ease-out;
}

.nav.scrolled {
  padding: 12px 0;
  background: rgba(245, 241, 232, 0.95);
  box-shadow: 0 2px 20px rgba(44, 37, 32, 0.06);
}
```

### Nav Link

```css
.nav-link {
  font-family: 'Plus Jakarta Sans';
  font-size: 15px;
  font-weight: 500;
  color: #5C544A;
  text-decoration: none;
  padding: 12px 16px;
  border-radius: 8px;
  transition: all 200ms;
}

.nav-link:hover {
  color: #2C2520;
  background: rgba(44, 37, 32, 0.03);
}

.nav-link.active {
  color: #3D5A45;
}
```

---

# 9. Animation & Motion

## 9.1 Timing Functions

| Name | Value | Use |
|------|-------|-----|
| **ease-out** | `cubic-bezier(0.16, 1, 0.3, 1)` | Entrances, reveals |
| **ease-in-out** | `cubic-bezier(0.45, 0, 0.55, 1)` | State changes |
| **spring** | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Bouncy interactions |

## 9.2 Duration Scale

| Token | Value | Use |
|-------|-------|-----|
| **instant** | 100ms | Immediate feedback |
| **fast** | 150ms | Micro-interactions |
| **normal** | 300ms | Standard transitions |
| **slow** | 500ms | Reveals, emphasis |
| **cinematic** | 800ms+ | Hero animations |

## 9.3 Animation Patterns

### Reveal on Scroll

```css
.reveal {
  opacity: 0;
  transform: translateY(24px);
  transition: opacity 800ms ease-out, transform 800ms ease-out;
}

.reveal.visible {
  opacity: 1;
  transform: translateY(0);
}
```

### Staggered Reveal

```css
.reveal-delay-1 { transition-delay: 100ms; }
.reveal-delay-2 { transition-delay: 200ms; }
.reveal-delay-3 { transition-delay: 300ms; }
.reveal-delay-4 { transition-delay: 400ms; }
```

### Hover Lift

```css
.lift {
  transition: transform 300ms ease-out, box-shadow 300ms ease-out;
}

.lift:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(44, 37, 32, 0.1);
}
```

### Button Press

```css
.press:active {
  transform: scale(0.98);
  transition: transform 100ms;
}
```

## 9.4 Scroll Animations (GSAP)

```javascript
// Hero content fade out on scroll
gsap.to('.hero-content', {
  opacity: 0,
  y: -100,
  scrollTrigger: {
    trigger: '.hero',
    start: 'top top',
    end: '20% top',
    scrub: true
  }
});

// Section reveal
gsap.from('.section-content', {
  opacity: 0,
  y: 40,
  duration: 1,
  ease: 'power3.out',
  scrollTrigger: {
    trigger: '.section',
    start: 'top 80%'
  }
});
```

## 9.5 Reduced Motion

Always respect user preferences:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

# 10. Page Templates

## 10.1 Landing Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│                         NAVIGATION                          │
│  [Logo]                                    [Links] [CTA]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                           HERO                              │
│                     (Full Viewport)                         │
│                                                             │
│              [Eyebrow]                                      │
│              [Display Headline XL]                          │
│              [Tagline]                                      │
│              [CTA Primary] [CTA Secondary]                  │
│                                                             │
│                     [Scroll Indicator]                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                    FEATURE SECTION 1                        │
│                      (120px padding)                        │
│                                                             │
│   [Eyebrow]                                                 │
│   [Display Headline SM]                                     │
│   [Body text]                                               │
│   [Visual/Video]                                            │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                    FEATURE SECTION 2                        │
│                (Alternating layout)                         │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                      TEAM SECTION                           │
│                                                             │
│                    [6 Persona Cards]                        │
│                        (3×2 grid)                           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                   TESTIMONIALS SECTION                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                    FAQ SECTION                              │
│                    (Accordion)                              │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                    CTA SECTION                              │
│                (Full-width, elevated)                       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                         FOOTER                              │
│  [Logo]  [Links]  [Links]  [Links]  [Social]  [Legal]      │
└─────────────────────────────────────────────────────────────┘
```

## 10.2 Hero Section Specifications

| Element | Desktop | Mobile |
|---------|---------|--------|
| **Height** | 100vh | 100vh (min 600px) |
| **Headline** | 96px, centered or left | 48px, centered |
| **Tagline** | 20px, max 600px width | 17px |
| **CTA Group** | Horizontal, 16px gap | Vertical stack |
| **Background** | Video or image | Simplified image |

## 10.3 Feature Section Specifications

| Element | Desktop | Mobile |
|---------|---------|--------|
| **Padding** | 120px top/bottom | 80px |
| **Layout** | Two-column (text + visual) | Stacked |
| **Headline** | 48px | 32px |
| **Visual** | 50% width, 16:9 | 100% width |

---

# 11. Voice & Copy

## 11.1 Brand Voice

**Warm but not saccharine:**
> ✅ "We're here when you need us."  
> ❌ "We're soooo excited to help you! 💕"

**Confident but not arrogant:**
> ✅ "Ferni remembers everything."  
> ❌ "We're the best AI ever created."

**Clear but not cold:**
> ✅ "Just talk. We'll understand."  
> ❌ "Leverage our NLP capabilities."

**Human but not artificial:**
> ✅ "Like talking to a friend who never forgets."  
> ❌ "Our AI simulates human connection."

## 11.2 Headline Framework

### Structure
- Lead with emotion or benefit
- Short, punchy phrases
- Use line breaks for emphasis
- End with period for gravity

### Examples

**Hero Headlines:**
> "Finally, someone who actually listens."  
> "Your AI team. Always there."  
> "The space between."

**Section Headlines:**
> "They remember. So you don't have to."  
> "A team that actually knows you."  
> "Fast enough to feel like thinking."

## 11.3 Microcopy

### Buttons
- Use action verbs: "Start", "Begin", "Try"
- Be personal: "Start Free" not "Sign Up"
- Be clear: "Open App" not "Launch"

### Error Messages
- Helpful, not blaming
- Suggest solution
- Human tone

> ✅ "Hmm, that doesn't look like an email. Mind checking?"  
> ❌ "Error: Invalid email format."

---

# 12. Accessibility

## 12.1 Color Contrast

All text must meet WCAG 2.1 AA standards:

| Element | Minimum Ratio |
|---------|---------------|
| **Body text** | 4.5:1 |
| **Large text (18px+)** | 3:1 |
| **UI components** | 3:1 |

### Verified Combinations

| Foreground | Background | Ratio | Pass |
|------------|------------|-------|------|
| Natural Ink (#2C2520) | Paper Cream (#F5F1E8) | 10.2:1 | ✅ AAA |
| Secondary (#5C544A) | Paper Cream (#F5F1E8) | 5.4:1 | ✅ AA |
| Forest Green (#3D5A45) | White (#FFFFFF) | 7.1:1 | ✅ AAA |
| White (#FFFFFF) | Forest Green (#3D5A45) | 7.1:1 | ✅ AAA |

## 12.2 Focus States

All interactive elements must have visible focus:

```css
:focus-visible {
  outline: 2px solid #3D5A45;
  outline-offset: 2px;
}
```

## 12.3 Keyboard Navigation

- All interactive elements must be keyboard accessible
- Tab order follows visual order
- Skip links provided for main content
- No keyboard traps

## 12.4 Screen Readers

- All images have descriptive alt text
- Icons with meaning have aria-label
- Decorative elements have aria-hidden="true"
- Form inputs have associated labels

---

# 13. Implementation

## 13.1 CSS Variables

```css
:root {
  /* Colors */
  --color-bg-primary: #F5F1E8;
  --color-bg-elevated: #FFFDFB;
  --color-text-primary: #2C2520;
  --color-text-secondary: #5C544A;
  --color-accent: #3D5A45;
  --color-highlight: #C4A265;
  
  /* Typography */
  --font-display: 'Plus Jakarta Sans', sans-serif;
  --font-body: 'Inter', sans-serif;
  
  /* Spacing */
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  
  /* Transitions */
  --transition-fast: 150ms ease-out;
  --transition-normal: 300ms ease-out;
  
  /* Shadows */
  --shadow-card: 0 2px 8px rgba(44, 37, 32, 0.04);
  --shadow-card-hover: 0 12px 32px rgba(44, 37, 32, 0.08);
  
  /* Radius */
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;
}
```

## 13.2 Required Files

```
/brand/
├── FERNI-SCREEN-GUIDELINES.md  ← This document
├── ferni-design-tokens.css     ← CSS variables
├── logos/
│   ├── logo-primary.svg
│   ├── logo-dark-bg.svg
│   ├── logomark.svg
│   └── wordmark.svg
├── icons/
│   └── ... (Lucide icon set)
└── fonts/
    ├── plus-jakarta-sans/
    ├── inter/
    └── sora/
```

## 13.3 Font Loading

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@400;500;600;700&display=swap" rel="stylesheet">
```

---

# Appendix

## A. File Naming Convention

| Type | Pattern | Example |
|------|---------|---------|
| **Logo** | `logo-[variant]-[context].svg` | `logo-primary.svg` |
| **Icon** | `icon-[name].svg` | `icon-phone.svg` |
| **Image** | `[section]-[desc]-[size].jpg` | `hero-meadow-1920.jpg` |
| **Video** | `[type]-[name]-[res].mp4` | `hero-zen-4k.mp4` |

## B. Image Optimization

Use next-gen formats with fallbacks:

```html
<picture>
  <source srcset="image.webp" type="image/webp">
  <source srcset="image.jpg" type="image/jpeg">
  <img src="image.jpg" alt="Description" loading="lazy">
</picture>
```

## C. References & Inspiration

- [Apple Vision Pro](https://www.apple.com/apple-vision-pro/)
- [Google DeepMind](https://deepmind.google/)
- [Google Flow](https://labs.google/flow/about)
- [Lucide Icons](https://lucide.dev/)

---

**© 2024 Ferni. All rights reserved.**

*These guidelines ensure consistent, premium brand expression across all digital touchpoints. For questions or asset requests, contact the design team.*

