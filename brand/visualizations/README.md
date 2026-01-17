# Ferni Visualization System

**World-class data storytelling** following the Better Than Human pattern.

> Pattern → Insight → Prompt → Action

## Quick Start

```html
<link rel="stylesheet" href="master-tokens.css">
<link rel="stylesheet" href="visualizations/components.css">
<link rel="stylesheet" href="visualizations/animations.css">

<script type="module">
  import FerniViz from './visualizations/viz-system.js';
  FerniViz.init();
</script>
```

## Architecture

```
viz-system.js        ← Unified entry point (import this)
├── tooltips.js      ← Interactive data tooltips
├── animations.js    ← Scroll reveals, chart animations, micro-interactions
├── progressive-disclosure.js  ← 4-level detail control
├── comparison-mode.js         ← 5 comparison view modes
├── icons.js         ← 50+ SVG icons (safe DOM methods)
└── export-share.js  ← PNG/SVG/PDF export, social sharing
```

## Modules

### Tooltips (`tooltips.js`)
Interactive tooltips for data storytelling with smart positioning.

```javascript
// Automatic via data attributes
<div data-tooltip="This is insightful!" data-tooltip-position="top">
  Hover me
</div>

// Programmatic
FerniViz.tooltips.attach(element, {
  title: 'Weekly Progress',
  value: '85%',
  insight: 'You\'re ahead of schedule!'
});
```

### Animations (`animations.js`)
Pixar-quality motion with spring physics.

```javascript
// Scroll reveal (automatic for .viz-reveal elements)
<div class="viz-reveal">Content appears on scroll</div>

// Chart animations
FerniViz.animations.animateBarChart(container, {
  direction: 'up',
  stagger: 80,
  duration: 600
});

// Micro-interactions
FerniViz.animations.playMicroInteraction(button, 'success');
```

### Progressive Disclosure (`progressive-disclosure.js`)
4 levels of detail: Summary → Standard → Detailed → Expert

```javascript
// Data attributes
<div data-disclosure="detailed">
  Only visible at detailed or expert level
</div>

// Programmatic
FerniViz.disclosure.setGlobalLevel('expert');
```

### Comparison Mode (`comparison-mode.js`)
5 comparison modes: Single, Side-by-side, Overlay, Difference, Slider

```javascript
// Activate comparison
FerniViz.comparison.setComparisonMode('slider');

// Data attributes for sync
<div data-dataset="before" data-sync-id="my-comparison">Before</div>
<div data-dataset="after" data-sync-id="my-comparison">After</div>
```

### Icons (`icons.js`)
50+ SVG icons using safe DOM methods (no innerHTML).

```javascript
// Create icon
const icon = FerniViz.icons.createIcon('heart', { size: 24 });

// Auto-hydrate
<span data-icon="ferni"></span>
```

Available icons: `expand`, `collapse`, `share`, `download`, `copy`, `heart`, `star`, `calendar`, `clock`, `trendUp`, `trendDown`, `barChart`, `pieChart`, `lineChart`, `ferni`, `maya`, `peter`, `jordan`, `alex`, `nayan`, `kintsugi`, and more.

### Export/Share (`export-share.js`)
Export visualizations and share to social platforms.

```javascript
// Export
await FerniViz.exportShare.exportVisualization(element, {
  format: 'png',
  filename: 'my-chart'
});

// Share
await FerniViz.exportShare.shareVisualization(element, {
  platform: 'native',  // Uses Web Share API
  title: 'My Progress'
});

// Quick action
FerniViz.makeShareable(element);  // Adds share button
```

## CSS Classes

### Components (`components.css`)
- `.action-panel` - BTH action panel (Pattern → Insight → Prompt → Action)
- `.action-btn` / `.action-btn-secondary` - Styled buttons
- `.viz-card` - Elevated visualization container
- `.kintsugi-highlight` - Golden accent for breakthroughs

### Animations (`animations.css`)
- `.viz-reveal` - Scroll-triggered reveal animation
- `.chart-bar` - Animated bar chart bars
- `.chart-segment` - Animated pie chart segments
- `.pulse-glow` - Gentle attention pulse

## Design Tokens

All styles inherit from `master-tokens.css`:

| Token | Usage |
|-------|-------|
| `--color-ferni` | Primary brand green |
| `--kintsugi-gold` | Highlight/breakthrough accent |
| `--duration-fast` | 150ms animations |
| `--duration-normal` | 300ms animations |
| `--easing-spring` | Organic spring motion |

## Validation

```javascript
// Run system validation
FerniViz.printValidation();

// Returns check results for:
// - CSS variables defined
// - Required elements present
// - Browser support
// - Accessibility issues
```

## Demo

Open `demo-interactive.html` for a live demonstration of all systems.

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Graceful degradation for older browsers
- Respects `prefers-reduced-motion`

## Philosophy

Built following the **Better Than Human** framework:
1. **Pattern** - Surface data patterns humans might miss
2. **Insight** - Provide actionable understanding
3. **Prompt** - Guide next steps with warmth
4. **Action** - Enable immediate response

Every visualization should leave users feeling more capable, not overwhelmed.
