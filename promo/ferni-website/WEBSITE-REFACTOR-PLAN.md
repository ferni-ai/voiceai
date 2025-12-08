# 🏗️ Ferni Website Refactor Plan

## Executive Summary

**Goal**: Migrate from hardcoded `index.html` (2077 lines) to a proper templated system using the existing Eleventy infrastructure in `src/`.

**Good News**: The foundation already exists! You have:
- ✅ Eleventy configured (`package.json`, `.eleventy.js`)
- ✅ Template structure (`src/_includes/layouts/`, `src/_includes/partials/home/`)
- ✅ Data file (`src/_data/site.json`)
- ✅ Design tokens (`brand/ferni-design-tokens.css`)

**The Problem**: The live `index.html` isn't using any of this—it's hardcoded HTML that has drifted from the templates.

---

## 📊 Current State Analysis

### File Structure
```
promo/ferni-website/
├── index.html              ← PROBLEM: 2077 lines of hardcoded HTML (THIS IS LIVE)
├── css/styles.css          ← PROBLEM: Hardcoded values, not using design tokens
├── js/main.js              ← OK: Works but needs cleanup
├── .eleventy.js            ← OK: Configured correctly
├── package.json            ← OK: Has build scripts
└── src/                    ← EXISTS BUT NOT USED
    ├── _data/site.json     ← OK: Content data (needs sync with live)
    ├── _includes/
    │   ├── layouts/        ← OK: base.njk, home.njk, etc.
    │   └── partials/home/  ← NEEDS UPDATE: 18 partial files
    ├── css/                ← OK: CSS files (need token integration)
    └── index.njk           ← EXISTS: Entry point
```

### Gap Analysis

| Component | Live `index.html` | Template `src/` | Status |
|-----------|-------------------|-----------------|--------|
| Hero Section | Video background + canvas | Canvas only | 🔴 Needs update |
| Hero Text | "Better than human." | Uses `site.json` | 🟢 Already data-driven |
| Nav Logo | Plain "Ferni" text | Uses `site.json` | 🟢 Already data-driven |
| Stats Section | Custom stats bar | Basic template | 🟡 Needs sync |
| Team Section | 6 personas | Template exists | 🟡 Needs sync |
| FAQ Section | Accordion | Template exists | 🟡 Needs sync |
| CSS | ~3000 lines mixed | Separate files | 🔴 Needs token integration |
| JS Animations | GSAP ScrollTrigger | Basic | 🟡 Needs sync |

---

## 🎯 Refactor Phases

### Phase 1: Audit & Sync (Day 1)
**Goal**: Understand exactly what's in the live HTML vs templates

1. **Extract sections from live `index.html`**
   - Document each `<section>` and its purpose
   - Note any classes/IDs used by JS
   - List all inline styles that need extraction

2. **Compare with existing templates**
   - Map live sections to `src/_includes/partials/home/*.njk`
   - Identify missing partials
   - Note structural differences

3. **Update `site.json`**
   - Ensure all content matches live site
   - Add any missing data fields

**Deliverable**: Gap analysis document with exact changes needed per file

---

### Phase 2: CSS Architecture (Days 2-3)
**Goal**: Proper CSS with design tokens

#### 2.1 Create CSS Architecture
```
src/css/
├── _tokens.css           ← Import from brand/ferni-design-tokens.css
├── _base.css             ← Reset, typography, global styles
├── _utilities.css        ← Utility classes (.hidden, .reveal, etc.)
├── _components.css       ← Buttons, cards, forms
├── _sections/
│   ├── _hero.css
│   ├── _nav.css
│   ├── _stats.css
│   ├── _team.css
│   ├── _features.css
│   ├── _testimonials.css
│   ├── _demo.css
│   ├── _faq.css
│   ├── _developers.css
│   ├── _privacy.css
│   ├── _newsletter.css
│   ├── _cta.css
│   ├── _footer.css
│   └── _cookie-banner.css
├── _animations.css       ← GSAP helpers, reveal classes
└── styles.css            ← Main entry (imports all above)
```

