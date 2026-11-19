# Admin portal and Dev Panel: every number real, or honestly absent

Issue: #4069. Owner's ask (2026-11-18): no fake data or services in the admin
portal (`/admin`) or the Dev Panel. Wire each screen to a real store, or change
the UI so it says what isn't measured.

## What is wrong today

An audit of `origin/main` at `cddbdfb8` found 65 fake or ungrounded values:

- 25 have a real source that just isn't wired;
- 12 need a small new store;
- 22 aren't measurable today;
- 6 are unconfirmed.

Four causes account for almost all of them:

1. **Two processes, one in-memory store.** The UI/API server and the LiveKit
   voice agent are separate deployables. Numbers the agent keeps in module-level
   maps (trust analytics, human listening, speech metrics, EvalOps metrics,
   semantic routing, handoff diagnostics, outreach counts) are invisible to the
   admin API. `src/api/trust-dashboard-routes.ts` already shows the fix: the
   agent persists to Firestore and the API reads that.
2. **Estimates in handlers.** `dashboard.ts`, `operations.ts`, `diagnostics.ts`
   and `experiments.ts` fill gaps with constants: sessions ×10, p95 = p50 ×
   constant, a fixed $46 spend, Redis always healthy, 95% confidence.
3. **Failure shown as zero.** Failed or unauthorised requests render `0`, `[]`
   or "System Down", which read as real measurements.
4. **Controls with no effect.** Placeholder buttons ("coming soon", demo
   loops, mock fallbacks) and actions whose request never matches the server.

## Rules every PR in this plan follows

- **No number without a source.** A value is a measurement from a named store,
  or the UI shows "not measured" or "unavailable (HTTP <status>)". Never a zero
  or a constant standing in for one.
- **Failure is a state, not data.** Each section has an explicit
  `unavailable` state carrying the reason.
- **Tests pin the honesty.** Each PR has a test that fails if the fake comes
  back. Examples: a fixed delta badge, `Math.random` in a rendered score, a
  zero shown on a failed request.
- **New writers go behind an off-by-default flag**, one store per PR, turned on
  on dev first.
- **About 400 reviewable lines or fewer**, an independent verifier on the exact
  head, and the merge queue.

## Order

| #   | PR                                                                                                                                                                                                                                                          | Kind            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1   | Honest states: remove or relabel every fabricated value that needs no backend (fixed "+12%", zero-on-failure, `0%` defaults, placeholder corrections, "coming soon" buttons, mislabelled "all flags", fallback budget, demo and mock modes in static pages) | client + labels |
| 2   | Dev Panel EvalOps overlay: delete `Math.random` scores, read the real flags API                                                                                                                                                                             | client          |
| 3   | Dashboard numbers from `analytics_daily`, the agent registry, a Firestore ping and `outreach_events`                                                                                                                                                        | wire (A)        |
| 4   | Business Metrics `init`/cleanup, Operations refresh, same-origin API tester                                                                                                                                                                                 | wire            |
| 5   | One Cloud Monitoring reader, then Operations latency and error rates                                                                                                                                                                                        | wire (A)        |
| 6   | Billing from the billing export (check `BILLING_EXPORT_TABLE` first)                                                                                                                                                                                        | wire (A)        |
| 7   | Diagnostics probes: LiveKit `listRooms`, Firestore and Gemini pings                                                                                                                                                                                         | wire (A)        |
| 8   | Trust analytics from `trust_profiles`                                                                                                                                                                                                                       | wire (A)        |
| 9   | BTH Validation: await telemetry, response shape, label the synthetic benchmark                                                                                                                                                                              | wire + label    |
| 10  | Experiments confidence from data; EvalOps and Create Agent contracts                                                                                                                                                                                        | wire (A)        |
| 11  | Dev Panel: contact route, remove the dead experiments page and the sample-data seeder                                                                                                                                                                       | client          |
| 12  | Agent and model config from container files to Firestore                                                                                                                                                                                                    | store (B)       |
| 13  | Agent-to-Firestore writers, flagged off, one per PR: EvalOps turns, human listening, speech metrics, handoffs, trust events, routing corrections                                                                                                            | store (B)       |

Unconfirmed before planning further: Dev Panel "Ferni's Understanding"
endpoints, BTH overlay capabilities/trends, the observability pages, the
API-docs catalogue, whether `BQ_EVENTS` and `BILLING_EXPORT_TABLE` are set in
prod. `BlindEvaluationPanel.ts` is not read without the owner's approval.

Kept on purpose (labelled test harness, owner to confirm): Dev Panel simulated
tier and stage, simulated music, network simulation, confetti.

## Done means

Every admin section and Dev Panel control has a row showing:

- the store it reads;
- the test that fails if it's faked;
- live evidence from dev, signed in as an admin.

The table lives on #4069, and Playwright runs `/admin` in CI.
