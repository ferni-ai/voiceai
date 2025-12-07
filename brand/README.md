# Ferni Brand Assets

> **We believe in making AI human, and the decisions we make will reflect that.**

This directory contains Ferni's brand assets and design guidelines.

## Contents

| File | Purpose |
|------|---------|
| [`FERNI-BRAND-GUIDELINES.md`](./FERNI-BRAND-GUIDELINES.md) | Complete brand guidelines |
| [`FERNI-SCREEN-GUIDELINES.md`](./FERNI-SCREEN-GUIDELINES.md) | UI/screen design standards |
| [`ferni-design-tokens.css`](./ferni-design-tokens.css) | CSS design tokens |
| [`brand-book.html`](./brand-book.html) | Interactive brand book |
| `logos/` | Logo files (SVG, PNG) |
| `icons/` | App and UI icons |
| `favicons/` | Browser favicons |

## Quick Reference

### Primary Colors

| Name | Hex | Use |
|------|-----|-----|
| Ferni Sage | `#4a6741` | Primary brand, Ferni persona |
| Cedar Brown | `#9a7b5a` | Secondary, grounding |
| Ocean Teal | `#3a6b73` | Peter (research) |
| Slate Blue | `#5a6b8a` | Alex (communications) |
| Rose | `#a67a6a` | Maya (wellness) |
| Coral | `#c4856a` | Jordan (celebrations) |
| Warm Gray | `#8a7a6a` | Nayan (wisdom) |

### Typography

- **Display**: Playfair Display (headings, quotes)
- **Body**: Inter (UI, body text)

### Voice & Tone

- Warm, not corporate
- Confident, not arrogant
- Supportive, not pushy
- Personal, not clinical

## Usage

### In Frontend

Design tokens are available via CSS variables:

```css
color: var(--ferni-sage);
background: var(--color-bg-primary);
font-family: var(--font-display);
```

### In Design Tools

Export assets from `logos/` and `icons/` directories. Use the brand book for color/typography reference.

## Related

- [`frontend-typescript/CLAUDE.md`](../frontend-typescript/CLAUDE.md) - Frontend design standards
- [`docs/architecture/CINEMATIC-DESIGN-SYSTEM.md`](../docs/architecture/CINEMATIC-DESIGN-SYSTEM.md) - Design system architecture
