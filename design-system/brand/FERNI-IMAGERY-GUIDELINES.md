# Ferni Imagery & Animation Guidelines

**Version 1.0 | December 2024**  
**Supplement to:** FERNI-BRAND-GUIDELINES.md, FERNI-SCREEN-GUIDELINES.md

---

## Purpose

This document defines how to use imagery and animations on Ferni digital properties to create Apple-level storytelling and emotional connection.

---

# 1. Image Usage Guidelines

## 1.1 Layout Patterns

### Full-Bleed Imagery
**When to use:** Hero sections, major feature reveals, emotional storytelling moments

```
┌─────────────────────────────────────────────────────────────┐
│                      FULL-BLEED IMAGE                       │
│  ┌────────────────────┐                                     │
│  │  Text overlay      │                                     │
│  │  with gradient     │                                     │
│  │  background        │                                     │
│  └────────────────────┘                                     │
└─────────────────────────────────────────────────────────────┘
```

**CSS Pattern:**
```css
.section-lifestyle {
  position: relative;
  min-height: 80vh;
}

.lifestyle-bg {
  position: absolute;
  inset: 0;
}

.lifestyle-bg img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
```

### Contained Imagery
**When to use:** Team cards, testimonials, product shots, supporting visuals

```
┌─────────────────────────────────────────────────────────────┐
│  Container                                                  │
│  ┌──────────────────────┐  ┌──────────────────────────┐    │
│  │  Text content        │  │  Contained image         │    │
│  │  on left             │  │  (16:9 or 1:1)           │    │
│  └──────────────────────┘  └──────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## 1.2 Text Over Image Overlays

### Light Background (Default)
For images where text needs to be dark:

```css
.lifestyle-overlay {
  background: linear-gradient(
    to right,
    rgba(250, 248, 245, 0.95) 0%,   /* Paper Cream, opaque */
    rgba(250, 248, 245, 0.85) 40%,  /* Semi-transparent */
    rgba(250, 248, 245, 0.4) 100%   /* Allow image to show */
  );
}

/* Mobile: vertical gradient */
@media (max-width: 768px) {
  .lifestyle-overlay {
    background: linear-gradient(
      to bottom,
      rgba(250, 248, 245, 0.95) 0%,
      rgba(250, 248, 245, 0.7) 100%
    );
  }
}
```

### Dark Background
For images where text needs to be light:

```css
.lifestyle-overlay-dark {
  background: linear-gradient(
    to left,
    rgba(44, 37, 32, 0.95) 0%,     /* Natural Ink, opaque */
    rgba(44, 37, 32, 0.7) 50%,
    rgba(44, 37, 32, 0.3) 100%
  );
}
```

### Contrast Requirements
- All text over images MUST meet WCAG 2.1 AA (4.5:1 for body, 3:1 for large text)
- Test overlays with actual images before deployment
- Avoid placing critical text over busy image areas

## 1.3 Image Categories & When to Use

| Category | Files | Use Case | Page Location |
|----------|-------|----------|---------------|
| **Hero** | `hero-zen-garden.jpg`, `hero-meadow.jpg` | Full-viewport backgrounds | Hero section only |
| **Lifestyle** | `lifestyle-*.jpg` | Human connection moments | Feature sections |
| **Stock Lifestyle** | `golden-hour-phone.jpg`, etc. | Supporting imagery | Features, testimonials |
| **Avatars** | `avatar-*.png` | Team member representations | Team section, sidebar |
| **Testimonial BGs** | `testimonial-bg-*.jpg` | Testimonial card backgrounds | Testimonials section |

## 1.4 Responsive Image Treatment

### Desktop (≥1200px)
- Full resolution, landscape orientation
- Text overlay on left or right 40%
- Image visible on opposite side

### Tablet (768px - 1199px)
- Cropped to 16:9 or 4:3
- Text overlay covers more area (60%)
- Consider art-directed crops

### Mobile (<768px)
- Square or portrait crops
- Text stacked above/below image OR
- Full gradient overlay with centered text

### Implementation
```html
<picture>
  <source media="(max-width: 768px)" srcset="image-mobile.jpg">
  <source media="(max-width: 1199px)" srcset="image-tablet.jpg">
  <img src="image-desktop.jpg" alt="Descriptive text" loading="lazy">
</picture>
```

---

# 2. Animation Standards

## 2.1 Scroll Reveal Animations

### Basic Reveal
Elements fade up as they enter viewport:

```css
.reveal {
  opacity: 0;
  transform: translateY(40px);
  transition: 
    opacity 700ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 700ms cubic-bezier(0.16, 1, 0.3, 1);
}

