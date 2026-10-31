# Capture Module

Active listening capture during speech: `active-listening-capture.ts`.

## What lives here

| File | Purpose | Callers |
|------|---------|---------|
| `active-listening-capture.ts` | Incremental capture while the user speaks, importance scoring, confirmation loops | `agents/voice-agent/active-listening-handler.ts` |

Import the file directly; this folder has no `index.ts`.

## History

The old "unified capture" entry point (`index.ts`: `captureTurnUnified`,
`captureBatchUnified`, a capture buffer and re-exports of `fast-capture` and
`stm-buffer`) had no callers and was deleted in memory v2 lane C5a
(`docs/plans/2026-10-29-memory-v2-retro-and-architecture.md`). Per-turn
capture runs through `intelligence/data-capture` (`routeToStorage`);
fast regex extraction is `memory/dynamic/fast-capture.ts` and the
short-term buffer is `memory/dynamic/stm-buffer.ts`.
