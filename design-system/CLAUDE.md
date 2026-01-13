# Design System

**Single source of truth** for all Ferni design tokens, brand assets, and visual identity.

## Purpose

This directory contains the centralized design token system that generates CSS, TypeScript, and Tailwind configurations consumed by all Ferni applications.

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `tokens/` | JSON token definitions (colors, animation, typography, etc.) - **EDIT THESE** |
| `assets/` | Brand assets (logos, icons, favicons, sounds) - **EDIT THESE** |
| `dist/` | Generated output (CSS, TS, Tailwind) - **NEVER EDIT** |
| `docs/` | Brand documentation and guidelines |
| `eslint-plugin/` | Custom ESLint rules for design token enforcement |
| `components/` | Shared component styles |

## Quick Commands

```bash
# Build tokens (from project root)
pnpm tokens:sync       # Build & sync all tokens
pnpm tokens:check      # Validate no drift
pnpm tokens:watch      # Watch mode during development

# Or via Ferni CLI
ferni tokens sync
ferni tokens check
ferni tokens version patch "Fixed X"
```

## Critical Files

| File | Purpose |
|------|---------|
| `tokens/colors.json` | Color palette (personas, themes, semantic) |
| `tokens/animation.json` | Easing curves, durations, keyframes |
| `tokens/personas.json` | Full persona profiles |
| `build.js` | Main token compiler |
| `generate-animation-constants.js` | Generates `animation-constants.generated.ts` |
| `sync-promo-tokens.js` | Syncs tokens to landing page |

## Adding/Editing Tokens

1. **Edit source JSON** in `tokens/*.json`
2. Run `pnpm tokens:sync` from project root
3. Commit both source JSON and generated files

## Generated Outputs

| Output | Location | Consumed By |
|--------|----------|-------------|
| `dist/tokens.css` | Design system | Frontend app |
| `animation-constants.generated.ts` | `apps/web/src/config/` | Frontend animations |
| `tailwind.config.generated.js` | Website root | Landing page |
| `design-tokens.css` | Promo website | Marketing site |

## Rules

1. **Never edit** files in `dist/` or any `*.generated.*` files
2. **Always use CSS variables** - never hardcode hex colors
3. **Run `pnpm tokens:check`** before committing token changes
4. **Brand colors are sacred** - see `docs/brand/FERNI-BRAND-GUIDELINES.md`

## Related Documentation

- `docs/brand/FERNI-BRAND-GUIDELINES.md` - Brand identity
- `docs/brand/BETTER-THAN-HUMAN.md` - Superhuman EQ specifications
- `CONSOLIDATION-PLAN.md` - Token consolidation roadmap
