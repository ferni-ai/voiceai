# Admin portal and Dev Panel: every control real, proven end to end

Issue: #4069. Owner's asks:

- **2026-11-18:** no fake data or services in the admin portal (`/admin`) or the Dev Panel. Wire each screen to a real store, or change the UI so it says what isn't measured.
- **2026-11-20:** every menu item, feature and capability on each page fully works, is green end to end, is proven on dev, and is promoted to production. Rebuild the Avatar Soul page on top of the real webapp avatar and the work done so far.

## Where we are (main `e80b3b2df7`, re-audited 2026-11-20)

**Landed:**

- honest "not measured" states (#4100);
- Business Metrics init (#4103);
- BTH Validation (#4137);
- the signed-in admin walk (#4215);
- the same-origin API tester (#4224);
- real Cloud Run metrics for Operations (#4229);
- FinOps save feedback (#4270).

The walk (`e2e/signed-in/admin-portal.spec.ts`) clicks every admin control. Its known-dead list drops to empty once the soul stats store lands.

**What is still not real.** The walk cannot see these: it fails on dead controls and unexplained HTTP errors, not on wrong content.

1. **Agent-only numbers.** These pages read maps that only the voice agent fills:
   - FinOps costs;
   - Diagnostics handoffs;
   - Speech Metrics;
   - Semantic Routing;
   - Trust aggregates;
   - Human Listening;
   - Business Metrics daily counts (the agent never calls `initializeAnalytics`).

   BigQuery `ferni_events` is the one shared store that is live in dev and prod:
   - `call_events` and `turn_metrics` are written by the agent;
   - the UI service account can query them;
   - no admin route reads them yet.

2. **No producer at all.**
   - `evalopsHook.afterTurn` has no caller, so the EvalOps page, its Dashboard tile and the Dev Panel EvalOps panel are zeros or `Math.random`.
   - `recordListeningEvent` and `calculateHealthScore` have no production caller.
3. **Config the agent never reads.** These save to the UI container's own files or memory:
   - agent enable, order and edits;
   - template agents;
   - model config defaults and persona overrides;
   - tool defaults.

   The voice agent reads its baked copy, so these saves change nothing on a call. Separately:
   - Feature Flags reads defaults unless the cache was written in the last 60 s;
   - no runtime code reads the `trust.*` flags.

4. **Fallbacks shown as data.** These appear as measurements:
   - Active Agents `|| 6`;
   - EvalOps `passRate: 100`;
   - Diagnostics "healthy" Redis and `successRate` 100;
   - health dots from env-var checks;
   - zeros on a failed load in Trust, Speech and EvalOps;
   - the `1.0.0` version;
   - a DEV/PROD badge that reads the hostname, so dev shows PROD.
5. **Broken contracts.**
   - Validate Agents runs a script name that doesn't exist.
   - Run EvalOps Suite sends no persona and scores canned replies.
   - Quick Voice Check sends the wrong body.
   - Two Export buttons download at once on BTH.
   - Create Agent PUTs an unknown id.
   - Experiments Start and Pause listeners stack up on every visit.
   - The header Refresh posts a flag reload and reloads the page.
   - 18 of 19 standalone dashboards send no credentials.
6. **Avatar Soul.**
   - The admin "lab" animates a hand-drawn circle. The real `avatar-soul.ui.ts` binds `#coachAvatar`, which `admin.html` doesn't have.
   - It demos pupils the webapp removed.
   - It shows neither the crisis hold nor reduced motion.
7. **Dev Panel.** These are fake, unconfirmed or unrun:
   - music tiles hard-coded;
   - outreach tests that send real SMS, email and calls with no confirm;
   - a heartbeat that keeps running after hide;
   - an experiments page that always shows sample data;
   - debug panels reading agent-only counters;
   - `e2e/dev-panel.spec.ts`, which no workflow runs.

## Owner decisions (2026-11-20)

| Question                            | Decision                                                                                                                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EvalOps                             | Score live calls. Behind a flag, the agent scores a sample of real turns into `ferni_events.eval_results`; the page reads that.                                                                          |
| Agents, Model Config, Feature Flags | Make them control the agent: one Firestore config store read by the UI and the voice agent (short cache, behind a flag), so a save changes the next call. Dev first, then prod.                          |
| Human Listening                     | Record signals: the agent writes each detected signal (type and severity, never text) to a `listening_events` table; live sessions come from LiveKit rooms.                                              |
| Avatar Soul                         | Both a live lab and field data. Mount the real webapp avatar and drive its real effects (including the crisis hold and reduced motion), plus how often each effect fired on real calls in the last 24 h. |

## Rules every PR in this plan follows

- **No number without a source.** A value is a measurement from a named store, or the UI shows "not measured: <reason>" or "unavailable (HTTP <status>)". Never a zero or a constant standing in for one.
- **Failure is a state, not data.** Each section has an explicit unavailable state carrying the reason.
- **Tests pin the honesty.** Each PR has a test that fails if the fake comes back, and a mutant that shows it.
- **New writers and new controls go behind an off-by-default flag**, one store per PR, turned on on dev first.
- **About 400 reviewable lines or fewer**, an independent verifier on the exact head, and the merge queue.
- **One reader per store.** BigQuery reads go through one admin reader module (aggregates only, never `user_hash` or `session_hash`, a short cache), copying the `capacity-guard.ts` pattern. Config reads go through one config store.

## Lanes and order

Lanes run in parallel; PRs within a lane run in order.

| Lane                                   | PRs, in order                                                                                                                                                                                                                                                                                                                                                                                                                              | Where it runs               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| **L0 in flight**                       | FinOps settings in Firestore. Soul stats store. Soul stats browser sender.                                                                                                                                                                                                                                                                                                                                                                 | UI server, web              |
| **L1 the walk sees content**           | (a) Each section declares the tiles it shows. The walk fails when one shows a bare number with no source, or a section renders nothing (WALK1). (b) A dev-mode walk project (`DEPLOY_ENV=dev`, fake LiveKit agent) so Agent Flags controls are walked. (c) The Dev Panel spec runs in CI and opens every panel.                                                                                                                            | e2e                         |
| **L2 honest fallbacks**                | One PR per page group: Dashboard fallbacks, version, env badge and labels. Diagnostics probes (Redis PING, Firestore, LiveKit `listRooms`) and no 100% default. Trust, Speech and EvalOps failure states. The small contracts (Validate Agents, BTH export, header Refresh, Experiments listeners and confidence, evalops auth badges, aria-labels, Dev Panel `${ICONS}` literals, heartbeat, outreach confirm, tester confirm on writes). | web, UI server              |
| **L3 one BigQuery reader**             | (a) The admin BigQuery reader. (b) Dashboard calls and latency. (c) Operations voice-agent latency and errors. (d) Speech Metrics sessions, latency and personas. (e) Business Metrics from `call_events`. Cheap hydration first: `agent_evolution` and `community_insights` in the API; `BTH_TELEMETRY_FLUSH` on in dev.                                                                                                                  | UI server                   |
| **L4 the agent writes what's missing** | One flagged PR per fact: (a) FinOps cost per call at call end; (b) `call_events.handoffs`, `p50_turn_ms`, `p90_turn_ms` plus a handoff table; (c) `routing_decisions`; (d) `listening_events`; (e) EvalOps sampled live scoring into `eval_results`; (f) a speech session summary; (g) trust aggregates from `trust_profiles`; (h) `initializeAnalytics` in the agent. Each read lands in L3.                                              | voice agent, then UI server |
| **L5 live config**                     | (a) The config store (Firestore, TTL cache, flag `ADMIN_LIVE_CONFIG`), read by both processes. (b) Agents: enable, order, edit, create from template. (c) Model Config: defaults, persona overrides wired into persona load, tool defaults. (d) Feature Flags: a lazy load from Firestore, and real readers for the `trust.*` flags or relabel them.                                                                                       | both                        |
| **L6 Avatar Soul**                     | (a) A short design. (b) The lab mounts the real avatar markup and drives `avatar-soul.ui.ts` and `avatar-motion/`, with the crisis hold and reduced motion as controls; pupils and gaze are removed. (c) Field data: the soul stats panel moves here and widens to every effect the avatar has.                                                                                                                                            | web, UI server              |
| **L7 standalone dashboards**           | Fold the 19 `public/*-dashboard.html` pages into the portal, or send the admin token and render unavailable states; one PR per group.                                                                                                                                                                                                                                                                                                      | web                         |

## Proving it on dev, then promoting

- **UI and API changes** reach production when they merge: GitHub Actions deploys `john-bogle-ui` from `main`. Dev proof is the signed-in walk in CI on the merged result, plus a signed-in check of the dev UI (`ferni-ui-dev`).
- **Voice-agent changes (L4, L5)** deploy to dev from `main` (skill `deploy-agent`), get their flag on in dev, and are checked on a live dev call (skill `voice-eval`). Prod gets the same commit only after it has run on dev, with the release check and a prod claim.
- **Owner-only prod steps**, listed in each PR:
  - IAM grants (`roles/monitoring.viewer` for the UI service account);
  - Firestore rules and TTL policies on `(default)`;
  - turning flags on in prod.

## Done means

Every admin section and Dev Panel control has a row on #4069 showing:

- the store it reads;
- the test that fails if it's faked;
- the walk step that proves it, with content checked;
- live evidence from dev and from prod, signed in as an admin.

`BlindEvaluationPanel.ts` is not read without the owner's approval.
