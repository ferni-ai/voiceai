# Go-to-Market Brand Integration Plan

> **Mission**: Apply the Ferni Brand Library's design system to every touchpoint of our go-to-market strategy.

---

## Current State Assessment

### What We Have

| Asset | Location | Status |
|-------|----------|--------|
| **Design System v2.0** | `brand/master-tokens.css` | Production-ready |
| **Component Library** | `brand/brand-components.css` | Production-ready |
| **6 Persona Avatars** | `brand/characters/*/` | Complete with expressions |
| **100+ Capabilities** | `brand/capabilities/` | Documented and visualized |
| **10 Blog Posts** | `apps/marketing/copy/blog-posts/` | Written, need styling |
| **Storytelling Strategy** | `apps/marketing/STORYTELLING-STRATEGY.md` | Defined |
| **App Store Copy** | `apps/marketing/copy/` | Written |
| **Social Content** | `apps/marketing/content/social/` | Partially adapted |

### The Gap

The brand library and marketing content exist in **separate silos**:
- Marketing pages don't use design tokens
- Social assets use arbitrary colors (not brand palette)
- App store screenshots don't exist
- Blog posts lack visual identity
- No unified landing page experience

---

## Integration Strategy

### Phase 1: Marketing Website (Week 1)
**Build: `apps/marketing/site/index.html`**

Create a marketing landing page that showcases Ferni using the brand library.

**Key Pages**:
1. **Homepage** - Hero with Ferni avatar, value prop, team reveal
2. **Capabilities** - Showcase the 100+ things Ferni can do
3. **Meet the Team** - The 6 personas with personalities
4. **Stories** - Real user stories ("2am Hour")
5. **Pricing** - Subscription tiers (when ready)
6. **Blog** - Styled blog posts

**Technical Setup**:
```html
<!-- Use brand library directly -->
<link rel="stylesheet" href="../../../brand/master-tokens.css">
<link rel="stylesheet" href="../../../brand/brand-components.css">
```

**Design Elements to Leverage**:
- `.btn-primary`, `.btn-secondary` for CTAs
- `.card`, `.card-interactive` for features
- `.badge-ferni`, `.badge-maya`, etc. for personas
- Hero with breathing avatar animation
- Dark/Light theme toggle
- Scroll reveal animations

---

### Phase 2: Social Media Branded Templates (Week 1-2)

**Create Template System**: `brand/marketing/templates/`

| Template | Sizes | Use Case |
|----------|-------|----------|
| **Quote Card** | 1080x1080, 1200x630 | Blog quotes, testimonials |
| **Feature Card** | 1080x1080 | Single capability highlight |
| **Team Card** | 1080x1080 | Persona introductions |
| **Story Card** | 1080x1920 | Instagram/TikTok stories |
| **Banner** | 1500x500 (Twitter), 1584x396 (LinkedIn) | Profile headers |
| **Thumbnail** | 1280x720 | YouTube/Blog thumbnails |

**Brand Elements to Include**:
- Warm White background: `#FAF8F5`
- Natural Ink text: `#2C2520`
- Accent (CTAs): `#3D5A45`
- Plus Jakarta Sans (display) + Inter (body)
- LUXO-style avatars (opaque white eyes)
- Breathing glow effect on avatars

**Color Usage**:
```css
/* Always use design tokens, never hardcode */
--color-ferni: #4A6741;
--color-maya: #A67A6A;
--color-peter: #3A6B73;
--color-jordan: #C4856A;
--color-alex: #5A6B8A;
--color-nayan: #B8956A;
```

---

### Phase 3: App Store Presence (Week 2)

**Screenshots** (`apps/marketing/screenshots/`):

| Screen | Content | Design Notes |
|--------|---------|--------------|
| 1 | Hero - "Your team of 6 AI specialists" | All 6 avatars, breathing animation frame |
| 2 | Conversation with Ferni | Night mode, 2am conversation |
| 3 | Meet Maya - Habit Coaching | Maya avatar, habit streak UI |
| 4 | Meet Peter - Research & Data | Peter avatar, research insights |
| 5 | Team handoff - Alex to Jordan | Seamless specialist transition |
| 6 | Always available - "3am. Still here." | Warm glow, contemplative mood |

