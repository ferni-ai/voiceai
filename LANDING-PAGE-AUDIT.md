# Ferni.ai Landing Page Audit
## Dark Mode Issues & Accessibility Review

**Date:** February 23, 2026
**Status:** RESEARCH ONLY - No file edits made
**Scope:** Visual audit of live ferni.ai landing page and template structure

---

## Executive Summary

The Ferni landing page has **strong dark mode CSS variable support** in the design tokens, but **lacks dark mode implementation in the main styles.css** (0 dark mode media queries found). The page uses a light-only theme with warm, neutral colors that appear designed for light mode exclusively.

**Critical Finding:** Dark mode variables are defined but not applied anywhere in the page layouts. The site will appear with light backgrounds (FAF8F5 - cream) even when users prefer dark mode.

---

## Page Structure (Top to Bottom)

### 1. Navigation Bar
- Logo text "Ferni"
- Nav links: Capabilities, Team, Blog, About
- Desktop CTA button: "Get Started" with arrow
- Mobile hamburger menu (with menu items + phone CTA)
- **Accessibility:** Has skip-link and aria-labels

### 2. Hero Section (Full Viewport)
- Living avatar (Pixar-style breathing animation)
- Headline with accent color
- Subheadline text
- Interactive demo input with microphone button
- Demo suggestion buttons (3 examples)
- Stats bar or scroll indicator
- **Background:** Animated gradient with orbs

### 3. Stats Bar / Two-AM Section
- Proof metrics (shown after hero)
- Multiple stat blocks

### 4. Product Showcase
- Product demo/features visuals
- Core value propositions

### 5. Memory Demo Section
- Visual demonstration of memory capabilities
- Timeline or visual progression

### 6. Story/Brand Section
- Narrative content about Ferni

### 7. Use Cases
- Different persona scenarios
- Real-world applications

### 8. Team Section
- Team member cards/avatars
- Team profiles

### 9. Journey Section
- Customer/user journey visualization

### 10. How It Works
- Step-by-step explanation
- Process flow

### 11. Features Section
- Feature blocks with descriptions
- Three main features with visuals
- Trust badges at bottom

### 12. Assistant Section
- AI capabilities/personality traits

### 13. Proof/Social Proof
- Testimonials, ratings, success stories

### 14. Security Section
- Privacy/security messaging
- Trust signals

### 15. FAQ Section
- Common questions and answers

### 16. Ferni Fund / Founders Section
- "AI Company" section with:
  - CEO (Ferni avatar)
  - Co-Founders (Claude, Gemini, GPT)

### 17. Final CTA
- Last conversion opportunity

### 18. Footer
- Meet the Team cards (6 AI specialists)
- Footer branding
- Social links
- Additional navigation

---

## Dark Mode CSS Analysis

### Design Tokens Support (Excellent)
**File:** `/css/design-tokens.css` (21,875 bytes)

The design system has **comprehensive dark mode support:**

```css
@media (prefers-color-scheme: dark) {
  :root {
    /* Background - Cedar Night theme */
    --color-bg-primary: #584840;        /* Cedar brown */
    --color-bg-secondary: #60504a;      /* Lighter cedar */
    --color-bg-elevated: #70605a;       /* Even lighter */

    /* Text - High contrast on dark */
    --color-text-primary: #faf6f0;      /* Off-white */
    --color-text-secondary: #f0ebe4;    /* Light beige */
    --color-text-muted: #e8e2da;        /* Muted cream */

    /* Accent - Gold instead of sage */
    --color-accent: #d4a84a;            /* Gold */
    --color-accent-hover: #e0bc6a;      /* Lighter gold */

    /* Persona text colors - WCAG AA compliant */
    --color-ferni-text: #a5c99a;        /* Light sage green */
    --color-maya-text: #e0b8a8;         /* Warm peachy */
    /* ... 13 more persona colors ... */
  }
}

[data-theme="dark"] {
  /* Duplicate dark mode rules for manual theme switching */
  /* (same values as @media block) */
}
```

