# Ferni Brand Library

This directory contains the complete Ferni brand system: design tokens, avatar expressions, marketing pages, and visual identity guidelines.

## Critical Design Rules

### LUXO-STYLE EYES (MANDATORY)

**ALL Ferni avatar eyes MUST be opaque white with NO pupils.**

This is inspired by Pixar's Luxo Jr. lamp character. The eyes are solid white ellipses - expression comes entirely from the eye SHAPE (scaleX, scaleY transforms), NOT from pupils.

```svg
<!-- CORRECT: Luxo-style opaque white eyes -->
<ellipse cx="36" cy="48" rx="7" ry="9" fill="white"/>
<ellipse cx="64" cy="48" rx="7" ry="9" fill="white"/>

<!-- WRONG: Never add pupils -->
<ellipse cx="36" cy="50" rx="3.5" ry="4.5" fill="#2c2520"/>  <!-- DELETE THIS -->
<circle cx="70" cy="92" r="10" fill="#2c2520"/>              <!-- DELETE THIS -->
```

**Why this matters:**
- Creates a distinctive, memorable character design
- Matches the Pixar Luxo Jr. lamp that inspired Ferni
- Emotions are conveyed through eye shape transforms, not pupil position
- Keeps the design clean and non-creepy

**When creating or modifying avatars:**
1. Eyes are ONLY white ellipses
2. Add comment `<!-- LUXO STYLE: opaque white eyes, no pupils -->`
3. Remove any circles or ellipses with `fill="#2c2520"` inside eyes
4. Expression animation uses CSS transforms on the eye shape

### Design Token Source of Truth

All colors, spacing, and typography come from `master-tokens.css`. Never hardcode values.

```html
<!-- CORRECT -->
<link rel="stylesheet" href="master-tokens.css">
color: var(--color-ferni);

<!-- WRONG -->
color: #4a6741;
```

### Persona Colors

| Persona | Variable | Hex |
|---------|----------|-----|
| Ferni | `--color-ferni` | #4a6741 |
| Maya | `--color-maya` | #a67a6a |
| Peter | `--color-peter` | #3a6b73 |
| Jordan | `--color-jordan` | #c4856a |
| Alex | `--color-alex` | #5a6b8a |
| Nayan | `--color-nayan` | #b8956a |

## File Structure

```
brand/
├── master-tokens.css        # Single source of truth for all tokens
├── index.html               # Brand library home page
├── brand-book.html          # Print-ready brand guidelines
├── FERNI-UNIVERSE-BIBLE.md  # Complete brand story
├── characters/              # Per-persona expression galleries
├── capabilities/            # 19 superhuman capabilities showcase
├── marketing/               # Marketing pages and assets
├── motion/                  # Animation system documentation
├── logos/                   # Logo variants
└── social/                  # Social media templates
```

## Quick Reference

- **Expression Gallery**: `characters/ferni/expressions.html`
- **Motion Demo**: `motion/demo.html`
- **Capabilities**: `capabilities/index.html`
- **Universe Bible**: `FERNI-UNIVERSE-BIBLE.md`
