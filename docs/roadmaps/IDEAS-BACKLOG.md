# Ideas Backlog

**Started 2026-10-21.** This file holds ideas that aren't defects: measurements, tuning and exploration. The issue tracker holds work in progress: bugs and capabilities being built. When an idea is picked up, open an issue for it with a "done when" and link it here.

Each entry keeps the closed issue that first described it, so its history and data remain one click away. Ordered by expected value.

## 1. Time to first word (1.7–2.5 s today)

From #1505, with #1543 and #1545.

- **Where the time goes:** LLM time to first token first, then the TTS first byte, then endpointing. Rust/WASM work comes last.
- **Built but off and unmeasured:** context caching and the first-clause flush.
- **Next steps:**
  - Measure each lever with `TURN_RECEIPT` medians before and after: caching, the prompt and tool-schema diet, region pinning (#1543; Vertex location is still `global`), endpointing (#1545), and a warm Cartesia pool.
  - Report false cut-offs alongside the endpointing medians.
- **Trim the prompt's biggest parts (#1542)** — Token receipts per turn shipped behind `TURN_TOKEN_RECEIPT` (off by default); the "cut the largest sections" half was never filed as a concrete change. Fold it into the latency program once the receipts show which parts dominate. `value: medium · effort: M`

## 2. Prod reply length and filler

From #1425.

- **Observed:** prod replies run 35–40 words, with filler in 53% of replies.
- **Next steps:**
  - Confirm prod's `TURN_LENGTH` / `TURN_TEXTURE` / `HUMAN_TEXTURE` values.
  - Build a dev-vs-prod table against the human bands.
  - Try a per-reply filler cap behind an off-by-default flag, and measure it.

## 3. HONEST_FRIEND pushback, on vs off

From #1435.

- **Exists:** the scripted probe harness.
- **Missing:** the on-versus-off results table, with guardrail and warmth checks. That result feeds the HONEST_FRIEND ship decision (#1465).

## 4. Dev-only behaviour flags, measured in groups

From #1422.

- Before any prod flip, measure dev-only flags in groups:
  - Map each flag to a scenario and a metric.
  - Do at least 4 recorded runs per config, with the sha and flag values.
  - Record a keep or discard verdict per flag.
- **Pre-flip checklist for `CONTEXT_PACKET` (#1470)** — Default off, no harm today. Keep the six pre-flip checks from the verifier follow-up (#992) and run them when the flag is scheduled. `value: medium · effort: S`
- **Pre-flip checks for three dormant flags (#1471)** — `REVIVED_INTELLIGENCE`, `THEORY_OF_MIND` and `QUIRK_AWARENESS` have never been turned on (`WORLD_MODEL_SNAPSHOT` was deleted 2026-10-31). The memory v2 plan (C5) already owns the dead-builder part; run the remaining checks when it lands. `value: medium · effort: M`

## 5. Template personas and cognitive quirks: reachable or dead?

From #1424.

- **Settled:** CANDOR is gone, and cognitive-quirks is wired in the loader.
- **Open:** `wellness-coach` and `generic-advisor` are still registered in `src/personas/index.ts`. Delete them, or document why they stay.
- **To confirm:** whether the COGNITIVE category runs on voice calls. A builder trace from one voice call would show it.

## 6. Measurement and evaluation

- **Per-persona split in the voice eval (#1436)** — The voice eval averages across personas, hiding a weak one; the weekly red team already reports per persona. Add a per-persona breakdown and fold it into the nightly scorecard. `value: medium · effort: S`
- **Judge call cap and cost log (#1531)** — Judges now default to the cheaper model; what is left is that nothing caps the number of judge calls in a run (the cheaper default is not applied to the voice-eval judge or the nightly, on purpose). Add an optional `JUDGE_MAX_CALLS` and a cost log line. `value: medium · effort: S`
- **Autonomous humanness optimisation loop (#1377)** — The spec is merged (#1381, #1396) but the loop itself is not built. The attached experiment list covers reply length, `QUIET_CALLER` versus `ATTUNE`, and an audio-listening pass. Decide whether to extend the weekly red-team job instead of building a second loop. `value: high · effort: L`

## 7. Reply policy experiments

- **Reflection-first replies (#1443)** — Try a policy where the reply first reflects the feeling the person expressed before offering anything else, behind an off-by-default flag and scored with the listening judge. Adjacent to #2179 but not covered by it. `value: medium · effort: M`
- **Farewell judge (#1441)** — A judge plus phrase list that flags goodbyes which guilt or pressure the person into staying. No such behaviour has been seen in this product; the idea comes from outside research, so this is defensive hardening. `value: low · effort: S`

## 8. Relationship-layer features (built, flag-off)

All of these shipped behind off-by-default flags. Arming is a flag-lane decision, not new build work; arm only with stage and mood gates.

- **Relationship layer umbrella (#1509)** — Groups the friend-style features below plus jokes (#1513). Arming order is tracked in the flag lane. `value: high · effort: S (arming only)`
- **Friend repair after a bad moment (#1512)** — Built in #1887 behind `FRIEND_REPAIR`. Arm after the next flag sweep. `value: medium · effort: S`
- **Friendly teasing (#1517)** — Built in #1873 behind `FRIEND_TEASE`. Arm only with the stage and mood gates in place. `value: medium · effort: S`
- **Follow-ups on things the person mentioned (#1518)** — Built behind `FRIEND_FOLLOWUPS` (#1567, #2084, #2092), with `RECALL_PEOPLE` also off. Overlaps the memory v2 triggers lane. `value: high · effort: S`
- **Friendship anniversary and date celebrations (#1515)** — The anniversary shipped flag-gated in #1648. Celebrating other dates is still unbuilt and needs the scheduler (#1493). `value: low · effort: M`

## 9. Features that need a scheduler

Depends on the scheduler work in #1493 unless noted.

- **Scheduled callbacks and heads-up texts (#1449)** — The callback tool honestly says nothing is booked, `CALL_FOLLOWTHROUGH` defaults off, and the unwired `HEADS_UP_TEXT` sender was removed on 2026-10-31. The public site no longer promises callbacks. Build once a scheduler exists. `value: high · effort: L`
- **Rituals (#1514)** — Only a per-call wind-down exists today. Recurring rituals (a regular check-in at a regular time) need the scheduler. `value: medium · effort: M`
- **Due-routine runner (#2778)** — The scheduler's callback registration has no callers and nothing runs routines that come due; user-facing copy was made honest in #2780 and production holds no workflow documents. Build as an idempotent async job behind a flag, off by default. `value: medium · effort: M`

## 10. Unbuilt companion features

- **Capturing when and where for a commitment (#1440)** — The coach follow-through feature stores no trigger, so there is no slot for "when and where will you do it". New feature; evaluate inside memory v2 (R2/M10), which overlaps. `value: medium · effort: M`
- **Joint live activities (#1516)** — Doing something together on the call, such as cooking along, a quiz, or a focus sprint. Nothing built. `value: medium · effort: L`
- **Surprise-and-delight outreach (#1519)** — Unprompted pleasant outreach. Outreach stays on by default and the consent default is unchanged; the AI-disclosure question lives in #1460. `value: medium · effort: M`
- **Dial chirp sound (#1502)** — A short, cute sound while a call connects, behind a `DIAL_CHIRP` flag. No flag or clip exists yet; clips are chosen by ear, not by metric. `value: low · effort: S`
- **Recognising family members on inbound calls (#2774)** — Nothing in production calls the code that records calls for sponsored identities, so inbound calls are never matched to family members. User-facing copy was fixed in #2779. Needs a privacy decision first, since caller-ID matching can be spoofed (see #2091). `value: low · effort: M`
- **Living characters (#2838)** — Stories can be registered and looked up by meaning, but nothing outside tests ever calls them, and no life-log feature exists (the persona-growth work in #3175 is open and off). Design first, then wire. `value: medium · effort: L`
- **Agent marketplace and voice-clone consent (#2839)** — Parked until moderation exists. Marketplace storage is off, registry agents have no runtime, and no voice-clone consent flow exists. `value: low · effort: L`
- **Living-agents plan tracker (#2840)** — A checklist tracker over the items above and the memory lanes, with nothing ticked. This page and the roadmap docs replace it. `value: low · effort: S`

## 11. Interface polish and platform

- **UI sweep from the handoff brief (#1524)** — Part 1 shipped flag-off (breath captions in #1560, heard captions in #1680, off by default); the connect-button item landed in #1523. Part 2, a UI-wide sweep, was never scheduled. Arm the caption flags only after a taste call. `value: medium · effort: M`
- **Mobile polish (#2295)** — The tracker's big items merged (#2296, #2358, #2298, #2312, #2310). What is left is polish with no PR: large-text support, a shared sheet component, haptics, and the install surface. `value: low · effort: M`
- **Competitive roadmap note (#1503)** — Items worth tracking against competitors: an MCP client, App Intents, and calendar standards. `value: medium · effort: L`

## 12. Parked experiments and design notes

- **Clause-split rule for name handling (#2769)** — A measured rule was cut from #2726 after a failed review, so it is not on main (the flag exists in the name gate, the rule does not). The issue keeps the failing inputs as a test set and the measured win; use those to retry later. `value: low · effort: S`
- **Deferring the first turn's notes (#2864)** — A redesign note for a deferral that never landed (only `FIRST_TURN_WARM`, from #2493, exists). Safety requirement for any future version: safety-type notes (crisis follow-up, early-warning and safety notes) must be delivered immediately and never held or dropped. Keep a single owner for the deferral decision. `value: low · effort: M`

## 13. Engineering health

- **Shared API error type (#60)** — The server has no common error class; the error helper emits only a message, and many routes still hand-build JSON errors or write raw headers. Add one error type plus middleware and migrate routes in batches with a lint ratchet. `value: medium · effort: L`
- **Config drift between dev and prod (#1423)** — Mostly done (boot-time settings log, flag classification, an unlisted-read scanner). Remaining: per-environment settings files, a dev/prod diff in CI, and removing the few prod-only names with no reader. `value: medium · effort: M`
- **Finish the deprecated-API migration and bump the dependency (#1653)** — Batches merged (#1659, #1661, #1692); dozens of files remain on the not-yet-migrated list and the package is one major behind. Continue in batches, or hand to a migration tool. `value: low · effort: M`
- **Quality exceptions burn-down (#1722)** — Its expiry gate is not on main, so no deadline is armed. Revive when the exceptions gate lands. `value: low · effort: M`
- **CI capacity and flake quarantine (#2053)** — Most of the tracker merged (#2054, #2058, #2067, #2108, #2156). Left as ideas: larger merge-queue runners (costs money), flake quarantine, and SHA pins (#2183). `value: medium · effort: M`
- **CI speed report (#3113)** — The daily speed report is a report, not a defect, and belongs as a workflow artifact rather than an issue. The runner-size target lives in #2053. `value: low · effort: S`

## Retired umbrellas

- **#1467 (better-than-human audit plan, 2026-10-15):** its open children were triaged one by one on 2026-10-21. Bugs and capabilities stay open as their own issues; ideas are on this page.
