# Ferni Website Standards
## Design Excellence Playbook

> *"The details are not the details. They make the design."* — Charles Eames

This document consolidates all website design standards, Apple-inspired principles, and implementation guidelines into a single source of truth.

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Visual Hierarchy](#2-visual-hierarchy)
3. [Copy & Content](#3-copy--content)
4. [Component Standards](#4-component-standards)
5. [Motion & Animation](#5-motion--animation)
6. [Implementation Checklist](#6-implementation-checklist)
7. [Technical Architecture](#7-technical-architecture)

---

## 1. Design Philosophy

### Core Principles (Apple-Inspired)

| Principle | Description | Ferni Application |
|-----------|-------------|-------------------|
| **Emotional First** | Lead with feeling, not features | "Finally, someone who listens" > "AI voice assistant" |
| **Benefit Over Spec** | What it does FOR you | "They remember everything" > "Persistent memory" |
| **Cinematic Quality** | Every frame could be a poster | Full-viewport hero, floating cards, depth |
| **Restrained Elegance** | Less is more, white space is intentional | Generous padding, single focus per section |
| **Rhythm & Flow** | Reading should feel like music | Line breaks for emphasis, staggered reveals |

### Brand Voice

```
DO:                              DON'T:
"Finally, someone who listens"   "AI-powered virtual assistant"
"They remember. So you don't     "Persistent context memory system"
 have to."
"A team that actually knows you" "Multi-agent architecture"
"Talk anywhere. Anytime."        "Cross-platform availability"
```

---

## 2. Visual Hierarchy

### Typography Scale (Apple-Level Impact)

| Element | Desktop | Tablet | Mobile | Weight | Tracking |
|---------|---------|--------|--------|--------|----------|
| Hero Display | 120px | 80px | 56px | 700 | -0.04em |
| Section Title | 80px | 56px | 40px | 600 | -0.03em |
| Feature Headline | 48px | 40px | 32px | 600 | -0.02em |
| Subheadline | 32px | 28px | 24px | 500 | -0.01em |
| Body Large | 20px | 20px | 18px | 400 | 0 |
| Body | 17px | 17px | 16px | 400 | 0 |
| Caption | 13px | 13px | 12px | 400 | 0.02em |
| Eyebrow | 11px | 11px | 11px | 600 | 0.1em |

### Hero Structure (The Apple Pattern)

```

                                                        
                    [Eyebrow Label]                     
                  MEET YOUR AI TEAM                     
                                                        
                      Ferni                                Product name (bold)
                                                        
              Finally, someone who                         Benefit (split across
                 actually listens.                           lines for rhythm)
                                                        
            [Start Free]  [Call Now]                       Clear CTAs
                                                        
                                                          Scroll indicator

```

### Section Storytelling (Emotional Frames)

| Section | OLD (Feature-Focused) | NEW (Benefit-Focused) |
|---------|----------------------|----------------------|
| Voice | "Just talk." | "Conversations that go somewhere." |
| Memory | "It remembers everything." | "They remember. So you don't have to." |
| Team | "Six minds. One conversation." | "A team that actually knows you." |
| Speed | "Feels instant." | "Fast enough to feel like thinking." |
| Access | "Connect Anywhere" | "Talk anywhere. Anytime. Any way." |
| Team Grid | "Meet Your Team" | "Six specialists. Zero strangers." |

---

## 3. Copy & Content

### Copy Rhythm (Break Lines for Impact)

```
 WRONG: "Your AI team remembers everything and is always there for you."

 RIGHT: "Your AI team.
          They remember everything.
          They're always there."
```

### Headline Formulas

1. **The Promise**: "Finally, [desire fulfilled]."
2. **The Team**: "[Number] specialists. [Benefit]."
3. **The Contrast**: "[Old way] vs [New way]."
4. **The Invitation**: "[Action]. [Outcome]."

### Examples

| Formula | Example |
|---------|---------|
| Promise | "Finally, someone who listens." |
| Team | "Six minds. One conversation." |
| Contrast | "Talk to AI that actually cares." |
| Invitation | "Start talking. Start growing." |

---

## 4. Component Standards

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: var(--color-accent);
  color: white;
  padding: var(--space-4) var(--space-8);
  border-radius: var(--radius-full);
  font-size: var(--text-button-md);
  font-weight: var(--font-weight-semibold);
  transition: transform var(--transition-fast),
              box-shadow var(--transition-fast);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}
```

### Cards (Floating Pattern)

```css
.card {
  background: var(--color-bg-elevated);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-card);
  padding: var(--space-8);
  transition: transform var(--transition-normal),
              box-shadow var(--transition-normal);
}

.card:hover {
  transform: translateY(-8px);
  box-shadow: var(--shadow-card-hover);
}
```

### Trust Indicators

Every page should include trust elements:
- Privacy commitment: "Your conversations never train AI models"
- Security badge: "End-to-end encrypted"
- Accessibility: "Voice-first by design"
- Human touch: "Real humans behind the AI"

---

## 5. Motion & Animation

### Scroll Animations

| Element | Animation | Timing |
|---------|-----------|--------|
| Section Title | Fade up + opacity | 600ms ease-out |
| Cards | Stagger fade up | 100ms delay between |
| Images | Fade + slight scale | 800ms ease-out |
| Stats | Count up animation | 1000ms ease-out |

### Micro-Interactions

| Element | Trigger | Effect |
|---------|---------|--------|
| Button | Hover | Lift (-2px) + shadow |
| Card | Hover | Lift (-8px) + enhanced shadow |
| Link | Hover | Color shift + underline grow |
| Nav | Scroll | Glass background reveal |

### Video Guidelines

| Type | Duration | Behavior |
|------|----------|----------|
| Hero Background | Loop | Autoplay, muted, cinematic |
| Feature Demo | 5-10s | Autoplay on scroll into view |
| Testimonial | 30-60s | Click to play |
| Brand Story | 60-90s | Full-screen modal |

---

## 6. Implementation Checklist

### Before Every Commit

- [ ] **Colors**: No hardcoded hex values (use `var(--color-*)`)
- [ ] **Spacing**: No hardcoded px (use `var(--space-*)`)
- [ ] **Typography**: No hardcoded font sizes (use `var(--text-*)`)
- [ ] **Shadows**: No hardcoded rgba (use `var(--shadow-*)`)
- [ ] **Radius**: No hardcoded border-radius (use `var(--radius-*)`)
- [ ] **Transitions**: Use CSS variables for timing

### Content Checklist

- [ ] Headlines are emotional, not technical
- [ ] Copy is broken across lines for rhythm
- [ ] CTAs are clear and action-oriented
- [ ] Trust indicators are present
- [ ] Images support the narrative

### Accessibility

- [ ] Color contrast meets WCAG AA (4.5:1 text, 3:1 large)
- [ ] Interactive elements have focus states
- [ ] Images have meaningful alt text
- [ ] Video has captions available
- [ ] `prefers-reduced-motion` respected

---

## 7. Technical Architecture

### Single Source of Truth

```
design-system/
 dist/
    tokens.css         THE canonical source
 tokens/
    colors.json
    typography.json
    spacing.json
    animation.json
 build.js               Generates tokens.css from JSON
```

**RULE**: All consumers import from `design-system/dist/tokens.css`. No copying.

### Website Structure (Target State)

```
apps/website/ferni-website/
 src/
    _includes/
       layouts/base.njk
       partials/
           header.njk
           footer.njk
    css/
       styles.css     Imports from design-system
    pages/
        index.njk
 _site/                 Build output
 .eleventy.js
```

### Automated Auditing

```bash
# Add to CI/pre-commit:

# Check for hardcoded colors
grep -E "#[0-9a-fA-F]{3,6}" css/styles.css | grep -v "var("

# Check for hardcoded font sizes
grep -E "font-size:\s*[0-9]+px" css/styles.css | grep -v "var("

# Check for hardcoded spacing
grep -E "(padding|margin|gap):\s*[0-9]+px" css/styles.css | grep -v "var("
```

---

## Quick Reference Card

### Emotional Headlines
| Tired | Wired |
|-------|-------|
| "AI Voice Assistant" | "Someone who actually listens" |
| "Persistent Memory" | "They remember everything" |
| "Multi-Agent System" | "A team that knows you" |
| "Cross-Platform" | "Talk anywhere. Anytime." |

### Key CSS Variables
```css
/* Most-used tokens */
--color-accent: #3D5A45;
--color-bg-primary: #F5F1E8;
--text-display-hero: 120px;
--space-8: 32px;
--radius-xl: 16px;
--shadow-lg: 0 8px 24px rgba(44, 37, 32, 0.08);
--transition-normal: 300ms cubic-bezier(0.16, 1, 0.3, 1);
```

---

## Migration Priority

### Phase 1: Foundation (This Week)
1. [ ] Symlink tokens.css from design-system (single source)
2. [ ] Audit and fix hardcoded values in styles.css
3. [ ] Update hero copy to Apple-style rhythm

### Phase 2: Templates (Next Week)
1. [ ] Set up Eleventy
2. [ ] Extract header/footer partials
3. [ ] Convert pages to Nunjucks

### Phase 3: Polish (Following Week)
1. [ ] Add scroll-triggered animations
2. [ ] Create feature micro-videos
3. [ ] Implement trust/values section

---

## Appendix: Archived Documents

The following documents have been consolidated into this playbook and moved to `_archive/`:

| Document | Now Lives In |
|----------|--------------|
| `APPLE-DESIGN-ANALYSIS.md` | Sections 1-3 (Philosophy, Hierarchy, Copy) |
| `BUILD-REFACTOR-PLAN.md` | Section 7 (Technical Architecture) |
| `DESIGN-AUDIT.md` | Section 6 (Implementation Checklist) |

These files are kept for historical reference only. **Do not edit them.**

---

## Quick Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Lint for hardcoded values
npm run lint:design

# Run before committing
npm run precommit
```

---

*Document Version: 1.0 | December 2024*
*Single source of truth for Ferni website standards*

