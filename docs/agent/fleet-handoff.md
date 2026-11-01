# Fleet handoff: state and queue (2026-10-16)

This is the plan a new lead session picks up. Read `fleet-rules.md` first.
PR and issue numbers are live, so check them with `gh` before acting: the
states below are as of 2026-10-16 about 13:00 UTC. The umbrella is epic #1467;
the release train is #1400.

## Start here (new machine)

1. Clone the repo and install once in the main checkout.
2. Copy the lead's local evidence folder from the old machine
   (`~/Documents/voiceai-evidence/`, not in git). It holds:
   - eval transcripts, audit reports and research;
   - the declared dev settings file `lead-handoff/dev-flags.env`;
   - the design canvas files.
3. Check that the `compound-loop` plugin (verifier) is installed. Check that
   `lk project list` shows `ferni-dev` and `ferni-prod`, and that `gh` and
   `gcloud` (project `johnb-2025`) are signed in.
4. Confirm what's deployed:
   - prod: `lk agent versions --project ferni-prod --config livekit.prod-cloud.toml`
   - dev: `lk agent versions --project ferni-dev --config livekit.toml`
5. Ship anything below marked "ship next", then start lane agents from
   `.claude/agents/` in waves of at most 4–5, each told its lane's queue.

## Deployed now

| | Version | Notes |
|---|---|---|
| Prod | `694459af1`, increment 3, deployed 2026-10-15 19:43Z | Settings turned on with it: NAME_FALLING_INTONATION, PRESENCE_SOUND_ASSETS and VOICED_PRESENCE. The prod gate passed: median reply-delay p50 1929 ms against 2092 before, and no false call claims. Rollback target: `245921a18`. |
| Dev | `58be015e5`, deployed 19:46Z | **Not deployed by the lead.** Find out who deployed it; only the lead deploys. Dev has the declared settings plus NAME_GATE and ACTION_CLAIM_GUARD, and the keys for Places, Amadeus, AfterShip and Google Calendar. |

## Ship next (lead)

