# Hardcoded colors: design review

Generated 2026-10-02 from the brand linter (`pnpm tsx apps/cli/src/commands/quality/lint-brand.ts`, rule `no-hardcoded-hex-colors`) and `design-system/dist/tokens.css`. Scope: `apps/web` and `apps/website/ferni-website`.

## Why these weren't swapped automatically

Most `--color-*` tokens change value between themes: `:root` is the default dark theme, `[data-theme="zen"]` is light, `[data-theme="midnight"]` is darker. Of the 44 `--color-*` tokens with hex values, 15 keep one value in every theme. Replacing a hardcoded hex with a token makes that element follow the theme, which changes how it looks in zen and midnight. That is often what the brand wants, but whether it is right depends on what the element sits on, so each needs a look. Two automated attempts that ignored this were rejected: they turned cream text dark ink in zen.

## Summary

| | Occurrences | Distinct values |
|---|---|---|
| Hardcoded hex flagged | 914 | 266 |
| Equal to a token's default (`:root`) value | 420 | 34 |
| ...where that token is the same in every theme (safe to swap) | 410 | 32 |
| No token has this value | 494 | 232 |

## Values that equal a token

Swapping these keeps the default (dark) theme identical. The zen and midnight columns show what the element would become there ("same" means the token does not change).

