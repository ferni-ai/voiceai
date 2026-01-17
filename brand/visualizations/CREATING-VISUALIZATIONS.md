# Creating New Ferni Visualizations

> **Pattern → Insight → Prompt → Action**
>
> Every visualization should reveal something humans couldn't see on their own,
> then guide them toward meaningful action.

---

## Quick Start

```bash
# 1. Copy the template
cp brand/visualizations/templates/visualization-template.html brand/visualizations/my-viz.html

# 2. Edit and customize
# 3. Open in browser to test
# 4. Run token check
pnpm tokens:check
```

---

## The BTH (Better Than Human) Framework

### 1. Pattern (Data Layer)
What raw data are we visualizing? What patterns exist that humans miss?

```javascript
// Example: User's emotional trajectory over 30 days
const data = {
  days: [...],
  moods: [...],
  triggers: [...],
  patterns: ['Monday dips', 'Post-workout highs']
};
```

### 2. Insight (Analysis Layer)
What does the pattern MEAN? What would a brilliant friend notice?

```html
<!-- Insight card that appears on hover/click -->
<div class="viz-insight" data-trigger="hover">
  <span class="insight-icon">💡</span>
  <p>Your energy peaks 2 hours after morning walks.
     You've had 12 high-energy days that started this way.</p>
</div>
```

### 3. Prompt (Guidance Layer)
What should the user consider? What questions does this raise?

```html
<div class="viz-prompt">
  <p>What if you scheduled important tasks in that 2-hour window?</p>
</div>
```

### 4. Action (Engagement Layer)
What can they DO right now?

```html
<div class="bth-action-panel">
  <button class="bth-action-btn primary">
    <span class="bth-icon">calendar</span>
    Schedule morning walk
  </button>
  <button class="bth-action-btn secondary">
    <span class="bth-icon">share</span>
    Share insight
  </button>
</div>
```

---

## Using the Visualization System

### Initialize

```html
<script type="module">
  import FerniViz from './viz-system.js';

  FerniViz.init({
    enableTooltips: true,      // Interactive data tooltips
    enableAnimations: true,    // Scroll reveals, spring physics
    enableDisclosure: true,    // Progressive detail levels
    enableComparison: true,    // Side-by-side comparisons
    enableIcons: true,         // 50+ SVG icons
    enableSharing: true,       // Export & social sharing
    debug: false               // Console logging
  });
</script>
```

### Make Elements Shareable

```javascript
// Any element can become shareable
document.querySelectorAll('.viz-card').forEach(card => {
  FerniViz.makeShareable(card);
});
```

### Add Scroll Reveal Animations

```javascript
// Elements fade in as they enter viewport
document.querySelectorAll('.viz-section').forEach(section => {
  section.classList.add('viz-reveal');
});
```

### Create Interactive Tooltips

```html
<div class="data-point"
     data-tooltip-title="Peak Energy Day"
     data-tooltip-content="March 15 • 9.2/10 energy score"
     data-tooltip-insight="This was the day after your best sleep of the month">
</div>
```

### Add Progressive Disclosure

```html
<div class="viz-card" data-disclosure-level="summary">
  <h3>Your Month at a Glance</h3>
  <p class="disclosure-summary">12 high-energy days, 3 challenging ones</p>
  <p class="disclosure-standard">Your best days followed morning exercise...</p>
  <p class="disclosure-detailed">Detailed breakdown by week...</p>
  <p class="disclosure-expert">Statistical analysis: σ=1.2, trend +0.3/week...</p>
</div>
```

---

## CSS Classes Reference

### Layout

| Class | Purpose |
|-------|---------|
| `.viz-card` | Container for a visualization unit |
| `.viz-section` | Full-width section |
| `.viz-grid` | Responsive grid layout |
| `.viz-hero` | Large featured visualization |

### Components

| Class | Purpose |
|-------|---------|
| `.bth-action-panel` | Action button container |
| `.bth-action-btn` | Action button |
| `.viz-insight` | Insight callout |
| `.viz-prompt` | Thought-provoking question |
| `.viz-legend` | Chart legend |

### Animations

