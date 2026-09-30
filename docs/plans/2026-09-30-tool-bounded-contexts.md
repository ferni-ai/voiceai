# Tool bounded contexts: fewer, clearer tools behind domain facades

2026-09-30. Status: planned; step 0 (measurement) in progress.

## Why

Ferni's tools are organised by *where the code lives*, not by *what a caller
asks for*. The catalog is 1,188 tools in 123 domains, and one request can map
to many near-identical tools:

- "Keep an eye on the time, the pasta needs 10 minutes" → `setTimer`,
  `quickTimer`, `setReminder` (communication), `setReminder` (conversation, a
  stub), `scheduleReminder`, `setAlarm`, `quickAlarm`... The time bounded
  context alone is **80 tools across 15 domains** (simple-utilities 14,
  calendar 14, scheduling 8, productivity 5, routines 5, family 3, ...).
- Tool retrieval (09-28) recovers the labelled tool in the top 20 only 86% of
  the time on spoken requests, but a tool that does the job equally well 93.5%
  of the time: most misses are near-duplicates (RESULTS.md).

What the duplication costs:

1. **Wrong or weaker tool.** The model chooses among lookalikes with
   different behaviour (one persists and delivers, one only logs).
2. **Latency.** Every extra tool definition is ~130 tokens the model reads
   before its first word; per-turn retrieval now sends ~40 instead of ~130,
   and fewer, broader tools let it send fewer still.
3. **Retrieval noise.** Near-duplicates split the similarity mass, pushing
   the one that works out of the top k.
4. **Change cost.** A fix to reminders has to find every reminder tool.

## Target design

About a dozen bounded contexts, each with a small public surface (a
**facade**) over the existing implementations:

| Context | Owns (examples) | Facade tools |
|---|---|---|
| time | reminders, timers, alarms, calendar, scheduling, routines | `reminders`, `timers`, `calendar` |
| media | music, podcasts, video, ambient, smart-home audio | `music`, `media` |
| comms | messages, email, calls, contacts | `message`, `call`, `contacts` |
| memory | remember, recall, relationships, notes | `remember`, `recall` |
| info | weather, news, search, local, travel | `lookup`, `weather`, `news` |
| money | finance, market research | `money`, `markets` |
| tasks | tasks, projects, documents, home | `tasks`, `notes` |
| health | wellness, health, sleep, presence | `wellbeing` |
| growth | habits, goals, career, learning, decisions | `habits`, `goals` |
| inner / relationships | coaching conversations | `reflect`, `relationships` |
| play | games, stories, curiosity | `play` |
| safety, handoff | crisis, human transfer, team | unchanged: individual core tools |

A facade takes an `action` (enum) plus the action's arguments, validates them
against the inner tool's own zod schema, and calls the inner tool's
`execute(args, opts)`, forwarding the SDK's RunContext (about 160 tools read
`ctx` from it). Inner tools stay where they are; duplicates are resolved by
choosing one implementation per action, and the losers are deprecated, not
deleted, until telemetry shows no callers.

The safety and handoff tools stay individual and always sent: their failure
mode is too costly for an extra level of indirection.

## How we will know it's better (measure first)

**Step 0 (now): a tool-choice accuracy harness.** For each spoken test
request (`scripts/tool-retrieval/out/generated-test.json`, 2,375, never
indexed), send gemini-3.5-flash (the production model and settings) exactly
the tool set a live turn would send, and record which tool it calls and with
what arguments. Score: correct (labelled tool), sufficient (a judged
equivalent), wrong, no call. Also record first-token latency and prompt
tokens. This is the baseline for both live retrieval and every facade.

**Per context:** the same harness, with the context's facade replacing its
tools. A context ships when, on its requests:

- correct + sufficient choice is **no worse** than baseline (within the
  harness's run-to-run noise, measured by running the baseline twice);
- argument errors (facade validation failures) are under 2%;
- first-token latency and prompt tokens are no worse;
- the voice-eval tools scenario passes on dev (2 runs) with no missed tool.

## Rollout

Behind `TOOL_FACADES=time,media,...` (default off), one context at a time,
starting with **time** (largest duplication, and the reminders path was just
hardened in PRs #113-#116). Shadow first where possible: log which inner tool
the facade would have called for real tool calls on dev.

## Out of scope

- Rewriting tool implementations. Facades route; the code behind stays.
- The coaching-conversation domains (inner, relationships) until the
  functional contexts are done: their tools mostly shape conversation rather
  than act, and need a different measure (conversation quality, not call
  accuracy).

## Related

- `src/tools/retrieval/turn-tool-retrieval.ts`: per-turn retrieval, live
  since 2026-09-30 on dev, with `findTools` as the fallback.
- `scripts/tool-retrieval/RESULTS.md`: retrieval recall measurements.
- `src/tools/dynamic-loader/index.ts`: per-session loaders (PR #121).