1. **Increment 4: guard latency.** #1501 (name gate) and #1504 (action-claim
   guard) both merged on 2026-10-16; main is `dbe48cae2` or later. Nothing
   from increment 4 is deployed yet. Deploy main to dev, run long-day ×2,
   real-call and action-claim (single runs: see Cost), then deploy to prod
   and run the prod gate (#1400). Seth has already approved this increment.
2. **Calendar keys to prod**, once the calendar-honesty fix merges (tools
   lane). Re-run the dev calendar check first: an unconnected caller must
   be told to connect, not told their calendar is clear.
3. **Places, Amadeus and AfterShip keys to prod**, after the tools lane's
   routing fix proves Ferni actually calls those tools.
4. **Context caching (#1505):** an A/B on dev of LLM_CONTEXT_CACHE off, on,
   and on with TOOL_CORE_STATIC, measured by `llmTtftMs` and
   `tokens.promptCached` in TURN_RECEIPT.

## Lanes and their queues

Each lane maps to an agent in `.claude/agents/`.

### safety (`ferni-safety`)
- #1504 merged. Watch increment 4's action-claim eval for missed ask phrasings.
- **Ferni's invented life:**
  - `ferni-self-share.ts` DAY_DETAILS has 4 items that are in no canon file;
  - `life-updates.ts` (LIFE_MOVES_ON, on in prod) has the model invent
    developments, the likely source of "Owen called me this morning…".
  
  Stop the invention; #1494 is related.
- #1494 (Ferni's own mood told as the caller's): merge main in (#1469 has landed), then re-verify. The plan for the canon-only self-share follow-up is in its body.
- **Crisis option (a), Seth's decision on #1464:**
  - detection unchanged;
  - a warmer response;
  - one full 988 mention per call;
  - the verifier's 89 true-risk lines go into the permanent eval;
  - close #1484.

### memory (`ferni-memory`)
- **#1507 (draft), teammate talk ≠ life event.** Its 4th verifier round
  FAILED. Next: use the set of teammates present in the call to drop threads
  about a present teammate (unless there's a relation word), and pass that
  set to the distress fallback.
- **#1399**, handoff labels. The verifier FAILED it:
  - conflict with main;
  - `perPersonaMeetingCounts` is never written;
  - Ferni's own lines get marked;
  - nothing strips "(X said:)".
- **The memory-view chain:** #1045, then #1054, then #1095. #945 is merged.
- The life-ledger grounding check (small PR or issue). Follow-ups: #1499, #1486–#1490.

### personas (`ferni-personas`)
- #1491, legend pseudonyms: verified and queued. Confirm it merges.
- **#1500, Nayan's stories as fiction.** Draft PR #1554 (branch
  `canon/nayan-fiction`); its body lists the remaining steps. Once #1491 merges: merge main in,
  re-run `nayan-fiction.test.ts`, then verify.
- **The legends stack:** #971, #933, #939.
  - Merge main into each.
  - Drop what #1491 already covers.
  - Close any PR that's fully superseded.
  - #939's Secret Scan failure was a runner refusal, not a leak.
- #1434 persona-ID rename: investigate only, and write the alias plan for
  Seth (IDs may key stored data).
- #1495: the handoff says "they're" for Ferni, and Ferni asks a known caller's name mid-call.

### tools (`ferni-tools`)
- #1508 and #1506 are merged.
- **#1535 (draft), routing:** places, flights, hotels and packages are now held for the model. Verifier PASS at 024f1b7d8; since then only a lint fix and a merge of main (24edba8a0). Open risk: travel tools may miss the 3 s `INTENT_LOAD_WAIT_MS` window on a cold start. Next the lead runs the dev lookups eval, and then it's queued. Diagnosis: #1548. The dead loader is #1534.
- Routing, option A, is #1535 above. Prove it in both TOOL_RETRIEVAL=live and the prod cap.
- The director doesn't know the caller's location: a small PR.
- **Calendar honesty (#1547):** with no Google calendar connected, Ferni said "your
  calendar is clear" and "I've got that on your calendar". Find out which
  tool answered and fix the wording. This blocks the calendar keys in prod.
- The remaining fake-data tools from #1496: packages, research simulators,
  wisdom citations.
- Massive.com market data behind the provider seam. The key is in Secret
  Manager as `massive-api-key`.

### web UI (`ferni-web-ui`)
- #1523 (draft), the "Connecting. Tap to cancel" button: the code is done. Verify, mark it ready, and queue it.
- #1524: the **Breath** and **Heard** captions Seth chose, built on captions v2. The brief and canvas link are in the issue.
- The UI sweep: phone, desktop, dark mode and large text.

### latency (`ferni-latency`)
- #1505, in priority order:
  1. context caching: draft PR #1525 (`feat/llm-context-cache`). It folds in #852's harness and the `staticCoreCallTools` findTools fix; #852 is closed. Still to do: tsc for main and scripts (8 GB heap), quality:arch, merge main in, then verify;
  2. a prompt diet;
  3. region;
  4. streaming the first clause sooner;
  5. endpointing;
  6. TTS warmup.

  Rust/WASM comes last.
- #1485 noisy room: build the noisy eval, then A/B BVC for web (`WEB_NOISE_CANCEL`).

### backlog (`ferni-backlog`)
- **The queued-but-stuck PRs** #671, #631, #684, #720, #788, #1043, #674.
  - Add the missing flag-manifest entries (new flag: `pnpm flags:new`).
  - Merge main into each.
  - #674's cli-guards failure may be environmental.
  - #997 folds into #674.
- **Backlog verdicts:** in the lead's evidence folder (`pr-triage-2026-10-15.md`).
  - #852 → the latency lane.
  - #1399 → the memory lane.
  - #1302 needs its deliberate auth-gate break reverted first (commit aef006b28).

### best-friend (`ferni-bestfriend`)
- #1522, the friendship rubric: merged. Next, a dev baseline (the lead schedules dev).
- #1529, #1513 inside jokes: verified and queued. It deletes the in-memory joke Map.
  Follow-ups listed in its body:
  - `persona-memory.ts` and `callback-opportunities.ts` still inject jokes outside the INSIDE_JOKES flag;
  - two more joke stores remain (superhuman-memory and the human-signal extractor).
- **Waves:**
  1. Done: #1522 rubric and #1529 inside jokes.
  2. #1511 Ferni's life from canon, plus #1512 repair.
  3. #1518 and #1520.
  4. #1515 and #1517.
  5. #1516 and #1519 (needs #1460).
  6. #1514 (needs Temporal).

### commitments (`ferni-commitments`)
- #1493 Temporal: PRs 1–2 need no infra (the engine port, a reminder
  workflow with time-skipping tests, the worker and client, payload
  encryption). The design is in the evidence folder
  (`temporal-commitment-engine-design.md`). PR 4 onward needs Seth's
  Temporal Cloud account.

## Cost (GCP budget hit on 2026-10-16)

- **#1531:** eval judges default to Pro, the main cost driver (a single eval
  day cost about 12.8M Pro output tokens). Move them to flash and cap runs.
  **Until that lands, never run Pro-judged evals in loops.**
- **#1532:** finish the Redis and runner cleanup. Done so far: the runner VMs and
  Redis are deleted, REDIS_URL is removed from john-bogle-ui, and the
  `redis-url` secret points at a fast-refusing local address.
- Ask Seth to turn on billing export to the `billing_export` BigQuery
  dataset, which exists but is empty, so costs can be attributed exactly.
- `aim-platform` stays; Seth needs it.

## Practice upgrades to adopt

#1526 lists the SDLC and AI product-lifecycle practices the repo doesn't have
yet: evals as CI gates, a prompt and model registry, LLM tracing and online
evals, SLOs with automated canary rollback, flag lifecycle, ADRs, and a
conversation design system. Work through it as normal issues.

## Decisions waiting on Seth

- **Temporal Cloud:** the account, billing, namespaces and API keys
  (straight into Secret Manager), the worker hosting, and budget alerts.
- **#1460, outbound calls and outreach consent.** Outreach is opt-out in code
  today (`outreach-consent.ts`). Blocks #841 and #848, the on-behalf report
  back, and surprises.
- **#1459:** the website copy approach. The privacy claims are #1451–#1458.
- **#1462:** which Jordan voice is canon.
- **#1465 HONEST_FRIEND and #1466 PERSONA_BEATS.**
- **#1161:** the legal pages.
- **#871:** hold it until correction precision is at least 95%.
- **From the safety lane:**
  - Should a goodbye or a bare "call my grandma", read as imminent with nothing risky said all call, get a soft check? Option (a) says no softening.
  - Is "heard, then corrected" acceptable for an unrequested action claim (#1504)?
- Safety test sets and verifier probes are local, in `lead-handoff/safety/`.

## Open questions to check

- Who deployed `58be015e5` to dev at 19:46Z.
- Some uppercase-named secrets in Secret Manager are empty placeholders, and
  the real values are under lowercase names. Prod's agent env may carry empty
  values for some keys: check this as part of #1423.
- Prod's long replies (35–40 words) aren't explained by the dev-only flags
  (#1422, #1425). Next: write down prod's real values (#1423).