| Class | Purpose |
|-------|---------|
| `.viz-reveal` | Fade-in on scroll |
| `.viz-reveal-up` | Slide up on scroll |
| `.viz-reveal-scale` | Scale in on scroll |
| `.chart-animate` | Chart entrance animation |
| `.pulse-glow` | Attention-drawing pulse |

### States

| Class | Purpose |
|-------|---------|
| `.viz-loading` | Loading skeleton |
| `.viz-empty` | Empty state |
| `.viz-error` | Error state |
| `.viz-highlight` | Highlighted data point |

---

## Design Token Usage

### Colors (ALWAYS use variables)

```css
/* ✅ CORRECT */
.my-viz {
  background: var(--color-surface);
  color: var(--color-text);
  border-color: var(--color-ferni);
}

/* ❌ WRONG - never hardcode */
.my-viz {
  background: #ffffff;
  color: #2c2520;
}
```

### Persona Colors

```css
/* For persona-specific visualizations */
.ferni-viz { --viz-accent: var(--color-ferni); }
.maya-viz { --viz-accent: var(--color-maya); }
.peter-viz { --viz-accent: var(--color-peter); }
.jordan-viz { --viz-accent: var(--color-jordan); }
.alex-viz { --viz-accent: var(--color-alex); }
.nayan-viz { --viz-accent: var(--color-nayan); }
```

### Kintsugi Accents (for breakthrough moments)

```css
/* Golden repair for moments of growth */
.breakthrough-moment {
  border-color: var(--kintsugi-gold);
  box-shadow: 0 0 20px var(--kintsugi-glow);
}
```

### Dark Mode

```css
/* Automatically adapts via CSS custom properties */
@media (prefers-color-scheme: dark) {
  :root {
    --color-surface: var(--color-surface-dark);
    --color-text: var(--color-text-dark);
  }
}
```

---

## Visualization Ideas

### Emotional & Wellness

| Visualization | Pattern | Insight | Action |
|--------------|---------|---------|--------|
| **Mood Calendar** | Daily mood ratings | "Wednesdays are consistently tough" | Schedule self-care |
| **Energy Flow** | Hourly energy levels | "Peak focus at 10am" | Block focus time |
| **Sleep Quality Map** | Sleep score over time | "Travel disrupts your rhythm" | Pre-trip preparation |
| **Stress Topology** | Stress triggers mapped | "Work calls spike anxiety" | Set boundaries |

### Relationship & Social

| Visualization | Pattern | Insight | Action |
|--------------|---------|---------|--------|
| **Connection Web** | Relationship interactions | "You haven't talked to Mom in 2 weeks" | Send a message |
| **Gratitude Garden** | Things you've appreciated | "Nature appears in 40% of entries" | Plan outdoor time |
| **Memory Lane** | Shared memories timeline | "3 year anniversary approaching" | Plan celebration |

### Growth & Achievement

| Visualization | Pattern | Insight | Action |
|--------------|---------|---------|--------|
| **Habit Constellation** | Habit streaks and chains | "Morning routine unlocks everything" | Protect the routine |
| **Goal Trajectory** | Progress toward goals | "You're 60% there, 3 weeks early" | Celebrate milestone |
| **Learning Landscape** | Skills and knowledge | "Patterns emerging in your interests" | Explore connection |
| **Values Compass** | Decisions vs stated values | "This month aligned 80% with values" | Reflect on outliers |

### Time & Productivity

| Visualization | Pattern | Insight | Action |
|--------------|---------|---------|--------|
| **Week Rhythm** | Activity patterns by day | "Saturdays are your creative peak" | Schedule creative work |
| **Commitment Keeper** | Promises made/kept | "You've kept 95% of promises" | Acknowledge reliability |
| **Calendar Heatmap** | Busyness distribution | "Next week looks overwhelming" | Delegate or reschedule |

---

## Data Sources

### From Ferni's Memory System

```javascript
// Access user data through Ferni's APIs
const userData = await fetch('/api/user/insights', {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json());

// Available data types:
// - moods: Daily mood check-ins
// - habits: Habit tracking data
// - conversations: Conversation themes
// - goals: Goal progress
// - relationships: Relationship interactions
// - values: Values alignment scores
```

### Aggregated Patterns

```javascript
// Get pattern analysis
const patterns = await fetch('/api/insights/patterns', {
  method: 'POST',
  body: JSON.stringify({
    timeframe: '30d',
    domains: ['mood', 'energy', 'sleep']
  })
}).then(r => r.json());
```

