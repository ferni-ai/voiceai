# 🚀 Ferni Landing Page Brand Alignment Plan

## Executive Summary

**Goal**: Complete the brand-aligned landing page (`story-brand.njk`) and deploy it as the primary ferni.ai homepage.

**Current Status**:
| Page | Theme | Brand Compliant | Status |
|------|-------|-----------------|--------|
| `ferni-landing-page.html` | Dark purple (#8b5cf6) | ❌ NOT compliant | **DELETE** |
| `story-brand.njk` | Paper Cream (#F5F1E8) | ✅ Compliant | **THE NEW HOMEPAGE** |

**Timeline**: 5-7 days across 6 phases

---

## 📊 Story-Brand Page Audit

### What's Already Complete ✅

| Section | Status | Brand Compliance |
|---------|--------|------------------|
| Navigation | ✅ Complete | ✅ Ferni green, Plus Jakarta Sans |
| Hero | ✅ Complete | ✅ Paper Cream bg, "Better than human." |
| Stats Bar | ✅ Complete | ✅ Ferni green stats |
| Product Showcase | ✅ Complete | ✅ Phone mockup with chat |
| Promise Quote | ✅ Complete | ✅ Warm philosophy |
| Use Cases (6) | ✅ Complete | ✅ Earthy icons, warm copy |
| Team Section | ✅ Complete | ✅ All 6 personas with colors |
| How It Works | ✅ Complete | ✅ 3 steps: Call/Text/Web |
| Features (6) | ✅ Complete | ✅ Voice-first, Memory, etc. |
| Comparison | ✅ Complete | ✅ "Other AI" vs "Ferni" |
| Testimonials | ✅ Complete | ✅ 4 testimonials from data |
| FAQ (7) | ✅ Complete | ✅ Accordion with key questions |
| Pricing | ✅ Complete | ✅ Free/Friend/Partner tiers |
| Final CTA | ✅ Complete | ✅ "Ready to feel heard?" |
| Footer | ✅ Complete | ✅ Links, social, legal |
| Mobile CTA | ✅ Complete | ✅ Sticky bottom bar |
| Scroll Animations | ✅ Complete | ✅ Reveal, stagger effects |

### What Needs Enhancement 🔧

| Feature | Current State | Target State | Priority |
|---------|--------------|--------------|----------|
| Hero Background | Plain gradient | Subtle video/particles | P1 |
| OG Meta Tags | Basic | Full social cards | P1 |
| Favicon | Missing logo.svg | Proper favicon set | P1 |
| Analytics | Not integrated | GA4 + events | P1 |
| Form Handling | No JS | Working newsletter/CTA | P2 |
| Live Demo Widget | Not present | Interactive chat demo | P2 |
| Press Logos | Not present | "As seen in" section | P3 |
| Security Badges | Not present | SOC2/Privacy icons | P3 |
| Cookie Banner | Not present | GDPR compliant | P2 |

---

## 🎯 Phase 1: Content & Meta Completion (Day 1)

### 1.1 Meta Tags & SEO

```njk
{# Add to story-brand.njk layout #}

{# Open Graph #}
<meta property="og:title" content="{{ title }}">
<meta property="og:description" content="{{ description }}">
<meta property="og:image" content="https://ferni.ai/images/og-image.jpg">
<meta property="og:url" content="https://ferni.ai/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Ferni">

{# Twitter Card #}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@ferniAI">
<meta name="twitter:title" content="{{ title }}">
<meta name="twitter:description" content="{{ description }}">
<meta name="twitter:image" content="https://ferni.ai/images/og-image.jpg">

{# Favicon Set #}
<link rel="icon" href="/images/favicon.png" type="image/png">
<link rel="icon" href="/images/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/images/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
```

### 1.2 Update site.json Data

```json
{
  "hero": {
    "eyebrow": "Your AI Life Coach",
    "headline": "Better than",
    "headlineAccent": "human.",
    "subhead": "Six AI specialists who actually listen, remember everything, and help you grow. Available 24/7."
  }
}
```

### 1.3 Analytics Integration

```html
<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-2JXL8SQPF2"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-2JXL8SQPF2');
</script>
```

### Deliverables
- [ ] Full meta tags in layout
- [ ] Favicon files in place
- [ ] Analytics snippet added
- [ ] site.json verified complete

---

## 🎨 Phase 2: Hero Enhancement (Days 2-3)

### 2.1 Subtle Animated Background

Option A: **CSS Gradient Animation** (lightweight)
```css
.hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: 
    radial-gradient(ellipse 80% 50% at 50% -20%, rgba(74, 103, 65, 0.08) 0%, transparent 50%),
    radial-gradient(ellipse 60% 40% at 80% 80%, rgba(74, 103, 65, 0.05) 0%, transparent 50%);
  animation: heroGlow 8s ease-in-out infinite alternate;
}

@keyframes heroGlow {
  from { opacity: 0.6; transform: scale(1); }
  to { opacity: 1; transform: scale(1.05); }
}
```

Option B: **Video Background** (premium feel)
```njk
<section class="hero">
  <video class="hero__video" autoplay muted loop playsinline poster="/images/hero-fallback.jpg">
    <source src="/videos/hero-golden-hour.webm" type="video/webm">
  </video>
  <div class="hero__overlay"></div>
  <div class="hero__content">...</div>
</section>
```

### 2.2 Living Avatar Integration

Add the animated Ferni orb to hero:
```njk
<div class="hero__avatar">
  <div class="persona-avatar persona-avatar--lg persona-avatar--ferni">
    <div class="persona-avatar__ring"></div>
    <div class="persona-avatar__orb">
      <span class="persona-avatar__text">FN</span>
    </div>
  </div>
</div>
```

### 2.3 Trust Indicators Enhancement

```njk
<div class="hero__trust">
  <div class="trust-badge">
    <svg><!-- shield icon --></svg>
    <span>SOC 2 Type II</span>
  </div>
  <div class="trust-badge">
    <svg><!-- lock icon --></svg>
    <span>End-to-End Encrypted</span>
  </div>
  <div class="trust-badge">
    <svg><!-- star icon --></svg>
    <span>4.9★ Rating</span>
  </div>
</div>
```

### Deliverables
- [ ] Animated hero background (CSS or video)
- [ ] Living avatar in hero
- [ ] Trust badges row
- [ ] Hero tested on all breakpoints

---

## 🛠 Phase 3: Missing Sections (Days 3-4)

### 3.1 "As Seen In" Press Section

```njk
<section class="section press-logos">
  <div class="container">
    <p class="press-logos__label">Trusted by</p>
    <div class="press-logos__grid">
      <img src="/images/logos/techcrunch.svg" alt="TechCrunch">
      <img src="/images/logos/wired.svg" alt="Wired">
      <img src="/images/logos/forbes.svg" alt="Forbes">
    </div>
  </div>
</section>
```

### 3.2 Live Demo Widget

Interactive mini-chat in showcase section:
```njk
<div class="demo-widget">
  <div class="demo-widget__header">
    <div class="persona-avatar persona-avatar--sm persona-avatar--ferni">
      <span class="persona-avatar__text">FN</span>
    </div>
    <span>Try talking to Ferni</span>
  </div>
  <div class="demo-widget__messages">
    <div class="demo-message demo-message--ai">Hi! I'm Ferni. What's on your mind today?</div>
  </div>
  <div class="demo-widget__input">
    <input type="text" placeholder="Type a message...">
    <button class="demo-widget__mic">🎤</button>
  </div>
</div>
```

### 3.3 Security & Privacy Section

```njk
<section class="section security">
  <div class="container">
    <div class="section__header">
      <p class="section__eyebrow">Your Privacy</p>
      <h2 class="section__title">Your conversations stay yours</h2>
    </div>
    
    <div class="security-grid">
      <div class="security-card">
        <svg><!-- shield --></svg>
        <h3>End-to-End Encrypted</h3>
        <p>Your conversations are encrypted in transit and at rest.</p>
      </div>
      <div class="security-card">
        <svg><!-- database --></svg>
        <h3>You Own Your Data</h3>
        <p>Export or delete your data anytime. No lock-in.</p>
      </div>
      <div class="security-card">
        <svg><!-- no-selling --></svg>
        <h3>We Never Sell Data</h3>
        <p>Your information is never shared with advertisers.</p>
      </div>
    </div>
  </div>
</section>
```

### 3.4 Cookie Consent Banner

```njk
<div class="cookie-banner" id="cookieBanner">
  <p>We use cookies to improve your experience. <a href="/cookies/">Learn more</a></p>
  <div class="cookie-banner__actions">
    <button class="btn btn--secondary btn--sm" onclick="declineCookies()">Decline</button>
    <button class="btn btn--primary btn--sm" onclick="acceptCookies()">Accept</button>
  </div>
</div>
```

### Deliverables
- [ ] Press logos section (placeholder or real)
- [ ] Demo widget (static or interactive)
- [ ] Security section
- [ ] Cookie banner with JS

---

## 📱 Phase 4: Mobile & Accessibility (Day 5)

### 4.1 Mobile Menu

```njk
<button class="nav__hamburger" id="mobileMenuToggle" aria-label="Open menu">
  <span></span>
  <span></span>
  <span></span>
</button>

<div class="mobile-menu" id="mobileMenu">
  <div class="mobile-menu__header">
    <span class="nav__logo-text">Ferni</span>
    <button class="mobile-menu__close" aria-label="Close menu">×</button>
  </div>
  <nav class="mobile-menu__nav">
    <a href="#how-it-works">How It Works</a>
    <a href="#team">Team</a>
    <a href="#pricing">Pricing</a>
    <a href="#faq">FAQ</a>
  </nav>
  <a href="https://app.ferni.ai" class="btn btn--primary">Get Started</a>
</div>
```

### 4.2 Responsive Breakpoints

```css
/* Mobile First */
@media (max-width: 639px) {
  .hero__headline { font-size: 42px; }
  .pricing-grid { grid-template-columns: 1fr; }
  .team-grid { grid-template-columns: 1fr; }
}

@media (min-width: 640px) and (max-width: 767px) {
  .hero__headline { font-size: 56px; }
  .team-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (min-width: 768px) and (max-width: 1023px) {
  .hero__headline { font-size: 72px; }
  .pricing-grid { grid-template-columns: repeat(3, 1fr); }
}
```

### 4.3 Accessibility Checklist

- [ ] All images have alt text
- [ ] Color contrast WCAG AA (4.5:1 text, 3:1 UI)
- [ ] Focus states visible
- [ ] Skip to content link
- [ ] Keyboard navigation works
- [ ] ARIA labels on interactive elements
- [ ] Reduced motion media query

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Deliverables
- [ ] Mobile hamburger menu working
- [ ] All breakpoints tested (320, 375, 768, 1024, 1440px)
- [ ] Accessibility audit passed
- [ ] Focus states styled

---

## ⚡ Phase 5: Performance Optimization (Day 6)

### 5.1 Image Optimization

```bash
# Optimize all images
npm run marketing:optimize:images

# Expected output sizes:
# - hero-fallback.jpg: < 100KB (lazy loaded)
# - og-image.jpg: < 200KB
# - avatars/*.png: < 50KB each
```

### 5.2 Critical CSS

```html
<head>
  <!-- Critical CSS inline -->
  <style>
    /* Nav, Hero above-fold styles */
    .nav { ... }
    .hero { ... }
  </style>
  
  <!-- Full CSS async -->
  <link rel="preload" href="/css/story-brand.css" as="style" onload="this.rel='stylesheet'">
</head>
```

### 5.3 Lazy Loading

```html
<!-- Below-fold images -->
<img loading="lazy" src="/images/testimonial-1.jpg" alt="...">

<!-- Video poster + lazy -->
<video poster="/images/hero-poster.jpg" preload="none">
```

### 5.4 Performance Targets

| Metric | Target | Tool |
|--------|--------|------|
| Lighthouse Performance | ≥ 90 | Chrome DevTools |
| First Contentful Paint | < 1.5s | PageSpeed Insights |
| Largest Contentful Paint | < 2.5s | PageSpeed Insights |
| Cumulative Layout Shift | < 0.1 | PageSpeed Insights |
| Total Page Weight | < 1MB | DevTools Network |

### Deliverables
- [ ] All images optimized
- [ ] Critical CSS extracted
- [ ] Lazy loading implemented
- [ ] Lighthouse score ≥ 90

---

## 🚀 Phase 6: Deploy & Launch (Day 7)

### 6.1 Pre-Deploy Checklist

**Content**
- [ ] All copy proofread
- [ ] Phone number correct: 1 (484) 481-3081
- [ ] App URL correct: https://app.ferni.ai
- [ ] All links working
- [ ] Copyright year: 2024 → 2025

**Technical**
- [ ] No console errors
- [ ] All forms submit correctly
- [ ] Analytics events firing
- [ ] Cookie banner works
- [ ] Mobile menu works

**Brand Compliance**
- [ ] No purple colors anywhere
- [ ] Ferni green (#4a6741) as primary accent
- [ ] Paper Cream (#F5F1E8) background
- [ ] Plus Jakarta Sans / Inter fonts
- [ ] All Lucide icons (no emoji)

### 6.2 Deploy Commands

```bash
# 1. Build production version
cd promo/ferni-website
npm run build:prod

# 2. Preview locally
npm run preview
# Open http://localhost:8080/story-brand/

# 3. Deploy to staging
firebase deploy --only hosting:ferni-prod
# Test at: https://ferni-prod.web.app/story-brand/

# 4. Make story-brand the homepage
# Update src/index.njk to use story-brand layout
# OR redirect / to /story-brand/

# 5. Deploy to production
npm run deploy
# Live at: https://ferni.ai
```

### 6.3 Post-Launch

- [ ] Test on real mobile devices (iPhone, Android)
- [ ] Check OG image renders on Twitter/LinkedIn
- [ ] Monitor analytics for first 24 hours
- [ ] Set up uptime monitoring (Pingdom/UptimeRobot)
- [ ] Delete old ferni-landing-page.html

### 6.4 Rollback Plan

```bash
# If issues found, revert to previous index
git checkout HEAD~1 -- src/index.njk
npm run build:prod
npm run deploy

# Firebase also keeps version history
# Can rollback from Firebase Console
```

---

## 📋 Complete Task Breakdown

### Immediate (Today)
- [x] Audit story-brand page completeness
- [ ] Review brand guidelines one more time
- [ ] Start Phase 1 meta tags

### This Week
- [ ] Phase 1: Meta & Analytics (1 day)
- [ ] Phase 2: Hero enhancement (1-2 days)
- [ ] Phase 3: Missing sections (1-2 days)
- [ ] Phase 4: Mobile & A11y (1 day)
- [ ] Phase 5: Performance (1 day)
- [ ] Phase 6: Deploy (1 day)

### Post-Launch
- [ ] A/B test different hero headlines
- [ ] Add more testimonials as they come in
- [ ] Implement interactive demo widget
- [ ] Set up conversion tracking

---

## 🎨 Brand Quick Reference

### Colors
| Name | Hex | Use |
|------|-----|-----|
| Paper Cream | #F5F1E8 | Primary background |
| Natural Ink | #2C2520 | Primary text |
| Ferni Green | #4a6741 | Primary accent/CTA |
| Forest Green | #3D5A45 | Secondary accent |
| Text Secondary | #5C544A | Body text |

### Typography
| Element | Font | Weight | Size |
|---------|------|--------|------|
| Display | Plus Jakarta Sans | 800 | 96px |
| Headline | Plus Jakarta Sans | 700 | 48px |
| Body | Inter | 400 | 17px |
| Button | Plus Jakarta Sans | 600 | 17px |

### Never Use
- ❌ Purple (#8b5cf6)
- ❌ Dark backgrounds (#08080c)
- ❌ Neon colors
- ❌ Cool grays
- ❌ Emojis as icons

---

## 🔗 Related Files

- **Source**: `src/story-brand.njk`
- **Layout**: `src/_includes/layouts/story-brand.njk`
- **Styles**: `src/css/story-brand.css`
- **Data**: `src/_data/site.json`
- **Brand**: `brand/FERNI-BRAND-GUIDELINES.md`
- **Design Tokens**: `css/design-tokens.css`

---

*Created: December 8, 2025*
*Owner: Ferni Engineering*

