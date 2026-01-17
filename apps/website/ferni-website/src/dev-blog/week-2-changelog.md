---
title: "Week 2 Changelog: Design System Overhaul, Graph RAG, and React Components"
excerpt: "A major release featuring 8 new design token files, complete memory system refactor with Spanner Graph, and the first React component library stories."
author: "Ferni Dev Team"
authorInitials: "FD"
authorColor: "#4a6741"
date: 2026-01-18
category: "Changelog"
image: "week-2-changelog.png"
readTime: 12
---

**This week was massive.** We shipped a comprehensive design system overhaul, rebuilt the memory architecture from the ground up, and launched the first React component library. Here's everything that landed.

## TL;DR

- **Design System**: 8 new token files including emotional colors, typography, and visualization tokens
- **Memory System**: Complete L1/L2/L3 architecture with Spanner Graph for relationship queries  
- **React Components**: 6 Storybook stories for Avatar, Button, Dialog, Toast, Waveform, and Celebration

---

## Design System Overhaul

The design system received its biggest update since launch. We've moved from a flat token structure to a comprehensive, emotionally-aware system.

### New Token Files

| File | Purpose | Tokens |
|------|---------|--------|
| `color-emotional.json` | Emotion-mapped color scales | 319 tokens |
| `typography-emotional.json` | Voice-appropriate type styles | 288 tokens |
| `visualizations.json` | Data viz color schemes | 668 tokens |
| `states.json` | Interactive state management | 255 tokens |
| `icons.json` | Icon system guidelines | 330 tokens |
| `shape.json` | Border radius, shadows, depth | 402 tokens |
| `components-extended.json` | Complex component tokens | 1,051 tokens |
| `effects.json` | Blur, glow, chromatic effects | 23 tokens |

### Animation Choreography

New documentation for sequencing animations across components. The `animation.json` file grew from 200 to 781 tokens, adding:

- **Stagger patterns** for list animations
- **Entrance sequences** with anticipation curves
- **Exit choreography** that respects attention
- **Emotion-specific timing** (celebration vs. concern)

### Dark Theme WCAG Fixes

Fixed circular CSS variable references and contrast issues in Cedar Night theme. All text now meets WCAG AA standards (4.5:1 contrast ratio).

```css
/* Before: Broken circular reference */
--color-text-primary: var(--color-text-primary);

/* After: Proper token chain */
--color-text-primary: #faf6f0; /* 5.56:1 on #70605a */
```

---

## Memory System: Complete Refactor

The memory system was rebuilt with a three-layer architecture designed for "Better Than Human" memory capabilities.

### L1/L2/L3 Architecture

```
User Speech → fastCapture() → STM Buffer (L1) → onSessionEnd() → Firestore (L2)
                                   │                                    │
                                   └→ AsyncEvents → DeepExtraction ─────┤
                                                                        │
                                                  Background Sync ──────┤
                                                                        ↓
                                                              Spanner Graph (L3)
```

| Layer | Storage | Latency | Purpose |
|-------|---------|---------|---------|
| **L1: STM** | In-memory | < 1ms | Current session context |
| **L2: Working** | Firestore | 50-150ms | Recent entities, facts |
| **L3: Long-Term** | Spanner | 100-200ms | Relationship graph |

### Spanner Graph Integration

New graph database layer for relationship queries. Enables questions like:

- "Who did I mention last time we talked about the project?"
- "What patterns do I have around Sunday evenings?"
- "When did I last update my goals?"

```typescript
// Query relationships across time
const relationships = await spannerGraph.query({
  from: { type: 'person', name: 'Sarah' },
  relationship: 'mentioned_with',
  depth: 2,
  timeRange: { days: 30 }
});
```

### New Memory Modules

| Module | Purpose |
|--------|---------|
| `hybrid-continuity-retrieval.ts` | Blends recent + semantic + graph results |
| `recall-attribution.ts` | Tracks when memories are used |
| `semantic-memory-search.ts` | Vector similarity across all memory |
| `memory-feedback.ts` | Learn from user corrections |
| `memory-lifecycle.ts` | TTL management, promotion rules |

---

## React Component Library

The first 6 React components are now in Storybook with full documentation.

### Available Components

| Component | Stories | Status |
|-----------|---------|--------|
| `Avatar` | Default, Personas, Animated | Complete |
| `Button` | Primary, Secondary, Ghost, Loading | Complete |
| `Dialog` | Standard, Confirmation, Form | Complete |
| `Toast` | Success, Error, Info, Warning | Complete |
| `Waveform` | Static, Animated, Persona-colored | Complete |
| `Celebration` | Confetti, Glow, Particles | Complete |

### Usage

```tsx
import { Avatar, Button, Toast } from '@ferni/design-system/react';

function MyComponent() {
  return (
    <div>
      <Avatar persona="ferni" size="lg" animated />
      <Button variant="primary" onClick={handleClick}>
        Get Started
      </Button>
      <Toast type="success" message="Saved!" />
    </div>
  );
}
```

View the full Storybook at [design.ferni.ai](https://design.ferni.ai).

---

## Brand Strategy Updates

### Micro-Interactions Demo

New interactive demo page showcasing Ferni's micro-interaction patterns:

- Hover states with magnetic cursor
- Button press animations
- Loading state choreography
- Success celebrations

### Visualization System

Comprehensive plan for "Better Than Human" data visualizations:

- Emotional color mapping for data
- Animation principles for charts
- Accessibility requirements
- Persona-specific styling

### Developer Blog 365-Day Plan

Complete content calendar for the developer blog with:

- Weekly themes (Authentication, Performance, Integrations, etc.)
- Post templates for tutorials, deep dives, quick tips
- Community spotlight rotation
- Release changelog automation

---

## Infrastructure Improvements

### Better Than Human Validation

New API routes for validating BTH capabilities:

```bash
GET /api/bth/validate/memory
GET /api/bth/validate/presence
GET /api/bth/validate/anticipation
```

### Build Optimizations

- Fixed Kaniko cache issues with stale dist folders
- Resolved circular import crashes in memory module
- Added missing exports for dynamic memory

### CI/CD

- Migrated all workflows from npm to pnpm (4x faster installs)
- Fixed Node memory issues in GitHub Actions
- Added proper GCR authentication for buildx

---

## Bug Fixes

- Fixed dark theme circular CSS variables
- Fixed button text contrast in Cedar Night theme  
- Added missing `ceo-coaching` domain to tool loader
- Fixed WCAG contrast issues across all text tokens
- Resolved memory module circular import crash

---

## What's Next

Week 3 focuses on:

1. **Testing Infrastructure** - Synthetic test suite for voice interactions
2. **Production Deployment** - Blue-green deployment patterns
3. **Monitoring** - Call quality dashboards and alerting

---

## Commits This Week

```
feat(design-system): comprehensive color token overhaul
feat(design-system): add chromatic effect tokens
feat(memory): Complete dynamic memory system - L1/L2/L3 architecture
feat(memory): Clean architecture refactor with Memory facade
feat(memory): Add performance optimizations and migration guide
feat(bth): Complete Better Than Human remediation plan
feat(bth): Register BTH validation routes in API server
feat(website): Pixel-perfect brand polish across 8 pages
feat(developers-portal): add developer platform v2 with brand compliance
feat(admin): add daily visitor & caller report
feat(voice-agent): enable OpenAI Realtime API in production
fix(website): Fix dark theme circular variables and WCAG contrast
fix(memory): Make getKnowledgeGraph lazy export to avoid circular import
```

---

Questions? Join us on [Discord](https://discord.gg/ferni) or reach out on [Twitter](https://twitter.com/ferni_ai).
