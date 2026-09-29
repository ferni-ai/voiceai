# Design System & Brand Audit — September 2026

> Status: **approved** (recommendations accepted, Sep 2026). In progress — see
> [Progress](#progress) at the end.
>
> Correction to D3: Joel has a live persona bundle (`src/personas/bundles/joel-dickson`),
> so Joel stays as a specialist persona. Only Jack is legacy.
> Supersedes `docs/audits/DESIGN-SYSTEM-AUDIT.md` (Dec 2024), which CLAUDE.md still cites as current.

## TL;DR

The critical brand colors (Accent `#3D5A45`, Ferni `#4a6741`, Natural Ink `#2C2520`) are correct everywhere they appear. The system around them is not a single source of truth:

1. **The drift gate checks timestamps, not content.** `pnpm tokens:check` compares mtimes for 5 of 41 token files. After a fresh checkout it always passes. It reported "All tokens in sync" while the drift below exists.
2. **Native apps have no generation path.** iOS, macOS and Android use 7+ hand-written color files. Three platforms share the wrong Nayan color (`#9a7b5a`, Jack's legacy brown; JSON says `#b8956a`). They cover 6 of 15 personas.
3. **Tokens are defined more than once, with conflicting values.**
   - Timing is split across `animation.json`, `motion.json` and `physics.json`: "fast" is 150ms in one and 100ms in another.
   - Color is split across `colors.json`, `glow-colors.json` and `color-emotional.json`.
   - Typography and spacing are both repeated in `responsive.json`.
   - Hand copies say "SINGLE SOURCE OF TRUTH" in their headers: `brand/master-tokens.css` and `ferni-website/src/css/tokens.css`.
4. **Brand guidance contradicts itself.**
   - The logo is described three ways: an "FE" monogram (guidelines), a Three Stones mark with iris and pupil (`LOGO.md`), and a two-eye orb with no pupils (the shipped assets and `brand/CLAUDE.md`).
   - The persona roster differs between docs: Nayan vs Jack, and Joel.
   - Fonts: `brand/README.md` says Playfair Display, while the tokens use Plus Jakarta Sans.
5. **Sprawl.**
   - 112 groups of byte-identical logo/icon files, up to 6 copies each.
   - Generated output committed to git: `apps/web/public/design-system`, `design-system/dist` (despite `.gitignore`), and `design-system-portal/_site`.
   - `build.js` is 7,446 lines, against a 500-line limit.
   - Three documentation sites.
   - Half-finished consolidation plans.

## Decisions needed from you

| # | Question | Recommendation |
|---|---|---|
| D1 | Canonical logo | The shipped **two-eye sage orb, white eyes, no pupils** (`design-system/assets/logos/ferni-logo.svg`). Rewrite `LOGO.md`, guidelines §2 and `expressions/README.md` to match. |
| D2 | Catchlights in eyes? | Shipped SVGs have white catchlight circles; `brand/CLAUDE.md` says "ONLY white ellipses". Recommend **allow catchlights, ban pupils/iris**. |
| D3 | Persona roster | 6 core personas (Ferni, Peter, Maya, Alex, Jordan, Nayan). Marketplace personas (Eli, Amara, Kenji, Ray, Sasha, Marcus, Carmen) are a separate tier. **Jack and Joel become legacy and are removed from generated outputs.** |
| D4 | Purple | `lint:brand` bans purple, but marketplace personas Eli `#6B5B95` and Amara `#7B6BA8` are purple. Recommend **allow purple only as persona identity color**. |
| D5 | `fe-ai-*` logo colorways (aurora, neon, ocean, sunset, gradient…) | Off-palette and undocumented. Recommend **archive**, unless marketing uses them. |
| D6 | Token build tool | Recommend **Style Dictionary** (DTCG format; CSS, TS, Tailwind, Swift and Kotlin out of the box). This replaces the 7.4k-line `build.js` and the two sync scripts. The alternative is splitting `build.js` into modules. |
| D7 | Docs site | Three surfaces: `design-system/site`, Storybook, `apps/website/design-system-portal`. Recommend **keep the portal** (public) plus Storybook (component dev), and delete `design-system/site`. |
| D8 | Default theme for `var()` fallbacks | `dist/tokens.css` `:root` is dark-first, but app fallbacks assume light. Recommend **light default, dark via `[data-theme=dark]`**. Confirm. |

## Findings (ranked)

### Critical
- **C1 Drift gate doesn't check content.** `check-drift.js` compares mtimes (60s tolerance) for 5 sources and 7 outputs. It covers no TS, Tailwind, native or marketplace outputs. `token-check.yml` can never pass its "timestamps differed" branch because every output embeds a timestamp. (A test run of `tokens:sync` today changed 18 files, all of them timestamp-only, so the outputs currently match in content by luck.)
- **C2 Native apps are hand-maintained, and they drift.**
  - `apps/shared/Models/Persona.swift`, `apps/macos-menubar/Models/Persona.swift` and Android (`Color.kt`, `colors.xml`, `Persona.kt`) all set Nayan to `#9a7b5a`.
  - `apps/ios-native/Sources/Design/FerniColors.swift` duplicates the FerniShared type of the same name with about 13 differing values.
  - A stray `apps/web/src/ui/visualizations/swift/FerniColors.swift` claims to be "the single source of truth for iOS" and has wrong values. Nothing references it.

### High
- **H1 Duplicate token domains** (see TL;DR 3), plus orphans nothing reads:
  - No reference at all: `ai-landing.json`, `emotion.json`.
  - Only mentioned in docs: `components.json`, `feedback.json`, `rituals.json`.
  - Roadmap mention only: `haptics-expanded.json`.
  - No generator reads it (the only matches are similarly named files): `moments.json`.
  - A stale copy of `src/tools/config/`: `tool-descriptions-extracted.json`.
  - `color-emotional.json` and `typography-emotional.json` are hand-copied into `apps/web/src/ui/color/mood-palette.ts` and `ui/typography/mood-weight.ts`.
- **H2 Hand-copied token files outside the pipeline:**
  - `brand/master-tokens.css` (1,091 lines, with 3 values that conflict with the JSON and dark persona colors that exist only there).
  - `brand/brand-components.css`.
  - `packages/ferni-react/src/tokens/index.ts` (33 hex).
  - `src/config/brand-colors.ts` (19 hex).
  - `ferni-website/src/css/tokens.css` (51 variables exist only here). Its `tailwind.config.js` also ignores the generated config.
  - `marketplace-portal/src/css/tokens.css`.
  - Persona hex repeated about 20 times per page across 7 marketplace persona pages.
- **H3 Competing color systems in apps/web.**
  - Persona maps are duplicated in `ui/color/persona-harmony.ts`, `services/persona-aura.ts`, `config/semantic-colors.ts`, `mood-palette.ts` and `time-fading.ts`.
  - Maya's hex appears in 49 hand-written files. Nayan appears with 8 different hex values.
  - Theme and brand code has no clear owner: `theme/`, `systems/emotional-color.ts`, `ui/design-system-integration.ts`, `brand.ts`, `services/brand-system.ts`, `services/brand-service.ts`, `app/brand-integration.ts`.
- **H4 Brand guidance contradictions** (see Decisions D1–D4).
  - Also: `LOGO.md` gives `#5a8060` as the Ferni secondary color; `colors.json` has `#3d5a35`.
  - Guidelines "Warm Amber `#C4A265`" doesn't exist in the tokens.
  - `brand/README.md` fonts are wrong.

### Medium
- **M1 Generator bugs and broken references.**
  - 13 `undefined` values in `dist/tokens.css`: persona meta keys like `_description` get emitted as selectors.
  - `design-system/package.json` exports 4 `dist/*-utils` files that are never generated, because `generate-new-tokens.js` is outside `tokens:sync`.
  - `apps/web/tests/design-system-integration.test.ts` imports a missing `dist/tokens.js`.
  - `inline-styles.css` references a missing `tokens/breakpoints.json`.
  - 15 token files point at a `$schema` that doesn't exist.
- **M2 Scripts.**
  - `sync-promo-tokens.js` and the unused `sync-website-tokens.js` write the same files.
  - There are two Tailwind generators.
  - The `build:tokens` script name means different things at the root and in the package.
  - An npm `package-lock.json` sits inside a pnpm workspace member.
  - UI linters (`fix-*`, `check-ui-*`, `ai-fix`, `check-i18n`) live in the token package and hardcode `apps/web` paths.
- **M3 apps/web fallback chaos.**
  - More than 5,000 `var(--x, #hex)` fallbacks with inconsistent values. For example, `--color-text-muted` falls back to three different hex values.
  - `lint:tokens` has 169 ignore patterns.
  - `lint:a11y` reports 285 errors.
- **M4 Asset sprawl.**
  - 112 identical-file groups.
  - 13 loose SVGs at `brand/` root, near-duplicates of `design-system/assets`.
  - 7+ favicon sets.
  - `ASSET-LOCATIONS.md` already names `design-system/assets` canonical, but `brand/` ignores it.

### Low
- **L1 Doc sprawl.**
  - `brand/INDEX.md` has 4 dead links.
  - Topic pairs exist in both HTML and markdown form: universe bible, sonic identity, the better-than-human manifesto, brand kit.
  - Stale plans: `CONSOLIDATION-PLAN.md` (0/14 checked but partly done), `FEATURES.md`, `WORLD-CLASS-FEATURES.md`, the Dec 2024 audit.
  - Marketing and strategy material sits inside `brand/` (`docs/`, much of `evolution/`).
  - Single-file folders.
  - `playground/` holds 9 prototype HTML files.

## Target organization

```
design-system/                      # CODE source of truth
  tokens/                           # DTCG ($value/$type), one domain per file
    color.json          # colors + glow + emotional moods + dark theme (incl. dark persona colors)
    typography.json     # + responsive scale + emotional weights
    spacing.json  shape.json  effects.json  states.json  icons.json
    motion.json         # animation + motion + physics → one duration/easing/spring scale
    haptics.json        # + expanded
    sonic.json          # + sounds
    personas.json       # roster + persona kits (core vs marketplace tier; legacy excluded)
    expressions.json  i18n.json
  content/                          # non-token copy data: content, templates, guardrails, personality, illustration
  build/                            # Style Dictionary config + small custom formats (<500 lines each)
    targets: css (light/dark), ts, tailwind preset, swift, kotlin + colors.xml, portal css
  checks/                           # drift (content diff), brand, token-level a11y
  assets/                           # ONLY canonical binary store: logos/ favicons/ icons/ social/ sounds/
  components/  stories/             # component CSS + Storybook
  README.md  CLAUDE.md
  dist/                             # generated, no timestamps, git-ignored

brand/                              # IDENTITY guidelines only — no tokens, no duplicate assets
  README.md                         # single index (merges INDEX.md + README.md + CLAUDE.md rules)
  guidelines/                       # normative: logo, color, type, voice & tone, characters, motion, sonic
  showcase/                         # HTML books, consuming generated CSS
  strategy/                         # non-normative: evolution, positioning, explorations
```

Generated outputs (all from `design-system/build`, none hand-edited):

| Consumer | Gets |
|---|---|
| apps/web | `tokens.css` (served at build time, not committed), `*.generated.ts` |
| websites (4 portals) | per-portal `tokens.css` + Tailwind preset |
| apps/shared (iOS/macOS) | `FerniTokens.generated.swift` |
| android-native | `FerniTokens.kt` + `colors.xml` |
| packages/ferni-react | generated `tokens.ts` |
| brand showcase | `tokens.css` |

## Execution plan (one PR per phase)

1. **Gate first (small, safe).** Strip timestamps from outputs. Make `tokens:check` regenerate into a temp directory and diff every output. Fix the `_`-key `undefined` bug and the broken exports/imports. *This makes the later phases verifiable.*
2. **Brand truth.** Apply decisions D1–D5 to the docs. Collapse the brand index. Fix the Nayan value, fonts and roster. Extend `brand:check` to catch off-token hex in brand docs and pupils in eye shapes.
3. **Token consolidation.** Migrate to DTCG with Style Dictionary (D6). Merge the duplicate domains, delete orphans, move content data to `content/`. Only the generated outputs' diff should change, and it should be reviewable.
4. **Cross-platform generation.** Add Swift and Kotlin targets. Replace the native hand copies (FerniShared, ios-native, macos, android) and the ferni-react and `brand-colors.ts` copies. *Native builds can't be run in this environment; they need a local Xcode/Gradle check.*
5. **Web consumers.** Delete the hand token CSS in ferni-website and marketplace, and the persona hex in marketplace pages. Wire the Tailwind preset. Retire `brand/master-tokens.css` and `brand-components.css`.
6. **apps/web color consolidation.** One persona-color module (generated). Remove the duplicate maps. Pick one owner for theme/brand services. Normalize or remove `var()` fallbacks (D8). Shrink the `lint:tokens` allowlist.
7. **Assets and docs cleanup.** Deduplicate assets into `design-system/assets` and generate the copies at build time. Stop committing `dist/`, `public/design-system` and `_site`. Archive stale plans. Choose the docs site (D7). Update root CLAUDE.md.

Phases 1–2 are independent of D6. Phases 3–7 depend on the D1–D8 answers.

## Progress

| Phase | Status | Notes |
|---|---|---|
| 1. Drift gate | ✅ Done | Content-based `tokens:check`; deterministic outputs; `undefined` CSS values fixed |
| 2. Brand truth | ✅ Done | Logo/eyes/palette/roster docs aligned; `brand:check` enforces doc colors and no pupils |
| 3. Token consolidation | ◐ Partial | `content/` + `specs/` split, orphans removed, one UI timing scale. **Open:** DTCG conversion + Style Dictionary for CSS; merge `glow-colors`, `responsive` typography/spacing, two breakpoint scales (`spacing.json` 640/768/1024/1280/1536 vs `responsive.json` 768/1024/1440) |
| 4. Native generation | ✅ Done (unbuilt) | Swift + Kotlin/XML generated; hand copies replaced. **Needs a local Xcode/Gradle build** |
| 5. Website consumers | ◐ Partial | Marketplace persona pages and ferni-website Tailwind use tokens. **Open (visual review needed):** ferni-website `src/css/tokens.css` (86 values differ from `_tokens.css`, used by the story/legal layouts incl. the homepage) and `brand/master-tokens.css` (~40 showcase pages) |
| 6. apps/web colors | ◐ Partial | persona-harmony and persona-aura derive from generated tokens. **Open:** `config/semantic-colors.ts` and `mood-palette.ts`/`mood-weight.ts` should become token files (`color-emotional.json`, `typography-emotional.json`); 5,000+ `var()` fallbacks; one owner for theme/brand services |
| 7. Assets & docs | ☐ Not started | Needs a decision on generating (not committing) `dist/`, `public/design-system` and `_site`, since deploys currently rely on the committed copies |