#### 2.2 Token Integration Rules
```css
/* ❌ BEFORE: Hardcoded values */
.hero-headline {
  font-size: 4rem;
  color: #2c2520;
  font-family: 'Plus Jakarta Sans', sans-serif;
}

/* ✅ AFTER: Design tokens */
.hero-headline {
  font-size: var(--text-6xl);
  color: var(--color-text-primary);
  font-family: var(--font-display);
}
```

#### 2.3 CSS Variables Mapping
| Hardcoded | Design Token |
|-----------|-------------|
| `#4a6741` | `var(--color-ferni)` |
| `#2c2520` | `var(--color-text-primary)` |
| `#faf8f5` | `var(--color-bg-primary)` |
| `0.3s ease` | `var(--duration-slow) var(--ease-ease-out)` |
| `1rem` | `var(--space-4)` |

**Deliverable**: New CSS architecture with 100% token usage

---

### Phase 3: Template Sync (Days 4-5)
**Goal**: Update all partials to match live site

#### 3.1 Priority Order (by complexity)
1. `nav.njk` - Navigation with mobile menu
2. `hero.njk` - Video background + scroll animation
3. `stats.njk` - Stats bar
4. `ai-company.njk` - AI company section
5. `features.njk` - Feature cards
6. `team.njk` - Team personas grid
7. `demo.njk` - Interactive demo widget
8. `testimonials.njk` - Testimonial slider
9. `faq.njk` - Accordion
10. `developers.njk` - Developer portal section
11. `connect.njk` - Contact methods
12. `privacy.njk` - Privacy banner
13. `newsletter.njk` - Email signup
14. `cta.njk` - Final CTA
15. `footer.njk` - Footer with links
16. `cookie-banner.njk` - Cookie consent
17. `living-avatar-overlay.njk` - Intro animation
18. `hero-avatar.njk` - Corner voice orb

#### 3.2 Template Pattern
```njk
{# src/_includes/partials/home/hero.njk #}

<section class="hero-scroll-container" id="heroScrollContainer">
  {# Video Background #}
  <video 
    id="heroVideo" 
    class="hero-video" 
    autoplay muted loop playsinline
    poster="/images/hero-fallback.jpg"
  >
    <source src="/videos/hero-golden-hour.webm" type="video/webm">
    <source src="/videos/Wide_shot_golden_202512040652.mp4" type="video/mp4">
  </video>

  <div class="hero-content-wrapper" id="heroContentWrapper">
    <div class="hero-content">
      <div class="hero-text">
        <p class="eyebrow reveal">{{ site.hero.eyebrow }}</p>
        <h1 class="headline-xl hero-headline reveal reveal-delay-1">
          {{ site.hero.headline }}<br>
          <span class="text-gradient">{{ site.hero.headlineAccent }}</span>
        </h1>
        <p class="body-lg hero-description reveal reveal-delay-2">
          {{ site.hero.subhead }}<br>
          {{ site.hero.subheadLine2 }}
        </p>
        {# ... rest of hero ... #}
      </div>
    </div>
  </div>
</section>
```

**Deliverable**: All 18 partials updated and tested

---

### Phase 4: JavaScript Cleanup (Day 6)
**Goal**: Clean, modular JS that works with templates

#### 4.1 Current JS Analysis
- `main.js` (618 lines) - Handles:
  - Canvas/video scroll animation
  - Mobile menu toggle
  - FAQ accordion
  - Cookie banner
  - Living avatar overlay
  - Form submissions
  - Analytics

#### 4.2 Modular Architecture
```
src/js/
├── main.js               ← Entry point, initializes modules
├── modules/
│   ├── scroll-animation.js  ← GSAP ScrollTrigger for hero
│   ├── mobile-menu.js       ← Navigation toggle
│   ├── faq-accordion.js     ← FAQ expand/collapse
│   ├── cookie-consent.js    ← Cookie banner logic
│   ├── living-avatar.js     ← Intro overlay
│   ├── form-handlers.js     ← Newsletter, developer signup
│   └── analytics.js         ← Track events
└── utils/
    ├── dom.js               ← querySelector helpers
    └── animations.js        ← Shared animation presets
```

