# 🌐 Ferni Design System Documentation Site

> **Specification for design.ferni.ai - A world-class design system documentation experience.**

**Version**: 1.0.0  
**Created**: January 2026  
**Status**: Planning

---

## Vision

Create a documentation site that:
1. **Inspires** - Beautiful enough to showcase as a portfolio piece
2. **Educates** - Clear enough for any developer to implement
3. **Delights** - Interactive enough to demonstrate Ferni's character
4. **Scales** - Structured for growth to 100+ components

### Inspiration

| Site | What We Learn |
|------|---------------|
| **Apple HIG** | Authority, clarity, beautiful examples |
| **Stripe Docs** | Developer experience, interactive demos |
| **Linear Method** | Design philosophy, motion excellence |
| **Primer (GitHub)** | Comprehensive component documentation |
| **Radix** | Accessibility-first, composable patterns |

---

## Site Architecture

### URL Structure

```
design.ferni.ai/
│
├── /                           # Landing / Hero
├── /getting-started/
│   ├── /installation           # How to install
│   ├── /quick-start            # 5-minute tutorial
│   └── /principles             # Design philosophy
│
├── /foundations/
│   ├── /colors                 # Color system + explorer
│   ├── /typography             # Type scale + examples
│   ├── /spacing                # Spacing system
│   ├── /motion                 # Animation principles
│   ├── /sound                  # Sonic identity
│   └── /accessibility          # A11y guidelines
│
├── /personas/
│   ├── /overview               # Team introduction
│   ├── /ferni                  # Individual persona pages
│   ├── /peter
│   ├── /alex
│   ├── /maya
│   ├── /jordan
│   └── /nayan
│
├── /components/
│   ├── /avatar                 # Individual component docs
│   ├── /button
│   ├── /card
│   ├── /dialog
│   ├── /toast
│   ├── /celebration
│   ├── /input
│   └── /[...more]
│
├── /patterns/
│   ├── /rituals                # Brand rituals
│   ├── /handoffs               # Persona transitions
│   ├── /celebrations           # Celebration patterns
│   ├── /conversations          # Chat UI patterns
│   └── /empty-states           # Empty & error states
│
├── /animation/
│   ├── /principles             # 12 principles
│   ├── /ferni-eq               # Emotional intelligence
│   ├── /easing-curves          # Interactive curve editor
│   └── /choreography           # Sequences & timing
│
├── /playground/
│   ├── /token-explorer         # Interactive token browser
│   ├── /theme-builder          # Custom theme creator
│   └── /animation-lab          # Animation sandbox
│
└── /resources/
    ├── /downloads              # Asset downloads
    ├── /changelog              # Version history
    ├── /figma                  # Figma resources
    └── /contributing           # How to contribute
```

---

## Page Specifications

### Landing Page (/)