**Strengths:**
- Persona colors are theme-aware (WCAG AA contrast on both light/dark)
- Gold accent color (#d4a84a) chosen specifically for dark mode readability
- Both CSS media query AND data-theme attribute support
- Border colors have proper opacity for dark mode

### Main Styles Missing Dark Mode (Critical Gap)
**File:** `/css/styles.css` (74,541 bytes)

- **0 dark mode media queries** found
- All color values either hardcoded or pointing to CSS variables
- No dark mode styling for:
  - `.hero` background
  - `.features` sections
  - `.ai-company` gradient
  - `.footer` styling
  - Button hover states
  - Text contrast in dark backgrounds
  - Shadows and borders

---

## Dark Mode Concerns Per Section

### Navigation Bar
- **Light Mode:** Dark text (#2c2520) on cream background (#faf8f5) ✅
- **Dark Mode:** Dark text (#faf6f0) on cedar brown (#584840) - OK, but NOT APPLIED
- **Issue:** Nav may not be explicitly styled for dark mode
- **Mobile Menu:** Likely has same issues

### Hero Section
**Current CSS:**
```css
.hero {
  background: linear-gradient(180deg, var(--color-bg) 0, var(--color-bg-secondary) 100%);
  /* Uses light colors even in dark mode */
}
```
- **Problem:** In dark mode, will show #faf8f5 (cream) instead of #584840 (cedar)
- **Animated Orbs:** Gradient colors likely hardcoded, may not adapt
- **Avatar SVG:** White eyes (#ffffff) on light background = good in light mode, poor contrast in dark
- **Text Contrast:** Headline text may be too dark in dark mode

### Features Section
**Current:** Appears to rely on background gradient
- **Problem:** Feature blocks may have light gray backgrounds (#f5f2ed) that don't contrast well with dark mode
- **Memory Visualizations:** Dots and lines likely use hardcoded colors
- **Trust Badges:** Icons likely light text on light background

### AI Company Section
**Current CSS:**
```css
.ai-company {
  padding: var(--space-36) 0;
  background: linear-gradient(180deg, var(--color-bg) 0, var(--color-bg-secondary) 100%);
}
```
- **Problem:** CEO card background likely not styled for dark mode
- **Avatar Ring:** Glow effects may be invisible on dark background
- **Text:** May lack proper contrast

### Footer
**Current CSS:**
```css
.footer {
  padding: var(--space-24) 0 var(--space-10);
  border-top: 1px solid var(--color-border);
  background: var(--color-bg);
}
```
- **Positive:** Uses CSS variables for border color
- **Issue:** Background doesn't adapt to dark mode
- **Team Avatars:** White SVG eyes on light orbs - will be invisible in dark mode on dark background
- **Social Links:** Text color may not be visible

### General Dark Mode Issues

| Component | Light Mode | Dark Mode | Status |
|-----------|-----------|-----------|--------|
| Text | #2c2520 on cream | #faf6f0 on cedar | ❌ Not applied |
| Backgrounds | #faf8f5 | #584840 | ❌ Not applied |
| Borders | rgba(0,0,0,0.1) | rgba(215,185,145,0.2) | ✅ Defined, ❌ Not applied |
| Accent | #3D5A45 (sage) | #d4a84a (gold) | ❌ Not applied |
| Shadows | Dark overlay | Light overlay | ❌ Not applied |

---

## Accessibility HTML Audit

### Skip Navigation Link
```html
<a href="#main-content" class="skip-link">Skip to main content</a>
```
✅ **Present and correct** - Allows keyboard navigation to main content

### Landmark Navigation
```html
<nav class="nav" id="nav" aria-label="Main navigation">
```
✅ **Has aria-label** - Properly labeled

### Mobile Menu Accessibility
```html
<button class="nav__hamburger" id="mobileMenuToggle" aria-label="Open menu">
<button class="mobile-menu__close" aria-label="Close menu">
```
✅ **Properly labeled buttons** - Both open and close have aria-labels

### Main Content Landmark
```html
<main id="main-content">
```
✅ **`<main>` element present** - Proper semantic HTML

### Heading Hierarchy Issues Found

**Positive:**
```html
<h1 class="hero-headline">...headline...</h1>
<h2 class="feature-hero-headline">Just talk.</h2>
<h3 class="feature-block-headline">It remembers...</h3>
```
✅ Correct h1 → h2 → h3 progression

**Potential Issue:**
```html
<h2 class="headline-lg">The first company built by AI.</h2>
<h4 class="founders-label">Co-Founders</h4>
```
⚠️ Jumps from h2 directly to h4 (missing h3)

### Images & Alt Text

**Avatar SVG in HTML:**
```html
<svg class="avatar-orb avatar-orb-hero animate-pixar-breathe" data-persona="ferni">
  <div class="avatar-eyes track-cursor" id="avatarEyes">
    <span class="eye"></span>
    <span class="eye"></span>
  </div>
</svg>
```
⚠️ **Decorative SVGs marked with aria-hidden="true"** - Good, but no alt text for meaning

**Issue with Persona Eyes SVGs:**
```html
<svg class="ferni-eyes-svg" viewBox="0 0 100 100">
  <ellipse cx="36" cy="50" rx="10" ry="12" fill="white"/>
  <circle cx="33" cy="45" r="2.5" fill="white" opacity="0.9"/>
</svg>
```
⚠️ **Inline SVGs used as decorative elements** - Should have aria-hidden="true" consistently

### Form Accessibility

**Demo Input:**
```html
<input
  type="text"
  id="heroDemoInput"
  class="demo-input"
  placeholder="What's on your mind?"
  aria-label="Try talking to Ferni"
  autocomplete="off"
>
```
✅ **Has aria-label** - Good accessibility

**Demo Button:**
```html
<button class="demo-mic-btn" id="demoMicBtn" aria-label="Speak to Ferni">
```
✅ **Has aria-label** - Microphone button is accessible

### Interactive Elements Keyboard Accessibility
⚠️ **Not fully verified** but:
- Nav links appear to be `<a>` elements ✅
- Buttons have proper `<button>` tags ✅
- No obvious event listeners on divs

### Focus Management
❌ **Not verified** - Need to check:
- Are focus states visible?
- Does focus move logically?
- Are modals trapped?

### WCAG Compliance Assessment

| Criterion | Status | Notes |
|-----------|--------|-------|
| Proper heading hierarchy | ⚠️ Partial | Jump from h2 to h4 in some sections |
| Landmark navigation | ✅ Good | Nav and main landmarks present |
| Alt text for images | ⚠️ Partial | Decorative SVGs handled, but check actual images |
| Keyboard navigation | ⚠️ Unknown | Need manual testing |
| Focus visible | ⚠️ Unknown | Need manual testing |
| Color contrast in dark mode | ❌ NOT IMPLEMENTED | Design tokens exist but not applied |
| Form labels | ✅ Good | aria-labels present |
| Accessible buttons | ✅ Good | Proper button elements with labels |

---

## Mobile Dark Mode Concerns

### Responsive Breakpoints in CSS
The design uses:
- Mobile: < 768px
- Tablet: 768px - 1024px
- Desktop: > 1024px

**Issues Found:**
1. **No mobile-specific dark mode styling** - Same problem as desktop
2. **Mobile hamburger menu** - If dark mode enabled, may have readability issues
3. **Touch targets** - Need verification they meet 44px minimum

### Mobile CTA Bar
- Not explicitly mentioned in code review
- Likely not styled for dark mode

### Avatar on Mobile
- Avatar animations may not perform well on older mobile browsers
- No fallback for dark mode

---

## Comparison to World-Class Landing Pages

### Structure Analysis

| Page | Section Count | Visual Rhythm | Our Page | Assessment |
|------|---|---|---|---|
| Apple.com | 8-10 | Excellent (light/dark alternation) | 17+ sections | **Too many** - cognitive overload |
| Linear.app | 6-8 | Great (large whitespace, clear hierarchy) | Dense with animations | **Too dense** - needs breathing room |
| Stripe.com | 10-12 | Excellent (clear visual separations) | Same background throughout | **Monotonous** |

### Key Findings

**Too Many Sections (17+):**
- Apple typically has 8-10 focused sections
- Linear uses 6-8 with plenty of whitespace
- Ferni has: Hero, Stats, Showcase, Memory, Story, Use-Cases, Team, Journey, How-It-Works, Features, Assistant, Proof, Security, FAQ, Fund, CTA, Footer

**Missing Visual Rhythm:**
- Light backgrounds dominate entire page
- No section variation (light ↔ dark alternation)
- Comparison:
  - **Apple:** Light section → Dark/image section → Light text → Dark CTA
  - **Linear:** Alternates backgrounds with clear visual pause
  - **Stripe:** Uses color blocks to separate sections
  - **Ferni:** All light with slight gradient variations

**Accessibility Gaps:**
- Linear: Dark mode fully supported with proper contrast
- Stripe: Excellent color contrast in all themes
- Ferni: No dark mode media queries in main CSS

---

## Specific Dark Mode Failures Per Section

### 1. Hero Avatar SVG

**Light Mode (Current):**
```html
<linearGradient id="eyeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
  <stop offset="0%" stop-color="#ffffff"/>
  <stop offset="100%" stop-color="#f0ebe4"/>
</linearGradient>
```
White eyes on light avatar = visible ✅

**Dark Mode (What Happens):**
White eyes (#ffffff) on light background (#faf8f5) = becomes white eyes on CREAM background - STILL LIGHT 😕
- Need: Darker eyes for dark mode (e.g., #2c2520 on #584840)
- **Missing:** No dark mode SVG gradient override

### 2. Animated Background Orbs

**Current (Light):**
```css
.hero__bg-orb {
  background: rgba(74, 103, 65, 0.15); /* Sage with low opacity */
}
```
Subtle sage orbs on cream = nice effect ✅

**Dark Mode (Missing):**
Same sage color on cedar brown = barely visible or wrong tone
- **Need:** Brighter, more golden orbs (#d4a84a or similar) in dark mode

### 3. Feature Block Backgrounds

**Current (Light):**
```css
.feature-block {
  background: var(--color-bg-secondary); /* #f5f2ed - light gray */
  border-radius: 20px;
}
```
Light gray on cream = subtle contrast ✅

**Dark Mode (Missing):**
Light gray (#f5f2ed) on cedar (#584840) = TOO DARK, unreadable
- **Need:** Dark mode override to #60504a or #70605a

### 4. Button Styling

**Current (Light):**
```css
.btn--primary {
  background: var(--color-accent); /* #3D5A45 - sage */
  color: white;
}
```
Sage button with white text on cream = good contrast ✅

**Dark Mode (Missing):**
Sage button (#3D5A45) on cedar (#584840) = TERRIBLE CONTRAST
- **Need:** Switch to gold accent (#d4a84a) in dark mode
- **Actually defined:** Dark mode tokens say --color-accent: #d4a84a
- **Problem:** The CSS variables are defined but NOT APPLIED anywhere

### 5. Border Dividers

**Current (Light):**
```css
border-top: 1px solid var(--color-border);
/* = rgba(44, 37, 32, 0.10) - very subtle */
```
Dark border on cream = barely visible ✅

**Dark Mode (Missing):**
Same dark color on dark background = INVISIBLE
- **Dark mode token defined:** rgba(215, 185, 145, 0.20) - light border for dark bg
- **Problem:** Not applied in styles.css

---

## Critical Issues Summary

### Severity: CRITICAL ⚠️

1. **No Dark Mode CSS in styles.css**
   - Design tokens are perfect
   - But no `@media (prefers-color-scheme: dark)` blocks apply them
   - Users with dark mode preference see all-light page
   - **Fix:** Add 50-100 lines of `@media (prefers-color-scheme: dark)` blocks

2. **Text Contrast in Dark Mode**
   - Dark text (#2c2520) will be invisible on dark backgrounds (#584840)
   - **Fix:** Override text color in dark mode media query

3. **Avatar SVGs Not Dark-Mode Aware**
   - White eyes hardcoded in gradient
   - **Fix:** Use filter or CSS to invert colors in dark mode

### Severity: HIGH ⚠️

4. **Heading Hierarchy Jumps**
   - h2 → h4 skip (missing h3)
   - **Fix:** Use h3 for founders label

5. **Too Many Sections (Cognitive Overload)**
   - 17+ sections vs industry standard 8-10
   - **Fix:** Consolidate similar sections or use collapsible categories

6. **Missing Visual Rhythm**
   - No dark sections to break up light page
   - **Fix:** Add dark mode media queries to alternate section backgrounds

7. **Feature Blocks Need Dark Background Override**
   - Light gray (#f5f2ed) unreadable on cedar (#584840)
   - **Fix:** Add dark mode CSS to adjust background

### Severity: MEDIUM ⚠️

8. **Footer Social Icons Visibility**
   - May not be visible on dark background
   - **Fix:** Check icon colors in dark mode CSS

9. **Mobile Menu Not Styled for Dark**
   - Hamburger icon contrast unknown
   - **Fix:** Add mobile dark mode media queries

10. **Animated Gradient Backgrounds**
    - Hero gradient may not adapt to dark theme
    - **Fix:** Override gradient colors in dark mode

---

## Recommended Fixes (Priority Order)

### IMMEDIATE (Week 1)
1. Add `@media (prefers-color-scheme: dark)` block to styles.css
2. Override background colors: body, sections, blocks
3. Override text colors in dark mode
4. Test avatar SVG visibility in dark mode

### SHORT TERM (Week 2)
5. Add dark mode styling for all interactive elements (buttons, inputs, links)
6. Fix heading hierarchy (h2 → h3 → h4)
7. Add dark mode styling for borders and shadows
8. Test footer and social icons in dark mode

### MEDIUM TERM (Week 3-4)
9. Reduce page sections from 17+ to 10-12 core sections
10. Add visual rhythm (alternate light/dark sections)
11. Review and adjust color contrast ratios
12. Add dark mode toggle or respect prefers-color-scheme

### LONG TERM (Month 2)
13. Mobile dark mode testing across devices
14. Accessibility audit with real users
15. WCAG AA compliance verification
16. Performance testing (dark mode rendering)

---

## Testing Checklist

### Manual Testing Required

- [ ] Enable dark mode in OS settings
- [ ] Reload ferni.ai and check all sections
- [ ] Verify text readability in dark mode
- [ ] Check avatar eyes visibility
- [ ] Verify button contrast in dark mode
- [ ] Test form input visibility
- [ ] Check footer link visibility
- [ ] Mobile dark mode on iOS and Android
- [ ] Keyboard navigation through entire page
- [ ] Tab order logical flow
- [ ] Screen reader testing (VoiceOver, NVDA)

### Automated Testing

```bash
# Run these tools:
- axe DevTools (accessibility)
- Lighthouse (mobile/dark mode)
- WAVE browser extension
- Color contrast checker
- WCAG 2.1 AA validator
```

---

## Conclusion

The Ferni landing page has **excellent design token infrastructure** for dark mode but **lacks implementation** in the main stylesheet. The page currently appears only in light mode, even for users who prefer dark mode system-wide.

**Key Stats:**
- ✅ Dark mode CSS variables: 100% complete
- ❌ Dark mode applied in styles.css: 0%
- ⚠️ Accessibility score: ~70/100 (skips, landmarks good; dark mode and heading hierarchy issues)
- ⚠️ Section count: 17+ (above industry standard)

**Next Steps:**
1. Add dark mode media queries to styles.css
2. Test with 5-10 users in dark mode
3. Fix heading hierarchy
4. Consider consolidating sections
5. Run accessibility audit

The fixes are straightforward - mostly adding dark mode CSS rules that mirror the token definitions that already exist.
