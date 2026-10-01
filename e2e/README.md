# Root E2E suite (`e2e/`)

Playwright end-to-end tests for the web app (`apps/web`) and the UI server API.
Config: [`playwright.config.ts`](../playwright.config.ts). Shared helpers:
[`support/`](support/).

**Default run = offline.** `pnpm test:e2e:offline` starts the Vite dev server on
`:5173`, mocks the UI server in the browser, signs in a dev-only stand-in user,
and fails any test that tries to reach a host other than localhost. Nothing
else needs to be running and no credentials are used.

## Quick start

```bash
# Chromium: either the pinned Playwright revision, or a preinstalled one
export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium   # optional

pnpm test:e2e:offline            # frontend-only tests, fully offline (default suite)
pnpm test:e2e:server             # needs `pnpm ui-server` on :3002
pnpm test:e2e:server:vitest      # the two Vitest API suites, also need :3002
pnpm test:e2e:agent              # needs the voice agent (and UI server)
pnpm test:e2e:landing            # needs E2E_LANDING_URL (marketing site)
pnpm test:e2e:typecheck          # Playwright doesn't type-check; this does

# Several suites at once
E2E_SUITES=offline,server pnpm exec playwright test
```

## Suites and tags

Tests are grouped by what they need. Tags live on `test.describe(...)` or
`test(...)` (`{ tag: '@needs-server' }`); the config builds one Playwright
project per suite from them.

| Suite (`E2E_SUITES`) | Selects | Needs | Mocked backend |
| --- | --- | --- | --- |
| `offline` (default) | everything **without** a `@needs-*` tag | Vite (started by the config) | yes |
| `server` | `@needs-server` (not `@needs-agent`) | UI server API at `E2E_API_URL` (`pnpm ui-server`) | no |
| `agent` | `@needs-agent` | voice agent HTTP port at `E2E_AGENT_URL`, LiveKit, plus the UI server | no |
| `landing` | `@needs-landing` | marketing site at `E2E_LANDING_URL` (skipped when unset) | no |

`E2E_ALL_BROWSERS=1` adds Firefox, WebKit and mobile variants of the offline
project (their browsers must be installed).

## Targets and the localhost guard

All targets come from env (see [`support/env.ts`](support/env.ts)) and default
to local servers:

| Variable | Default | Used for |
| --- | --- | --- |
| `E2E_BASE_URL` | `http://localhost:5173` | the web app (Vite dev server; the config starts it) |
| `E2E_API_URL` | `http://localhost:3002` | UI server API (`TEST_API_URL` / `TEST_BASE_URL` still read as fallbacks) |
| `E2E_AGENT_URL` | `http://localhost:8080` | voice agent health/observability (`AGENT_URL` fallback) |
| `E2E_LANDING_URL` | unset → landing tests skip | marketing site (`apps/website/ferni-website`) |
| `E2E_ALLOW_REMOTE` | unset | `1` permits non-localhost targets |

Guards, all failing fast unless `E2E_ALLOW_REMOTE=1`:

1. `support/env.ts` throws at import time if any configured URL isn't localhost,
   and `global-setup.ts` re-checks them before any test runs.
2. The `request` fixture is wrapped: an `APIRequestContext` call to a non-local
   URL throws.
3. Every browser context gets a catch-all `context.route` and
   `routeWebSocket`: a request or WebSocket to a non-local host is aborted and
   **fails the test**. A response from a non-loopback server address fails it
   too. The third-party assets the app's HTML loads (GSAP from cdnjs, Google
   Fonts CSS, Google Identity Services, Spotify SDK) are answered with local
   stand-ins so they never leave the machine.
4. Service workers are blocked (their requests would bypass routing).
5. Network-level backstop: the browser is launched with a proxy on a closed
   local port (`--proxy-server=http://127.0.0.1:9`; loopback bypasses it), so
   connections `page.route` can't see, such as speculative preconnects, DNS
   prefetch and Chromium's background services, fail with
   `ERR_PROXY_CONNECTION_FAILED` on this machine instead of going out.

`E2E_NETWORK_LOG=/tmp/e2e-net.log` appends one line per intercepted non-local
request (`stubbed <url>` or `blocked <url>`) to audit a run.

Smoke-testing a deployed environment is opt-in and explicit, for example:

```bash
E2E_ALLOW_REMOTE=1 E2E_LANDING_URL=https://ferni.ai pnpm test:e2e:landing
```

## Offline fixtures

Specs import `test`/`expect` from [`support/fixtures.ts`](support/fixtures.ts),
not from `@playwright/test`. Ported from `apps/web/tests/e2e/fixtures.ts`:

- **Dev auth user**: `ferni_dev_auth_user` is seeded in localStorage. The app
  reads it only when `import.meta.env.DEV` (see
  `apps/web/src/services/dev-auth-user.ts`), so it gets past the sign-in gate
  without Firebase. Turn off with `test.use({ seedDevAuthUser: false })`.
