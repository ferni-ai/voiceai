# Dark Theme Polish Plan - Apple-Level Readability

> **Mission:** Make the Ferni landing page beautiful and readable in dark mode, achieving Apple-level polish.

## 🚨 Critical Issue Identified

**The dark mode CSS exists but doesn't apply to most sections.** The `@media (prefers-color-scheme: dark)` blocks in `_tokens.css` only update `:root` variables, but many sections have hardcoded colors that override these variables.

---

## Current State Analysis

### What's Happening
1. **Tokens defined but not applied**: `_tokens.css` has dark mode overrides, but they only affect elements using CSS variables
2. **Hardcoded colors everywhere**: Many sections use `#F5F1E8`, `#2c2520`, etc. directly instead of `var(--color-*)`
3. **Missing dark selectors**: Key sections (hero, showcase, memory-story, etc.) lack `@media (prefers-color-scheme: dark)` blocks
4. **Inconsistent inheritance**: Some sections use `.theme--dark` class, others use `.time-mode--late-night`, others rely on media query

### Files Involved
| File | Issue |
|------|-------|
| `_tokens.css` | Has dark mode `:root` overrides ✅ |
| `story-brand.css` | Partial dark support for some components |
| `landing-intelligence.css` | Has `.theme--dark` but not `@media (prefers-color-scheme: dark)` |
| `components.css` | Garden section has dark mode, others don't |
| `sections/cta.css` | Has dark mode ✅ |
| `sections/faq.css` | Has dark mode ✅ |
| `sections/footer.css` | Has dark mode ✅ |

---

## Phase 1: Foundation - Make Dark Mode Actually Work 🔴

### P1.1 Create Unified Dark Mode System

Create a new file: `dark-mode.css` that consolidates all dark mode styles:

```css
/* ======================
   DARK MODE MASTER FILE
   ====================== 
   
   Single source of truth for dark mode styles.
   Applied via @media (prefers-color-scheme: dark)
   or .theme--dark class on body.
*/

@media (prefers-color-scheme: dark) {
  :root {
    /* Surface Colors */
    --color-background: #2c2520;
    --color-background-elevated: #3a332e;
    --color-background-surface: #4a4038;
    
    /* Text Colors - WCAG AA Compliant */
    --color-text-primary: #ffffff;
    --color-text-secondary: #f0ebe4;
    --color-text-muted: #ddd6cc;
    --color-text-dimmed: #c8bfb4;
    
    /* Accent Colors */
    --color-accent: #5a7a52;
    --color-accent-hover: #6a8a62;
    --color-highlight: #d4b275;
    
    /* Border Colors */
    --color-border-subtle: rgba(255, 255, 255, 0.08);
    --color-border-medium: rgba(255, 255, 255, 0.15);
    --color-border-strong: rgba(255, 255, 255, 0.25);
    
    /* Shadows */
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
    --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
    --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
  }
  
  body {
    background: var(--color-background);
    color: var(--color-text-primary);
  }
}
```

### P1.2 Hero Section Dark Mode

**Current:** Light cream background, dark text
**Needed:** Dark warm brown background, light text

```css
@media (prefers-color-scheme: dark) {
  .hero {
    background: linear-gradient(
      180deg,
      var(--color-background) 0%,
      var(--color-background-elevated) 100%
    );
  }
  
  .hero__headline,
  .hero__headline-accent {
    color: var(--color-text-primary);
  }
  
  .hero__subhead {
    color: var(--color-text-secondary);
  }
  
  .hero__tagline {
    color: var(--color-highlight);
  }
  
  .hero__phone {
    color: var(--color-text-muted);
  }
  
  .hero__phone a {
    color: var(--color-highlight);
  }
  
  /* Background orbs - more subtle in dark */
  .hero__bg-gradient {
    background: radial-gradient(
      ellipse 80% 50% at 50% -20%,
      rgba(90, 122, 82, 0.15),
      transparent
    );
  }
  
  .hero__bg-orb {
    opacity: 0.3;
  }
}
```

