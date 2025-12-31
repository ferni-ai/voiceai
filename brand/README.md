# Ferni Brand Library

> **We believe in making AI human, and the decisions we make will reflect that.**

This directory is the **interactive brand library** with HTML galleries and visual references.

## Asset Consolidation Notice

**Canonical asset locations have been consolidated to `design-system/assets/`**

| Asset Type | Canonical Location | This Folder |
|------------|-------------------|-------------|
| Logos | `design-system/assets/logos/` | Originals (reference) |
| Favicons | `design-system/assets/favicons/` | Originals (reference) |
| Icons | `design-system/assets/icons/` | Originals (reference) |
| Social Templates | `design-system/assets/social/` | Originals (reference) |
| CSS Tokens | `design-system/dist/tokens.css` | Manual copy (deprecated) |

See `design-system/ASSET-LOCATIONS.md` for the complete reference.

---

## What's in This Folder

### Interactive Galleries (HTML)

| File | Purpose |
|------|---------|
| `index.html` | Brand library home page |
| `brand-book.html` | Print-ready brand guidelines |
| `icons.html` | Complete icon library (61 icons) |
| `components.html` | UI component gallery |
| `accessibility.html` | Accessibility standards |
| `sound-design.html` | Sound design principles |
| `universe-bible.html` | Interactive universe bible |

### Character Expressions (`characters/`)

| Persona | File |
|---------|------|
| Ferni | `characters/ferni/expressions.html` |
| Maya | `characters/maya/expressions.html` |
| Peter | `characters/peter/expressions.html` |
| Jordan | `characters/jordan/expressions.html` |
| Alex | `characters/alex/expressions.html` |
| Nayan | `characters/nayan/expressions.html` |

### Motion System (`motion/`)

- `demo.html` - Interactive motion demo
- Animation documentation

### Capabilities Showcase (`capabilities/`)

- `index.html` - 19 superhuman capabilities
- `gallery.html` - Visual capability gallery

### Marketing Pages (`marketing/`)

- `introducing-ferni.html` - Launch landing page
- `persona-picker.html` - Interactive persona selector
- `video-timeline.html` - Video timeline demo

---

## Quick Reference

### Primary Colors (CSS Variables)

```css
--color-ferni: #4a6741;     /* Primary brand */
--color-maya: #a67a6a;      /* Wellness */
--color-peter: #3a6b73;     /* Research */
--color-jordan: #c4856a;    /* Celebrations */
--color-alex: #5a6b8a;      /* Communications */
--color-nayan: #b8956a;     /* Wisdom */
```

### Typography

- **Display**: Playfair Display
- **Body**: Inter
- **Mono**: Berkeley Mono

---

## Brand Documentation

All brand guidelines live in the design system:

| Document | Location |
|----------|----------|
| Brand Guidelines | `design-system/docs/brand/FERNI-BRAND-GUIDELINES.md` |
| Better Than Human | `design-system/docs/brand/BETTER-THAN-HUMAN.md` |
| Voice Guide | `design-system/docs/brand/BRAND-VOICE-GUIDE.md` |
| All Docs | `design-system/docs/brand/` |

---

## Development

To view the brand library locally:

```bash
cd brand
python3 -m http.server 8000
# Open http://localhost:8000
```

Or use the design-system dev server:

```bash
cd design-system
npm run dev
```

---

## Critical Design Rules

### LUXO-STYLE EYES (MANDATORY)

All Ferni avatar eyes are **opaque white ellipses with NO pupils**. Expression comes from eye SHAPE transforms, not pupils.

```svg
<!-- CORRECT -->
<ellipse cx="36" cy="48" rx="7" ry="9" fill="white"/>

<!-- WRONG - Never add pupils -->
<ellipse cx="36" cy="50" rx="3.5" ry="4.5" fill="#2c2520"/>
```

---

*See `CLAUDE.md` for complete design rules.*
