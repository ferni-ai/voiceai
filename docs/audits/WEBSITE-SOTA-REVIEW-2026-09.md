# ferni.ai — State-of-the-Art Review (September 2026)

> Scope: `apps/website/ferni-website` (marketing site, blog), its AI features and publishing
> automation. Companion to `DESIGN-SYSTEM-BRAND-AUDIT-2026-09.md`.

## Verdict

The site is warm and on-brand, but it is **not award-level**. The 2026 bar (Awwwards SOTD, FWA,
Webby) rewards one idea told with craft, speed and restraint. Ferni's site instead:

- tells about ten ideas across 18 sections;
- ships about 1 MB of CSS and JS on every page;
- never lets a visitor *hear* the product, even though it's voice-first.

The foundations are now clean: tokens, one shell, consent, a publish pipeline. The next step is
a focused redesign, not more patching.

## Fixed in this pass (PR #107)

| Area | What changed |
| --- | --- |
| Chrome | One shell for every page (nav, footer, legal links). There were three nav variants and double footers. |
| Theme | Dark-mode CSS leaked onto light-pinned pages. It's now guarded everywhere; token aliases use `var()`. |
| Tailwind | Opacity modifiers work with token colors (`color-mix`); `text-display-sm` added. |
| Home | Memory timeline had dark text on dark. Removed the empty social-proof band, finished the mic icon, and floating UI no longer covers the cookie banner. |
| FAQ | Unstyled text → accessible `<details>` accordion + FAQPage JSON-LD. |
| 404 | Ferni's eyes glance around instead of a "?". |
| Tokens | EQ micro-animation easings were undefined, so the animations were silently dropped. Removed dead utilities. |
| Publishing | Landing deploy pointed at a deleted `promo/` dir and ran only by hand. It now deploys on merge. Weekly AI blog drafts open as PRs for review. |
| AI features | Flags fail closed; model output is escaped; the persona box contract is fixed; cache shapes are consistent. |
| Security | `PUT /api/landing/flags` was unauthenticated. TTS/LLM endpoints had no per-IP limit. The admin API accepted a key committed to the repo. |
| Compliance | GA ran without consent, and "Decline" only hid the banner. Consent Mode v2 now defaults to denied, and every tracker is gated. |

## Measured gaps (September 29, 2026 build)

| Metric | Home | About | Terms | 2026 target |
| --- | --- | --- | --- | --- |
| Page height | 20,455 px | 9,887 px | 20,745 px | Home ≤ 8,000 px |
| Sections | 18 | — | — | 6–8 |
| Stylesheets | 15 req / 527 KB | 15 / 527 KB | 16 / 557 KB | 1–2 req, ≤ 60 KB |
| Scripts | 19 req / 468 KB | 10 / 253 KB | 10 / 253 KB | ≤ 80 KB, deferred |

Sizes are uncompressed. Other counts: 58 CSS files (`story-brand.css` alone is 7,555 lines), 50 JS files, and five preview/prototype pages built into production output (`/preview-*`, `/tailwind-landing`, `/story-brand`, `/pages`).

## What isn't award-level, and what SOTA looks like

### 1. Narrative and layout
- **Now:** a 2021-style SaaS scroll. Centered orb, headline, two buttons, trust chips, then grids of icon-in-a-square cards, repeated "free for everyone" blocks and FAQs.
- **SOTA:** one sentence, one moment, one action. The strongest idea already on the page is **"3:47 AM"**. Build the whole home page around it: *it's late, you can't sleep, someone is here*. Fold 18 sections into about 7 chapters:
  1. hear Ferni
  2. the 3am moment
  3. memory
  4. the team
  5. trust and privacy
  6. how it's free
  7. begin

### 2. Voice-first, but silent
- **Now:** voice samples sit deep in the page, and the hero is text.
- **SOTA:** the hero *is* the product. Press to hear Ferni, with a live waveform and eyes that react as it speaks. Captions stay on for accessibility.
- **Cost:** reuse `voice-samples.js` and the `/api/landing/tts` endpoint, which is now rate limited. Cache the audio at build time so it's free and instant.