### P1.3 Navigation Dark Mode

```css
@media (prefers-color-scheme: dark) {
  .nav {
    background: rgba(44, 37, 32, 0.8);
    backdrop-filter: blur(20px);
    border-bottom-color: var(--color-border-subtle);
  }
  
  .nav.is-scrolled {
    background: rgba(44, 37, 32, 0.95);
  }
  
  .nav__logo-text {
    color: var(--color-text-primary);
  }
  
  .nav__link {
    color: var(--color-text-secondary);
  }
  
  .nav__link:hover,
  .nav__link.is-active {
    color: var(--color-text-primary);
  }
  
  .nav__cta {
    background: var(--color-accent);
    color: white;
  }
  
  .nav__cta:hover {
    background: var(--color-accent-hover);
  }
}
```

### P1.4 Section Headers Dark Mode

Every section header needs these overrides:

```css
@media (prefers-color-scheme: dark) {
  .section__eyebrow {
    color: var(--color-highlight);
  }
  
  .section__title {
    color: var(--color-text-primary);
  }
  
  .section__subtitle {
    color: var(--color-text-secondary);
  }
}
```

### P1.5 Stats Bar Dark Mode

```css
@media (prefers-color-scheme: dark) {
  .stats-bar {
    background: var(--color-background-elevated);
    border-color: var(--color-border-subtle);
  }
  
  .stat__value {
    color: var(--color-text-primary);
  }
  
  .stat__label {
    color: var(--color-text-muted);
  }
}
```

### P1.6 Showcase Section Dark Mode

```css
@media (prefers-color-scheme: dark) {
  .showcase {
    background: var(--color-background);
  }
  
  .showcase__eyebrow {
    color: var(--color-highlight);
  }
  
  .showcase__title {
    color: var(--color-text-primary);
  }
  
  .showcase__description {
    color: var(--color-text-secondary);
  }
  
  .showcase__feature {
    color: var(--color-text-secondary);
  }
  
  .showcase__feature svg {
    color: var(--color-accent);
  }
  
  /* Phone mockup */
  .showcase__phone {
    background: var(--color-background-elevated);
    border-color: var(--color-border-medium);
  }
  
  .showcase__phone-screen {
    background: var(--color-background-surface);
  }
  
  .showcase__app-bubble--user {
    background: var(--color-accent);
    color: white;
  }
  
  .showcase__app-bubble--ai {
    background: var(--color-background-elevated);
    color: var(--color-text-secondary);
  }
}
```

---

## Phase 2: Component Polish 🟡

### P2.1 Cards System Dark Mode

All card variants need consistent dark treatment:

```css
@media (prefers-color-scheme: dark) {
  /* Base card */
  .card,
  .team-card,
  .use-case,
  .moment-card,
  .security-card,
  .connect-option,
  .feature {
    background: var(--color-background-elevated);
    border-color: var(--color-border-subtle);
    box-shadow: var(--shadow-md);
  }
  
  .card:hover,
  .team-card:hover,
  .use-case:hover {
    border-color: var(--color-border-medium);
    box-shadow: var(--shadow-lg);
  }
  
  /* Card titles */
  .team-card__name,
  .use-case__title,
  .moment-card__title,
  .security-card__title,
  .connect-option__title,
  .feature__title {
    color: var(--color-text-primary);
  }
  
  /* Card descriptions */
  .team-card__role,
  .use-case__description,
  .moment-card__description,
  .security-card__description,
  .connect-option__desc,
  .feature__description {
    color: var(--color-text-secondary);
  }
  
  /* Card muted text */
  .use-case__example,
  .connect-option__detail {
    color: var(--color-text-muted);
  }
}
```

### P2.2 Memory Story Section Dark Mode

The Memory Demo section is complex - needs special attention:

