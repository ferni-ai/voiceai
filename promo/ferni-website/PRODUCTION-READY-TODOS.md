# Ferni Landing Page: Production-Ready Checklist

## 🔴 CRITICAL (Must Fix Before Launch)

### Visual Bugs
- [ ] **Hero Avatar Missing** - The Ferni orb isn't rendering in hero section
- [ ] **Hero Spacing** - Too much vertical space between emotional hook and tagline
- [ ] **2AM Section** - Verify it renders correctly (dark to light transition)
- [ ] **Team Cards** - Verify sample quotes and traits display properly
- [ ] **Memory Demo** - Timeline dots may be off-center

### Functionality
- [ ] **Audio Button** - Remove or add actual audio file (currently broken)
- [ ] **Mobile Menu** - Test hamburger menu open/close
- [ ] **Cookie Banner** - Test accept/decline functionality
- [ ] **Scroll Animations** - Verify `.reveal` elements animate on scroll
- [ ] **FAQ Accordion** - Test expand/collapse

### Copy/Content
- [ ] **Audit for forbidden words** - therapist, advisor, chatbot, bot, AI assistant
- [ ] **Verify all CTAs work** - Links to app.ferni.ai, tel: links
- [ ] **Footer links** - Ensure all pages exist

---

## 🟡 IMPORTANT (Should Fix)

### Performance
- [ ] **Image Optimization** - Lazy load below-fold images
- [ ] **Font Loading** - Preload critical fonts
- [ ] **CSS Minification** - Remove duplicate rules
- [ ] **JS Defer** - Defer non-critical JavaScript
- [ ] **Lighthouse Score** - Target 90+ on all metrics

### Accessibility
- [ ] **ARIA Labels** - All interactive elements need labels
- [ ] **Focus States** - Visible focus indicators on all buttons/links
- [ ] **Color Contrast** - Verify WCAG AA compliance
- [ ] **Alt Text** - All images need descriptive alt text
- [ ] **Skip Link** - Verify skip-to-content works
- [ ] **Keyboard Navigation** - Tab through entire page

### SEO
- [ ] **Meta Description** - Unique, compelling description
- [ ] **OG Image** - Create proper 1200x630 social share image
- [ ] **Canonical URL** - Add canonical tags
- [ ] **Structured Data** - Verify JSON-LD renders correctly
- [ ] **Sitemap** - Generate and submit sitemap.xml
- [ ] **Robots.txt** - Verify crawling is allowed

### Mobile
- [ ] **Responsive Testing** - Test at 320px, 375px, 414px, 768px, 1024px
- [ ] **Touch Targets** - Min 44x44px for all tappable elements
- [ ] **Horizontal Scroll** - No unexpected horizontal overflow
- [ ] **Fixed Footer CTA** - Verify sticky mobile CTA bar works

---

## 🟢 POLISH (Nice to Have)

### Animations
- [ ] **Entrance Animations** - Staggered reveals feel organic
- [ ] **Button Micro-interactions** - Hover/active states with spring physics
- [ ] **Parallax Effects** - Subtle depth on scroll
- [ ] **Avatar Breathing** - Ferni orb subtle pulse animation

### Visual Refinement
- [ ] **Typography Audit** - Consistent line heights, letter spacing
- [ ] **Shadow System** - Consistent use of design tokens
- [ ] **Border Radius** - Consistent across all components
- [ ] **Color Consistency** - All colors use CSS variables

### Content Enhancement
- [ ] **Real Testimonials** - Replace placeholder quotes
- [ ] **Team Photos/Avatars** - Better visual representation
- [ ] **Video Background** - Optional animated hero background
- [ ] **Sample Conversation Audio** - Record actual Ferni clip

---

## 📋 SPECIFIC BUG FIXES NEEDED

### 1. Hero Avatar Not Showing
**File:** `src/css/story-brand.css`
**Issue:** The `.hero-ferni` element has styles but isn't visible
**Fix:** Check z-index, display property, and positioning

### 2. Hero Section Layout
**File:** `src/index.njk` (lines 79-105)
**Issue:** Emotional hook, avatar, tagline, headline have too much spacing
**Fix:** Reduce margins, consider restructuring HTML order

### 3. Audio Button Without Audio
**File:** `src/index.njk` (lines 117-128)
**Options:**
- Remove the button entirely
- Add placeholder text "Coming soon"
- Record actual audio file

### 4. CSS Duplicates
**File:** `src/css/story-brand.css`
**Issue:** Multiple `.btn` definitions, conflicting styles
**Fix:** Consolidate button styles, remove duplicates

### 5. JavaScript Scroll Reveal
**File:** `src/js/landing-animations.js`
**Issue:** Intersection Observer may not be firing
**Fix:** Verify selectors match actual HTML classes

---

## 🔧 TECHNICAL DEBT

### CSS Cleanup
- [ ] Remove duplicate style blocks
- [ ] Consolidate media queries
- [ ] Remove unused classes
- [ ] Organize by component (BEM structure)

### JavaScript
- [ ] Check for console errors
- [ ] Remove unused functions
- [ ] Add error boundaries
- [ ] Optimize event listeners

### Build Process
- [ ] Minify CSS in production
- [ ] Minify JS in production
- [ ] Generate source maps
- [ ] Cache busting for assets

---

## ✅ VERIFICATION CHECKLIST

### Before Launch
- [ ] Test on Chrome, Safari, Firefox, Edge
- [ ] Test on iOS Safari, Android Chrome
- [ ] Test with slow 3G network
- [ ] Test with JavaScript disabled
- [ ] Run Lighthouse audit (target: 90+)
- [ ] Check Google PageSpeed Insights
- [ ] Verify analytics tracking
- [ ] Test all form submissions
- [ ] Test all external links
- [ ] Verify SSL certificate
- [ ] Check for mixed content warnings

### After Launch
- [ ] Monitor error logs
- [ ] Check Google Search Console
- [ ] Verify Google Analytics data
- [ ] Monitor Core Web Vitals
- [ ] Set up uptime monitoring

---

## 📊 SUCCESS METRICS

| Metric | Target | Current |
|--------|--------|---------|
| Lighthouse Performance | 90+ | ? |
| Lighthouse Accessibility | 90+ | ? |
| Lighthouse Best Practices | 90+ | ? |
| Lighthouse SEO | 90+ | ? |
| First Contentful Paint | < 1.5s | ? |
| Largest Contentful Paint | < 2.5s | ? |
| Time to Interactive | < 3.5s | ? |
| Cumulative Layout Shift | < 0.1 | ? |

---

## 🚀 DEPLOYMENT CHECKLIST

### Pre-Deploy
- [ ] All tests passing
- [ ] No console errors
- [ ] Build completes without warnings
- [ ] Preview on staging URL

### Deploy
- [ ] Run `npm run deploy:landing`
- [ ] Verify Firebase deployment success
- [ ] Check both ferni.ai and ferni-landing.web.app

### Post-Deploy
- [ ] Hard refresh and verify
- [ ] Check mobile version
- [ ] Test critical user flows
- [ ] Monitor for errors