```
┌─────────────────────────────────────────────────────────────┐
│  [Logo]                    [Foundations] [Components] [↗]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                                                             │
│                    ╭─────────╮                              │
│                   │   ⌒ ⌒   │     ← Animated Ferni         │
│                    ╰─────────╯                              │
│                                                             │
│              Ferni Design System                            │
│                                                             │
│      Building emotional intelligence into every pixel.      │
│                                                             │
│        [Get Started]          [Explore Components]          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Colors   │  │ Motion   │  │ Personas │  │ Sound    │    │
│  │ 🎨       │  │ ✨       │  │ 🤝       │  │ 🎵       │    │
│  │ Explore  │  │ Explore  │  │ Explore  │  │ Explore  │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  "Better than human"                                        │
│                                                             │
│  [Micro-expressions] [Active Listening] [Breath Sync]       │
│                                                             │
│  See how Ferni creates emotional connection through design. │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Features**:
- Animated Ferni avatar (breathing, occasional blink)
- Smooth scroll sections
- Interactive foundation cards
- Ferni EQ showcase

### Color Explorer (/foundations/colors)

```
┌─────────────────────────────────────────────────────────────┐
│  ← Foundations        Colors                          [🔍]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Ferni's color system is built on warmth, earthiness,       │
│  and emotional resonance.                                   │
│                                                             │
├──────────────────────┬──────────────────────────────────────┤
│                      │                                      │
│  PERSONA COLORS      │  ╭────────────────────────────────╮  │
│                      │  │                                │  │
│  ○ Ferni   #4a6741   │  │        Live Preview            │  │
│  ○ Peter   #3a6b73   │  │                                │  │
│  ○ Alex    #5a6b8a   │  │     Text on background         │  │
│  ○ Maya    #a67a6a   │  │     Contrast ratio: 7.2:1 ✅   │  │
│  ○ Jordan  #c4856a   │  │                                │  │
│  ○ Nayan   #b8956a   │  │                                │  │
│                      │  ╰────────────────────────────────╯  │
│  SEMANTIC COLORS     │                                      │
│                      │  CSS Variable:                       │
│  ○ Success           │  var(--color-ferni)                  │
│  ○ Warning           │                                      │
│  ○ Error             │  [Copy CSS] [Copy Hex] [Copy RGB]    │
│                      │                                      │
└──────────────────────┴──────────────────────────────────────┘
```

**Features**:
- Click any color to see it applied
- Contrast ratio calculator
- Copy in multiple formats
- Export entire palette

### Component Page (e.g., /components/avatar)

```
┌─────────────────────────────────────────────────────────────┐
│  ← Components         Avatar                    [Source] [↗]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  The Avatar component brings Ferni and team to life with    │
│  Pixar-quality animation and emotional intelligence.        │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │                    LIVE PREVIEW                       │  │
│  │                                                       │  │
│  │                   ╭─────────╮                         │  │
│  │                  │   ⌒ ⌒   │                         │  │
│  │                   ╰─────────╯                         │  │
│  │                                                       │  │
│  │  [Ferni ▼]  [200px ▼]  [● Breathing]  [● Glow]       │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ## Usage                                                   │
│                                                             │
│  ```tsx                                                     │
│  import { Avatar } from '@ferni/react';                     │
│                                                             │
│  <Avatar                                                    │
│    persona="ferni"                                          │
│    size={200}                                               │
│    breathing                                                │
│    glow                                                     │
│  />                                                         │
│  ```                                                        │
│                                                             │
│  [React] [Vue] [Svelte] [Vanilla] [Swift] [Kotlin]          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ## Props                                                   │
│                                                             │
│  | Prop      | Type     | Default | Description           │ │
│  |-----------|----------|---------|----------------------- │ │
│  | persona   | string   | 'ferni' | Which team member     │ │
│  | size      | number   | 200     | Size in pixels        │ │
│  | breathing | boolean  | true    | Enable breathing      │ │
│  | glow      | boolean  | true    | Enable glow ring      │ │
│  | state     | string   | 'idle'  | idle/speaking/listen  │ │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ## States                                                  │
│                                                             │
│  [Idle] [Speaking] [Listening] [Celebrating] [Thinking]     │
│                                                             │
│  Click to see each state animated                           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ## Accessibility                                           │
│                                                             │
│  - Use `aria-label` to describe the persona                 │
│  - Respects `prefers-reduced-motion`                        │
│  - Glow provides visual indicator, not sole status signal   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Features**:
- Live interactive preview
- Props playground (change values, see results)
- Multi-framework code examples
- State demonstrations
- Accessibility checklist

### Animation Lab (/playground/animation-lab)

```
┌─────────────────────────────────────────────────────────────┐
│  Animation Lab                                    [Share]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │                    PREVIEW                            │  │
│  │                                                       │  │
│  │      ╭───────╮  ───────────────>  ╭───────╮          │  │
│  │     │        │                   │        │          │  │
│  │      ╰───────╯                    ╰───────╯          │  │
│  │                                                       │  │
│  │  [▶ Play] [⟲ Reset] [🐢 0.5x] [1x] [🐇 2x]           │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────┐  ┌──────────────────────────────────┐  │
│  │                 │  │                                  │  │
│  │  EASING CURVES  │  │  DURATION: [300ms ▼]             │  │
│  │                 │  │                                  │  │
│  │  ○ standard     │  │  EASING:                         │  │
│  │  ● spring       │  │  ┌────────────────────────────┐  │  │
│  │  ○ bounce       │  │  │                            │  │  │
│  │  ○ elastic      │  │  │      ╭────╮                │  │  │
│  │  ○ gentle       │  │  │     ╱      ╲               │  │  │
│  │  ○ custom...    │  │  │    ╱        ╲──────────    │  │  │
│  │                 │  │  │───╱                        │  │  │
│  │  PRESETS        │  │  └────────────────────────────┘  │  │
│  │                 │  │                                  │  │
│  │  ○ buttonPress  │  │  cubic-bezier(0.34, 1.56, 0.64, 1)│ │
│  │  ○ modalEnter   │  │                                  │  │
│  │  ○ celebration  │  │  [Copy CSS] [Copy JSON]          │  │
│  │                 │  │                                  │  │
│  └─────────────────┘  └──────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Features**:
- Interactive easing curve editor
- Drag control points
- Real-time preview
- Preset library
- Export to CSS/JSON
- Shareable URLs

---

## Technical Implementation

### Framework

**Astro** - Static site generation with islands of interactivity

```
Why Astro:
- Zero JS by default (fast)
- Islands architecture (interactive where needed)
- MDX support (docs in markdown)
- Great for documentation sites
```

### Project Structure

```
design-site/
├── src/
│   ├── components/
│   │   ├── Avatar.astro
│   │   ├── ColorPicker.tsx      # React island
│   │   ├── AnimationLab.tsx     # React island
│   │   ├── CodeBlock.astro
│   │   ├── PropsTable.astro
│   │   └── LivePreview.tsx      # React island
│   ├── layouts/
│   │   ├── DocsLayout.astro
│   │   ├── ComponentLayout.astro
│   │   └── PlaygroundLayout.astro
│   ├── pages/
│   │   ├── index.astro
│   │   ├── getting-started/
│   │   ├── foundations/
│   │   ├── components/
│   │   ├── patterns/
│   │   ├── animation/
│   │   ├── playground/
│   │   └── resources/
│   ├── content/
│   │   ├── components/
│   │   │   ├── avatar.mdx
│   │   │   ├── button.mdx
│   │   │   └── ...
│   │   └── foundations/
│   │       └── ...
│   └── styles/
│       └── global.css           # Uses design tokens
├── public/
│   ├── assets/
│   │   ├── sounds/
│   │   ├── icons/
│   │   └── images/
│   └── fonts/
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