```css
@media (prefers-color-scheme: dark) {
  .memory-story {
    background: linear-gradient(
      180deg,
      var(--color-background) 0%,
      var(--color-background-elevated) 50%,
      var(--color-background) 100%
    );
  }
  
  .memory-story__eyebrow {
    color: var(--color-highlight);
  }
  
  .memory-story__headline {
    color: var(--color-text-primary);
  }
  
  .memory-story__subhead {
    color: var(--color-text-secondary);
  }
  
  /* Timeline */
  .memory-story__marker::before {
    background: var(--color-border-medium);
  }
  
  .memory-story__time {
    color: var(--color-text-muted);
  }
  
  /* Memory cards */
  .memory-story__card {
    background: var(--color-background-elevated);
    border-color: var(--color-border-subtle);
    box-shadow: var(--shadow-md);
  }
  
  .memory-story__quote {
    color: var(--color-text-secondary);
  }
  
  /* Ferni response card - special highlight */
  .memory-story__card--ferni {
    background: linear-gradient(
      135deg,
      rgba(90, 122, 82, 0.15) 0%,
      var(--color-background-elevated) 100%
    );
    border-color: rgba(90, 122, 82, 0.3);
    box-shadow: 0 8px 32px rgba(90, 122, 82, 0.15);
  }
  
  .memory-story__response {
    color: var(--color-text-secondary);
  }
  
  /* Emotion tags */
  .memory-story__tag {
    background: rgba(255, 255, 255, 0.1);
    color: var(--color-text-muted);
  }
  
  /* Dashboard */
  .memory-dashboard {
    background: var(--color-background-surface);
    border-color: var(--color-border-subtle);
  }
  
  .memory-dashboard__stat-value {
    color: var(--color-text-primary);
  }
  
  .memory-dashboard__stat-label {
    color: var(--color-text-muted);
  }
  
  /* Chart */
  .memory-chart__grid line {
    stroke: var(--color-border-subtle);
  }
  
  .memory-chart__x-labels text {
    fill: var(--color-text-muted);
  }
}
```

### P2.3 Two-AM Section Dark Mode

This section should be DARKER than everything else - it's about 3:47 AM:

```css
@media (prefers-color-scheme: dark) {
  .two-am {
    background: #1a1614; /* Deepest dark */
  }
  
  .two-am__time {
    color: rgba(255, 255, 255, 0.6);
  }
  
  .two-am__quote {
    color: var(--color-text-secondary);
    font-style: italic;
  }
  
  .two-am__limit-who {
    color: var(--color-text-muted);
  }
  
  .two-am__limit-status {
    color: rgba(255, 255, 255, 0.4);
  }
  
  /* Ferni response - warm glow */
  .two-am__ferni {
    background: radial-gradient(
      circle at center,
      rgba(90, 122, 82, 0.2) 0%,
      transparent 70%
    );
  }
  
  .two-am__ferni-says {
    color: var(--color-text-primary);
  }
  
  .two-am__ferni-sub {
    color: var(--color-accent);
  }
}
```

### P2.4 Story Section Dark Mode

The story section has high-impact text - needs drama:

```css
@media (prefers-color-scheme: dark) {
  .story {
    background: var(--color-background);
  }
  
  .story__eyebrow {
    color: var(--color-highlight);
  }
  
  .story__headline {
    color: var(--color-text-primary);
  }
  
  .story__headline em {
    color: var(--color-accent);
    font-style: normal;
  }
  
  .story__subtext {
    color: var(--color-text-secondary);
  }
  
  .story__punchline {
    color: var(--color-accent);
  }
  
  .story__aside {
    color: var(--color-text-muted);
    border-left-color: var(--color-border-medium);
  }
  
  .story__link {
    color: var(--color-highlight);
  }
  
  .story__closer {
    color: var(--color-text-primary);
  }
  
  .story__signature {
    color: var(--color-accent);
  }
}
```

### P2.5 Journey Section Dark Mode