- **Mocked backend** (offline suite only, option `mockBackend`): every path
  the Vite dev server proxies to the UI server (`/api`, `/token`,
  `/subscription`, `/spotify`, `/wearables`, `/auth`, `/calendar`, `/usage`,
  `/health`, ...) is answered with `context.route`: `/api/agents` returns two
  personas, `/health` is OK, everything else is a JSON 404 the app must
  tolerate. A test overrides any route with `page.route` (page routes win).
- **`prepareContext`**: for tests that create contexts with
  `browser.newContext()`, applies the same guard, mocks and user.

App helpers in [`support/app.ts`](support/app.ts) follow the real DOM:
`APP_LOADED` (`body.app-loaded`), `openSettingsMenu`, `clickMenuItem` (expands
the menu section that holds an item), `seedRelationship` (relationship stage,
which gates menu sections and features), `pinMenuItems` (some panels are only
listed in the menu as pinned favorites), and Digital Twin helpers that mock
`/api/custom-agents` and open the twin's journal or profile wizard from the
marketplace.

## Inventory

Every spec, classified by what it needs:

- **(a)** frontend only: runs offline against Vite with the mocked backend
- **(b)** the UI server API (`@needs-server`)
- **(c)** a live voice agent or LiveKit (`@needs-agent`)
- **(d)** defaulted to production or another remote URL before this change
  (now all default to localhost; the marketing-site tests are opt-in via
  `@needs-landing`)

Counts are Playwright tests (parameterized tests expanded) in the Chromium
project: **916 tests in 63 files**: 390 offline (a), 494 `@needs-server` (b),
5 `@needs-agent` (c; these need the UI server too), 27 `@needs-landing`. Seven
files used to default to a remote host (d). A file can mix classes, typically
"X API" tests (b) next to "X UI" tests (a).

| Spec | Class | Offline (a) | `@needs-server` (b) | `@needs-agent` (c) | `@needs-landing` | Used to default to |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `accent-settings.spec.ts` | a, b | 3 | 4 |  |  |  |
| `accessibility.spec.ts` | a | 8 |  |  |  |  |
| `action-confirmation.spec.ts` | b |  | 8 |  |  |  |
| `admin-dashboard-comprehensive.spec.ts` | a | 40 |  |  |  |  |
| `admin-portal.spec.ts` | a, b | 14 | 9 |  |  |  |
| `analytics.spec.ts` | a, b | 4 | 9 |  |  |  |
| `auth.spec.ts` | b |  | 17 |  |  |  |
| `billing.spec.ts` | a, b | 2 | 2 |  |  |  |
| `burnout-prevention.spec.ts` | b |  | 12 |  |  |  |
| `calendar.spec.ts` | a, b, c, d | 4 | 18 | 2 |  | http://34.134.186.63:8080 (agent tests) |
| `cognitive-differentiation.spec.ts` | a, b | 1 | 12 |  |  |  |
| `cognitive-insights.spec.ts` | a, b | 2 | 4 |  |  |  |
| `commitment-tracking.spec.ts` | b |  | 13 |  |  |  |
| `contact-settings.spec.ts` | a, b | 4 | 5 |  |  |  |
| `conversation-history.spec.ts` | a, b | 4 | 2 |  |  |  |
| `custom-agent.spec.ts` | b |  | 22 |  |  |  |
| `daily-checkin.spec.ts` | b |  | 20 |  |  |  |
| `dashboard.spec.ts` | a | 9 |  |  |  |  |
| `data-export.spec.ts` | a, b | 1 | 9 |  |  |  |
| `dev-panel.spec.ts` | a | 76 |  |  |  |  |
| `digital-twin.spec.ts` | a, b, c | 9 | 3 | 1 |  |  |
| `ferni-eq.spec.ts` | a, b, d | 9 | 1 |  |  | https://app.ferni.ai |
| `ferni-fund.spec.ts` | a, b | 4 | 5 |  |  |  |
| `games.spec.ts` | a, b | 11 | 7 |  |  |  |
| `google-one-tap.spec.ts` | a | 8 |  |  |  |  |
| `group-coaching.spec.ts` | b |  | 11 |  |  |  |
| `group-conversation.spec.ts` | b |  | 12 |  |  |  |
| `growth.spec.ts` | b |  | 16 |  |  |  |
| `guided-practices.spec.ts` | a, b | 11 | 8 |  |  |  |
| `household.spec.ts` | a, b | 4 | 15 |  |  |  |
| `human-listening.spec.ts` | a, b | 4 | 1 |  |  |  |
| `integrations.spec.ts` | b |  | 15 |  |  |  |
| `journey.spec.ts` | a, b | 15 | 13 |  |  |  |
| `landing-accessibility.spec.ts` | d |  |  |  | 13 | https://ferni.ai |
| `landing-intelligence.spec.ts` | b, d |  | 9 |  | 14 |  |
| `language-selector.spec.ts` | a | 8 |  |  |  |  |
| `memory-browser.spec.ts` | a, b | 3 | 4 |  |  |  |
| `memory-enhancement.spec.ts` | a, b | 7 | 16 |  |  |  |
| `music-dashboard.spec.ts` | a, b | 4 | 6 |  |  |  |
| `notifications.spec.ts` | a, b | 3 | 2 |  |  |  |
| `onboarding.spec.ts` | a | 7 |  |  |  |  |
| `outreach.spec.ts` | a, b | 3 | 8 |  |  |  |
| `persona-handoff.spec.ts` | a, b, d | 5 | 6 |  |  | https://app.ferni.ai |
| `personalize.spec.ts` | a, b | 3 | 5 |  |  |  |
| `practice-view.spec.ts` | a, b | 2 | 21 |  |  |  |
| `prediction-tracker.spec.ts` | a, b | 2 | 9 |  |  |  |
| `predictive-intelligence.spec.ts` | a, b | 1 | 10 |  |  |  |
| `referral.spec.ts` | a, b | 4 | 4 |  |  |  |
| `relationship-arc.spec.ts` | a, b | 3 | 6 |  |  |  |
| `ritual-builder.spec.ts` | a, b | 2 | 5 |  |  |  |
| `roadmap.spec.ts` | a, b | 9 | 8 |  |  |  |
| `subscription.spec.ts` | a, b | 4 | 2 |  |  |  |
| `team-huddle.spec.ts` | a, b | 1 | 12 |  |  |  |
| `team-roster-unlock.spec.ts` | a, b, d | 8 | 2 |  |  | https://app.ferni.ai |
| `theme-toggle.spec.ts` | a | 5 |  |  |  |  |
| `tool-calling.spec.ts` | a, b, c, d | 3 | 11 | 2 |  | https://app.ferni.ai + http://34.134.186.63:8080 |
| `trust-systems.spec.ts` | a, b | 20 | 14 |  |  |  |
| `utilities.spec.ts` | b, d |  | 13 |  |  | https://app.ferni.ai |
| `video-sessions.spec.ts` | b |  | 11 |  |  |  |
| `voice-identity.spec.ts` | a, b | 3 | 14 |  |  |  |
| `voice-journal.spec.ts` | a | 29 |  |  |  |  |
| `wearable.spec.ts` | b |  | 12 |  |  |  |
| `wellbeing.spec.ts` | a, b | 4 | 11 |  |  |  |
| **Total** | | **390** | **494** | **5** | **27** | |

