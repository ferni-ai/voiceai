# Tailwind v4 Integration

## Installation

```bash
npm install tailwindcss@next @tailwindcss/postcss@next
```

## Setup

### 1. Create `postcss.config.js`

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {}
  }
}
```

### 2. Create your main CSS file (e.g., `app.css`)

```css
/* Import design tokens first - provides CSS custom properties */
@import "../../design-system/dist/tokens.css";

/* Import Tailwind v4 theme that maps to our tokens */
@import "../../design-system/dist/tailwind-theme.css";

/* Import Tailwind */
@import "tailwindcss";
```

### 3. Use in your HTML/JSX

```html
<!-- Theme-aware backgrounds -->
<div class="bg-background-primary text-text-primary">

  <!-- Accent colors that change with theme -->
  <button class="bg-accent hover:bg-accent-hover text-text-inverse rounded-lg px-4 py-2">
    Click me
  </button>

  <!-- Persona-aware colors -->
  <div class="bg-persona/10 border border-persona">
    Persona accent
  </div>

  <!-- Shadows that adapt to theme (darker in midnight, lighter in zen) -->
  <div class="shadow-lg rounded-xl bg-background-elevated p-6">
    Card content
  </div>

  <!-- Typography -->
  <h1 class="font-display text-4xl font-bold tracking-tight">
    Heading
  </h1>
  <p class="font-body text-base text-text-secondary leading-relaxed">
    Body text
  </p>

  <!-- Animations -->
  <div class="transition-all duration-normal ease-out-expo">
    Smooth transition
  </div>

</div>
```

## Theme Switching

Themes switch automatically when you change the `data-theme` attribute:

```js
// Switch to zen (light) theme
document.documentElement.setAttribute('data-theme', 'zen');

// Switch back to midnight (dark) theme
document.documentElement.setAttribute('data-theme', 'midnight');
```

All Tailwind utilities using our design tokens will automatically update.

## Available Utilities

### Colors
- `bg-background-{primary|secondary|tertiary|elevated|glass|overlay}`
- `text-{primary|secondary|muted|dimmed|inverse}`
- `border-{subtle|medium|strong}`
- `bg-accent`, `bg-accent-hover`, `bg-accent-pressed`
- `bg-success`, `bg-error`, `bg-warning`, `bg-info` (+ `-glow` variants)
- `bg-persona`, `bg-persona-secondary` (changes per persona)
- `bg-natural-{wood|bamboo|stone|sand|moss}` (zen theme extras)

### Typography
- `font-{display|body|mono}`
- `text-{2xs|xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl}`
- `font-{light|regular|medium|semibold|bold|extrabold}`
- `leading-{none|tight|snug|normal|relaxed|loose}`
- `tracking-{tighter|tight|normal|wide|wider|widest}`

### Spacing
- `p-{0|px|0_5|1|1_5|2|...|96}` (and m-, gap-, etc.)

### Border Radius
- `rounded-{none|xs|sm|md|lg|xl|2xl|3xl|full}`

### Shadows
- `shadow-{xs|sm|md|lg|xl|2xl|glow|inner}`

### Animation
- `ease-{linear|in|out|in-out|out-expo|out-back|spring|smooth}`
- `duration-{instant|fastest|faster|fast|normal|slow|slower|slowest|deliberate|dramatic|glacial}`

## Example Component

```html
<button
  class="
    bg-accent hover:bg-accent-hover active:bg-accent-pressed
    text-text-inverse font-body font-semibold
    px-6 py-3 rounded-xl
    shadow-md hover:shadow-lg
    transition-all duration-fast ease-out-expo
  "
>
  Get Started
</button>
```

This button will:
- Use gold accent in midnight theme, green accent in zen theme
- Have appropriate shadows for each theme
- Animate smoothly using our design system easings