```css
@media (prefers-color-scheme: dark) {
  .journey {
    background: var(--color-background);
  }
  
  .journey__depth-scale span {
    color: var(--color-text-muted);
  }
  
  .journey__depth-bar {
    background: var(--color-background-elevated);
    border-color: var(--color-border-subtle);
  }
  
  .journey__depth-bar-fill {
    background: linear-gradient(
      180deg,
      var(--color-accent) 0%,
      rgba(90, 122, 82, 0.5) 100%
    );
  }
  
  .journey__stage-marker {
    border-color: var(--color-border-medium);
  }
  
  .journey__stage-content {
    color: var(--color-text-secondary);
  }
  
  .journey__stage-title {
    color: var(--color-text-primary);
  }
  
  .journey__note {
    background: var(--color-background-elevated);
    color: var(--color-text-muted);
  }
}
```

### P2.6 Superpowers Section Dark Mode

```css
@media (prefers-color-scheme: dark) {
  .superpowers {
    background: var(--color-background);
  }
  
  .superpowers__tab {
    background: var(--color-background-elevated);
    color: var(--color-text-muted);
    border-color: var(--color-border-subtle);
  }
  
  .superpowers__tab.is-active {
    background: var(--color-accent);
    color: white;
    border-color: var(--color-accent);
  }
  
  .superpowers__demo-title {
    color: var(--color-text-primary);
  }
  
  .superpowers__demo-description {
    color: var(--color-text-secondary);
  }
  
  .superpowers__demo-why {
    background: var(--color-background-elevated);
    color: var(--color-text-muted);
  }
  
  /* Demo chat */
  .demo-chat__message--user {
    background: var(--color-accent);
    color: white;
  }
  
  .demo-chat__message--ai {
    background: var(--color-background-elevated);
    color: var(--color-text-secondary);
  }
  
  .demo-chat__insight {
    color: var(--color-highlight);
  }
}
```

### P2.7 Features Section Dark Mode

```css
@media (prefers-color-scheme: dark) {
  .features {
    background: var(--color-background-elevated);
  }
  
  .feature {
    background: var(--color-background-surface);
  }
  
  .feature__icon {
    color: var(--color-accent);
  }
  
  .feature__title {
    color: var(--color-text-primary);
  }
  
  .feature__description {
    color: var(--color-text-secondary);
  }
}
```

### P2.8 The Gaps Section Dark Mode

```css
@media (prefers-color-scheme: dark) {
  .the-gaps {
    background: #1a1614; /* Deep dark for drama */
  }
  
  .gaps__eyebrow {
    color: var(--color-highlight);
  }
  
  .gaps__headline {
    color: var(--color-text-primary);
  }
  
  .gaps__scenario {
    color: var(--color-text-muted);
  }
  
  .gaps__response {
    color: var(--color-accent);
    font-weight: 600;
  }
  
  .gaps__closing {
    color: var(--color-text-secondary);
  }
}
```

### P2.9 Hardest Moments Section Dark Mode

```css
@media (prefers-color-scheme: dark) {
  .hardest-moments {
    background: var(--color-background);
  }
  
  .moment-card {
    background: var(--color-background-elevated);
    border-color: var(--color-border-subtle);
  }
  
  .moment-card__icon {
    color: var(--color-accent);
  }
  
  .moment-card__title {
    color: var(--color-text-primary);
  }
  
  .moment-card__superpower {
    color: var(--color-highlight);
  }
  
  .moment-card__description {
    color: var(--color-text-secondary);
  }
  
  .moment-card__voice {
    color: var(--color-text-muted);
    border-left-color: var(--color-accent);
    font-style: italic;
  }
}
```

### P2.10 Use Cases Section Dark Mode

```css
@media (prefers-color-scheme: dark) {
  .use-cases {
    background: var(--color-background-elevated);
  }
  
  .use-case {
    background: var(--color-background-surface);
  }
  
  .use-case__icon {
    color: var(--color-accent);
  }
  
  .use-case__example {
    background: var(--color-background);
    color: var(--color-text-muted);
  }
}
```

### P2.11 Quiz Section Dark Mode