---

## Accessibility Checklist

Every visualization MUST include:

- [ ] **ARIA labels** on all interactive elements
- [ ] **Keyboard navigation** (arrow keys, Enter, Escape)
- [ ] **Focus indicators** visible on tab
- [ ] **Color contrast** meets WCAG AA (4.5:1)
- [ ] **Reduced motion** respect (`prefers-reduced-motion`)
- [ ] **Screen reader** friendly (landmarks, alt text)
- [ ] **Text alternatives** for purely visual data

```html
<!-- Example accessible chart -->
<div role="figure" aria-labelledby="chart-title" aria-describedby="chart-desc">
  <h3 id="chart-title">Monthly Mood Trends</h3>
  <p id="chart-desc" class="visually-hidden">
    Line chart showing mood scores from 1-10 over 30 days.
    Average score: 7.2. Trend: improving.
  </p>
  <svg aria-hidden="true"><!-- visual chart --></svg>
  <table class="visually-hidden"><!-- data table for screen readers --></table>
</div>
```

---

## Testing Checklist

Before shipping a visualization:

- [ ] **Token compliance**: `pnpm tokens:check` passes
- [ ] **Dark mode**: Test in dark theme
- [ ] **Mobile**: Test at 320px width
- [ ] **Performance**: No layout shifts, smooth animations
- [ ] **Accessibility**: VoiceOver/NVDA testing
- [ ] **Print**: Looks good when printed
- [ ] **Export**: PNG/SVG/PDF exports work
- [ ] **Share**: Social sharing preview correct

---

## File Structure for New Visualizations

```
brand/visualizations/
├── my-new-viz.html          # Main visualization page
├── js/
│   └── my-viz-data.js       # Data processing (if needed)
├── css/
│   └── my-viz-custom.css    # Custom styles (use tokens!)
└── assets/
    └── my-viz-preview.png   # Social sharing preview
```

---

## Example: Creating a "Weekly Rhythm" Visualization

### Step 1: Plan the BTH Framework

| Element | Content |
|---------|---------|
| **Pattern** | Activity distribution across weekdays |
| **Insight** | "Your most creative work happens on Saturdays" |
| **Prompt** | "What if you protected Saturday mornings?" |
| **Action** | "Block Saturday morning" button |

### Step 2: Create the HTML Structure

```html
<section class="viz-section weekly-rhythm">
  <div class="viz-card" data-disclosure-level="summary">
    <h2>Your Weekly Rhythm</h2>

    <!-- Pattern: The data visualization -->
    <div class="rhythm-chart" role="figure" aria-label="Weekly activity heatmap">
      <!-- Chart rendered here -->
    </div>

    <!-- Insight: What the data means -->
    <div class="viz-insight">
      <span class="insight-icon">✨</span>
      <p>Your most creative work happens on <strong>Saturdays</strong>.
         You've had 8 breakthrough moments on Saturday mornings this month.</p>
    </div>

    <!-- Prompt: Question to consider -->
    <div class="viz-prompt">
      <p>What if you protected Saturday mornings for creative work?</p>
    </div>

    <!-- Action: What to do now -->
    <div class="bth-action-panel">
      <button class="bth-action-btn primary" data-action="block-time">
        Block Saturday Mornings
      </button>
      <button class="bth-action-btn secondary" data-action="share">
        Share Insight
      </button>
    </div>
  </div>
</section>
```

### Step 3: Add Interactivity

```javascript
import FerniViz from './viz-system.js';

FerniViz.init();

// Make the card shareable
FerniViz.makeShareable(document.querySelector('.weekly-rhythm .viz-card'));

// Add action handlers
document.querySelector('[data-action="block-time"]').addEventListener('click', () => {
  // Integration with calendar
  window.open('https://calendar.google.com/calendar/r/eventedit?text=Creative+Time');
});
```

---

## Support

- **Documentation**: `brand/visualizations/README.md`
- **Audit Report**: `brand/visualizations/AUDIT-REPORT.md`
- **Design Tokens**: `design-system/tokens/`
- **Brand Guidelines**: `design-system/docs/brand/BETTER-THAN-HUMAN.md`