### Key Dependencies

```json
{
  "dependencies": {
    "astro": "^4.x",
    "@astrojs/react": "^3.x",
    "@astrojs/mdx": "^2.x",
    "@astrojs/sitemap": "^3.x",
    "react": "^18.x",
    "shiki": "^1.x",
    "@ferni/design-tokens": "workspace:*"
  }
}
```

### Design Token Integration

```typescript
// Import tokens directly from design-system
import tokens from '@ferni/design-tokens';

// Use in components
const styles = {
  color: `var(--color-ferni)`,
  animation: `${tokens.duration.normal}ms ${tokens.easing.spring}`
};
```

---

## Content Strategy

### Documentation Standards

Every page should include:

1. **Introduction** - What it is, when to use it
2. **Live Example** - Interactive demonstration
3. **Usage Code** - Copy-paste ready
4. **Props/API** - Complete reference
5. **Variants** - Different configurations
6. **Accessibility** - A11y considerations
7. **Related** - Links to related content

### Writing Style

- **Second person** - "You can use..."
- **Active voice** - "Import the component"
- **Concise** - Short sentences, scannable
- **Friendly** - Warm but professional

---

## Search & Navigation

### Global Search (⌘K)

```
┌─────────────────────────────────────────────────────────────┐
│  🔍 Search documentation...                           ⌘K    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  COMPONENTS                                                 │
│  ├─ Avatar - Animated persona representation                │
│  ├─ Button - Interactive button component                   │
│  └─ Toast - Notification component                          │
│                                                             │
│  TOKENS                                                     │
│  ├─ --color-ferni - Primary brand color                     │
│  └─ --duration-normal - Standard animation duration         │
│                                                             │
│  PAGES                                                      │
│  └─ Animation Principles - 12 principles of animation       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Features**:
- Fuzzy search
- Recent searches
- Keyboard navigation
- Search tokens, components, and content

### Navigation

- **Left sidebar** - Section navigation
- **Right sidebar** - On-page table of contents
- **Breadcrumbs** - Location awareness
- **Prev/Next** - Linear navigation within section

---

## Performance Goals

| Metric | Target |
|--------|--------|
| Lighthouse Performance | >95 |
| First Contentful Paint | <1.0s |
| Time to Interactive | <2.0s |
| Total Blocking Time | <100ms |
| Cumulative Layout Shift | <0.1 |

---

## Launch Checklist

### MVP (v1.0)

- [ ] Landing page
- [ ] Getting started guide
- [ ] All foundation pages (colors, typography, spacing, motion)
- [ ] Core components (Avatar, Button, Toast, Dialog)
- [ ] Token explorer playground
- [ ] Mobile responsive
- [ ] Search functionality
- [ ] Deploy to design.ferni.ai

### V1.1

- [ ] All component pages
- [ ] Animation lab
- [ ] Theme builder
- [ ] Figma integration docs
- [ ] Contributing guide

### V1.2

- [ ] Multi-framework code examples
- [ ] API playground
- [ ] Community showcase
- [ ] Blog/updates section

---

## Deployment

### Hosting

**Firebase Hosting** (consistent with main app)

```bash
# Deploy command
firebase deploy --only hosting:design-system

# Preview
firebase hosting:channel:deploy preview-design
```

### CI/CD

```yaml
# .github/workflows/design-site.yml
name: Deploy Design System Site

on:
  push:
    paths:
      - 'design-system/**'
      - 'design-site/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm --filter design-site build
      - run: firebase deploy --only hosting:design-system
```

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Adoption | 100% of Ferni devs use it | Survey |
| Satisfaction | >4.5/5 | NPS survey |
| Search success | >80% find what they need | Analytics |
| Time to first component | <10 minutes | User testing |
| External interest | 10+ external visitors/day | Analytics |

---

**© 2026 Ferni. Documentation that inspires.**

*"The best documentation doesn't just tell you how. It shows you why."*
