# Speech Director P1 + P2 — Implementation Plan

**Date:** 2026-10-03
**Spec:** `docs/superpowers/specs/2026-10-03-human-speech-director-design.md` (PR #176, owner-approved)
**Branch:** `feat/speech-director-p1p2`, stacked on `fix/tts-expression-1003` (PR #177)
**Scope:** P1 (phrasing, pauses, speech-ready normalization) and P2 (one emotion per reply, per-reply pacing smoothed across turns). P3 (Rust events) and P4 (listening promotion) are out of scope.

## Owner rulings this plan follows

1. **One emotion decision per reply**, not per phrase.
2. **No Rust in this task.** The `SpeechPlan` carries the Rust event slots (breath / sigh / pause / laughSample, anchored to word indices or segment edges); P1/P2 only emit them into the shadow log line.
3. **Native `<break>` is not relied on.** Pauses render as punctuation until a measured test on the continuous-context path says otherwise. (Supporting evidence already in the repo: `prompt-speech-markup.test.ts` — "stacked breaks make it hallucinate"; PR #171's `native-breaks.ts` measured a 1 s break as 270 ms when sent as `. ` and notes a break splits the generation.)

## Integration point (the only live-path edit)

Live path, re-verified on `fix/tts-expression-1003` @ `cbc042741`:
`tts-wrapper.ts:1139 createGatewayTTSNode` → `gateway-tts-node.ts createStreamingOverlapTTS` → (provider has `openReplyStream`, `TTS_REPLY_CONTINUATIONS` unset) `continuation-tts.ts createContinuationTTS` → `sanitizeChunkForTTS` → `ssml/processor.ts parse` → `providers/cartesia.ts prosodyTags` → `CartesiaReplyStream.push`.

The Director sits **between `createContinuationTTS` and the Cartesia reply stream** as a `ReplyStream` decorator, plus a pass-through observer on the LLM text stream:

```ts
const directed = directSpeech({ reply: provider.openReplyStream(voiceId), textStream, ... });
createContinuationTTS({ textStream: directed.textStream, reply: directed.reply, ... });
```

Why a decorator instead of editing `continuation-tts.ts`: PR #171 rewrites `continuation-tts.ts` (215 lines) and `chunk-boundary.ts`; a decorator keeps this change to a 3-line edit of `gateway-tts-node.ts` and composes with either version. It also makes OFF byte-identical by construction: with the gate off `directSpeech` returns the **same** `reply` and `textStream` objects.

`gateway-tts-node.ts` is over 500 lines, so the ratchet forbids growth: the edit is offset by removing a stale comment.

## Gate

`SPEECH_DIRECTOR=off|shadow|live` (default `off`, unknown → `off`), read per reply, modeled on `speech/direction/director.ts directionMode(env)`. Per-lever overrides `SPEECH_DIRECTOR_{PHRASING,PAUSES,NORMALIZE,EMOTION,PACING}` (spec §4.4: each lever its own gate) can only lower a lever below the global mode.

| Mode   | Reply stream                                             | Text stream           | Pushed text | Log                |
| ------ | -------------------------------------------------------- | --------------------- | ----------- | ------------------ |
| off    | same object                                              | same object           | identical   | none               |
| shadow | decorator forwards every push verbatim first, then plans | pass-through observer | identical   | one line per reply |
| live   | decorator applies live levers                            | pass-through observer | directed    | one line per reply |

Director failures in either mode fall back to forwarding the push verbatim.

## Files

All new code under `src/speech/tts-gateway/director/` (each file < 500 lines).

| File                | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`          | `SpeechPlan`, `SpeechSegment`, `RustEvent` (spec §4.3, reuses `SSMLProsodyConfig`), `DirectorMode`, `Lever`                                                                                                                                                                                                                                                                                                                                                          |
| `gate.ts`           | `speechDirectorMode(env)`, `leverModes(env)`                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `spoken-numbers.ts` | integer / decimal / ordinal / year / digit-string → words                                                                                                                                                                                                                                                                                                                                                                                                            |
| `normalize.ts`      | `normalizeForSpeech(text)` → `{ text, count }`: phone, currency, percent, times, dates, ordinals, years, grouped/large numbers, decimals, abbreviations (titles, etc./vs./e.g./i.e./approx., then `COMMON_ABBREVIATIONS`). Never touches `[...]` / `<...>`                                                                                                                                                                                                           |
| `phrasing.ts`       | `PhraseAssembler`: re-cuts the continuation's pieces so no push ends mid-phrase. Sentence-ended pieces pass; a piece cut by the 80-char fallback is split at its last prosodic boundary (`, ; : —`, then before a conjunction) and the tail is held for the next piece. Never splits inside tags, abbreviations (reuses #177 `SENTENCE_BOUNDARY_ABBREVIATIONS` via `findSentenceEnd`), or numbers (`4,200`, `3.50`). First piece is never held (time-to-first-audio) |
| `pauses.ts`         | `planPauses(segment)` → pause events with kind (clause 150–300 ms, thought 300–600 ms, pre-reveal 600–900 ms; deterministic jitter) anchored by word index / segment end; `renderPauses(segment)` → punctuation-only upgrades (pre-reveal marker → `...`, missing comma after an opening discourse marker, comma before a contrastive conjunction in a long unpunctuated run)                                                                                        |
| `emotion.ts`        | `decideEmotion(...)` — one value per reply from {LLM-authored tag, session hint, the reply's opening words, previous reply's emotion}; only from `STABLE_EMOTIONS` (= `continuation-tts.ts` CALM_EMOTIONS, the measured-stable allowlist, all Cartesia-valid); word-consistency veto; turn-to-turn bridge (no sympathetic → content jump without bright words)                                                                                                       |
| `pacing.ts`         | `decideSpeed(...)` — per-reply target from content weight, EMA-smoothed across turns, clamped 0.9–1.08, skipped for Professional Voice Clones (`PRO_VOICE_IDS`, empty: spec §2.6 says Ferni's voice is almost certainly not a PVC; unconfirmed)                                                                                                                                                                                                                      |
| `session-state.ts`  | per-session carry-over (previous emotion, speed): bounded LRU keyed by sessionId, same pattern as `output-control/speech-context.ts`                                                                                                                                                                                                                                                                                                                                 |
| `reply-director.ts` | `DirectedReply` (the `ReplyStream` decorator), raw-text observer, plan assembly, latency accounting (µs), the one aggregate log line                                                                                                                                                                                                                                                                                                                                 |
| `index.ts`          | `directSpeech()` + exports                                                                                                                                                                                                                                                                                                                                                                                                                                           |

Touch outside the folder: `chunk-boundary.ts` exports `findSentenceEnd` (one word, #177's helper); `gateway-tts-node.ts` 3-line wiring.

## Tasks (failing test first for each)

1. **OFF identity characterization** — `director/__tests__/gateway-identity.test.ts`: drive `createGatewayTTSNode` with a provider whose `openReplyStream` records pushes, real SSML processor, a reply with markup/numbers/abbreviations. Golden pushes captured on the base commit; assert identical with gate unset and `off`, and identical pushes under `shadow`.
2. **Gate** — `gate.test.ts`: default off, unknown → off, lever overrides lower only.
3. **Spoken numbers + normalization** — `normalize.test.ts`: currency, cents, millions/k, percent, times (am/pm, keeps sentence-final period), dates (month-name, slash with year, slash without year only after a date preposition), ordinals, years, grouped numbers, decimals, phone, abbreviations; leaves `[laughter]`, small integers and plain text untouched.
4. **Phrasing** — `phrasing.test.ts`: sentence-ended pieces unchanged; fallback-cut piece split at last clause boundary with tail held; no split inside abbreviation / number / tag; first piece never held; flush on end; text conserved.
5. **Pauses** — `pauses.test.ts`: bucket ranges, deterministic durations, word-index anchors, renders are punctuation only (no `<break>`), each upgrade rule and its exclusions.
6. **Emotion** — `emotion.test.ts`: only allowlisted outputs; each allowlisted value passes `processor.parse` and continuation's calm filter; authored-but-inconsistent vetoed; non-stable mapped; session hint; previous carry-over; bridge rule.
7. **Pacing** — `pacing.test.ts`: targets, smoothing across turns, clamp, PVC skip, no tag near 1.
8. **Reply director** — `reply-director.test.ts`: shadow forwards verbatim + exactly one log line without transcript text (segment count, emotion, pause count/ms, latency µs, rust events); live applies normalization/phrasing/pauses/emotion/speed; soft-start opening preserved then reset to reply speed; director error → verbatim fallback; per-session isolation; Rust events present in plan.
9. **Latency benchmark** — `director-latency.bench.test.ts`: 300 replies from a fixed corpus through the live director; assert p95 ≤ 20 ms per reply; print p50/p95/max µs.
10. **Wire** — `gateway-tts-node.ts`; re-run task 1 (must still pass), gateway + continuation suites.
11. **Gates** — `pnpm typecheck` (canary-proven), `pnpm lint`, ratchet, `pnpm test` for `src/speech/`, full `pnpm test`.

## Deferred

- P3: consuming `RustEvent`s in `apps/rust-audio` (breath trigger, sigh renderer, PCM pause insertion), word timestamps (`add_timestamps`), SOLA fallback for un-honored speed.
- P4: blind A/B promotion; objective metrics (inter-chunk discontinuity, pause-distribution KL vs corpus).
- Fillers and `[laughter]` gating (spec puts them in P2 alongside emotion; not in this task's brief) — `contextual-laughter.ts` liveness check still open.
- Native `<break>` re-test on the continuous context (owner ruling 3).
- `GET /voices/{id}` PVC confirmation (needs the Cartesia key; not made).
