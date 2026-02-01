# Ferni Visualizations System

> **Principle**: Every pixel must earn its place. Show the data, not the chrome.

This visualization system implements world-class data visualization inspired by Edward Tufte, Giorgia Lupi, Nadieh Bremer, and other masters.

## Brand Requirements (Mandatory)

### Colors
```typescript
// ✅ ALWAYS use CSS variables
fill: 'var(--viz-mood-calm)'
stroke: 'var(--color-accent)'
color: 'var(--persona-maya)'

// ❌ NEVER hardcode hex values
fill: '#4a6741'  // WRONG - fails brand:check
stroke: 'rgb(74, 103, 65)'  // WRONG
```

**Visualization Color Variables:**
| Variable | Usage |
|----------|-------|
| `--viz-mood-*` | Mood types (calm, joyful, anxious, etc.) |
| `--viz-sparkline-*` | Sparkline/lifeline colors |
| `--viz-trend-*` | Trend direction colors |
| `--viz-text-*` | Text within visualizations |
| `--viz-border-*` | Borders and separators |

### Spacing (MA System)
```typescript
// ✅ Use spacing tokens
gap: 'var(--viz-space-xs)'
margin: 'var(--viz-space-pause)'
padding: 'var(--space-ma-4)'

// ❌ Never hardcode
padding: '16px'  // WRONG
gap: '8px'       // WRONG
```

### Animation
```typescript
import { DURATION, EASING } from 'animation-constants.generated';

// ✅ Use animation constants
transition: `transform ${DURATION.SLOW}ms ${EASING.SPRING}`

// ❌ Never hardcode
transition: 'transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1)'  // WRONG
```

### Typography
```typescript
// ✅ Use font variables
fontSize: 'var(--viz-font-size-sm)'
fontWeight: 'var(--viz-font-weight-medium)'
fontFamily: 'var(--font-body)'

// ❌ Never hardcode
fontSize: '14px'  // WRONG
fontFamily: 'Inter'  // WRONG
```

---

## Tufte Principles (Required Knowledge)

### 1. Data-Ink Ratio
Maximize the ratio of ink used to show data vs. total ink.

```typescript
import { analyzeDataInk, TUFTE_STRICT } from './builders/data-ink-optimizer.js';

// Analyze any SVG for data-ink ratio
const analysis = analyzeDataInk(svgElement, TUFTE_STRICT);
if (analysis.score < 0.8) {
  console.warn('Low data-ink ratio:', analysis.suggestions);
}
```

### 2. No Chartjunk
Remove decorative elements that don't encode data:
- ❌ Decorative gridlines
- ❌ 3D effects
- ❌ Drop shadows on data points
- ❌ Excessive borders
- ❌ Rainbow gradients
- ❌ Unnecessary animations

### 3. Direct Labeling
Label data directly instead of using legends:
```typescript
// ❌ Legend (requires eye movement)
<Legend items={[{ color: 'blue', label: 'Sales' }]} />

// ✅ Direct label (Tufte approved)
<text x={lastPoint.x} y={lastPoint.y}>Sales</text>
```

### 4. Small Multiples
Compare patterns across time/categories:
```typescript
// Render same visualization multiple times for comparison
renderSmallMultiples(container, [weekData, lastWeekData, monthData], {
  sharedScale: true,  // Same scale for honest comparison
  annotations: 'minimal',
});
```

### 5. Lie Factor
Graphics must not distort data:
```typescript
import { calculateLieFactor, isDistorted } from './builders/data-ink-optimizer.js';

const lieFactor = calculateLieFactor(graphicChange, dataChange);
if (isDistorted(lieFactor)) {
  // Fix your visualization - it's lying!
}
```

---

## Emotional Data Art (Lupi-Inspired)

### Imperfection = Humanity
Add subtle randomness for hand-drawn feel:
```typescript
// Slight variation makes data feel human
const jitter = (Math.random() - 0.5) * 2; // ±1px
point.x += jitter;
point.y += jitter;
```

### Color Encodes Emotion
```typescript
const EMOTION_COLORS = {
  calm: 'var(--viz-mood-calm)',      // Cool blues
  joyful: 'var(--viz-mood-joyful)',  // Warm yellows
  anxious: 'var(--viz-mood-anxious)', // Tense reds
  // ...
};
```

### Size Encodes Intensity
```typescript
// Intensity 0-1 maps to visual size
const radius = 4 + intensity * 12;  // 4-16px range
```

### Show Patterns as They Form
Don't wait for complete data - surface emerging patterns:
```typescript
import { detectEmergingPattern } from './living-data/emotional-encoding.js';

const pattern = detectEmergingPattern(recentData, windowSize);
if (pattern?.confidence > 0.7) {
  highlightEmergingPattern(pattern);
}
```

---

## Device Adaptation

Every builder must support all device types:

