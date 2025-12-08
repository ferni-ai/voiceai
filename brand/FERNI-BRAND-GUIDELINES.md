# Ferni Brand Guidelines
## Screen Design System & Visual Identity

**Version 1.0 | December 2024**

---

# Table of Contents

1. [Brand Overview](#1-brand-overview)
2. [Logo & Identity](#2-logo--identity)
3. [Color System](#3-color-system)
4. [Typography](#4-typography)
5. [Spacing & Layout](#5-spacing--layout)
6. [Photography & Video](#6-photography--video)
7. [Iconography](#7-iconography)
8. [UI Components](#8-ui-components)
9. [Motion & Animation](#9-motion--animation)
10. [Voice & Tone](#10-voice--tone)
11. [Application Examples](#11-application-examples)

---

# 1. Brand Overview

## Our Mission

> **We believe in making AI human, and the decisions we make will reflect that.**

Every design choice, every interaction, every pixel should move us closer to AI that genuinely connects with humans. See [`../CORE-PRINCIPLES.md`](../CORE-PRINCIPLES.md) for our complete philosophy.

## Brand Essence

**Ferni is the AI that actually listens.**

We exist in the space between—the 2am worry, the commute contemplation, the moment before a big decision. We're not replacing human connection; we're filling the gaps when your people aren't available.

## Brand Personality

| Attribute | Description |
|-----------|-------------|
| **Warm** | Like a trusted friend, not a cold machine |
| **Grounded** | Calm, stable, reliable presence |
| **Wise** | Thoughtful guidance without judgment |
| **Present** | Fully attentive, never distracted |
| **Human** | Natural, organic, approachable |

## Brand Promise

> "Finally, someone who actually listens."

## Design Philosophy

Our design draws from **Japanese zen aesthetics** and **Scandinavian warmth**:
- Clean, uncluttered spaces
- Natural, earthy materials
- Warm, inviting tones
- Purposeful simplicity
- Human-centered experiences

**We are NOT:**
- Cold, clinical, corporate
- Neon, tech-bro, startup-y
- Busy, cluttered, overwhelming
- Artificial, plastic, synthetic

---

# 2. Logo & Identity

## Primary Logo

The Ferni logo consists of two elements:
1. **Logomark**: "FN" monogram in a rounded square
2. **Wordmark**: "Ferni" in Plus Jakarta Sans

### Logo Versions

| Version | Use Case |
|---------|----------|
| **Full Logo** | Primary use - logo + wordmark |
| **Logomark Only** | Small spaces, app icons, favicons |
| **Wordmark Only** | When logomark is nearby |

### Logo Colors

| Context | Logomark BG | Logomark Text | Wordmark |
|---------|-------------|---------------|----------|
| **Light backgrounds** | Ferni Sage (#4a6741) | White | Natural Ink (#2C2520) |
| **Dark backgrounds** | Ferni Sage (#4a6741) | White | Paper Cream (#F5F1E8) |
| **Monochrome light** | Natural Ink (#2C2520) | White | Natural Ink (#2C2520) |
| **Monochrome dark** | Paper Cream (#F5F1E8) | Natural Ink | Paper Cream (#F5F1E8) |

### Clear Space

Minimum clear space around logo = height of "F" in logomark

### Minimum Sizes

| Format | Minimum Width |
|--------|---------------|
| **Digital (full logo)** | 120px |
| **Digital (logomark)** | 32px |
| **Print (full logo)** | 1 inch |
| **Print (logomark)** | 0.25 inch |

### Logo Don'ts

❌ Don't stretch or distort  
❌ Don't rotate  
❌ Don't add effects (shadows, glows)  
❌ Don't change colors outside system  
❌ Don't place on busy backgrounds  
❌ Don't outline or stroke  

---

# 3. Color System

## Primary Palette

### Background Colors

| Name | Hex | RGB | Use |
|------|-----|-----|-----|
| **Paper Cream** | #F5F1E8 | 245, 241, 232 | Primary background |
| **Sand** | #E8E0D5 | 232, 224, 213 | Secondary background |
| **Elevated** | #FFFDFB | 255, 253, 251 | Cards, elevated surfaces |

### Text Colors

| Name | Hex | RGB | Use |
|------|-----|-----|-----|
| **Natural Ink** | #2C2520 | 44, 37, 32 | Primary text, headlines |
| **Secondary** | #5C544A | 92, 84, 74 | Body text |
| **Muted** | #756A5E | 117, 106, 94 | Captions, hints |
| **Dimmed** | #A89D90 | 168, 157, 144 | Disabled, placeholder |

### Accent Colors

| Name | Hex | RGB | Use |
|------|-----|-----|-----|
| **Forest Green** | #3D5A45 | 61, 90, 69 | Primary CTA, links |
| **Warm Amber** | #C4A265 | 196, 162, 101 | Highlights, emphasis |

### Border Colors

| Name | Value | Use |
|------|-------|-----|
| **Subtle** | rgba(44, 37, 32, 0.05) | Dividers |
| **Medium** | rgba(44, 37, 32, 0.10) | Card borders |
| **Strong** | rgba(44, 37, 32, 0.18) | Input borders |

## Persona Colors

Each AI specialist has a unique, earthy color:

| Persona | Primary | Secondary | Meaning |
|---------|---------|-----------|---------|
| **Ferni** | #4a6741 | #3d5a35 | Deep Sage - Grounding leader |
| **Jack** | #9a7b5a | #7d6348 | Warm Cedar - Trusted mentor |
| **Peter** | #3a6b73 | #2d5359 | Ocean Teal - Research depth |
| **Alex** | #5a6b8a | #4a5a73 | Soft Indigo - Clear communication |
| **Maya** | #a67a6a | #8a635a | Dusty Terracotta - Nurturing warmth |
| **Jordan** | #c4856a | #a86d55 | Warm Sunset - Celebration |

### Color Usage Rules

1. **Background**: Always Paper Cream (#F5F1E8) or lighter
2. **Text**: Natural Ink (#2C2520) for headlines, Secondary for body
3. **CTAs**: Forest Green (#3D5A45) - filled primary, outline secondary
4. **Accents**: Use persona colors sparingly for identity
5. **Never**: Use cool blues, neons, or saturated tech colors

### Accessibility

All color combinations must meet WCAG 2.1 AA standards:
- Normal text: 4.5:1 contrast ratio minimum
- Large text: 3:1 contrast ratio minimum
- UI components: 3:1 contrast ratio minimum

---

# 4. Typography

## Font Families

### Primary: Plus Jakarta Sans
**Use for**: Headlines, display text, navigation, buttons

```css
font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
```

**Weights available**: 400, 500, 600, 700, 800

### Secondary: Inter
**Use for**: Body text, paragraphs, UI elements

```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
```

**Weights available**: 300, 400, 500, 600, 700

### Accent: Sora
**Use for**: Special callouts, numbers, accent text

```css
font-family: 'Sora', sans-serif;
```

### Monospace: JetBrains Mono
**Use for**: Code, technical content

```css
font-family: 'JetBrains Mono', monospace;
```

## Type Scale

### Display (Heroes, Major Headlines)

| Name | Size | Weight | Line Height | Letter Spacing |
|------|------|--------|-------------|----------------|
| **Display XL** | 96px / 6rem | 800 | 1.0 | -0.03em |
| **Display LG** | 80px / 5rem | 800 | 1.0 | -0.03em |
| **Display MD** | 64px / 4rem | 700 | 1.05 | -0.02em |
| **Display SM** | 48px / 3rem | 700 | 1.1 | -0.02em |

### Headlines

| Name | Size | Weight | Line Height | Letter Spacing |
|------|------|--------|-------------|----------------|
| **H1** | 40px / 2.5rem | 700 | 1.2 | -0.015em |
| **H2** | 32px / 2rem | 600 | 1.25 | -0.01em |
| **H3** | 24px / 1.5rem | 600 | 1.3 | -0.01em |
| **H4** | 20px / 1.25rem | 600 | 1.35 | 0 |

### Body Text

| Name | Size | Weight | Line Height | Letter Spacing |
|------|------|--------|-------------|----------------|
| **Body LG** | 20px / 1.25rem | 400 | 1.6 | 0 |
| **Body MD** | 17px / 1.0625rem | 400 | 1.6 | 0 |
| **Body SM** | 15px / 0.9375rem | 400 | 1.5 | 0 |

### UI Elements

| Name | Size | Weight | Line Height | Letter Spacing |
|------|------|--------|-------------|----------------|
| **Button LG** | 18px | 600 | 1 | -0.01em |
| **Button MD** | 16px | 600 | 1 | -0.01em |
| **Button SM** | 14px | 600 | 1 | 0 |
| **Caption** | 13px | 500 | 1.3 | 0.01em |
| **Label** | 12px | 600 | 1.2 | 0.05em |
| **Overline** | 11px | 700 | 1.2 | 0.1em |

### Responsive Typography

Headlines scale down on mobile:

| Breakpoint | Display XL | Display LG | H1 | H2 |
|------------|------------|------------|----|----|
| **Desktop (1200px+)** | 96px | 80px | 40px | 32px |
| **Tablet (768px)** | 72px | 56px | 32px | 28px |
| **Mobile (375px)** | 48px | 40px | 28px | 24px |

---

# 5. Spacing & Layout

## Spacing Scale

Based on 4px base unit:

| Token | Value | Use |
|-------|-------|-----|
| **space-1** | 4px | Tight spacing, icon gaps |
| **space-2** | 8px | Related elements |
| **space-3** | 12px | Small gaps |
| **space-4** | 16px | Standard gap |
| **space-5** | 20px | Medium spacing |
| **space-6** | 24px | Section padding |
| **space-8** | 32px | Large gaps |
| **space-10** | 40px | Section spacing |
| **space-12** | 48px | Major sections |
| **space-16** | 64px | Hero padding |
| **space-20** | 80px | Section breaks |
| **space-24** | 96px | Major breaks |
| **space-32** | 128px | Hero sections |

## Layout Grid

### Desktop (1200px+)
- **Container**: 1200px max-width, centered
- **Columns**: 12 columns
- **Gutter**: 24px
- **Margin**: 48px (min)

### Tablet (768px - 1199px)
- **Container**: 100% - 48px
- **Columns**: 8 columns
- **Gutter**: 20px
- **Margin**: 24px

### Mobile (< 768px)
- **Container**: 100% - 32px
- **Columns**: 4 columns
- **Gutter**: 16px
- **Margin**: 16px

## Section Spacing

| Section Type | Top Padding | Bottom Padding |
|--------------|-------------|----------------|
| **Hero** | 0 (full viewport) | 0 |
| **Major Section** | 120px | 120px |
| **Minor Section** | 80px | 80px |
| **Content Block** | 48px | 48px |
| **Card Internal** | 32px | 32px |

## Border Radius

| Token | Value | Use |
|-------|-------|-----|
| **radius-sm** | 4px | Small buttons, tags |
| **radius-md** | 8px | Inputs, small cards |
| **radius-lg** | 12px | Cards, containers |
| **radius-xl** | 16px | Large cards |
| **radius-2xl** | 24px | Hero elements |
| **radius-full** | 9999px | Pills, avatars |

---

# 6. Photography & Video

## Photography Style

### Mood
- **Warm**: Golden hour, amber tones
- **Natural**: Real people, real settings
- **Intimate**: Close, personal, connected
- **Grounded**: Earth tones, natural materials

### Subjects
- Real people in natural settings
- Meadows, fields, peaceful outdoor spaces
- Cozy indoor environments
- Moments of connection and contemplation

### Color Treatment
- Warm color grading throughout
- Lifted blacks for softness
- Muted, natural saturation
- Film grain for humanity

### Don'ts
❌ Stock photo aesthetic  
❌ Corporate/sterile settings  
❌ Cool blue color casts  
❌ Harsh, artificial lighting  
❌ Posed, fake expressions  
❌ Neon or saturated colors  

## Video Guidelines

### Style
- Cinematic, 24fps for narrative content
- 30fps for UI demonstrations
- Slow, contemplative pacing
- Natural, ambient sound design

### Color
- Match photography color treatment
- Paper Cream highlights
- Warm amber mid-tones
- Soft shadows, never pure black

### Motion
- Smooth, deliberate camera moves
- Gentle parallax and depth
- Never jarring cuts
- Fade transitions preferred

### Sound
- Soft piano, acoustic instruments
- Ambient nature sounds
- Human voices (when used) are warm, unhurried
- Reference: Ólafur Arnalds, Max Richter, Nils Frahm

---

# 7. Iconography

## Icon Style

- **Stroke weight**: 1.5px - 2px
- **Corner radius**: Rounded (2px)
- **Style**: Outlined, not filled
- **Size**: 24px base, scales to 16px, 20px, 32px

## Icon Colors

| Context | Color |
|---------|-------|
| **Default** | Secondary (#5C544A) |
| **Active/Selected** | Forest Green (#3D5A45) |
| **Muted** | Dimmed (#A89D90) |
| **On dark** | Paper Cream (#F5F1E8) |

## Icon Set

Use Lucide Icons or custom icons matching this style:
- Simple, recognizable shapes
- Consistent stroke weight
- Rounded corners
- No fills unless necessary for meaning

---

# 8. UI Components

## Buttons

### Primary Button
```css
background: #3D5A45;
color: #FFFFFF;
padding: 16px 32px;
border-radius: 9999px; /* pill shape */
font-weight: 600;
font-size: 16px;
transition: all 200ms ease;
```

**Hover**: `background: #4a6d52; transform: translateY(-2px);`  
**Active**: `transform: scale(0.98);`

### Secondary Button (Outline)
```css
background: transparent;
color: #2C2520;
border: 1.5px solid rgba(44, 37, 32, 0.2);
padding: 16px 32px;
border-radius: 9999px;
```

**Hover**: `border-color: #2C2520; background: rgba(44, 37, 32, 0.03);`

### Ghost Button
```css
background: transparent;
color: #5C544A;
padding: 16px 32px;
```

**Hover**: `color: #2C2520;`

## Cards

### Standard Card
```css
background: #FFFDFB;
border: 1px solid rgba(44, 37, 32, 0.08);
border-radius: 16px;
padding: 32px;
box-shadow: 0 2px 8px rgba(44, 37, 32, 0.04);
transition: all 300ms ease;
```

**Hover**: 
```css
transform: translateY(-4px);
box-shadow: 0 12px 32px rgba(44, 37, 32, 0.08);
```

### Feature Card
```css
background: linear-gradient(135deg, #F5F1E8 0%, #FFFDFB 100%);
border-radius: 24px;
padding: 48px;
```

## Form Elements

### Input Field
```css
background: #FFFDFB;
border: 1.5px solid rgba(44, 37, 32, 0.12);
border-radius: 12px;
padding: 16px 20px;
font-size: 16px;
color: #2C2520;
transition: all 200ms ease;
```

**Focus**:
```css
border-color: #3D5A45;
box-shadow: 0 0 0 3px rgba(61, 90, 69, 0.1);
```

### Labels
```css
font-size: 13px;
font-weight: 600;
color: #5C544A;
letter-spacing: 0.02em;
margin-bottom: 8px;
```

## Navigation

### Desktop Nav
```css
position: fixed;
top: 0;
background: rgba(245, 241, 232, 0.8);
backdrop-filter: blur(20px);
padding: 16px 0;
border-bottom: 1px solid rgba(44, 37, 32, 0.05);
```

### Nav Links
```css
font-size: 15px;
font-weight: 500;
color: #5C544A;
transition: color 200ms;
```

**Hover**: `color: #2C2520;`  
**Active**: `color: #3D5A45;`

---

# 9. Motion & Animation

## Timing Functions

| Name | Value | Use |
|------|-------|-----|
| **ease-out** | cubic-bezier(0.16, 1, 0.3, 1) | Entrances, reveals |
| **ease-in-out** | cubic-bezier(0.45, 0, 0.55, 1) | Transitions |
| **spring** | cubic-bezier(0.34, 1.56, 0.64, 1) | Bouncy interactions |

## Duration

| Name | Value | Use |
|------|-------|-----|
| **fast** | 150ms | Micro-interactions |
| **normal** | 300ms | Standard transitions |
| **slow** | 500ms | Reveals, major transitions |
| **cinematic** | 800ms - 1200ms | Hero animations |

## Animation Patterns

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
- First element: 0ms delay
- Each subsequent: +100ms delay
- Maximum stagger: 500ms total

### Hover Lift
```css
.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(44, 37, 32, 0.1);
}
```

### Button Press
```css
.button:active {
  transform: scale(0.98);
}
```

## Reduced Motion

Always respect `prefers-reduced-motion`:
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

# 10. Voice & Tone

## Brand Voice

**Warm but not saccharine**
> ✅ "We're here when you need us."
> ❌ "We're sooooo happy to help you! 💕"

**Confident but not arrogant**
> ✅ "Ferni remembers everything."
> ❌ "We're the best AI ever made."

**Clear but not cold**
> ✅ "Just talk. We'll understand."
> ❌ "Utilize natural language processing."

**Human but not artificial**
> ✅ "Like talking to a friend who never forgets."
> ❌ "Our AI simulates human connection."

## Headline Style

### Structure
- Lead with emotion or benefit
- Short, punchy phrases
- Line breaks for emphasis
- End with period for gravity

### Examples

**Hero Headlines:**
> "Finally, someone who actually listens."
> "Your AI team. Always there."
> "Talk to AI that cares."

**Section Headlines:**
> "Conversations that go somewhere."
> "They remember. So you don't have to."
> "A team that actually knows you."

### Don'ts
❌ Marketing speak ("Leverage synergies")  
❌ Tech jargon ("NLP-powered conversations")  
❌ Hyperbole ("Revolutionary breakthrough")  
❌ Generic claims ("World-class service")  

## Body Copy

- Second person ("you", "your")
- Active voice
- Short sentences (under 20 words ideal)
- One idea per paragraph
- Conversational but not casual

## Microcopy

### Buttons
- Action verbs: "Start", "Begin", "Try", "Call"
- Personal: "Start Free" not "Sign Up"
- Clear: "Open App" not "Launch"

### Labels
- Sentence case for labels
- No periods at end
- Clear and concise

### Error Messages
- Helpful, not blaming
- Suggest solution
- Human tone

> ✅ "Hmm, that doesn't look like an email. Mind checking?"
> ❌ "Invalid email format."

---

# 11. Application Examples

## Landing Page

### Hero Section
- Full viewport height
- Video/image background (zen garden)
- Centered headline (Display XL)
- Sub-headline (Body LG)
- Two CTAs (Primary + Secondary)
- Scroll indicator

### Feature Sections
- Emotional headline (Display SM)
- Supporting copy (Body MD)
- Visual/video (16:9 or square)
- Alternating layout (left/right)
- Generous spacing (120px between)

### Team Section
- Grid of avatar cards (3x2)
- Avatar with persona color
- Name (H3) + Role (Caption)
- Bio (Body SM)
- Hover state with lift

### CTA Section
- Dark or gradient background (rare)
- Large headline (Display MD)
- Clear value proposition
- Two CTAs (Primary + Phone)

### Footer
- Logo + tagline
- Link columns (3-4)
- Social icons
- Legal links
- Copyright

## App Interface

### Coach View
- Central avatar with persona color glow
- Waveform visualization
- Minimal controls
- Status indicators subtle

### Team Sidebar
- Avatar circles in column
- Active state with ring
- Hover state with persona color
- Transition feedback on handoff

### Transcript
- Clean message bubbles
- Persona color accents
- Timestamps subtle
- Smooth scroll

---

# Appendix

## File Naming

- Logos: `ferni-logo-[variant]-[color].svg`
- Icons: `icon-[name]-[size].svg`
- Images: `[section]-[description]-[size].jpg`
- Videos: `[type]-[name]-[resolution].mp4`

## Asset Delivery

| Format | Use |
|--------|-----|
| **SVG** | Logos, icons, illustrations |
| **PNG** | Raster with transparency |
| **JPG** | Photography (optimized) |
| **WebP** | Web images (with fallback) |
| **MP4** | Video (H.264) |
| **WebM** | Video (VP9, with fallback) |

## Contact

For brand questions or asset requests:
- Brand: brand@ferni.ai
- Design: design@ferni.ai

---

**© 2024 Ferni. All rights reserved.**

*This document defines the Ferni brand identity and should be followed for all brand applications. For questions about usage not covered here, please contact the brand team.*