**Device Sizes** (Priority Order):
1. iPhone 6.7" (Pro Max) - Required
2. iPhone 6.5" (Plus) - Required
3. iPad Pro 12.9" - Recommended
4. Android Phone - Required for Play Store
5. Mac - For Mac App Store

**Visual Style**:
- Use `--color-bg-primary` (#FAF8F5) for light backgrounds
- Use `--color-bg-primary` (dark: #141311) for night mode screens
- Persona colors for avatar glows
- Typography: Plus Jakarta Sans headlines, Inter body

**Feature Graphic** (1024x500 for Play Store):
- Ferni avatar center with subtle glow
- "Your team of 6 AI specialists" headline
- 6 smaller persona avatars in arc below

---

### Phase 4: Blog Visual Identity (Week 2-3)

**Blog Template**: Use brand library components

```html
<article class="blog-post container container-md">
  <header class="blog-header">
    <span class="badge badge-ferni">Behind the Build</span>
    <h1 class="display-2">Why We Let AI Help Build Ferni</h1>
    <p class="body-lg">The honest story of building with your own product...</p>
  </header>

  <div class="blog-content body-md">
    <!-- Content -->
  </div>
</article>
```

**Author Cards** (for "Letters from the Team"):
```html
<div class="author-card" style="--card-color: var(--color-maya);">
  <img src="maya-avatar.svg" class="author-avatar">
  <div>
    <h4 class="heading-4">Maya</h4>
    <p class="caption">Habits Coach</p>
  </div>
</div>
```

**Pull Quote Styling**:
```css
.blog-quote {
  border-left: 4px solid var(--color-accent);
  padding-left: var(--space-6);
  font-style: italic;
  font-size: var(--text-lg);
  color: var(--color-text-secondary);
}
```

---

### Phase 5: Video & Animation Assets (Week 3)

**App Preview Video** (30 seconds):
- Opening: Ferni avatar breathing, glow animation
- Scene 1: Late night conversation (dark mode)
- Scene 2: Team handoff animation (Ferni → Maya)
- Scene 3: Quick capability montage
- Closing: "Your team. Always here." + 6 avatars

**Animation Assets Needed**:
- Ferni avatar breathing loop (MP4/GIF)
- Team avatar entrance (staggered reveal)
- Handoff transition (Ferni → each persona)
- Micro-expressions (happy, curious, warm, concerned)

**Export from Brand Library**:
```bash
# Expressions are already in brand/characters/*/expressions.html
# Can be screen-recorded or exported to Lottie
```

---

### Phase 6: Launch Campaign Assets (Week 3-4)

**Press Kit** (`apps/marketing/graphics/press-kit/`):

| Asset | Specs | Notes |
|-------|-------|-------|
| Logo (light bg) | SVG + PNG (512, 1024, 2048) | Ferni avatar with glow |
| Logo (dark bg) | SVG + PNG | Adjusted for dark backgrounds |
| Wordmark | SVG | "Ferni" in Plus Jakarta Sans |
| All 6 avatars | SVG + PNG (256, 512) | Individual + group |
| Color palette | PNG | Brand colors with hex codes |
| Typography | PDF | Font specimens |

**Email Marketing**:
- Header: Ferni avatar on warm white background
- Footer: 6 persona mini-avatars
- CTA buttons: Use `--color-accent` (#3D5A45)
- Font: System fonts (fallback to Inter)

**OG/Social Meta Images**:
- Default OG: 1200x630, Ferni + tagline
- Blog OG: 1200x630, article title + author avatar
- Twitter Card: 1200x600, similar to OG

---

## Implementation Checklist

### Immediate (This Week)

- [ ] **Create marketing site structure**
  ```
  apps/marketing/site/
  ├── index.html          # Landing page
  ├── capabilities.html   # What Ferni can do
  ├── team.html           # Meet the 6 personas
  ├── stories.html        # User testimonials
  └── css/
      └── site.css        # Page-specific styles
  ```

- [ ] **Link brand library CSS**
  ```html
  <link rel="stylesheet" href="../../../brand/master-tokens.css">
  <link rel="stylesheet" href="../../../brand/brand-components.css">
  ```

- [ ] **Create landing page hero** with:
  - Breathing Ferni avatar (from brand library)
  - "Better than human. Always available."
  - Primary CTA: "Get Started" (`btn-primary btn-lg`)
  - Secondary CTA: "Meet the Team" (`btn-secondary btn-lg`)

- [ ] **Export persona avatars** for social templates
  - SVG from `brand/characters/*/expressions.html`
  - PNG renders at 512x512

### This Week

- [ ] Build capabilities showcase page
- [ ] Build team introduction page
- [ ] Create 3 social media templates (quote, feature, team card)
- [ ] Generate first app store screenshot

### Next Week

- [ ] Complete all app store screenshots
- [ ] Create feature graphic for Play Store
- [ ] Style first 3 blog posts
- [ ] Export OG/meta images

### This Month

- [ ] Full marketing site live
- [ ] All 10 blog posts styled
- [ ] Video assets created
- [ ] Press kit complete
- [ ] Social templates in use

---

## Design Token Quick Reference

### Colors (Most Used)

```css
/* Backgrounds */
--color-bg-primary: #FAF8F5;     /* Main background */
--color-bg-secondary: #F5F2ED;   /* Section backgrounds */
--color-bg-elevated: #FFFFFF;    /* Cards, modals */

/* Text */
--color-text-primary: #1D1B18;   /* Headlines */
--color-text-secondary: #4A4641; /* Body text */
--color-text-muted: #8A847C;     /* Captions */

/* Brand */
--color-accent: #3D5A45;         /* CTAs, links */
--color-ferni: #4A6741;          /* Ferni avatar */

/* Personas */
--color-maya: #A67A6A;
--color-peter: #3A6B73;
--color-jordan: #C4856A;
--color-alex: #5A6B8A;
--color-nayan: #B8956A;
```

### Typography

```css
/* Fonts */
--font-display: 'Plus Jakarta Sans';  /* Headlines */
--font-body: 'Inter';                  /* Body text */

/* Common Sizes */
--text-xs: 0.75rem;   /* 12px - captions */
--text-sm: 0.875rem;  /* 14px - small text */
--text-base: 1rem;    /* 16px - body */
--text-lg: 1.25rem;   /* 20px - large body */
--text-xl: 1.5rem;    /* 24px - subheadings */
--text-2xl: 2rem;     /* 32px - headings */
--text-4xl: 3rem;     /* 48px - display */
```

### Components

```html
<!-- Primary Button -->
<a href="#" class="btn btn-primary btn-lg">Get Started</a>

<!-- Card -->
<div class="card card-interactive">
  <h3 class="card-title">Feature Name</h3>
  <p class="card-description">Description text...</p>
</div>

<!-- Badge -->
<span class="badge badge-ferni">Ferni</span>
<span class="badge badge-maya">Maya</span>
```

---

## Success Metrics

### Brand Consistency
- [ ] All marketing assets use design tokens (no hardcoded colors)
- [ ] Typography follows hierarchy (Plus Jakarta Sans / Inter)
- [ ] Persona colors are consistent across all touchpoints
- [ ] LUXO-style avatars used everywhere (opaque white eyes, no pupils)

### Visual Quality
- [ ] Assets meet platform specs (app stores, social media)
- [ ] Dark mode versions where applicable
- [ ] Responsive design for all screen sizes
- [ ] Accessibility: 4.5:1 contrast ratios, focus states

### Launch Readiness
- [ ] App store presence complete
- [ ] Social media templates operational
- [ ] Marketing site live
- [ ] Press kit downloadable

---

*Last updated: December 2024*
*Owner: Marketing + Design*