| Hex | Uses | Token(s) | zen | midnight | Top files |
|---|---|---|---|---|---|
| `#4a6741` | 140 | `--viz-river-ferni`, `--viz-energy-source`, `--viz-growth-ring-active` | same | same | web/src/ui/digital-twin.ui.ts (18); website/ferni-website/src/js/voice-samples.js (10) |
| `#3a6b73` | 36 | `--viz-river-user`, `--viz-moods-focused`, `--category-mentorship-text` | same | same | web/src/ui/oura-settings.ui.ts (6); web/src/ui/your-year-with-ferni.ui.ts (2) |
| `#a67a6a` | 32 | `--category-health-text`, `--category-health-primary` | same | same | web/src/ui/digital-twin.ui.ts (3); web/src/ui/your-year-with-ferni.ui.ts (2) |
| `#ffffff` | 32 | `--cinematic-text-hero` | same | same | web/src/config/semantic-colors.ts (5); web/src/ui/ferni-logo.ui.ts (3) |
| `#c4856a` | 26 | `--viz-energy-drain`, `--viz-seasons-autumn`, `--category-lifestyle-text` | same | same | web/src/config/semantic-colors.ts (3); web/src/ui/your-year-with-ferni.ui.ts (2) |
| `#5a6b8a` | 24 | `--viz-seasons-winter` | same | same | web/src/config/semantic-colors.ts (3); web/src/ui/your-year-with-ferni.ui.ts (2) |
| `#b8956a` | 18 | `--glow-color-wisdom`, `--viz-kintsugi-subtle`, `--viz-constellation-node` | same | same | web/src/config/semantic-colors.ts (3); web/src/ui/your-year-with-ferni.ui.ts (2) |
| `#756a5e` | 16 | `--viz-moods-tired`, `--viz-priority-low`, `--comparison-before-text` | same | same | website/ferni-website/src/js/ferni-sentience.js (7); website/ferni-website/src/js/better-than-human.js (6) |
| `#3d5a45` | 13 | `--viz-moods-calm`, `--viz-status-balanced`, `--viz-chapters-growth` | same | same | web/src/ui/visualizations/types.ts (3); web/src/ui/visualizations/native/index.ts (3) |
| `#faf8f5` | 9 | `--color-natural-paper-cream`, `--gradient-hero-light-start`, `--gradient-warm-sunrise-start` | #fffdfb | #faf8f5 | web/src/ui/team-huddle.ui.ts (2); website/ferni-website/src/js/forms-enhanced.js (2) |
| `#4285f4` | 8 | `--external-gemini-primary`, `--external-google-primary` | same | same | web/src/ui/calendar-settings.ui.ts (2); web/src/ui/calendar-selection.ui.ts (2) |
| `#b5453a` | 8 | `--viz-moods-anxious`, `--viz-priority-high`, `--comparison-bad-text` | same | same | web/src/ui/visualizations/types.ts (4); website/ferni-website/src/js/forms-enhanced.js (4) |
| `#8a7a6a` | 7 | `--viz-energy-neutral`, `--category-custom-text`, `--category-custom-primary` | same | same | web/src/ui/digital-twin.ui.ts (2); web/src/ui/next-checkin.ui.ts (1) |
| `#a86d55` | 5 | `--category-lifestyle-secondary` | same | same | web/src/ui/your-year-with-ferni.ui.ts (2); web/src/config/semantic-colors.ts (2) |
| `#000000` | 5 | `--external-apple-primary` | same | same | web/src/ui/trigger-debug-panel.ui.ts (2); web/src/ui/sign-in-gate.ui.ts (1) |
| `#5c544a` | 5 | `--color-natural-ink-light` | #5c544a | #5c544a | web/src/ui/ferni-awakens.ui.ts (1); web/src/config/semantic-colors.ts (1) |
| `#3d7a52` | 5 | `--viz-status-thriving`, `--comparison-good-text` | same | same | website/ferni-website/src/js/forms-enhanced.js (4); web/src/ui/visualizations/types.ts (1) |
| `#8a635a` | 4 | `--category-health-secondary` | same | same | web/src/ui/your-year-with-ferni.ui.ts (2); web/src/services/persona-aura.ts (1) |
| `#c4a77d` | 4 | `--color-natural-tea` | #c4a77d | #c4a77d | web/src/ui/narrative-visuals.ui.ts (2); web/src/ui/insight-cards.ui.ts (2) |
| `#2d5359` | 3 | `--category-mentorship-secondary` | same | same | web/src/ui/your-year-with-ferni.ui.ts (2); web/src/services/persona-aura.ts (1) |
| `#ff6b6b` | 2 | `--glow-color-excitement` | same | same | web/src/ui/health-dashboard.ui.ts (1); website/ferni-website/src/js/waitlist-modal.js (1) |
| `#ffd700` | 2 | `--glow-color-joy` | same | same | web/src/services/cosmetics.service.ts (1); website/ferni-website/src/js/waitlist-modal.js (1) |
| `#c4956a` | 2 | `--viz-moods-joyful`, `--viz-chapters-transition` | same | same | web/src/ui/visualizations/types.ts (2) |
| `#7a6a8a` | 2 | `--viz-moods-reflective`, `--viz-chapters-reflection` | same | same | web/src/ui/visualizations/types.ts (2) |
| `#4a7a52` | 2 | `--viz-moods-energized`, `--viz-chapters-celebration` | same | same | web/src/ui/visualizations/types.ts (2) |
| `#a67c35` | 2 | `--viz-priority-medium`, `--viz-status-stretched` | same | same | web/src/ui/visualizations/types.ts (2) |
| `#1db954` | 1 | `--external-spotify-primary` | same | same | web/src/ui/game-picker.ui.ts (1) |
| `#2d4a35` | 1 | `--color-natural-forest-green` | #3d5a45 | #2d4a35 | web/src/ui/digital-twin.ui.ts (1) |
| `#f5f2ed` | 1 | `--color-natural-paper-sand`, `--gradient-hero-light-end`, `--comparison-before-background` | same | #f5f2ed | web/src/pages/payment-complete.ts (1) |
| `#a54545` | 1 | `--viz-moods-stressed` | same | same | web/src/ui/visualizations/types.ts (1) |
| `#5a8a73` | 1 | `--viz-moods-peaceful` | same | same | web/src/ui/visualizations/types.ts (1) |
| `#6a6a6a` | 1 | `--viz-moods-uncertain` | same | same | web/src/ui/visualizations/types.ts (1) |
| `#c67840` | 1 | `--viz-status-depleted` | same | same | web/src/ui/visualizations/types.ts (1) |
| `#8a6a7a` | 1 | `--category-entertainment-text`, `--category-entertainment-primary` | same | same | website/ferni-website/src/js/demo-widget.js (1) |

