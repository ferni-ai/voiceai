# 📊 Ferni Data Visualization Language
## Trust Journey Visual Design System

**Version 1.0 | December 2024**

---

> *"The greatest value of a picture is when it forces us to notice what we never expected to see."*  
> — John Tukey

---

# Table of Contents

1. [Philosophy](#1-philosophy)
2. [Visual Principles](#2-visual-principles)
3. [Relationship Health Visualization](#3-relationship-health-visualization)
4. [Growth Timeline](#4-growth-timeline)
5. [Emotion Mapping](#5-emotion-mapping)
6. [Progress Indicators](#6-progress-indicators)
7. [Milestone Markers](#7-milestone-markers)
8. [Color in Data](#8-color-in-data)
9. [Animation in Data](#9-animation-in-data)
10. [Accessibility](#10-accessibility)
11. [Implementation](#11-implementation)

---

# 1. Philosophy

## Emotional Data Design

Ferni's data visualizations are different. We're not showing cold metrics—we're visualizing a **relationship**. The data should feel:

### Warm, Not Clinical
```
❌ "You've had 47 conversations with an average duration of 12.3 minutes."
✅ "47 conversations. That's real connection."
```

### Encouraging, Not Judgmental
```
❌ A red downward arrow showing "engagement dropped 23%"
✅ A gentle wave showing "a quieter week—that's okay"
```

### Personal, Not Generic
```
❌ Standard bar charts and pie graphs
✅ Custom visualizations that feel like Ferni
```

---

## Core Principles

| Principle | Description |
|-----------|-------------|
| **Never show decline as failure** | Quieter periods are "natural rhythm" |
| **Boundaries are protected spaces** | Not walls, not barriers |
| **Growth is gentle curves** | Never aggressive spikes |
| **Color intensity = emotional significance** | Not just data magnitude |
| **Less is more** | Show what matters, hide what doesn't |

---

# 2. Visual Principles

## 2.1 Shape Language

| Data Type | Shape | Rationale |
|-----------|-------|-----------|
| **Progress** | Arc/Ring | Journey, completion |
| **Growth** | Soft curve | Organic development |
| **Milestones** | Dots/circles | Moments in time |
| **Boundaries** | Dashed enclosure | Protected, not blocked |
| **Connection** | Flowing lines | Relationship threads |
| **Wins** | Star bursts | Celebration moments |

## 2.2 Grid System

All data visualizations use the same underlying grid:

```
┌─────────────────────────────────────┐
│  Margin (16px)                      │
│  ┌─────────────────────────────┐   │
│  │  Chart Area                  │   │
│  │  8px grid for positioning    │   │
│  │                              │   │
│  │  Labels: Inter, 12px         │   │
│  │  Values: Plus Jakarta, 14px  │   │
│  │                              │   │
│  └─────────────────────────────┘   │
│  Legend/Labels Area                 │
└─────────────────────────────────────┘
```

## 2.3 Typography in Data

| Element | Font | Size | Weight |
|---------|------|------|--------|
| **Large numbers** | Plus Jakarta Sans | 32-48px | 700 |
| **Labels** | Inter | 12px | 500 |
| **Annotations** | Inter | 11px | 400 |
| **Axis labels** | Inter | 10px | 500 |

---

# 3. Relationship Health Visualization

## 3.1 The Relationship Ring

The primary visualization for overall relationship health.

```
         ╭───────────────╮
       ╱                   ╲
      │    ┌─────────┐     │
      │    │  Score  │     │ ← Fill indicates health
      │    │   72    │     │
      │    │ Growing │     │ ← Status text
      │    └─────────┘     │
       ╲                   ╱
         ╰───────────────╯
```

### Ring Specifications

| Score Range | Fill Color | Status Text |
|-------------|------------|-------------|
| 0-20 | `--color-text-dimmed` | "Getting started" |
| 21-40 | Persona 20% opacity | "Building" |
| 41-60 | Persona 40% opacity | "Growing" |
| 61-80 | Persona 60% opacity | "Established" |
| 81-100 | Persona full | "Flourishing" |

### CSS Implementation

```css
.relationship-ring {
  --score: 72; /* 0-100 */
  --ring-size: 200px;
  --ring-width: 12px;
  
  width: var(--ring-size);
  height: var(--ring-size);
  border-radius: 50%;
  
  background: conic-gradient(
    from 0deg,
    var(--persona-secondary) 0%,
    var(--persona-primary) calc(var(--score) * 1%),
    var(--color-bg-secondary) calc(var(--score) * 1%)
  );
  
  /* Inner cutout */
  mask: radial-gradient(
    transparent calc(50% - var(--ring-width)),
    black calc(50% - var(--ring-width))
  );
}
```

### Animation

```css
@keyframes ring-fill {
  from { --score: 0; }
  to { --score: var(--target-score); }
}

.relationship-ring {
  animation: ring-fill 1.5s var(--ease-expo-out) forwards;
}
```

---

## 3.2 Health Factors Breakdown

Smaller rings showing individual factors:

```
┌─────────────────────────────────────┐
│                                     │
│  ○ Boundary Respect    ██████░ 85  │
│  ○ Emotional Attunement ████░░░ 68  │
│  ○ Growth Acknowledgment █████░░ 75  │
│  ○ Callback Success     ███░░░░ 52  │
│  ○ Session Depth        ██████░ 82  │
│                                     │
└─────────────────────────────────────┘
```

### Mini Ring Specifications

- **Size:** 24px diameter
- **Stroke:** 4px
- **Color:** Persona primary at score opacity
- **Background:** `--color-bg-secondary`

---

# 4. Growth Timeline

## 4.1 Timeline Visualization

Shows the journey over time with key moments marked.

```
Now ●━━━━━○━━━━━○━━━━━●━━━━━○━━━━━● Start
    │      │      │      │      │
    │      │      │      │      └─ First conversation
    │      │      │      └─ First win celebrated
    │      │      └─ Building Trust stage
    │      └─ First callback landed
    └─ Today
```

### Timeline Elements

| Element | Visual | Color |
|---------|--------|-------|
| **Today** | Large filled circle | Persona primary |
| **Milestone** | Medium filled circle | Warm amber |
| **Regular session** | Small dot | Text muted |
| **Timeline path** | Continuous line | Border medium |
| **Growth moment** | Upward bump | Success green |
| **Boundary set** | Dashed marker | Protected, subtle |

### Timeline Implementation

```typescript
interface TimelinePoint {
  date: Date;
  type: 'milestone' | 'session' | 'growth' | 'boundary';
  label?: string;
  magnitude?: number; // For sizing
}

interface TimelineConfig {
  width: number;
  height: number;
  padding: number;
  pointSizes: {
    milestone: number;  // 12px
    session: number;    // 4px
    growth: number;     // 8px
    boundary: number;   // 6px
  };
}
```

---

## 4.2 Growth Curve

Shows emotional/growth trajectory over time.

```
                    ╱╲
              ╱╲   ╱  ╲
         ╱╲  ╱  ╲ ╱    ╲
    ╱╲  ╱  ╲╱    ╲      ╲───
───╱  ╲╱                    
   │   │   │   │   │   │
  Jan Feb Mar Apr May Jun
```

### Curve Rules

1. **Always show upward trend** — Even if flat, never downward
2. **Smooth the data** — No jarring spikes
3. **Mark significant moments** — Dots on key points
4. **Use area fill** — Gentle gradient from line to bottom
5. **Never show negative space** — Curve never goes below baseline

### Curve Styling

```css
.growth-curve-area {
  fill: linear-gradient(
    to bottom,
    var(--persona-primary-20) 0%,
    transparent 100%
  );
}

.growth-curve-line {
  stroke: var(--persona-primary);
  stroke-width: 2px;
  stroke-linecap: round;
  fill: none;
}

.growth-curve-point {
  fill: var(--persona-primary);
  r: 4px;
}
```

---

# 5. Emotion Mapping

## 5.1 Sentiment Timeline

Visualizes emotional journey with appropriate warmth.

```
Joy      ●   ●       ●       ●
         │   │       │       │
Neutral ─┼───┼───●───┼───●───┼──
         │   │   │   │   │   │
Low     ─┼───┼───┼───┼───┼───┼──
        Mon Tue Wed Thu Fri Sat
```

### Emotion Color Mapping

| Emotion | Color | Representation |
|---------|-------|----------------|
| **Joy** | Warm Amber | Circle, upper |
| **Calm** | Persona primary | Circle, middle |
| **Thoughtful** | Ocean teal | Circle, middle |
| **Struggling** | Terracotta | Circle, lower |
| **Neutral** | Text secondary | Small dot |

### Important: No "Negative" Visualization

We never show emotions as "bad" or "failing":

```
❌ Red zone for sadness
✅ Warmer color for harder times (terracotta = support needed)

❌ Downward arrow
✅ Horizontal or gentle curve

❌ "Low score" 
✅ "Quieter period"
```

---

## 5.2 Emotion Distribution

Pie/donut showing emotion breakdown, but warmer:

```
      ╭─────────────────╮
    ╱    Joy (35%)       ╲
   │   ┌───────────┐     │
   │   │  Feeling  │     │
   │   │   Good    │     │
   │   └───────────┘     │
    ╲    Calm (45%)      ╱
      ╰─────────────────╯
        Thoughtful (20%)
```

### Distribution Rules

- **No more than 4 segments** — Simplify if more
- **Dominant emotion labeled** — In center
- **Warm colors only** — Even for struggle
- **No "other" category** — Either show it or don't

---

# 6. Progress Indicators

## 6.1 Stage Progress

Shows progress toward next relationship stage.

```
Getting Started → Building Trust → Established → Deep Partnership

[█████████░░░░░░░░░░] 
      65% to Building Trust
      3 more days · 2 more conversations
```

### Progress Bar Styling

```css
.stage-progress {
  height: 8px;
  border-radius: 4px;
  background: var(--color-bg-secondary);
  overflow: hidden;
}

.stage-progress-fill {
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    var(--persona-secondary) 0%,
    var(--persona-primary) 100%
  );
  transition: width 800ms var(--ease-expo-out);
}
```

---

## 6.2 Streak Indicators

Shows consistency streaks.

```
┌───────────────────────────────────┐
│  🔥 7 Day Streak                  │
│                                   │
│  ● ● ● ● ● ● ●   ○ ○ ○ ○ ○ ○ ○   │
│  M T W T F S S   M T W T F S S   │
│                                   │
│  This week        Last week       │
└───────────────────────────────────┘
```

### Streak Dot States

| State | Visual | Color |
|-------|--------|-------|
| **Completed** | Filled circle | Persona primary |
| **Today** | Filled + ring | Persona primary + glow |
| **Upcoming** | Hollow circle | Border medium |
| **Missed** | No dot | (Don't show) |

**Note:** We never show "missed" days — only completed and upcoming.

---

# 7. Milestone Markers

## 7.1 Milestone Types

| Type | Icon/Shape | Color |
|------|-----------|-------|
| **First conversation** | Circle | Persona |
| **Stage up** | Star | Warm amber |
| **Win celebrated** | Sparkle | Success |
| **Breakthrough** | Burst | Persona + glow |
| **Callback landed** | Heart | Terracotta |
| **Boundary set** | Shield (gentle) | Protected |

## 7.2 Milestone Cards

```
┌─────────────────────────────────────┐
│  ✦ Relationship Milestone          │
│                                     │
│  "Building Trust"                   │
│  March 15, 2024                     │
│                                     │
│  After 7 conversations and 3 weeks, │
│  you've reached a new stage.        │
│                                     │
└─────────────────────────────────────┘
```

---

# 8. Color in Data

## 8.1 Semantic Data Colors

| Meaning | Color | CSS Variable |
|---------|-------|--------------|
| **Progress/Growth** | Persona Primary | `--persona-primary` |
| **Achievement** | Warm Amber | `--color-highlight` |
| **Positive** | Success Green | `--color-success` |
| **Support needed** | Terracotta | `--color-maya` |
| **Neutral** | Text Secondary | `--color-text-secondary` |
| **Background** | BG Secondary | `--color-bg-secondary` |

## 8.2 Never Use

❌ Red for "bad"  
❌ Gray for "empty"  
❌ Bright saturated colors  
❌ More than 4 colors in one visualization  

## 8.3 Opacity as Data

Use opacity to indicate magnitude without changing hue:

```css
/* Lower engagement */
.data-point[data-magnitude="low"] {
  opacity: 0.4;
}

/* Medium engagement */
.data-point[data-magnitude="medium"] {
  opacity: 0.7;
}

/* High engagement */
.data-point[data-magnitude="high"] {
  opacity: 1;
}
```

---

# 9. Animation in Data

## 9.1 When to Animate

✅ **DO animate:**
- Initial data load
- Score increases
- Milestone achievements
- User interaction feedback

❌ **DON'T animate:**
- Every data update
- Score decreases (just transition smoothly)
- Background data refreshes
- When user has reduced motion preference

## 9.2 Animation Patterns

### Number Count-Up
```typescript
function countUp(element: HTMLElement, from: number, to: number) {
  const duration = 1500;
  const start = performance.now();
  
  const tick = (now: number) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // Ease out
    
    element.textContent = Math.round(from + (to - from) * eased).toString();
    
    if (progress < 1) requestAnimationFrame(tick);
  };
  
  requestAnimationFrame(tick);
}
```

### Ring Fill
```css
@keyframes ring-fill {
  from {
    stroke-dashoffset: var(--circumference);
  }
  to {
    stroke-dashoffset: calc(
      var(--circumference) * (1 - var(--score) / 100)
    );
  }
}

.ring-progress {
  animation: ring-fill 1.2s var(--ease-expo-out) forwards;
}
```

### Celebration Burst
```css
@keyframes milestone-burst {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  50% {
    transform: scale(1.2);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
```

---

# 10. Accessibility

## 10.1 Color Independence

Data must be understandable without color:

```
✅ Use patterns in addition to color
✅ Include text labels
✅ Provide data tables as alternative
✅ Ensure 4.5:1 contrast for text
```

## 10.2 Screen Reader Support

```html
<!-- Ring with ARIA -->
<div 
  class="relationship-ring"
  role="progressbar"
  aria-valuenow="72"
  aria-valuemin="0"
  aria-valuemax="100"
  aria-label="Relationship health: 72 out of 100, status: Growing"
>
  <span class="sr-only">72 out of 100</span>
  <span class="visible-score">72</span>
</div>
```

## 10.3 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  .ring-progress,
  .growth-curve,
  .milestone-marker {
    animation: none;
    transition: none;
  }
}
```

---

# 11. Implementation

## 11.1 Component Library

```typescript
// Available visualization components
import {
  RelationshipRing,
  GrowthTimeline,
  StreakIndicator,
  EmotionChart,
  MilestoneCard,
  ProgressBar,
  StatsGrid,
} from '@ferni/data-viz';
```

## 11.2 Usage Example

```tsx
<RelationshipRing 
  score={72}
  status="Growing"
  persona="ferni"
  animated={true}
/>

<GrowthTimeline
  data={timelineData}
  range="6months"
  showMilestones={true}
/>

<StreakIndicator
  current={7}
  goal={21}
  showWeeks={2}
/>
```

## 11.3 Data Format

```typescript
interface TrustVisualizationData {
  overallScore: number;
  status: 'building' | 'growing' | 'established' | 'flourishing';
  factors: {
    boundaryRespect: number;
    emotionalAttunement: number;
    growthAcknowledgment: number;
    callbackSuccess: number;
    sessionDepth: number;
  };
  timeline: TimelinePoint[];
  milestones: Milestone[];
  streak: {
    current: number;
    longest: number;
  };
}
```

---

# Appendix: Quick Reference

## Visualization Types

| Type | Use Case | Primary Color |
|------|----------|---------------|
| Ring | Overall health | Persona |
| Timeline | Journey | Persona |
| Streak | Consistency | Persona |
| Progress | Stage | Persona gradient |
| Emotion | Sentiment | Multi-persona |
| Milestone | Achievement | Warm amber |

## Animation Durations

| Animation | Duration | Easing |
|-----------|----------|--------|
| Ring fill | 1200ms | expo-out |
| Count up | 1500ms | cubic ease-out |
| Milestone | 800ms | spring |
| Progress | 800ms | expo-out |

## Accessibility Checklist

- [ ] Works without color
- [ ] Text labels present
- [ ] ARIA attributes set
- [ ] Reduced motion supported
- [ ] Contrast ratios pass
- [ ] Data table alternative

---

**© 2024 Ferni. All rights reserved.**

*Data tells a story. Our story is one of growth, connection, and care.*