.reveal.visible {
  opacity: 1;
  transform: translateY(0);
}
```

### Staggered Reveals
For groups of related elements (cards, list items):

```css
.reveal-delay-1 { transition-delay: 100ms; }
.reveal-delay-2 { transition-delay: 200ms; }
.reveal-delay-3 { transition-delay: 300ms; }
.reveal-delay-4 { transition-delay: 400ms; }
.reveal-delay-5 { transition-delay: 500ms; }
/* Maximum total stagger: 500ms */
```

### Directional Reveals

```css
/* From left */
.reveal-left {
  opacity: 0;
  transform: translateX(-40px);
}

/* From right */
.reveal-right {
  opacity: 0;
  transform: translateX(40px);
}

/* Scale up */
.reveal-scale {
  opacity: 0;
  transform: scale(0.95);
}
```

## 2.2 GSAP Implementation

### Required Setup
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js"></script>
```

### Basic Scroll Reveal
```javascript
gsap.registerPlugin(ScrollTrigger);

document.querySelectorAll('.reveal').forEach(el => {
  gsap.fromTo(el, 
    { opacity: 0, y: 40 },
    {
      opacity: 1,
      y: 0,
      duration: 0.8,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: el,
        start: 'top 85%',
        toggleActions: 'play none none none'
      }
    }
  );
});
```

### Hero Parallax
```javascript
gsap.to('.hero-content', {
  y: 100,
  opacity: 0,
  scrollTrigger: {
    trigger: '.hero',
    start: 'top top',
    end: '50% top',
    scrub: true
  }
});
```

### Section Content Reveal
```javascript
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

## 2.3 Timing Guidelines

| Animation Type | Duration | Easing |
|----------------|----------|--------|
| Scroll reveal | 700-800ms | `power3.out` / `ease-out` |
| Hero parallax | Scrubbed | linear |
| Card hover | 300ms | `ease-out-back` |
| Button press | 100ms | `ease-out` |
| FAQ accordion | 400ms | `ease-out` |
| Nav scroll | 300ms | `ease-out` |

## 2.4 Reduced Motion

**ALWAYS** respect user preferences:

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

```javascript
// Check before running animations
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  // Run animations
}
```

---

# 3. Page Narrative Structure

## 3.1 Emotional Arc

Every landing page should follow this narrative:

```
1. HOOK (Hero)
   └─→ Promise the outcome: "Finally, someone who actually listens."
   └─→ Full-viewport, immersive, single message
   
2. RELATE (Value Proposition)
   └─→ Show you understand their pain
   └─→ Use lifestyle imagery of real moments
   └─→ "The 2am worry, the commute contemplation..."

3. DIFFERENTIATE (Features)
   └─→ Demonstrate what makes Ferni unique
   └─→ "They Remember" - show the memory feature
   └─→ "Voice-First" - show human using voice

4. PROVE (Team & Testimonials)
   └─→ Introduce the AI team with personality
   └─→ Real testimonials from real users
   └─→ Social proof numbers if available

5. ENABLE (Pricing)
   └─→ Clear, simple pricing
   └─→ Free tier prominent
   └─→ Value proposition for each tier

6. CONVERT (Final CTA)
   └─→ Clear, single action
   └─→ Reinforce the promise
   └─→ Remove friction
```

## 3.2 Section Transitions

**Between Major Sections:**
- Background color changes create natural breaks
- Alternating: Light → Dark → Light → Accent
- 120px+ padding creates breathing room

**Within Sections:**
- Content reveals as user scrolls
- Staggered animations draw attention
- Images anchor the emotional moment

## 3.3 Visual Hierarchy

```
HERO
├── Eyebrow (small, muted)
├── Headline (HUGE, commanding)
├── Tagline (medium, supportive)
└── CTAs (prominent, clear)

FEATURE SECTION
├── Eyebrow (topic label)
├── Headline (clear benefit)
├── Body (supporting detail)
├── Image (emotional anchor)
└── Link (path forward)
```

---

# 4. Asset Checklist

Before launching a page, verify:

## Images
- [ ] All images have descriptive alt text
- [ ] All images use lazy loading (`loading="lazy"`)
- [ ] Hero images have fallback (`poster` for video)
- [ ] Images are optimized (WebP with JPG fallback)
- [ ] Responsive images use `<picture>` or `srcset`

## Animations
- [ ] Respects `prefers-reduced-motion`
- [ ] No animations >1000ms
- [ ] Stagger delays don't exceed 500ms total
- [ ] GSAP includes fallback for no-JS

## Overlays
- [ ] All text meets WCAG AA contrast
- [ ] Overlays work on actual images (not just placeholders)
- [ ] Mobile overlays adapt gradient direction

## Performance
- [ ] Images are sized appropriately (not scaled down in CSS)
- [ ] Hero image/video <500KB
- [ ] Total page weight <3MB
- [ ] LCP <2.5s on mobile

---

**© 2024 Ferni. All rights reserved.**

*These guidelines supplement the main brand guidelines. For questions, contact the design team.*

