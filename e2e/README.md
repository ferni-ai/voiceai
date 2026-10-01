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
project.

<!-- inventory-table -->

Not run by Playwright:

| File | Runner | Class | Tests |
| --- | --- | --- | ---: |
| `predictive-outreach.spec.ts` | Vitest (`pnpm test:e2e:server:vitest`) | b | 12 |
| `intelligent-outreach.e2e.ts` | Vitest (`pnpm test:e2e:server:vitest`) | b | 15 |

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
