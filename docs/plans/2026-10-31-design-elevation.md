# Design elevation (2026-10-31)

Seth asked how to make Ferni's design award-level ("better than Apple, Pixar and
Anthropic") and then said "Lets do it all!" to the ten moves in the
[design audit](https://claude.ai/artifact/2Gpn5BTC8Hn5BtcGjbaRoK). This plan is how
they land: small PRs from `origin/main`, new behaviour off by default.

## The moves and their PRs

| # | Move | How it lands | Switch |
|---|---|---|---|
| 1 | Let people meet the avatar already built | #3265: both prod web builds pass the 13 motion switches and calm idle | repo variables, all unset |
| 2, 3 | Calm home screen: no split-heart badge, no one-person picker, no rituals count | `app/calm-idle-screen.ts` + `styles/calm-idle.css` | `VITE_CALM_IDLE` (existing calm idle flag) |
| 10 | The avatar survives a CDN outage | gsap bundled from the package, CDN tag removed | none (no visible change) |
| 8 | One design system the app reads | `app-design-debt.ts` ratchet; codemods by area follow | none (CI only) |
| 5, 7 | ferni.ai: a hero you can hear, half the sections, "Meet Ferni" | `index.njk` renders `/` and a `/home-next/` preview (pagination over `homeNext`) | the page itself (noindex, unlinked) |
| 6 | Menu down to six groups | after a menu map; the menu file is 2,600 lines and can't grow | a new web flag |
| 4, 9 | One drawn Ferni and a sound motif | [brief](https://claude.ai/artifact/Dup3sPnm2NBEXAEG4DpibQ); art lands behind `faceEngine` and `soundDirector` | existing motion switches |

## Rollout

1. Each motion switch is turned on in dev (a repo variable for the build, or
   `localStorage` per browser), looked at and listened to, then prod.
2. Calm idle: on in dev, then prod once Seth has seen it.
3. Homepage: Seth reviews `/home-next/`. On his OK, the sections it hides are
   deleted from `index.njk`, the `homeNext` conditionals and the pagination go. `site.json` `brand.promise` and the
   experiment variants that still say "Better than human." change in that PR.
4. App design debt: codemods swap literals for tokens one area at a time, with the
   light theme pixel-identical, and lower the baseline each time.

## Found along the way

- Seven scripts on the homepage rewrite the hero tagline (`ferni-character.js`,
  `experiment-variants.js`, `landing-intelligence.js`, `ai-copy-magic.js`,
  `ai-powered-landing.js`, `ai-personalization.js`, `scroll-hero.js`). The
  preview opts out with `data-hero-copy="fixed"`; the swap should leave one owner.
- `body.connected` is read in `unified-indicator.ui.ts` but nothing sets it.