## Values with no matching token (top 40 by use)

Each needs a decision: map to the nearest token, add a token, or keep (for example canvas or chart code that can't read CSS variables).

| Hex | Uses | Top files |
|---|---|---|
| `#2c2520` | 27 | web/src/ui/digital-twin.ui.ts (4); web/src/admin/AdminPortal.ts (3) |
| `#3d5a35` | 25 | web/src/ui/your-year-with-ferni.ui.ts (3); web/src/ui/team-huddle.ui.ts (2) |
| `#c4a265` | 16 | web/src/ui/digital-twin.ui.ts (10); web/src/config/semantic-colors.ts (4) |
| `#70605a` | 9 | website/ferni-website/src/js/voice-samples.js (4); website/ferni-website/src/js/ai-powered-landing.js (4) |
| `#ff2d55` | 9 | web/src/ui/apple-health-settings.ui.ts (9) |
| `#5a8060` | 8 | web/src/ui/favicon-manager.ui.ts (3); web/src/ui/your-year-with-ferni.ui.ts (2) |
| `#4a7c59` | 8 | web/src/ui/narrative-visuals.ui.ts (3); web/src/ui/insight-cards.ui.ts (3) |
| `#0078d4` | 7 | web/src/ui/calendar-settings.ui.ts (3); web/src/ui/calendar-selection.ui.ts (2) |
| `#e74c3c` | 7 | web/src/ui/b2b-admin.ui.ts (3); web/src/pages/payment-complete.ts (2) |
| `#9a7a52` | 6 | web/src/ui/your-year-with-ferni.ui.ts (2); web/src/config/persona-colors.ts (2) |
| `#34a853` | 6 | web/src/ui/calendar-settings.ui.ts (2); web/src/ui/sign-in-gate.ui.ts (1) |
| `#fbbc05` | 6 | web/src/ui/calendar-settings.ui.ts (2); web/src/ui/sign-in-gate.ui.ts (1) |
| `#ea4335` | 6 | web/src/ui/calendar-settings.ui.ts (2); web/src/ui/sign-in-gate.ui.ts (1) |
| `#faf6f0` | 6 | web/src/admin/AdminPortal.ts (5); web/src/ui/milestone-card.ui.ts (1) |
| `#9a7b5a` | 6 | web/src/config/semantic-colors.ts (2); web/src/ui/micro-interactions.ui.ts (1) |
| `#666666` | 6 | web/src/services/marketplace.service.ts (5); website/ferni-website/src/js/ferni-character.js (1) |
| `#4a5a73` | 5 | web/src/ui/your-year-with-ferni.ui.ts (2); web/src/config/semantic-colors.ts (2) |
| `#ef4444` | 5 | web/src/ui/custom-agent-wizard.ui.ts (3); web/src/ui/voice-clone-recorder.ui.ts (1) |
| `#44aa66` | 5 | web/src/ui/oura-settings.ui.ts (2); website/ferni-website/src/js/ai-copy-magic.js (2) |
| `#555555` | 5 | web/src/ui/calendar-settings.ui.ts (2); web/src/ui/calendar-selection.ui.ts (2) |
| `#f59e0b` | 4 | web/src/ui/unified-indicator.ui.ts (3); web/src/ui/digital-twin.ui.ts (1) |
| `#8b7355` | 4 | web/src/ui/insight-cards.ui.ts (2); web/src/ui/theme-language-settings.ui.ts (1) |
| `#ddd5cd` | 4 | web/src/ui/mood.ui.ts (4) |
| `#f5f1e8` | 4 | web/src/ui/ferni-logo.ui.ts (1); web/src/ui/ferni-awakens.ui.ts (1) |
| `#96151d` | 4 | web/src/ui/agent-page-builder.ui.ts (4) |
| `#c8102e` | 4 | web/src/ui/accent-settings.ui.ts (4) |
| `#444444` | 4 | web/src/services/marketplace.service.ts (4) |
| `#22c55e` | 4 | web/src/admin/sections/ExperimentsSection.ts (4) |
| `#fafaf9` | 3 | web/src/theme/index.ts (2); web/src/ui/theme-language-settings.ui.ts (1) |
| `#c0392b` | 3 | web/src/ui/weather-effects.ui.ts (2); web/src/ui/visualizations/native/index.ts (1) |
| `#f4a460` | 3 | web/src/ui/value-capture.ui.ts (1); web/src/pages/payment-complete.ts (1) |
| `#f0f0f0` | 3 | web/src/ui/ferni-logo.ui.ts (2); web/src/ui/team.ui.ts (1) |
| `#9b6b6b` | 3 | web/src/ui/insight-cards.ui.ts (2); web/src/ui/narrative-visuals.ui.ts (1) |
| `#fffdfb` | 3 | web/src/ui/ferni-logo.ui.ts (1); web/src/pages/payment-complete.ts (1) |
| `#33dd55` | 3 | web/src/ui/empty-state.ui.ts (1); web/src/pages/payment-complete.ts (1) |
| `#1a1612` | 3 | web/src/ui/avatar-soul.ui.ts (1); web/src/ui/admin.ui.ts (1) |
| `#ff6b8a` | 3 | web/src/ui/apple-health-settings.ui.ts (3) |
| `#aacccc` | 3 | web/src/ui/account-button.ui.ts (3) |
| `#a89a8c` | 3 | web/src/admin/AdminPortal.ts (3) |
| `#7a5a52` | 3 | web/src/config/semantic-colors.ts (3) |

## Purple (`no-purple-colors`)

Several hits are the word "purple" in content (smart-home light colors, a joke in humor-tools, weather types), not brand colors: the rule matches the word anywhere, and should match color values only. Real purple values to review: `src/services/gtm/brand-voice.ts` (`#8b5cf6`, `#a855f7`) and `apps/web/src/styles/inline-styles.css` lines 1090, 13329, 13333.


## Color variables apps/web uses that nothing defines

Measured in the running app (Vite dev server, all three themes) by resolving every `var(--color-*)` that `apps/web/src` uses without a fallback.

| | Undefined names | Uses that render as nothing |
|---|---|---|
| Before this branch | 60 | 2,806 |
| After this branch | 39 | 319 |

What fixed most of it:

- `apps/web/src/styles/inline-styles.css` declared eight tokens as themselves on `:root` (`--color-text-primary: var(--color-text-primary)`, and the same for `-secondary`, `-muted`, `-dimmed`, `--color-border-subtle`, `-medium`, `--color-accent-hover`, `-glow`). A custom property that refers to itself is invalid, so it erased the design-system value in every theme. Visible symptom: on the sign-in page, "Welcome to Ferni" rendered in its fallback `#f4f4f5` on a cream background, almost invisible. Introduced 2025-12-15 in `59fe48ea9`.
- Persona colors (`--color-ferni`, `--color-maya`, `--color-ferni-dark`, ...) were only defined for the website. The design-system build now emits them globally.
- The service worker served `/design-system/*.css` cache-first under a cache name unchanged since 2025-12-25, so returning users kept old tokens. It now revalidates fixed-URL files in the background, and the cache version moves to v4.

Still undefined (each needs a mapping decision: alias to an existing token, add a token, or change the call site):

`--color-border` (111), `--color-background-subtle` (56), `--color-background-hover` (37), `--color-accent-secondary` (26), `--color-accent-light` (22), `--color-background` (11), `--color-bg-subtle` (9), `--color-text-on-accent` (4), `--color-bg` (4), `--color-semantic-success-bg` (3), `--color-background-muted` (3), and 28 names used once or twice (`--color-success-subtle`, `--color-error-bg`, `--color-border-default`, `--color-accent-warm`, `--color-semantic-error-rgb`, `--color-destructive`, `--color-coral`, `--color-accent-primary-alpha-10`/`-20`, ...).