Not run by Playwright:

| File | Runner | Class | Tests |
| --- | --- | --- | ---: |
| `predictive-outreach.spec.ts` | Vitest (`pnpm test:e2e:server:vitest`) | b | 12 |
| `intelligent-outreach.e2e.ts` | Vitest (`pnpm test:e2e:server:vitest`) | b | 15 |

## Known gaps

- **Pre-existing skips** (2, both `test.skip(...)` in the source):
  `data-export.spec.ts` "Data Export modal shows all categories" and
  `guided-practices.spec.ts` "shows info message when not connected to agent".
- **Tests that pass without exercising the UI** (they look for an entry point
  that no longer exists and do nothing when it is missing):
  `outreach.spec.ts` "Upcoming Check-ins UI" (3; the outreach schedule has no
  menu entry), `prediction-tracker.spec.ts` "predictions panel can be
  accessed", `team-huddle.spec.ts` "can request team huddle from menu",
  `journey.spec.ts` "can open journey modal from settings menu".
- **Panels the menu lists only as pinned favorites** (the tests pin them with
  `pinMenuItems`): Voice Accent, Support Ferni, What I've Learned, Progress
  Analytics, Wellbeing, Memory Browser, Contact Info, Voice ID, Household,
  Personalize. Several of these have no other entry point in the UI.
- **Guided practices panel** (`ui/commands.ui.ts`): the menu's "Guided
  Practices" item now opens the Sanctuary; the panel is still wired up by
  `app.ts` but nothing opens it, so its tests open it through its module.
- The server, agent and landing suites need real services and were not run
  while preparing the offline suite.

## Writing tests

- Import from `./support/fixtures` and read URLs from `./support/env`; never
  hard-code a host.
- A test that asserts on real backend data or calls the API with `request`
  belongs in the server suite: tag it `@needs-server`. One that needs the voice
  agent: `@needs-agent`.
- Prefer the real user path (menu item, button) over dispatching events, and
  selectors from `apps/web/src` over guesses. Scope generic selectors such as
  `[role="dialog"]` or `[data-action="close"]` to the component: many panels
  stay in the DOM while hidden.
- Toasts render as `.whisper` (`apps/web/src/ui/whisper.ui.ts`).