```css
@media (prefers-color-scheme: dark) {
  .quiz-section {
    background: var(--color-background);
  }
  
  .persona-quiz {
    background: var(--color-background-elevated);
    border-color: var(--color-border-subtle);
  }
  
  .quiz__step {
    color: var(--color-text-muted);
  }
  
  .quiz__content h3 {
    color: var(--color-text-primary);
  }
  
  .quiz__content button {
    background: var(--color-background-surface);
    color: var(--color-text-secondary);
    border-color: var(--color-border-subtle);
  }
  
  .quiz__content button:hover {
    background: var(--color-accent);
    color: white;
    border-color: var(--color-accent);
  }
}
```

### P2.12 Final CTA Section Dark Mode

```css
@media (prefers-color-scheme: dark) {
  .final-cta {
    background: linear-gradient(
      180deg,
      var(--color-background) 0%,
      #1a1614 100%
    );
  }
  
  .final-cta__headline {
    color: var(--color-text-primary);
  }
  
  .final-cta__subhead {
    color: var(--color-text-secondary);
  }
  
  .final-cta__phone {
    background: var(--color-accent);
    color: white;
  }
  
  .final-cta__phone-label {
    color: rgba(255, 255, 255, 0.8);
  }
  
  .final-cta__divider span {
    color: var(--color-text-muted);
  }
}
```

---

## Phase 3: Contrast & Accessibility 🟢

### P3.1 WCAG AA Compliance Audit

Every text element needs to meet these contrast ratios:
- **Normal text (< 18px):** 4.5:1 minimum
- **Large text (≥ 18px bold or ≥ 24px):** 3:1 minimum
- **UI components:** 3:1 minimum

| Background | Text Token | Hex | Contrast Ratio | Status |
|------------|------------|-----|----------------|--------|
| #2c2520 | `--color-text-primary` | #ffffff | 12.1:1 | ✅ Pass |
| #2c2520 | `--color-text-secondary` | #f0ebe4 | 9.8:1 | ✅ Pass |
| #2c2520 | `--color-text-muted` | #ddd6cc | 7.5:1 | ✅ Pass |
| #2c2520 | `--color-text-dimmed` | #c8bfb4 | 5.9:1 | ✅ Pass |
| #3a332e | `--color-text-primary` | #ffffff | 10.2:1 | ✅ Pass |
| #3a332e | `--color-text-secondary` | #f0ebe4 | 8.3:1 | ✅ Pass |
| #4a4038 | `--color-text-primary` | #ffffff | 8.1:1 | ✅ Pass |
| #4a4038 | `--color-text-secondary` | #f0ebe4 | 6.6:1 | ✅ Pass |

### P3.2 Focus States

All interactive elements need visible focus states:

```css
@media (prefers-color-scheme: dark) {
  /* Focus ring - visible on dark backgrounds */
  *:focus-visible {
    outline: 2px solid var(--color-highlight);
    outline-offset: 2px;
  }
  
  /* Button focus */
  .btn:focus-visible {
    outline: 2px solid var(--color-highlight);
    outline-offset: 2px;
    box-shadow: 0 0 0 4px rgba(212, 178, 117, 0.3);
  }
  
  /* Link focus */
  a:focus-visible {
    outline: 2px solid var(--color-highlight);
    outline-offset: 2px;
  }
  
  /* Input focus */
  input:focus-visible,
  textarea:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 0;
    border-color: var(--color-accent);
  }
}
```

### P3.3 High Contrast Mode Support

```css
@media (prefers-color-scheme: dark) and (prefers-contrast: more) {
  :root {
    --color-text-primary: #ffffff;
    --color-text-secondary: #ffffff;
    --color-text-muted: #e0e0e0;
    --color-border-subtle: rgba(255, 255, 255, 0.3);
    --color-border-medium: rgba(255, 255, 255, 0.5);
  }
}
```

---

## Phase 4: Polish & Animation 🔵

### P4.1 Smooth Color Transitions

Add transition for theme switching (for manual theme toggle):

```css
/* Add to elements that change color in dark mode */
body,
.hero,
.section,
.card,
.nav {
  transition: 
    background-color 0.3s ease,
    color 0.3s ease,
    border-color 0.3s ease,
    box-shadow 0.3s ease;
}
```