**Deliverable**: Modular JS with clear responsibilities

---

### Phase 5: Build Pipeline (Day 7)
**Goal**: Automated build, minification, deployment

#### 5.1 Update `.eleventy.js`
```javascript
module.exports = function(eleventyConfig) {
  // Copy design tokens from brand directory
  eleventyConfig.addPassthroughCopy({
    '../../../brand/ferni-design-tokens.css': 'css/tokens.css'
  });
  
  // Process CSS
  eleventyConfig.addTransform('postcss', async (content, outputPath) => {
    if (outputPath && outputPath.endsWith('.css')) {
      // Autoprefixer, minification, etc.
    }
    return content;
  });
  
  // ... existing config
};
```

#### 5.2 npm Scripts
```json
{
  "scripts": {
    "dev": "eleventy --serve --port=8080",
    "build": "eleventy",
    "build:prod": "NODE_ENV=production eleventy && npm run minify",
    "minify": "node scripts/minify.js",
    "lint:css": "stylelint 'src/css/**/*.css'",
    "lint:templates": "node scripts/lint-templates.js",
    "sync:tokens": "cp ../../../brand/ferni-design-tokens.css src/css/_tokens.css",
    "deploy": "npm run build:prod && firebase deploy --only hosting:ferni-landing"
  }
}
```

#### 5.3 Add CSS Linting
```javascript
// scripts/lint-css.js
// Check that no hardcoded colors/values are used
// Enforce design token usage
```

**Deliverable**: One-command build and deploy

---

### Phase 6: Testing & QA (Day 8)
**Goal**: Ensure parity with live site

#### 6.1 Visual Regression Testing
- Screenshot compare: live `ferni.ai` vs `localhost:8080`
- Check all breakpoints: 320px, 768px, 1024px, 1440px, 1920px

#### 6.2 Functionality Testing
- [ ] Video background plays and loops
- [ ] Scroll parallax works
- [ ] Mobile menu opens/closes
- [ ] FAQ accordion expands/collapses
- [ ] Cookie banner appears/dismisses
- [ ] Living avatar overlay works
- [ ] All links work
- [ ] Forms submit correctly
- [ ] Analytics events fire

#### 6.3 Performance Testing
- Lighthouse score ≥ 90
- First Contentful Paint < 1.5s
- Largest Contentful Paint < 2.5s

**Deliverable**: QA checklist passed

---

### Phase 7: Deployment & Cutover (Day 9)
**Goal**: Go live with templated version

#### 7.1 Pre-Deploy Checklist
- [ ] All tests pass
- [ ] Lighthouse scores acceptable
- [ ] No console errors
- [ ] Analytics working
- [ ] All images optimized
- [ ] All videos loading

#### 7.2 Deploy Steps
```bash
# 1. Build production version
npm run build:prod

# 2. Preview locally
npm run preview

# 3. Deploy to staging (ferni-prod.web.app)
firebase deploy --only hosting:ferni-prod

# 4. Test staging thoroughly

# 5. Deploy to production (ferni.ai)
firebase deploy --only hosting:ferni-landing
```

#### 7.3 Rollback Plan
- Keep `index.html` backup
- Firebase hosting has version history
- Can revert in < 2 minutes

**Deliverable**: Live site running on templated system

---

## 📋 Task Breakdown

### Immediate Tasks (Today)
- [ ] Create detailed section-by-section audit of `index.html`
- [ ] Update `site.json` with any missing data
- [ ] Test current `npm run dev` to see template state