| Device | Constraints | Adaptations |
|--------|-------------|-------------|
| **Watch** | 38-44mm, no hover | Ultra-compact, no labels, large touch targets |
| **Mobile** | 320-428px, touch | Swipe gestures, 44px min touch targets |
| **Tablet** | 768-1024px | Hover states, moderate detail |
| **Desktop** | 1024px+ | Full features, keyboard navigation |
| **TV** | 1920px+, remote | Large type, simple navigation |

```typescript
export function buildVisualization(
  container: HTMLElement,
  data: VisualizationData,
  context: DeviceContext  // Always receive device context
): VisualizationResult {
  switch (context.type) {
    case 'watch': return buildWatch(container, data, context);
    case 'mobile': return buildMobile(container, data, context);
    // ...
  }
}
```

---

## Builder Pattern

All visualization builders follow this signature:

```typescript
/**
 * Build [VisualizationName] visualization.
 */
export function build[Name](
  container: HTMLElement,
  data: [DataType],
  context: DeviceContext,
  options?: Partial<[OptionsType]>
): VisualizationResult {
  // 1. Clear container
  container.replaceChildren();

  // 2. Route to device-specific builder
  switch (context.type) {
    case 'watch': return buildWatch(container, data, context, opts);
    // ...
  }

  // 3. Return result with destroy/update methods
  return {
    type: 'svg' | 'canvas' | 'html',
    destroy: () => container.replaceChildren(),
    update: (newData) => build[Name](container, newData, context, options),
  };
}
```

---

## File Structure

```
visualizations/
├── CLAUDE.md              # This file
├── index.ts               # Main exports
├── types.ts               # Shared types (469 lines)
├── builders/              # Visualization builders
│   ├── index.ts           # Re-exports all builders
│   ├── mood-calendar.ts   # Emotional rhythm heatmap
│   ├── burnout-gauge.ts   # Capacity gauge
│   ├── life-timeline.ts   # Life chapters
│   ├── growth-radar.ts    # Growth areas radar
│   ├── emotional-arcs.ts  # Emotion trajectories
│   ├── predictions.ts     # AI predictions
│   ├── relationship-network.ts  # People connections
│   ├── open-loops.ts      # Unfinished items
│   ├── energy-rings.ts    # Energy levels
│   ├── sparkline-lifeline.ts   # Tufte sparklines
│   ├── micro-trend.ts     # Ultra-compact trends
│   ├── data-ink-optimizer.ts   # Tufte analysis
│   ├── actions-taken.ts   # Actions taken visualization
│   ├── celebration-wheel.ts # Celebration wheel
│   ├── energy-wave.ts     # Energy wave visualization
│   └── social-battery.ts  # Social battery gauge
├── api/                   # Data fetching
│   ├── index.ts           # API exports
│   ├── demo-data.ts       # Demo/mock data
│   ├── firestore-fetcher.ts # Firestore data fetching
│   └── insights-client.ts # Insights API client
├── native/                # Native platform renderers
│   ├── index.ts           # Native exports
│   ├── swift-types.ts     # iOS Swift type mappings
│   └── kotlin-types.ts    # Android Kotlin type mappings
├── utils/
│   └── dom.ts             # Safe DOM helpers
├── adapters/              # Platform adapters
├── styles/                # CSS modules
└── swift/                 # iOS native renderers
```

---

## Adding a New Visualization

1. **Create the builder file** in `builders/`:
   ```bash
   touch builders/my-visualization.ts
   ```

2. **Define types** (inline or in types.ts):
   ```typescript
   export interface MyVisualizationData {
     // ...
   }
   ```

3. **Implement device-specific builders**:
   - `buildWatch()` - Ultra-compact
   - `buildMobile()` - Touch-optimized
   - `buildDesktop()` - Full features

4. **Export from index.ts**:
   ```typescript
   export { buildMyVisualization } from './builders/my-visualization.js';
   ```

5. **Run data-ink analysis**:
   ```bash
   # In tests or dev tools
   const analysis = analyzeDataInk(svg, TUFTE_STRICT);
   expect(analysis.score).toBeGreaterThan(0.8);
   ```

---

## Testing

```bash
# Run visualization tests
pnpm test -- --run visualizations

# Check brand compliance
pnpm lint:tokens
pnpm brand:check

# Visual regression (if configured)
pnpm test:visual
```

---

## Common Mistakes

| Wrong | Right |
|-------|-------|
| Hardcoded colors `#4a6741` | CSS variables `var(--color-ferni)` |
| Decorative gridlines | Remove or make very subtle |
| Legend separate from data | Direct labeling on data |
| Same viz for all devices | Device-specific rendering |
| Static visualizations | Living data that responds |
| Rainbow gradients | Semantic color encoding |
| 3D bar charts | 2D for 2D data |

---

## References

- **Tufte**: "The Visual Display of Quantitative Information"
- **Lupi**: "Dear Data" (personal data as art)
- **Bremer**: Data Sketches (organic forms)
- **Design System**: `design-system/tokens/colors.json`
- **Animation System**: `design-system/tokens/animation.json`