### 3. Art direction
- **Now:** the blog art (organic paper-cut shapes in persona colours) is distinctive, but the site doesn't use it. Pages are cream background plus white cards.
- **SOTA:** one illustration language used everywhere:
  - organic shapes as section transitions, persona "constellations" and hero backdrops;
  - paper grain texture;
  - generous negative space (the brand's "Ma" spacing).

### 4. Typography
- **Now:** Plus Jakarta Sans at 700–800 weight for every heading. It's competent but generic.
- **SOTA:** an expressive pairing. Keep Jakarta for UI and add an editorial display face (variable serif or humanist) for chapter titles and quotes. Add fluid type (`clamp()` tokens are already in `typography.json`), optical sizes and tighter measure control.

### 5. Motion (the web platform caught up)
- **Now:** fade-up on scroll, JS IntersectionObservers, and many timers.
- **SOTA 2026, all native CSS with no library:**
  - **Scroll-driven animations** (`animation-timeline: view()`) for the memory timeline and the 3am clock.
  - **Cross-document View Transitions** (`@view-transition { navigation: auto }`) so page changes morph: the persona avatar flies into its team page.
  - **`@starting-style`** for entry animations; **`interpolate-size`** for the FAQ open/close.
  - Everything honors `prefers-reduced-motion`. That's a 2026 judging criterion, not optional.

### 6. Dark mode
- **Now:** pinned light because the old dark theme was broken.
- **SOTA:** a real Cedar Night theme via `light-dark()` in the generated tokens, plus a toggle. The "3am" story practically demands a night mode.

### 7. Performance (Core Web Vitals are judged)
- One CSS bundle per page type: tokens + shell + page, with the critical CSS inlined. That replaces 15 requests.
- Scripts: ES modules, `defer`, and a home-only bundle. Delete the 13 unreferenced files and the dead features: memory-demo module, voice-demo, chat-widget, demo-widget, ai-personalization.
- Images in AVIF/WebP with `srcset`; fonts self-hosted with `font-display: swap` and subset.
- Exclude `preview-*`, `tailwind-landing`, `story-brand` and `pages/` from production builds.

### 8. Architecture and code
- **One styling approach.** Hand-written BEM + tokens, *or* Tailwind. Mixing both costs about 500 KB. Recommendation: keep BEM + tokens (it's the design-system path) and use Tailwind only in the three pages that already use it, then migrate them.
- **Retire** `base.njk`, `home.njk`, `home-v2.njk` and `css-legacy/` once nothing references them.
- **One owner for the hero.** Four scripts currently rewrite it (`ai-copy-magic`, `landing-intelligence`, `experiment-variants`, `ai-powered-landing`), which makes it flicker.

### 9. Intelligence: make it real, visible and honest
- **Real:** chat, smart FAQ, 2am scenario, waitlist.
- **Fake or dead:** the storytelling "AI" (a built-in rotation), memory demo, persona quiz, superpowers demo, A/B tests (the flags aren't registered, so everyone gets control), and experiment events (logged, never stored).
- **SOTA:** fewer, visible, honest AI moments.
  - **"Talk to Ferni" in the hero:** voice, real, rate limited.
  - **"Ask anything" FAQ:** real, with citations to the page content.
  - **Real experiments:** register the `hero-*` flags and persist the events so the page learns.
  - **Honesty:** delete built-in text that's presented as AI, and label anything illustrative as an example.

### 10. Automation (now wired)
- **Publishing:** merging to `main` deploys the landing site. `blog-autopilot.yml` drafts a post weekly and opens a PR for review.
- **Next steps:**
  - Lighthouse CI budgets on the landing site (the workflow path is now fixed).
  - Visual-regression screenshots in CI, using the same Playwright script from this audit.
  - Social snippets and a newsletter generated from each merged post.

## Decisions needed (content and brand, not code)

1. **Claims that conflict.** These are left unchanged pending your call:
   - **Pricing:** JSON-LD and Terms list paid tiers ($9.99 / $19.99, trials), but the Give page says free for everyone with no tiers.
   - **Encryption:** "End-to-end encrypted" (trust chips, FAQ) vs "encrypted in transit and at rest" (Privacy).
   - **Stats:** "10K+ conversations" is hardcoded; the capabilities counts disagree (45+ / 28 / 146).
   - **Invented anecdotes:** the backend prompt asks Gemini to invent anecdotes that "feel REAL" ("Last night at 2:47am, someone had a breakthrough").
   - **Stale date:** the Cookies page says "Last updated December 2024".
2. **Where the developer blog lives.** `/developers/**` redirects to developers.ferni.ai, so the 23 posts in `src/dev-blog` are unreachable. That portal has 5 older copies. Pick one home.
3. **Admin key in the web bundle.** `cloudbuild-ui.yaml` bakes `VITE_ADMIN_API_KEY` into the public app bundle. Move admin auth to Firebase custom claims and rotate the key.
4. **Redesign go-ahead.** Approve the "3am" narrative direction (sections 1–6 above) and I'll build it behind a preview channel with before/after screenshots.

## Suggested sequence

| Phase | Work | Outcome |
| --- | --- | --- |
| A (1–2 days) | Perf: CSS/JS bundles, drop preview pages and dead code, image pipeline, Lighthouse CI | Fast; CWV green |
| B (3–5 days) | Home redesign: 7 chapters, voice hero, scroll-driven 3am/memory, illustration system | The award-level idea |
| C (2 days) | View Transitions, Cedar Night theme with toggle, editorial type pairing | Delight and polish |
| D (1–2 days) | Real experiments, persisted events, honest AI copy, visual-regression CI | Site that learns, safely |
