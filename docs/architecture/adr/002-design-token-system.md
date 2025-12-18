# ADR-002: Design Token System

## Status

Accepted

## Date

2024-12-07

## Context

The frontend had inconsistent styling with:
- Hardcoded colors scattered across files
- Magic numbers for spacing, timing, z-index
- No systematic approach to theming
- Accessibility issues from poor color contrast

## Decision

Implement a comprehensive design token system:

1. **CSS Variables** for all visual properties:
   - Colors: `--color-*` (text, background, accent, semantic)
   - Spacing: `--space-*` (golden ratio based)
   - Typography: `--text-*`, `--font-*`
   - Animation: `--timing-*`, `--ease-*`
   - Z-index: `--z-*` (modal, dropdown, notification, etc.)

2. **Validation Script** (`scripts/validate-design-tokens.js`):
   - Detects hardcoded colors, fonts, shadows
   - Runs on pre-commit and in CI
   - Blocking - cannot merge with violations

3. **Theme Support**:
   - Midnight theme (dark)
   - Zen theme (light)
   - Tokens change values per theme

## Consequences

### Positive
- Consistent visual language across app
- Easy to maintain and update branding
- Theme switching works automatically
- Accessibility improvements (contrast ratios)
- New developers can't accidentally break design

### Negative
- Learning curve for token names
- Some edge cases need exceptions (SVG data URLs)
- Slightly more verbose CSS

### Neutral
- Existing violations grandfathered via exception list
- Gradual migration for complex components

## Alternatives Considered

### Alternative 1: CSS-in-JS (styled-components, emotion)
- Pros: Type-safe, scoped styles
- Cons: Runtime cost, different mental model
- Why not chosen: Project uses vanilla TypeScript, not React

### Alternative 2: Tailwind CSS
- Pros: Rapid development, built-in design system
- Cons: Large class strings, build step, opinionated
- Why not chosen: Existing CSS investment, prefer CSS variables

## References

- `brand/ferni-design-tokens.css` - Token definitions
- `apps/web/scripts/validate-design-tokens.js` - Validator
- `apps/web/CLAUDE.md` - Frontend standards
