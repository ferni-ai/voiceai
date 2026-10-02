# Design System Audit

**Status: consolidated (October 2026).** This replaces the December 2024 audit,
whose findings (five drifting token files, missing Jack colors, wrong README
persona colors, hand-synced animation constants, no drift gate) are all closed.
The phase-by-phase plan and decision log live in
[`DESIGN-SYSTEM-BRAND-AUDIT-2026-09.md`](./DESIGN-SYSTEM-BRAND-AUDIT-2026-09.md).

## One source, generated everywhere

`design-system/tokens/*.json` is the only place a design value is written.
`pnpm tokens:sync` generates every consumer file; nobody edits the outputs.

| Consumer | Generated file(s) | Generator |
|---|---|---|
| apps/web | `design-system/dist/tokens.css` → `public/design-system/tokens.css` (not committed), `src/config/*.generated.ts` | `build.js`, `generate-animation-constants.js` |
| ferni-website | `src/css/_tokens.css`, `tailwind.config.generated.js` | `sync-promo-tokens.js`, `generate-tailwind-config.js` |
| developers + design-system portals | `src/css/tokens.css` (Cedar Night) | `sync-promo-tokens.js` |
| marketplace portal | `src/css/tokens.css` (Zen Garden) — generated since 2026-10; it used to be a hand copy labelled "auto-generated" | `sync-promo-tokens.js` |
| brand library + marketing site | `brand/ferni-design-tokens.css` | `sync-promo-tokens.js` |
| iOS / macOS / widgets | `FerniTokens.generated.swift` | `generate-native-tokens.js` |
| Android | `FerniTokens.kt`, `ferni_tokens.xml` | `generate-native-tokens.js` |

## Gates

| Gate | What it fails on |
|---|---|
| `pnpm tokens:check` | Any committed generated file that differs from what the JSON produces now (content-based) |
| `pnpm brand:check` | Critical brand colors changed; off-token hex in normative brand docs; pupils in logo eyes; generated text inks below WCAG AA; **(Check 8)** a hardcoded color, or a `:root` redefinition of a generated token, in any portal stylesheet under `apps/website/*/src/css` |
| `cd apps/web && pnpm lint:tokens` | Hardcoded design values in `apps/web/src/ui` |
| `apps/web/tests/unit/design-system/no-self-referencing-vars.test.ts` | `--x: var(--x)` cycles |
| `apps/web/tests/e2e/contrast.spec.ts` | axe color-contrast violations on the main app screens, Zen and Midnight |

## Final state by area

### Websites (4 Eleventy portals)
- Stylesheets take every color from the generated tokens (`var(--…)`, or
  `color-mix(in srgb, var(--token) N%, transparent)` for translucency); radii,
  durations, easings, fonts and neutral elevation shadows too. Colored glows keep
  their geometry but use token colors.
- Local `:root` copies of generated tokens are gone. Exception, by design:
  ferni-website pins the `--space-*` scale to px in `story-brand.css` /
  `story-premium.css`, because the site sets `html { font-size: var(--text-base) }`
  (15px) and the rem tokens would shrink every layout by 1/16.
- Consumers referenced ~60 custom properties no token file defined (silent
  fallbacks); they now use real token names.
- Kept literal on purpose (content, not styling): documented glow values on the
  design-system portal's glow page, off-brand "don't" swatches on the guardrails
  page, Discord / Stack Overflow brand marks, and email newsletters (email clients
  don't support CSS variables).
- Removed: the unlinked legacy `ferni-website/css/` copy, unreferenced
  stylesheets and layouts, orphan static `developers/*.html`, `features.html`,
  `ferni-landing-page.html`, the design research pages under `src/images/`, and
  accidentally committed `_site/` build output (it is gitignored; build before
  deploying).

### apps/web
- `tokens.css` defines theme-invariant `--color-white`, `--color-black` and
  persona fills (`--color-ferni`, `--color-maya-secondary`, …); the app used
  `var(--color-ferni)` 160+ times and only ever got its fallback.
- `inline-styles.css`: 603 → 110 literal colors. TS-in-CSS: 3,863 literal
  fallbacks removed from `var(--token, …)` where the token is always defined;
  literals on CSS declaration lines mapped to invariant tokens.
- Theme-variant tokens are never substituted for literals, so neither theme
  changes. What remains literal has no theme-invariant token (mostly `#2c2520`
  ink on light-only surfaces) or is canvas/WebGL data (`fillStyle`, gradients
  computed in JS), which CSS variables cannot reach.

### Brand library
- `brand/master-tokens.css` (hand-maintained, drifted: ink `#1D1B18`, AA-failing
  muted text, its own type and radius scales) is retired. Galleries and the
  marketing site load the generated `brand/ferni-design-tokens.css` plus
  `brand/brand-base.css` (reset, type classes, nav, footer; token names only).
- The generated file carries the visualization palettes (kintsugi, viz-*), glass
  surfaces, letter spacing and theme-aware text inks, and its dark overrides
  apply to `data-theme="dark"`, `"cedar"` and `"midnight"`.

### Contrast (axe color-contrast, WCAG AA text)
- Web app: 0 violations on every screen of `contrast.spec.ts`, Zen and Midnight.
- Website portals (47 pages audited, light + dark scheme): 150 -> ~40 violations
  per scheme. Persona/accent/semantic colors used as text now use the generated
  text inks; white text on gold buttons uses the on-accent ink. Remaining: white
  initials on light persona fills (avatars), two marketplace headings in Carmen /
  Sasha fills, and documentation swatches.
- Brand + marketing pages (8 audited): light 142 → 28 violations.

## Open items
- Remaining literal colors in apps/web TS (canvas/data colors, and `#2c2520`
  ink on light-only surfaces that would need a light-only ink token).
- The brand library's dark toggle: expression-gallery cards are designed light
  and keep white-on-light text in dark mode (pre-existing).
- Native builds (Swift/Kotlin outputs) still need a local Xcode/Gradle build.
- `design-system/assets/icons/png/` holds byte-identical `ios-*`/`orb-ios-*`/
  `app-icon-*` sets; `scripts/regenerate-icons.ts` writes and references all
  three names, so they stay until that script is consolidated.
