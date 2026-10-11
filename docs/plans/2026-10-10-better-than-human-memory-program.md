# Better than human: memory, between-call thinking, adaptive style (2026-10-10)

Owner: the sethford-95 session (W0–W4). Coordinated with the voice-PR lead
(firestore-migration-monitoring), which owns dev, the live call path, the
temporal world model (#685/#690), theory-of-mind (#684) and deliberation.

## Why

Prod judge scores on 2026-10-10 (3 = a good friend): recall 1.25, thought 2.38,
empathy/endearing above 3 on dev. Ferni's warmth is there; its memory and
between-call thinking are not. Measured causes:

- The end-of-call signal extractor runs but has no bucket for people,
  plans or outcomes and is never told the call's date: on the one real
  returning account, 751 conversations produced 3 facts, 6 entities and 0
  saved dates.
- Weekly deep analysis, life trajectory, cross-domain synthesis and the
  summary indexer read `conversation_summaries`, which nothing writes; calls
  save to `summaries` (315 on that account). Deep analysis isn't scheduled.
- Every per-turn style knob is global; nothing adapts to the person.
- User interests live in a per-process cache and are lost after each call.

## Workstreams

| | What | State | PRs |
|---|---|---|---|
| W0 | Seed→recall measurement: per-fact recall counter (`#@fact`/`#@avoid` lines), batch runner | queued | #682 |
| W1 | After-call extraction: transcript → dated world observations (people, events, outcomes, goals, commitments, threads, `replaces`) into the temporal store | extractor up; hook waits on #690/#694/#685 | #693, registry #694 |
| W2 | Between-call thinking: background jobs read real summaries; deep analysis guarded (5 real calls, 2-call evidence, no clinical labels, in-call injection behind `DEEP_ANALYSIS_IN_CALL`); then outreach suggestions into existing outreach; nightly pondering → dated follow-ups for the opener | readers #691; guards next; pondering after W1 | #691 |
| W3 | Per-person style: learned multipliers (reply length, laugh/opinion/filler odds, pushback) in `style_profile/current`, applied at the draw sites in turn-shape/extras/candor; never overrides a global flag that is off | building | — |
| W4 | Research ahead: `followTopic` tool (flag-gated, no default tool-count cost), nightly sourced findings with 3-day expiry, surfaced once in the next call's opener | designed | — |

## Flags (all off by default)

`LIVE_SUMMARIES`, `AFTER_CALL_EXTRACTION` (+ the lead's `WORLD_MODEL_TEMPORAL`),
`DEEP_ANALYSIS_IN_CALL`, `STYLE_PROFILE`, `RESEARCH_AHEAD`.

## Proof bar

Each workstream ships only when a seed→recall batch on dev (`scripts/voice-eval/batch.sh`,
n ≥ 10 per arm, flag on vs off, same build) moves its judge dimension (recall,
thought) and the per-fact recall rate, with empathy and endearing holding.
Dev slots come from the voice-PR lead. Turning a flag on in prod, and adding a
Cloud Scheduler job (writes to the Firestore that dev and prod share), need
Seth's OK.

## Guard rails learned on the way

- Check what a store holds on prod before reviving its reader (several
  "live" writers write nothing useful).
- Background LLM output that reaches a live turn needs its own flag and a
  grounding filter: a dry run of deep analysis on mostly test calls produced
  confident psychological readings of the caller.
- `session-manager.ts`, `voice-agent-entry/index.ts` and `daily-outreach-job.ts`
  are over the 500-line ratchet: new work goes in new modules, with a
  one-line call site and an honest offset.
