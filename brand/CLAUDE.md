# Ferni Brand Library

**Interactive brand showcase** with HTML galleries, expression demos, and visual references.

> **Full doc index**: see [`README.md`](./README.md). This file holds only the rules.

## Quick Links

| Need | Go To |
|------|-------|
| **Brand guidelines** | `design-system/docs/brand/FERNI-BRAND-GUIDELINES.md` |
| **Better Than Human spec** | `design-system/docs/brand/BETTER-THAN-HUMAN.md` |
| **UI/screen standards** | `design-system/docs/brand/FERNI-SCREEN-GUIDELINES.md` |
| **Voice/tone** | `design-system/docs/brand/BRAND-VOICE-GUIDE.md` |
| **Design tokens (JSON)** | `design-system/tokens/` |
| **Growth strategy** | `brand/evolution/README.md` (16 docs) |
| **All docs map** | `brand/README.md` |

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

**Catchlights are allowed.** Small white highlight dots inside the eye (as in
`design-system/assets/logos/ferni-logo.svg`) are fine. What's banned is any
dark pupil or colored iris.

**When creating or modifying avatars:**
1. Eyes are white ellipses (optionally with small white catchlights)
2. Add comment `<!-- LUXO STYLE: opaque white eyes, no pupils -->`
3. Remove any circles or ellipses with `fill="#2c2520"` inside eyes
4. Expression animation uses CSS transforms on the eye shape

### Design Token Source of Truth

All colors, spacing, and typography come from `design-system/tokens/*.json`
(edit there, then `pnpm tokens:sync`). Never hardcode values.

The HTML galleries in this folder load two stylesheets:

- `ferni-design-tokens.css` — **generated** by `pnpm tokens:sync`
  (`design-system/sync-promo-tokens.js`). Never edit it; change the JSON.
  It carries the light theme, plus the dark overrides for
  `data-theme="dark"`/`"cedar"`/`"midnight"` and `prefers-color-scheme: dark`.
- `brand-base.css` — reset, type classes, nav and footer shared by the
  galleries. It uses token names only, no color values.

(`master-tokens.css`, the old hand-maintained token layer, was retired in
October 2026.)

```html
<!-- CORRECT -->
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

## Where Things Live

See [`README.md`](./README.md) for the full map. In short: guidelines in
`design-system/docs/brand/`, tokens in `design-system/tokens/`, canonical
assets in `design-system/assets/`, showcases and strategy here.