### This Week
- [ ] Phase 1: Complete audit (1 day)
- [ ] Phase 2: CSS architecture (2 days)
- [ ] Phase 3: Update 18 partials (2 days)
- [ ] Phase 4: JS modularization (1 day)
- [ ] Phase 5: Build pipeline (1 day)

### Next Week
- [ ] Phase 6: Testing (1 day)
- [ ] Phase 7: Deployment (1 day)
- [ ] Documentation updates

---

## 🔧 Technical Decisions

### Why Eleventy (Not React/Next.js)?
- ✅ Already set up and configured
- ✅ Static HTML output (fast, no JS required for content)
- ✅ Nunjucks templates are simple and readable
- ✅ Great for marketing sites
- ✅ Easy to integrate with existing CSS/JS

### Why Not SCSS?
- CSS custom properties (design tokens) provide most SCSS benefits
- Native CSS is simpler to maintain
- No build step for CSS = faster development
- Browser support is excellent now

### CSS Strategy
- Use CSS custom properties from design tokens
- One CSS file per section (easier to maintain)
- Concatenate in build (for production)
- No CSS-in-JS (keeps templates clean)

---

## 📁 Final Directory Structure

```
promo/ferni-website/
├── .eleventy.js
├── package.json
├── firebase.json
├── src/
│   ├── _data/
│   │   ├── site.json         ← All content
│   │   └── navigation.json   ← Nav structure
│   ├── _includes/
│   │   ├── layouts/
│   │   │   ├── base.njk      ← HTML skeleton
│   │   │   ├── home.njk      ← Homepage layout
│   │   │   ├── page.njk      ← Generic page
│   │   │   └── legal.njk     ← Privacy/Terms
│   │   └── partials/
│   │       ├── head.njk      ← <head> content
│   │       ├── header.njk    ← Site header
│   │       ├── footer.njk    ← Site footer
│   │       └── home/         ← 18 homepage sections
│   ├── css/
│   │   ├── _tokens.css       ← Design system tokens
│   │   ├── _base.css         ← Reset, typography
│   │   ├── _components.css   ← Buttons, cards, forms
│   │   ├── _sections/        ← Per-section styles
│   │   └── styles.css        ← Main entry
│   ├── js/
│   │   ├── main.js           ← Entry point
│   │   └── modules/          ← Feature modules
│   ├── images/               ← All images
│   ├── videos/               ← Hero videos
│   ├── index.njk             ← Homepage entry
│   ├── privacy.md            ← Privacy page
│   ├── terms.md              ← Terms page
│   └── ...                   ← Other pages
├── _site/                    ← Build output (gitignored)
└── scripts/                  ← Build/lint scripts
```

---

## 🎯 Success Metrics

1. **Code Quality**
   - Zero hardcoded colors in CSS
   - All content in data files
   - < 100 lines per partial template
   - Lighthouse performance ≥ 90

2. **Developer Experience**
   - `npm run dev` starts in < 5 seconds
   - Hot reload on template changes
   - Clear error messages
   - Easy to add new sections

3. **Maintainability**
   - Change hero text in `site.json`, not HTML
   - Change colors in design tokens, affects entire site
   - Add new page by creating `.njk` file
   - No copy-paste between pages

---

## 🚀 Getting Started

```bash
# 1. Navigate to website directory
cd promo/ferni-website

# 2. Install dependencies (if needed)
npm install

# 3. Start development server
npm run dev

# 4. View current template state
open http://localhost:8080

# 5. Compare with live site
open https://ferni.ai
```

---

## Questions to Answer Before Starting

1. **Do we want to add SCSS/PostCSS, or stick with vanilla CSS + tokens?**
   - Recommendation: Vanilla CSS + tokens (simpler)

2. **Should we modularize JS now, or just sync what works?**
   - Recommendation: Sync first, modularize later

3. **Do we need to support IE11?**
   - Recommendation: No (CSS variables don't work)

4. **What's the timeline?**
   - Recommendation: 1-2 weeks for full migration

---

*Created: December 7, 2025*
*Last Updated: December 7, 2025*

