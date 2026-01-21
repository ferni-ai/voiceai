# Developer Portal Design Standards

> **Goal:** Match Apple and Google developer portal quality through restraint, consistency, and intentional design.

---

## Design Philosophy

### 1. Less is More

Every element must earn its place. If removing something doesn't hurt the experience, remove it.

| ❌ Cluttered                | ✅ Minimal                               |
| --------------------------- | ---------------------------------------- |
| 6+ nav items                | 4 nav items max                          |
| Decorative icons everywhere | Icons only when they aid comprehension   |
| Multiple font weights       | 2-3 weights: regular, medium, semibold   |
| Borders + shadows + colors  | One distinguishing treatment per element |

### 2. Intentional Whitespace

Whitespace is not empty space—it's a design element. Use it generously.

```
Section padding: --space-16 to --space-24 (4-6rem)
Card padding: --space-6 to --space-8 (1.5-2rem)
Element gaps: --space-3 to --space-6 (0.75-1.5rem)
Text margins: --space-4 to --space-6 (1-1.5rem)
```

### 3. Typography Hierarchy

Three levels of emphasis maximum. If you need more, reconsider your content structure.

| Level         | Use                     | Token                                       |
| ------------- | ----------------------- | ------------------------------------------- |
| **Primary**   | Headings, key actions   | `--text-primary`, `--font-weight-semibold`  |
| **Secondary** | Body text, descriptions | `--text-secondary`, `--font-weight-regular` |
| **Muted**     | Metadata, captions      | `--text-muted`, `--font-weight-regular`     |

---

## Navigation Standards

### Desktop Nav (4 items max)

```
Logo | [Docs] [API] [SDK] [Blog] | Search | Theme | [GitHub] [Console]
```

- **Docs**: Entry point to all documentation
- **API**: API reference
- **SDK**: Client libraries
- **Blog**: Thought leadership content

**Removed:** Redundant items (API Explorer, Examples, Community)—these live within their parent sections.

### Mobile Nav

- Hamburger menu only
- Full-screen overlay with large touch targets
- Primary CTA at bottom

### Nav Styling

```css
/* Links: Minimal, no underlines */
.nav-links a {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  color: var(--text-muted);
}

.nav-links a:hover {
  background: var(--bg-glass);
  color: var(--text-primary);
}

.nav-links a.active {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}
```

---

## Page Layout Standards

### Blog Index Page

```
┌─────────────────────────────────────────┐
│                 Header                  │  ← Centered, max-width: 680px
│         [eyebrow] [h1] [desc]          │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│             Featured Post               │  ← 2-column: image | content
│   [image]  │  [meta] [h2] [excerpt]    │
│            │  [author] [read time]      │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│              Posts Grid                 │  ← 2-column grid
│   [card]          [card]               │
│   [card]          [card]               │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│          Newsletter Section             │  ← Centered, subtle bg
└─────────────────────────────────────────┘
```

### Blog Post Page

```
┌─────────────────────────────────────────┐
│              Post Header                │  ← max-width: 720px
│  [back] [meta] [h1] [excerpt]          │
│  [author info] [share buttons]          │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│              Post Content               │  ← max-width: 720px
│  [prose with proper spacing]            │
└─────────────────────────────────────────┘
```

---

## Spacing Scale

Use tokens, never hardcoded values.

| Token        | Value          | Use                              |
| ------------ | -------------- | -------------------------------- |
| `--space-1`  | 0.25rem (4px)  | Tight spacing, icon padding      |
| `--space-2`  | 0.5rem (8px)   | Button padding, small gaps       |
| `--space-3`  | 0.75rem (12px) | Standard internal padding        |
| `--space-4`  | 1rem (16px)    | Paragraph margins                |
| `--space-6`  | 1.5rem (24px)  | Card padding, medium gaps        |
| `--space-8`  | 2rem (32px)    | Section gaps, large card padding |
| `--space-12` | 3rem (48px)    | Between major sections           |
| `--space-16` | 4rem (64px)    | Page section padding             |
| `--space-24` | 6rem (96px)    | Hero/major section padding       |

---

## Color Usage

### Light Theme

- Background: `#FAFAF9` (warm white)
- Accent: `#3D5A45` (Ferni Sage)
- Text hierarchy uses gray scale with warm undertones