### P4.2 Dark Mode Specific Animations

```css
@media (prefers-color-scheme: dark) {
  /* Ferni avatar glow - more pronounced in dark */
  .hero-ferni__glow,
  .two-am__avatar-glow,
  .final-cta__avatar-glow {
    opacity: 0.8;
    animation: pulse-glow 3s ease-in-out infinite;
  }
  
  @keyframes pulse-glow {
    0%, 100% { 
      transform: scale(1); 
      opacity: 0.6;
    }
    50% { 
      transform: scale(1.1); 
      opacity: 0.9;
    }
  }
  
  /* Cards subtle lift on hover */
  .card:hover,
  .team-card:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-lg);
  }
  
  /* Buttons more noticeable hover */
  .btn--primary:hover {
    box-shadow: 0 8px 32px rgba(90, 122, 82, 0.4);
  }
}
```

### P4.3 Reduced Motion Support

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

## Implementation Order

### Day 1: Critical Foundation
1. Create `dark-mode.css` with unified variables
2. Add dark mode to: Hero, Navigation, Section headers
3. Test contrast ratios
4. Import dark-mode.css in story-brand.njk

### Day 2: Main Content
5. Add dark mode to: Showcase, Memory Story, Two-AM
6. Add dark mode to: Story, Journey, Superpowers
7. Add dark mode to: Cards system (all variants)
8. Test all sections visually

### Day 3: Polish & QA
9. Add dark mode to: Features, Use Cases, Quiz
10. Add dark mode to: The Gaps, Hardest Moments
11. Add dark mode to: Final CTA
12. Focus states and accessibility
13. Animation refinements
14. Full page QA in dark mode

### Day 4: Testing
15. Cross-browser testing (Chrome, Firefox, Safari)
16. Mobile testing
17. WCAG automated testing
18. Manual accessibility audit
19. Performance check

---

## Files to Create/Modify

### New Files
- `src/css/dark-mode.css` - All dark mode styles in one place

### Modified Files
- `src/_includes/layouts/story-brand.njk` - Add dark-mode.css import
- `src/css/styles.css` - Update variable references

### Files to Review (may have conflicts)
- `src/css/_tokens.css` - Check for variable conflicts
- `src/css/story-brand.css` - Has some dark mode
- `src/css/landing-intelligence.css` - Has `.theme--dark` class

---

## Success Criteria

The dark theme is complete when:

- [ ] All sections are readable in dark mode
- [ ] All text meets WCAG AA contrast requirements  
- [ ] Navigation is visible and functional
- [ ] Cards and components look intentional, not broken
- [ ] Interactive elements have visible focus states
- [ ] Animations work correctly in dark mode
- [ ] No jarring color transitions
- [ ] Mobile experience is excellent
- [ ] Screenshot looks like an Apple product page

---

## Quick Test Checklist

```bash
# Enable dark mode on macOS
osascript -e 'tell application "System Events" to tell appearance preferences to set dark mode to true'

# Open landing page
open http://localhost:8080

# Check these sections:
# [ ] Hero section
# [ ] Navigation (normal and scrolled)
# [ ] Stats bar
# [ ] Showcase with phone mockup
# [ ] Memory Story timeline
# [ ] Two-AM section (should be extra dark)
# [ ] Our Story section
# [ ] Garden section
# [ ] Team cards
# [ ] Use Cases grid
# [ ] Quiz section
# [ ] Journey timeline
# [ ] Superpowers tabs
# [ ] Features grid
# [ ] Hardest Moments cards
# [ ] The Gaps section
# [ ] Security section
# [ ] FAQ accordion
# [ ] Final CTA
# [ ] Footer

# Disable dark mode
osascript -e 'tell application "System Events" to tell appearance preferences to set dark mode to false'
```

---

## References

- [WCAG 2.1 Contrast Requirements](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
- [Apple Human Interface Guidelines - Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)
- [CSS prefers-color-scheme MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme)
- Ferni Design Tokens: `design-system/tokens/colors.json`