### Dark Theme

- Background: `#0A0A0A` (true dark, NOT brown)
- Accent: `#D4A84A` (gold)
- Preserves same hierarchy with inverted values

### Rules

1. **Never hardcode colors** — always use CSS variables
2. **One accent per section** — don't mix accent colors
3. **Subtle backgrounds only** — avoid strong colored backgrounds

---

## Cards

### Card Hierarchy

1. **Featured Card** (blog featured)
   - Larger padding (`--space-8`)
   - Two-column layout
   - Prominent shadow on hover

2. **Standard Card** (blog grid)
   - Medium padding (`--space-6`)
   - Single column
   - Subtle shadow on hover

3. **Inline Card** (nav dropdowns, tooltips)
   - Small padding (`--space-4`)
   - No shadow, border only

### Card Styling

```css
.card {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  transition: all var(--duration-normal) var(--ease-gentle);
}

.card:hover {
  border-color: var(--border-medium);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}
```

---

## Typography

### Font Stack

```css
--font-display: 'Plus Jakarta Sans', system-ui, sans-serif;
--font-body: 'Inter', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', monospace;
```

### Heading Scale

| Element | Size                   | Weight | Letter Spacing |
| ------- | ---------------------- | ------ | -------------- |
| h1      | `--text-4xl` (2.25rem) | 700    | -0.02em        |
| h2      | `--text-2xl` (1.5rem)  | 600    | -0.01em        |
| h3      | `--text-xl` (1.25rem)  | 600    | 0              |
| h4      | `--text-lg` (1.125rem) | 600    | 0              |

### Body Text

| Context   | Size                   | Line Height |
| --------- | ---------------------- | ----------- |
| Default   | `--text-base` (1rem)   | 1.6         |
| Blog body | `--text-lg` (1.125rem) | 1.75        |
| Caption   | `--text-sm` (0.875rem) | 1.5         |
| Label     | `--text-xs` (0.75rem)  | 1.4         |

---

## Buttons

### Primary Button

```css
.btn-primary {
  background: var(--accent-primary);
  color: white;
  padding: var(--space-3) var(--space-5);
  border-radius: var(--radius-lg);
  font-weight: 600;
}
```

### Ghost Button

```css
.btn-ghost {
  background: transparent;
  color: var(--text-muted);
  padding: var(--space-2) var(--space-3);
}

.btn-ghost:hover {
  background: var(--bg-glass);
  color: var(--text-primary);
}
```

### Button Rules

1. One primary button per section max
2. Ghost buttons for secondary actions
3. Icon-only buttons need `aria-label`

---

## Animations

### Duration Scale

| Token               | Value | Use              |
| ------------------- | ----- | ---------------- |
| `--duration-fast`   | 150ms | Hovers, toggles  |
| `--duration-normal` | 200ms | Card transitions |
| `--duration-slow`   | 300ms | Page transitions |

### Easing

- **Hover states:** `var(--ease-gentle)` — smooth, organic
- **Entrances:** `var(--ease-out)` — fast start, slow end
- **Interactive:** `var(--ease-out-back)` — slight overshoot

### Rules

1. Never animate `width` or `height` — use `transform`
2. Always include `prefers-reduced-motion` support
3. Subtle is better than flashy

---

## Checklist Before Launch

### Layout

- [ ] Max 4 nav items on desktop
- [ ] Consistent page max-widths (720px for prose, 1080px for grids)
- [ ] Generous section padding (16-24 spacing units)
- [ ] Mobile responsive at 768px breakpoint

### Typography

- [ ] Only 2-3 font weights used
- [ ] Proper heading hierarchy (h1 > h2 > h3)
- [ ] Body text has 1.6+ line-height

### Spacing

- [ ] No hardcoded pixel values
- [ ] Consistent card padding throughout
- [ ] Adequate whitespace between sections

### Colors

- [ ] All colors use CSS variables
- [ ] Passes WCAG contrast in both themes
- [ ] Accent color used sparingly

### Polish

- [ ] Hover states on all interactive elements
- [ ] Focus states for accessibility
- [ ] Smooth transitions (150-300ms)
- [ ] No layout shifts on interaction

---

_Last updated: January 2026_
