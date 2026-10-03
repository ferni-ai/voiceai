# Human Speech Director — Design Spec

**Date:** 2026-10-03
**Status:** Draft (for owner review — no implementation in this change)
**Method:** Read live code + prior audit scratchpad, verify every "current state" claim against `origin/main` directly (several audit claims turned out stale — see §1.1), research Cartesia's public docs for the capability matrix, grep-verify Rust module liveness, then design the two-stage pipeline the owner asked for.
**Predecessor:** `fix/tts-expression-1003` (branch exists off `origin/main`, no commits yet as of this writing) — the in-flight correctness pass this spec is designed to sit on top of, not duplicate.
**Scope:** Design only. No code changes. Do not deploy/restart/change secrets.

---

## 0. Principle (owner-approved)

> Every aspect that makes speech sound human is **decided before Cartesia** and expressed only in forms Cartesia supports. Anything Cartesia cannot do happens in Ferni's Rust audio layer **after** Cartesia.

Two stages, one direction of data flow, no exceptions:

```
LLM reply text
     │
     ▼
┌─────────────────────────────┐
│ STAGE 1 — Speech Director    │  TypeScript, pre-Cartesia
│ (new)                        │  Decides EVERYTHING Cartesia can express:
│                               │  phrasing, emotion arc, pacing, pauses,
│                               │  fillers, laughter, text normalization
└───────────────┬───────────────┘
                │  SpeechPlan (§4.3)
                ▼
┌─────────────────────────────┐
│ Cartesia Sonic (sonic-3.6)   │  One context per reply, continue:true
└───────────────┬───────────────┘
                │  PCM frames (+ word timestamps, if available — §2.5)
                ▼
┌─────────────────────────────┐
│ STAGE 2 — Rust audio layer   │  apps/rust-audio, post-Cartesia
│ (extend existing)            │  Renders what Cartesia can't: breaths, sighs,
│                               │  seamless joins, micro-variation, SOLA pacing
└───────────────┬───────────────┘
                ▼
          LiveKit audio frames
```

Nothing in Stage 2 should duplicate a lever Cartesia already exposes — if Cartesia can do it (speed, a documented emotion, a native break, `[laughter]`), Stage 1 asks for it directly in Cartesia's own vocabulary. Stage 2 exists only for the complement: real breath/sigh audio, inter-chunk seam quality, and voice micro-texture that no TTS vendor renders.

---

## 1. Current state (verified against `origin/main`, 2026-10-03)

### 1.1 Correction to the prior audit

A read-only audit (`/private/tmp/claude-501/.../scratchpad/ferni-speech-audit.md`, same date) confirmed the live path is the TTS Gateway — `src/speech/tts-gateway/gateway-tts-node.ts` → `ssml/processor.ts` → `providers/cartesia.ts` — not `src/speech/tts/persona-aware.ts`. That part holds up: `src/speech/tts-gateway/providers/index.ts:44-49` still defaults to `getCartesiaProvider()` and only switches to Sonata when `TTS_PROVIDER=sonata` **and** the native addon resolves; the root `CLAUDE.md`'s "Current Production Stack" table and the audit's live `lk agent logs` capture (prod agent `CA_GeFvEpsNXLSF` running `cartesia-cascade`) agree.

But two of the audit's **highest-severity findings no longer hold** on the `origin/main` commit this worktree is built from (`e563a6fea`). Both the audit and this spec were written the same day; either the audit read a stale checkout or missed these files. Re-verified directly, file-by-file:

| Audit claim | Audit's cited evidence | What `origin/main` actually has today |
|---|---|---|
| "Every TTS chunk opens a brand-new Cartesia context... no `continue` flag threaded" | `cartesia.ts:123`, `gateway-tts-node.ts:513-667` (old) | **Already fixed.** `src/speech/tts-gateway/providers/cartesia-reply-stream.ts` implements `CartesiaReplyStream` — one `context_id` per reply, `continue:true` on every push except the last. `continuation-tts.ts` feeds it from the LLM stream. `gateway-tts-node.ts:410` enables it by default: `if (provider.openReplyStream && process.env.TTS_REPLY_CONTINUATIONS !== 'false')`. The module comment documents the exact regression this closed: "each request added its own leading and trailing silence (300-560ms gaps measured on a live call)." |
| "80-char fallback splitter can cut mid-tag... fix written in commit `9c992128e`, never merged" | `gateway-tts-node.ts:575-581` (old) | **Already fixed and merged.** `src/speech/tts-gateway/chunk-boundary.ts` exists on `origin/main` with exactly this logic (`findChunkEnd()`, `markupSafeCut()` — never cuts inside `<...>` or `[...]`) plus `__tests__/chunk-boundary.test.ts`. `continuation-tts.ts:97` calls it. |
| "`<emotion>`/`<speed>`/`<volume>` parsed then discarded (`_prosody` unused, leading underscore)" | `cartesia.ts:54,108` (old) | **Partially stale.** `cartesia.ts`'s `synthesize()`/`synthesizeStreaming()` take `prosody` (no underscore) and render it via `prosodyTags()` (`cartesia.ts:60-73`) as inline Cartesia markup prepended to the transcript — the correct Cartesia mechanism (emotion/speed/volume are transcript-text tags, not JSON body fields; confirmed in §2). The real, still-current constraint is in `continuation-tts.ts:24-44`: only one emotion/speed/volume push per reply (the *opening* only), and emotion is clamped to a `CALM_EMOTIONS` allow-list — code comment: "Big ones (excited, surprised...) widened the cloned voice's pitch range from 8.7 to 10.9 semitones and swung it between turns." This is a real, measured constraint the Director must design around (§4.2), not a bug to fix (§4.1). |

**Findings that are still accurate** (re-verified):

- **Abbreviation gap confirmed live.** `chunk-boundary.ts:16`'s `SENTENCE_END` regex still only guards 1–2 character prefixes (`[A-Z][a-z]`, `[A-Z]`, `[0-9]`). `src/ssml/constants/common-abbreviations.ts` has a real `COMMON_ABBREVIATIONS` list but `grep -rn "common-abbreviations" src/` shows it is only imported by `src/ssml/constants/index.ts` itself — zero callers in the TTS gateway path. "Mrs. Johnson", "etc.", "approx." still get a hard sentence break.
- **`[laughter]` works end-to-end; `[sigh]`/`[breath]`/`<phoneme>` do not.** `src/speech/tts-gateway/ssml/processor.ts:62-68` normalizes `[laughs]`/`[chuckle]`/etc. to Cartesia's native `[laughter]` and lets it through. `STRIP_BRACKET_REGEX` (`processor.ts:68-69`) explicitly strips `[sighs?]`, `[smiles?]`, `[nods?]`, etc. The existing `sigh`/`breath` behavior tool (`src/tools/domains/behavior/index.ts:112,115`) emits `<phoneme alphabet="ipa" ph="hh">...</phoneme>` for breath and `<emotion value="gentle"/>Ahh.` for sigh — the phoneme tag's open/close both match the generic "strip any remaining XML-like tag" fallback (`processor.ts:366-374`), so only the placeholder text between the tags (literally `"..."`) survives, which Cartesia will not render as a real breath sound.
- **New finding, not in the audit: native `<break>` is never sent to Cartesia.** `processor.ts:258-277` converts every `<break time="Xms"/>` to punctuation by duration bucket (≥500ms → `. `, ≥200ms → `, `, ≥50ms → ` `, else dropped) "since Cartesia streaming can't handle breaks reliably" per the module's own doc comment. This predates the reply-stream work above and was never revisited. The owner's design explicitly wants native `<break>` with human-distributed durations — §4.1 addresses whether that constraint still holds now that replies go through one continuous context instead of disjoint per-sentence requests.
- **No text normalization for numbers/dates exists anywhere in the codebase.** `grep -rn "normalizeNumbers\|normalizeDates\|expandNumber\|expandDate"` across `src/` returns nothing. `src/ssml/constants.ts` exports `FINANCIAL_PRONUNCIATIONS` (really `ALL_PRONUNCIATIONS`, a word→phonetic-spelling substitution dictionary) consumed by `src/ssml/pronunciation-processor.ts` → `src/ssml/core.ts` — but that whole pipeline is the **other**, non-live SSML module (the one the audit confirmed `PersonaAwareTTS` uses, not the gateway). `gateway-tts-node.ts` never imports from `src/ssml/` — only from its own local `./ssml/index.js`. This is a real gap, not doc drift: numbers/dates/abbreviations have zero normalization on the live path today.
- **Doc drift found and worth fixing separately (not in this spec's scope):** `src/speech/CLAUDE.md` says "After the Sonata migration (Feb 2026), all TTS goes through Sonata... Factory: `tts-gateway/providers/index.ts` → always returns Sonata." This is wrong on `origin/main` today — the factory's own comment says "Default: Cartesia (production)" and only returns Sonata when `TTS_PROVIDER=sonata` is set and the native addon resolves (`providers/index.ts:38-49`). Flagging this because it would have sent an implementer to the wrong module; not fixing it here since it's a docs-only change outside this spec's remit.

### 1.2 What exists that this spec builds on, not duplicates

| Capability | File | Keep as-is |
|---|---|---|
| One Cartesia context per reply, `continue:true` streaming | `cartesia-reply-stream.ts`, `continuation-tts.ts` | Yes — Stage 1's phrasing output (§4.1) feeds this unchanged; the Director decides *where* to cut, this layer still owns *how* to push. |
| Tag-safe chunk cut points | `chunk-boundary.ts` | Yes — the Director's phrasing stage should emit already-complete prosodic phrases, so `findChunkEnd()` becomes a safety net, not the primary splitter. |
| Opening-only emotion/speed/volume per reply, calm-only allow-list | `continuation-tts.ts:24-44` | Keep the calm-only constraint; the Director's emotion arc (§4.1) must still land through this single opening-tag mechanism unless/until per-phrase emotion is proven stable (see Risks, §5). |
| `[laughter]` passthrough | `processor.ts:62-68` | Yes. |
| Inline Cartesia tag rendering (`prosodyTags()`) | `cartesia.ts:60-73` | Yes — this is the one and only place tags get serialized into transcript text; Stage 1 should produce `SSMLProsodyConfig`-shaped values, not hand-written tag strings, so this stays the single point of truth for valid Cartesia syntax. |

---

## 2. Cartesia capability matrix

Researched via public docs (`docs.cartesia.ai`) and Cartesia's own blog/changelog on 2026-10-03; the `emotional-control` landing page itself redirects to a login wall, so citations below are to the pages that remained public (`volume-speed-emotion`, `ssml-tags`, API reference pages, changelog). Every row is either sourced or marked UNCONFIRMED — none of this is a live API call (none was made, per this task's read-only scope).

### 2.1 Model

| Aspect | Finding | Source |
|---|---|---|
| Current model | Ferni's `CARTESIA_MODEL` default is `sonic-3.6` (`src/config/voice-ids.ts:28`) — Cartesia's latest stable alias, a drop-in for `sonic-3` | [Sonic 3.6 docs](https://docs.cartesia.ai/build-with-cartesia/tts-models/latest) |
| Streaming latency | Sub-90ms documented first-byte latency; Sonic-3.6 generates roughly 2x faster than v3 | [2026 changelog](https://docs.cartesia.ai/changelog/2026) |
| Languages | 44 languages documented (English, Spanish, Mandarin, Hindi, Japanese, Arabic, and others) | [Sonic 3.6 docs](https://docs.cartesia.ai/build-with-cartesia/tts-models/latest) |
| Sample rates / encodings | 8000–48000 Hz; `pcm_f32le`, `pcm_s16le`, `pcm_mulaw`, `pcm_alaw`; `raw` container on all endpoints, `wav`/`mp3` on the Bytes endpoint only | [Output format](https://docs.cartesia.ai/build-with-cartesia/capability-guides/tts-output-audio-format) |

### 2.2 Inline/control tags

| Tag | Syntax | Range | Notes | Source |
|---|---|---|---|---|
| Speed | `<speed ratio="X"/>` | 0.6–1.5 | Matches `SPEED_MIN`/`SPEED_MAX` already in `processor.ts:79-80` exactly. **Not supported on Professional Voice Clones.** | [SSML tags](https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags), [PVC guide](https://docs.cartesia.ai/build-with-cartesia/capability-guides/clone-voices-pro) |
| Volume | `<volume ratio="X"/>` | 0.5–2.0 | Matches `VOLUME_MIN`/`VOLUME_MAX` in `processor.ts:82-83` exactly. **Not supported on PVCs.** | Same as above |
| Emotion | `<emotion value="X"/>` | ~60 documented values (§2.3) | English-only. Documented **"highly experimental."** Only works when the emotion is consistent with the transcript's own content — a hard requirement, not a tuning nicety. Best results on Cartesia's 8 "Emotive"-tagged voices (Leo, Jace, Kyle, Gavin, Maya, Tessa, Dana, Marian); "may not work reliably" on non-Emotive voices (Ferni's voice is not in this list). **Not supported on PVCs.** | [Emotion guide](https://docs.cartesia.ai/build-with-cartesia/capability-guides/volume-speed-emotion), [SSML tags](https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags) |
| Break | `<break time="Xms"/>` or `"Xs"` | any duration | Native silence insertion. Ferni currently converts this to punctuation instead of sending it (§1.1) — the docs don't themselves warn against it; that caution predates this spec's own evidence and should be re-tested (§6 P1). | [SSML tags](https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags) |
| Spell | `<spell>...</spell>` | text content | Character-by-character readout (codes, names) — not currently used anywhere in Ferni's SSML processor; a candidate tool for the text-normalization work in §4.1. | [SSML tags](https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags) |
| `[laughter]` | bracket tag in transcript text | — | Documented and supported; this is the only nonverbal bracket tag Cartesia documents. | [Emotion guide](https://docs.cartesia.ai/build-with-cartesia/capability-guides/volume-speed-emotion) |
| `[sigh]`, `[breath]`, `[gasp]`, `[cough]` | — | — | **Not documented anywhere in Cartesia's public docs.** Only appear in third-party research datasets (e.g. the NonverbalTTS corpus, describing other vendors' models), never as a Cartesia Sonic capability. No changelog entry proposes adding them. | Absence confirmed against [SSML tags](https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags) and [2026 changelog](https://docs.cartesia.ai/changelog/2026) |

This directly confirms the owner's architecture call: sigh/breath have no Cartesia-side expression today and must be entirely Stage 2 (§4.2) — not even a word-substitute sent to Cartesia, per the owner's principle.

### 2.3 Emotion value list

Cartesia documents roughly 60 values (primary/best-results subset: `neutral`, `calm`, `angry`, `content`, `sad`, `scared`). [Source](https://docs.cartesia.ai/build-with-cartesia/capability-guides/volume-speed-emotion). Ferni's own validator (`VALID_EMOTIONS`, `processor.ts:27-49`) lists ~50 plus several "legacy aliases" (`happiness`, `sadness`, `anger`, etc.) not in Cartesia's documented list, and is missing a few Cartesia documents (`trust`). Worth a follow-up sync, but out of scope for this spec — flagging here so the Director doesn't inherit a stale allow-list unknowingly.

**Mid-utterance switching:** Cartesia's own guidance is to use **separate generation contexts per emotion**, not to switch emotion mid-context. This directly informs §4.1/§5.1 — it's not just Ferni's own measured instability (pitch range widening, §1.1) causing the single-opening-tag constraint; Cartesia's documentation independently recommends against what the owner's "emotion arc per phrase" architecture would otherwise require within one continuous reply-stream context.

### 2.4 Context continuation (WebSocket)

| Parameter | Type | Behavior | Source |
|---|---|---|---|
| `context_id` | string | Groups related generation requests; reuse the same id to keep one context open — exactly what `cartesia-reply-stream.ts` already does. | [WebSocket API](https://docs.cartesia.ai/api-reference/tts/websocket) |
| `continue` | boolean, default `false` | `true` = more text coming (optimizes for throughput); `false` = final chunk (optimizes for latency) — matches `continuation-tts.ts`'s usage exactly. | Same |
| `max_buffer_delay_ms` | integer, 0–5000, default 3000 | How long the server buffers text before generating; `cartesia.ts`'s `openReplyStream()` already sets this to `0` ("the gateway already sends whole sentences; server buffering only adds delay") — consistent with the docs' own trade-off description. | Same |
| Max context lifetime | — | **UNCONFIRMED** — not specified in the public API reference. Ferni's own timeout (`WS_STREAM_TIMEOUT_MS = 30_000` in `cartesia.ts`) is a self-imposed ceiling, not one Cartesia documents. | [WebSocket API](https://docs.cartesia.ai/api-reference/tts/websocket) — silent on this |

### 2.5 Word-level timestamps

| Aspect | Finding | Source |
|---|---|---|
| Supported transports | **SSE and WebSocket only — not the Bytes REST endpoint.** Ferni's streaming path uses the WebSocket endpoint (`cartesia.ts`'s `buildWebsocketUrl()`), so this is reachable. | [WebSocket API](https://docs.cartesia.ai/api-reference/tts/websocket), [Bytes API](https://docs.cartesia.ai/api-reference/tts/bytes) |
| Request flag | `add_timestamps: true` (boolean, default `false`) — **not currently sent anywhere in `cartesia.ts`'s WebSocket request body.** A phoneme-level sibling, `add_phoneme_timestamps`, also exists. | [SSE API reference](https://docs.cartesia.ai/api-reference/tts/sse) (documents the shared timestamp event shape used by WS too) |
| Response shape | A timestamp event with `word_timestamps: { words: [...], start: [...], end: [...] }`, times in seconds. | Same |
| Language coverage | **en, de, es, fr only** for Sonic-3-family models (Ferni is English, so this is not a blocker). | Same |

**This resolves §4.3's open question partially**: word timestamps are available on the transport Ferni already uses, gated behind one request flag Ferni doesn't currently send. Still open: whether `cartesia-socket.ts`'s response handling already tolerates (or would need new parsing for) a timestamp event type alongside the audio-chunk events it handles today — that's an implementation question for P1, not answered by this research pass (no code change was made to verify it end-to-end).

### 2.6 Voice types

| Voice type | Speed/volume tags | Emotion tags | How to identify via API |
|---|---|---|---|
| Stock/library voice | Supported | Supported (English, best-effort) | Default — no special flag |
| Instant Voice Clone (IVC) | Supported | Supported | Returned voice id from the clone endpoint |
| Professional Voice Clone (PVC) | **Not supported** — baked into training | **Not supported** — baked into training | `GET /voices/{id}` → `is_pro: true` |

**Ferni's voice (`fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc`):** still UNCONFIRMED whether stock or IVC — the code comment ("picked from Cartesia's public voice library") suggests stock, and the `docs/research/VOICE-CLONE-API-RESEARCH.md` note about rejecting PVC was about a different, unrelated voice-cloning feature (confirmed independently during this research pass, consistent with the prior audit's reading). Either way it is almost certainly **not a PVC** (nothing in the repo suggests a 30-minute studio PVC session ever happened for the main Ferni voice), so the PVC speed/emotion restriction is very likely not the limiting factor — but the one-call confirmation (`GET /voices/fdeb5d75-...`, read-only, no mutation) is cheap and should happen in P1 rather than staying an assumption (§5.8).

### 2.7 Summary relevant to this spec's design

- Everything the Director needs to express per §4.1 (speed, volume, emotion, break, `[laughter]`) has a real, documented Cartesia mechanism — confirming the owner's principle is achievable, not aspirational.
- Sigh/breath/gasp/cough have **zero** Cartesia expression, documented or roadmapped — confirming Stage 2 must own 100% of that surface, with no Cartesia-side half-measure (not even a word substitute).
- Cartesia's own docs — independent of Ferni's own measured instability — recommend against mid-context emotion switching, which is the strongest evidence yet for §5.1's resolution: a full per-phrase emotion arc inside one continuous reply-stream context is very likely off the table permanently, not just until Ferni runs a stability experiment. P2 should plan for "one emotion decision per reply" as the probable final answer, with the stability experiment there to confirm rather than discover this.

---

## 3. Rust audio layer — liveness audit

**Headline finding, more important than any single row below: there are two parallel Rust implementations of "speech humanization," and they are not the same code.** `apps/rust-perf/src/humanization/*` (the paths the owner's brief named) is well-written but entirely disconnected — never NAPI-exported, reachable only from an unused HTTP server binary. `apps/rust-audio/src/{post_tts,post_tts_processor,sola}.rs` is the one that's actually live, NAPI-exported, and wired into every real reply today — and it **already implements breath injection and SOLA time-stretching**, just switched off by a conservative production preset after a documented audio-quality regression. Stage 2 (§4.2) should extend the `rust-audio` pipeline, not revive or port from `rust-perf`.

Verified directly against `origin/main` (not solely from the audit agent's report, which is corroborating evidence, not the primary source — see methodology note at the end of this section).

### 3.1 `apps/rust-perf/src/humanization/*` — confirmed dead code

| Module | What it does | NAPI export | Live caller |
|---|---|---|---|
| `breath_injector.rs` | Breath sound injection at phrase boundaries | NONE | NONE |
| `emotion_coloring.rs` | Spectral EQ/compression shaped by emotion | NONE | NONE |
| `filler_injector.rs` | Hesitation sound injection ("um", lip smacks) at pauses | NONE | NONE |
| `paralinguistic.rs` | Sigh/throat-clear injection at first detected pause | NONE | NONE |
| `physiological.rs` | Physiological-state voice effects (tired, crying) | NONE | NONE |
| `prosody_engine.rs` | Pitch shift + declination from emotion/intensity | NONE | NONE |
| `vocal_texture.rs` | Cycle-to-cycle jitter/shimmer | NONE | NONE |
| `adaptive_pacing.rs` | Emotion/intensity-driven time-stretch | NONE | NONE |

Evidence (re-run and confirmed):
```
$ grep -i "breath_injector\|emotion_coloring\|filler_injector\|paralinguistic\|physiological\|prosody_engine\|vocal_texture\|adaptive_pacing" apps/rust-perf/index.d.ts
# (no matches)
$ grep -rn "breath_injector\|emotion_coloring\|filler_injector" src/ --include="*.ts"
# (no matches)
$ grep -rn "humanization::humanize_audio" apps/rust-perf/src/
apps/rust-perf/src/bin/server.rs:896:    humanization::humanize_audio(&samples, sample_rate, &context)
```
The only caller of this entire module tree is `apps/rust-perf/src/bin/server.rs`, a standalone HTTP server binary with no TypeScript caller anywhere in `src/`. This is a confident MISSING, not an unconfirmed one — both the NAPI-export check and the exhaustive TS-side grep came back empty.

### 3.2 `apps/rust-audio/src/{post_tts,post_tts_processor,sola}.rs` — live, but almost entirely switched off

**The call chain, read directly:** `src/agents/shared/tts-wrapper.ts:1213` — `applyPostTTSEnhancement(audioStream, enhancementConfig)` — runs on the output of the TTS Gateway (§1, the same `gateway-tts-node.ts` pipeline this whole spec is about) on **every reply**, gated only by `enablePostTTSEnhancement` which defaults to `process.env.POST_TTS_ENHANCEMENT_ENABLED !== 'false'` (`tts-wrapper.ts:412`) — i.e. on unless explicitly disabled. `applyPostTTSEnhancement` (`src/agents/shared/performance/post-tts-transform.ts`) calls into the NAPI-exported Rust functions in `apps/rust-audio/src/lib.rs` (`enhance_post_tts_output` / `get_default_post_tts_config`, confirmed via `#[napi]`-annotated functions reading the config struct from `post_tts.rs`), which call `post_tts_processor.rs`'s stateful processor, which in turn uses `sola.rs`'s `SolaMicroPitch`, `SolaPitchDrift`, `SolaTimeStretch` internally (`post_tts_processor.rs:24`) — SOLA itself has no separate NAPI export; it's reached only through the processor, so "is SOLA live" and "is the processor live" are the same question, and the answer is yes.

What's **already implemented** inside this live pipeline, confirmed by reading the Rust source directly, not inferred from names:
- **Breath injection**, procedurally synthesized (not a recorded sample): `post_tts.rs:84`'s `generate_breath_sample()` and `post_tts_processor.rs`'s `BreathGenerator` use time-varying formant synthesis (documented in-code as modeling the "sss" → "hhh" spectral evolution of a real exhale) triggered at phrase boundaries (`post_tts_processor.rs:4701`, `check_and_inject_boundary_breath()`) with a configurable `breathProbability`. This is close to the owner's "breaths before long phrases" ask already, except the owner's brief says "real samples" — current code is procedural synthesis, which the test suite (`post_tts_processor.rs:5599-6509`, `test_breath_generator_injects_breath`, `test_e2e_phrase_boundary_breath_injection`) confirms works, but is not literally sampled audio. Whether to keep procedural synthesis or move to real recordings is an open call for P3 (§6), not decided by this spec.
- **SOLA-based time-stretch and pitch-shift**, artifact-free (the whole point of SOLA — avoids the clicks a naive resample would cause): `useSolaPitch`, `enableTempoVariation`/`enableMicroPitch` config flags.
- **Jitter, shimmer, HNR modulation (breathiness)**: `enableJitter`/`jitterAmount`, `enableShimmer`/`shimmerAmount`, `enableHnrModulation`/`hnrBreathiness` config fields — exactly the owner's "micro-variation (jitter/shimmer/HNR)" ask, already coded.
- Warmth EQ (low-shelf boost), dynamic compression, split-band de-esser, presence boost, soft edges (click-free chunk-join crossfade), vocal fry, lip smacks, glottalization, Lombard effect, register transitions — a considerably larger feature set than the owner's brief enumerated.

**What's actually ON in production**, read directly from `PostTTSPresets.betterThanHuman` (`post-tts-transform.ts:1458-1500`, the exact preset `tts-wrapper.ts:1201` passes):

| Feature | Live default |
|---|---|
| Soft edges (10ms crossfade) | **ON** |
| Warmth EQ | **ON** (amount 0.25) |
| Compression | **ON** (ratio 1.5, threshold -20dB) |
| Breath injection | **OFF** |
| Presence boost | **OFF** |
| Amplitude jitter | **OFF** |
| Pitch drift | **OFF** |
| Noise floor | **OFF** |
| SOLA pitch | **OFF** |
| Emotion prosody | **OFF** |
| Micro-pitch | **OFF** |
| Vocal fry / lip smacks | **OFF** |
| Tempo variation | **OFF** |
| Onset softening | **OFF** |
| Jitter / shimmer / HNR modulation | **OFF** |
| Subglottal resonance / smile formants / glottalization / Lombard effect / register transitions / pharyngeal constriction | **OFF** (all) |

The preset's own comment, verbatim: *"After production audio quality issues, this preset is now MINIMAL... NO experimental humanization features. For more features, use specific presets or enable via env vars after testing."* This is the single most important fact for Stage 2 planning: **almost the entire feature set the owner is asking for already exists in this file and is reachable today via env vars** (`POST_TTS_BREATH=true`, `POST_TTS_JITTER=true`, `POST_TTS_SOLA_PITCH=true`, etc. — documented in `post-tts-transform.ts`'s own header comment block), but was turned off after a real production incident whose specifics aren't in this file (no linked postmortem or date found). Re-enabling any of these without first measuring — exactly what the "measure before tuning" operating principle exists to prevent — would be repeating whatever caused that incident.

**The config-flag-dropout bug the owner's brief mentioned is real and already fixed**, not open: commit `e91c02ad96b3b235c92c1611d2ea91223faefbcb` (2026-09-28, `fix(audio): working post-tts switches, typed ssml extractors, js fallbacks`, verified to exist via `git cat-file -t`) fixed TypeScript-side config flags not being threaded through to the Rust processor — the `betterThanHuman` preset's env-var overrides now actually reach Rust. This landed five days before this spec; no further action needed here, just worth citing so P3 doesn't rediscover it as a live bug.

### 3.3 Implications for Stage 2 design (§4.2)

1. Breath and SOLA-pacing-fallback (owner's design, §0/§4.2) are not new work — they're **re-enablement-with-measurement** of existing, tested Rust code, plus wiring the Director's `RustEvent`s (§4.3) as the trigger source instead of (or alongside) the existing standalone `breathProbability` heuristic.
2. Micro-variation (jitter/shimmer/HNR) is the same story — exists, is tested, is off. P3's "measure before tuning" gate applies directly here, with an unusually good starting point: the exact config flags and their ranges already exist, so the P3 experiment is "re-enable flag X, measure the three objective metrics from §4.4, compare to the regression that got it disabled" rather than "design the feature from scratch."
3. Sighs are the one piece with **no existing Rust implementation to extend** — `paralinguistic.rs`'s sigh logic lives only in the dead `rust-perf` tree. A new sigh renderer (sample-based or procedural, following the `BreathGenerator`'s formant-synthesis pattern as precedent) is genuinely new work for `apps/rust-audio`, not a re-enablement.
4. Room tone (mentioned in the owner's brief) has no corresponding config flag found in `post-tts-transform.ts` — UNCONFIRMED whether it exists anywhere in `apps/rust-audio`; treat as new work until a dedicated search in P3 says otherwise.

### 3.4 Methodology note

This section's claims were verified two ways: (a) a dedicated audit agent ran the grep-and-read protocol below and reported its evidence; (b) several of its highest-value claims (the live call chain through `tts-wrapper.ts`, the `betterThanHuman` preset's actual contents, the breath/SOLA implementation details, the commit SHA) were independently re-verified by reading the cited files directly during this same research pass, because the agent's initial framing of `post_tts_processor.rs` as "LIVE" undersold how much of its feature set is live-but-disabled — a distinction load-bearing enough for this spec that it needed primary-source confirmation, not a single secondhand report. Protocol used for both passes, verbatim:

> Before reporting any feature/call site as MISSING or UNWIRED: (1) grep for the symbol across the TS tree and read ~20 lines around each hit; (2) if an NAPI export exists, find every caller, not just the expected one; (3) for a module with no obvious caller, check the `.d.ts`/generated glue file before concluding nothing exports it; (4) report "UNCONFIRMED" rather than a confident MISSING claim if these checks don't reach zero-matches-with-confidence.

---

## 4. Architecture

### 4.1 Stage 1 — Speech Director (TypeScript, pre-Cartesia)

**Where it sits:** a new module, e.g. `src/speech/tts-gateway/director/`, called once per LLM reply, upstream of `createStreamingOverlapTTS()`/`createContinuationTTS()` in `gateway-tts-node.ts`. It consumes the same text stream `sanitizeChunkForTTS()` consumes today and produces a `SpeechPlan` (§4.3) instead of (or alongside, during SHADOW — §4.4) today's per-chunk `sanitizeChunkForTTS()` + `prosodyTags()` calls.

**Phrasing.** One Cartesia context per reply (already true — §1.2). The Director's job is to decide *where inside that one context* to push, i.e. where `reply.push()` is called in `continuation-tts.ts`. Today that's `findChunkEnd()`'s job, driven by `SENTENCE_END` + a 80-char fallback. The Director should instead segment on prosodic phrase boundaries — clause breaks (commas, conjunctions, relative clauses), not just sentence-final punctuation — because a single long sentence currently waits for `MAX_UNPUNCTUATED` (80 chars) before any cut, which is an un-prosodic place to break speech. Concretely: the Director walks the completed LLM text (it can afford to wait for slightly more context than the raw streaming splitter, since it is deciding structure, not minimizing time-to-first-audio) and emits phrase boundaries; `findChunkEnd()`/`markupSafeCut()` remain the tag-safety net underneath those boundaries, unchanged. Hard constraint carried over from `chunk-boundary.ts`: never split inside `<...>`, `[...]`, an abbreviation, or a number — the fix for the abbreviation gap (§1.1) belongs here, by having the Director's phrase-boundary detector consult `COMMON_ABBREVIATIONS` (already written, unused — §1.1) before treating a `.` as a boundary.

**Emotion arc.** Per-phrase emotion *decisions* are computed from conversation state (persona, topic weight, user's emotional trajectory — signals already available via `src/speech/audio-prosody/` and `src/speech/sesame-inspired/anticipatory-prosody.ts`), but the *expression* is constrained by what's actually safe to send to Cartesia today (§1.2, §5): one opening tag per reply, calm-adjacent values only, smoothed so a reply never asks for two incompatible emotions back to back (e.g. `sad` immediately followed by `excited`). "Only when consistent with the words" means the Director should not tag a reply `happy` if the sentence itself is bad news — Cartesia's own docs call this out as a hard requirement for the tag to work at all (§2). Until Cartesia's per-phrase mid-context emotion stability is proven (§5, open question), the Director's output for emotion is a single value per reply, chosen conservatively from the arc rather than the full multi-point arc the owner's architecture describes — the arc computation should still exist (so Stage 2's narration/expressiveness decisions and future work have it), but only its first/dominant point reaches Cartesia until the stability question is resolved.

**Pacing.** Same per-reply ceiling as emotion: one `<speed>` value on the opening push (the existing `RESET_PACE_TAGS` mechanism in `continuation-tts.ts` already resets pace after the opening, confirming the codebase's own assumption is "pace is an opening-only lever today"). The Director can still vary speed *across* replies (turn to turn) based on content weight (slow for a hard topic, slightly faster for banter) — that's free, it only touches the per-reply opening value. Slight natural micro-variation *within* a reply is a Stage 2 concern (SOLA, §4.2) unless/until Cartesia proves safe for mid-context speed changes.

**Pauses.** `<break>` is Cartesia-native syntax but is currently converted to punctuation before it ever reaches the provider (§1.1, new finding) — a workaround written before the reply-stream/continuation work existed. The Director should re-evaluate sending real `<break time="Xms"/>` tags now that a reply is one continuous WebSocket context rather than disjoint requests (the original "Cartesia streaming can't handle breaks reliably" comment predates that change and may no longer apply — this needs the P1 spike described in §6 P1, not an assumption either way in this spec). Duration should come from a human-pause-distribution model with three buckets matching natural speech timing: clause pause (short, ~150–300ms), thought pause (medium, ~300–600ms, e.g. before a qualifying remark), pre-reveal pause (long, ~600–900ms, e.g. before delivering the point of a sentence) — these numbers are a starting point for the P1 spike's calibration against a real speech corpus (§6 P4), not a final spec.

**Fillers/disfluencies.** Sparse, context-appropriate ("um", "well", "so") drawn from existing persona voice data (`src/speech/persona-phrases/`, `getSilenceFillerSync()` in `persona-voice-loader.ts` — already loaded per persona) rather than invented fresh. Rate-limited per reply and per conversation (the existing `contextual-laughter.ts` cooldown-per-persona pattern, e.g. "min 3 turns between" for Ferni, is a reusable template for a filler/laughter shared budget rather than two independent ones).

**`[laughter]`.** Already works (§1.1) — the Director's job is only to decide *when* it's earned, reusing `src/speech/adaptive-ssml/contextual-laughter.ts`'s existing decision logic (`addContextualLaughter()` already encodes "not during heavy topics," "not when user is distressed," persona-specific base probabilities and cooldowns) rather than re-deciding this from scratch. Confirm during P1 whether `contextual-laughter.ts` is itself reachable from the live gateway path or is part of the non-live `adaptive-ssml`/`PersonaAwareTTS` pipeline (§3 flags this as a liveness question the Rust-focused audit touched only in passing) — if it's currently dead on this path, the Director either revives the call or re-implements the same decision rules, but should not invent a third laughter-gating policy.

**Text normalization.** No existing implementation to build on for numbers/dates (§1.1) — this is new work. Scope: spoken-form expansion for currency ("$4,200" → "four thousand two hundred dollars"), dates ("10/3" → "October third," context-dependent on locale), ordinals, and phone/time formats, landing before the phrase-boundary segmentation so punctuation inside a normalized number ("4,200" → comma) never gets mistaken for a clause boundary. `COMMON_ABBREVIATIONS` (unused today) is reused here directly, not reinvented.

### 4.2 Stage 2 — Rust audio layer (post-Cartesia, extends existing crates)

Scope per the owner's principle: only what Cartesia cannot do. §3's audit changes this section's shape from "build new Rust" to "re-enable, re-wire, and selectively build new" — most of this capability already exists in `apps/rust-audio`, already live-reachable, already tested, and switched off by one conservative preset.

- **Breaths before long phrases.** Already implemented: `post_tts_processor.rs`'s `BreathGenerator` does formant-synthesized breath injection at phrase boundaries today, gated off in production (§3.2). Two real decisions for P3, not "build it": (a) keep procedural synthesis or move to real recorded samples — the owner's brief says "real samples," current code is synthesis; procedural is cheaper to vary (no repeating-sample problem) but synthesis quality needs its own listening check against real recordings before deciding either way is good enough; (b) re-wire the trigger from the existing standalone `breathProbability` heuristic to the Director's `breath` `RustEvent` (§4.3), so breath placement follows the Director's phrase-boundary decisions (§4.1) instead of an independent probability roll.
- **Sighs.** The one genuinely net-new piece in Stage 2 (§3.3) — no live-or-dead Rust implementation to extend (the only existing sigh logic is in the dead `rust-perf/paralinguistic.rs`). Cartesia has no sigh tag and no realistic text substitute (the current `sigh` behavior tool's `<emotion value="gentle"/>Ahh.` workaround, §1.1, is a word, not a sigh) — the Director marks intent, Cartesia never sees any sigh-shaped text at all (not even a word substitute), and Rust renders it, following `BreathGenerator`'s formant-synthesis pattern as the nearest precedent in the same crate. This is a strict reading of the owner's principle: today's workaround violates it by asking Cartesia to *speak* a sigh; the fix is to stop sending Cartesia anything for a sigh and render it entirely in Stage 2.
- **Seamless chunk joins + loudness consistency.** Partially already implemented: `enableSoftEdges`/`softEdgeMs` (10ms crossfade) is one of the three features already ON in the live `betterThanHuman` preset (§3.2) — the crackle the owner's brief attributes to "a frame crossfade bug" may already be addressed by this, or may be a different seam than the one soft-edges covers; P1/P3 should confirm which with a listening check before assuming either outcome. Now that replies are one continuous Cartesia context (§1.2) rather than N independent requests, there are fewer seams per reply than when this was likely first measured — but any seam that remains (barge-in recovery, cache-hit splicing, provider fallback) still needs the same consistent loudness and click-free crossfade.
- **Micro-variation (jitter/shimmer/HNR) and room tone.** Jitter/shimmer/HNR already implemented and config-flagged (`enableJitter`/`enableShimmer`/`enableHnrModulation`, §3.2), off since a documented-but-undetailed production audio-quality incident. Re-enabling is explicitly gated behind the "measure before tuning" rule (§4.4): no flag flips without a before/after on the three objective metrics, run per-flag, not all at once (so a regression is attributable). Room tone has no corresponding flag found anywhere in `apps/rust-audio` (§3.3) — treat as net-new, UNCONFIRMED until a dedicated search.
- **SOLA time-stretch pacing fallback.** Already implemented and already the internal mechanism `post_tts_processor.rs` uses for its own (currently OFF) pitch/tempo features (§3.2) — no new Rust code needed, only a new call path: if a voice/text combination ignores the Director's requested `<speed>` (per §2.6's PVC-vs-stock-voice research), route to SOLA via the existing `useSolaPitch`/tempo-variation flags instead of leaving speed unapplied.

### 4.3 Interface: `SpeechPlan`

The Director's only output. One per LLM reply.

```ts
interface SpeechPlan {
  segments: SpeechSegment[];
}

interface SpeechSegment {
  /** Exactly what gets pushed to Cartesia for this segment — already
   *  normalized, already a complete prosodic phrase, already tag-safe. */
  cartesiaText: string;

  /** Rendered via the existing prosodyTags()-shaped config (cartesia.ts:51-73).
   *  Only ever non-empty on the FIRST segment of a reply, per §4.1/§1.2 —
   *  the type allows it per-segment so the constraint is enforced by the
   *  Director's logic, not hard-coded into the shape, in case Cartesia's
   *  per-phrase stability improves (§5). */
  cartesiaControls?: SSMLProsodyConfig; // reuse the existing type, don't fork it

  /** Stage 2 events anchored to this segment's audio, applied after Cartesia
   *  returns PCM for it. */
  rustEvents: RustEvent[];
}

interface RustEvent {
  type: 'breath' | 'sigh' | 'pause' | 'laughSample';
  /** Word-index anchor if Cartesia returns word timestamps for the segment
   *  (§2.5 — UNCONFIRMED at the implementation level whether the transport Ferni uses supports
   *  this); otherwise an anchor relative to the segment boundary
   *  ('segment-start' | 'segment-end'). Rust must handle both — don't
   *  assume timestamps are available. */
  anchor: { atWordIndex: number } | { edge: 'segment-start' | 'segment-end' };
  params: Record<string, number | string>; // e.g. { durationMs, intensity }
}
```

Design notes:
- `cartesiaControls` reuses `SSMLProsodyConfig` (`tts-gateway/types.ts`) rather than introducing a parallel shape — `prosodyTags()` already knows how to serialize it; the Director should not duplicate that serialization logic.
- `rustEvents` carries pause events too, not just breath/sigh/laughter — if the P1 spike (§6) finds native `<break>` is still unsafe on the live reply-stream path, pauses fall back to being a Stage 2 `RustEvent` (silence insertion in PCM) rather than a Cartesia tag or the current punctuation workaround. This is an explicit fallback path the Director should support from day one, not a later patch.
- Word-index anchoring depends on Cartesia actually returning timestamps on the WebSocket reply-stream transport Ferni uses — §2.5 confirms the API supports this; §5.9 tracks the remaining implementation-level question before Rust can rely on it; the alternative anchor shape (`edge`) is the degraded-but-functional fallback and should be implemented first regardless of what §2 finds, since it works unconditionally.

### 4.4 Delivery: gating and promotion

Every new behavior ships behind a three-state gate, consistent with the rest of the TTS gateway's existing pattern (`TTS_REPLY_CONTINUATIONS`, `TTS_PROVIDER` env flags):

| State | Meaning |
|---|---|
| OFF | Director computes a `SpeechPlan` (so metrics/logging exist) but today's `sanitizeChunkForTTS()` + `prosodyTags()` path is what actually reaches Cartesia/Rust. |
| SHADOW | Director's plan is executed in parallel on a sampled fraction of calls (or recorded and replayed offline against captured LLM text), scored against objective metrics below, never heard by a real caller. |
| LIVE | Director's plan is what ships. |

Promotion from SHADOW → LIVE requires both:
1. **Blind listening A/B** (human-likeness) — pairs of (old path, Director path) clips rated blind, same methodology as the existing `blind-ab-pipeline` skill/harness used elsewhere in this codebase for humanness measurement.
2. **Objective metrics**, computed without a human rater:
   - Inter-chunk discontinuity (loudness/pitch jump at each Cartesia-push boundary and at each Stage 2 splice point).
   - Pause-duration distribution vs. a human speech corpus (KL-divergence or similar, bucketed by clause/thought/pre-reveal — the same three buckets from §4.1).
   - Emotion-tag/word consistency (did the Director ever tag a reply with an emotion inconsistent with its own sentiment — a direct, cheap, pre-Cartesia check since the Director has the text and the tag together before anything is sent).

Each Stage 1 lever (phrasing, emotion, pacing, pauses, fillers, normalization) and each Stage 2 event type (breath, sigh, joins, micro-variation, SOLA fallback) gets its own gate — per the "one job each" operating principle, a single global on/off would hide which specific lever caused a regression.

---

## 5. Risks and open questions

1. **Per-phrase emotion arc is probably not achievable inside one reply-stream context, on two independent lines of evidence.** Ferni's own measured instability (§1.1: pitch range widened 8.7→10.9 semitones, swung between turns) and Cartesia's own documentation independently recommending separate contexts per emotion rather than mid-context switching (§2.3) now both point the same direction. This spec's design (§4.1) ships only the single-opening-tag-per-reply version. The remaining open question for P2 is narrower than "is an arc possible" — it's "is there any value in computing the full arc and only ever emitting its dominant/first point," or should the Director simplify to a single per-reply emotion decision outright and drop the arc computation.
2. **Breath: procedural synthesis vs. real recordings** (§4.2, §3.2). The existing `BreathGenerator` is formant-synthesized, not sampled, and is already tested — the owner's brief assumed real samples. This needs a direct listening comparison (synthesis vs. a recorded reference) before P3 decides whether to keep, replace, or offer both per-persona.
3. **Sigh sample/synthesis sourcing.** Unlike breath, there's no existing implementation to extend (§3.3) — source, number of variants (to avoid an audibly repeating sound), voice-matching across personas' distinct voices, and (if sample-based rather than synthesized) licensing terms are all unresolved. Blocking for P3.
4. **What caused the production audio-quality incident that turned off jitter/shimmer/breath/SOLA/etc. in `betterThanHuman`** (§3.2)? The preset comment doesn't link a postmortem or date. Re-enabling any of these flags without knowing what broke last time risks repeating it blind — P3 should look for the incident (deploy history, old PRs reverting these flags) before re-enabling, not just re-run the current objective metrics and assume they'd have caught it.
5. **Latency budget.** The Director adds a processing step before any Cartesia call. Owner's ceiling: <~20ms added per reply. Given the Director needs more than one streaming token to find a good phrase boundary (unlike today's reactive `findChunkEnd()`), there's real tension between phrase-boundary quality and time-to-first-audio — P1 needs to measure this directly against the existing TTFB instrumentation (`markCallStage`/`recordCallEvent` already in `gateway-tts-node.ts`) rather than assume the budget is met.
6. **Rust per-chunk processing budget.** Breath/sigh mixing and crossfade work happens after Cartesia returns PCM, inside the same streaming path that currently paces frames "slightly faster than realtime" (`splitIntoFrames`, `frameDurationMs * 0.8` — `gateway-tts-node.ts`). Stage 2's added CPU work per chunk must stay inside that same margin or it becomes the new bottleneck; the existing Rust test suite (§3.2) is a starting point for benchmarks but none were confirmed to measure wall-clock cost specifically in this research pass.
7. **Does the "Cartesia streaming can't handle breaks reliably" constraint (§1.1) still hold?** It predates the one-context-per-reply work, and Cartesia's public docs don't themselves warn against native `<break>` (§2.2) — the caution may be fully resolved already. P1 should test it directly rather than inherit the old workaround on faith.
8. **PVC vs. stock voice for Ferni's main voice** — needed to know whether `<speed>`/`<volume>`/`<emotion>` are honored at all for Ferni's specific voice ID (§2.6). UNCONFIRMED without a live, read-only `GET /voices/{id}` call — not made in this spec (no API use beyond public-docs research per the task's constraints). P1 should make this one call before building pacing/emotion logic that assumes Cartesia will honor the requests.
9. **Word-timestamp availability confirmed at the API level (§2.5) but not yet at the implementation level** — Ferni's WebSocket client (`cartesia-socket.ts`) doesn't currently request or parse timestamp events; unknown whether its response-handling loop would need new code to not choke on an event type it doesn't expect today, or would simply ignore it. The degraded `edge`-based anchor fallback (§4.3) should be built regardless, so this isn't a hard blocker, just a quality ceiling until P1 confirms.

---

## 6. Phased plan (milestone level)

**P0 — Correctness (in flight).** `fix/tts-expression-1003` and whatever remains of the audit's still-valid findings (abbreviation gap, native-break re-evaluation spike). Not this spec's deliverable; this spec assumes P0 lands first or in parallel.

**P1 — Director core.** Phrasing (prosodic phrase boundaries, abbreviation-aware), pauses (resolve the native-`<break>`-on-reply-stream question; ship whichever of native-tag or `RustEvent`-pause wins), text normalization (numbers/dates/currency). Ships OFF/SHADOW only — no listening A/B yet, objective metrics only (discontinuity, pause distribution).

**P2 — Emotion + pacing.** Resolve the per-phrase-emotion-arc open question (§5.1) first; ship the single-per-reply-decision version (now the likely answer on two lines of evidence, §2.3/§5.1) plus the fillers/`[laughter]` reuse of existing decision logic (`contextual-laughter.ts`, persona voice data). SHADOW → LIVE gate per-lever.

**P3 — Rust events.** Mostly re-enablement, not greenfield (§3.3, §4.2): find what caused the production incident behind `betterThanHuman`'s current all-off posture (§5.4) before touching any flag; resolve breath synthesis-vs-sample (§5.2) and wire the Director's `breath` `RustEvent` to the existing `BreathGenerator`; build sigh from scratch (§5.3, the one genuinely new Rust feature here); re-enable jitter/shimmer/HNR per-flag with a measured before/after each (§4.4's three objective metrics, run per-flag so a regression is attributable); wire the Director's pacing decisions to the existing SOLA-backed flags instead of leaving `<speed>` unapplied when Cartesia won't honor it.

**P4 — Listening-test promotion.** Full blind A/B human-likeness measurement across the complete pipeline (Stage 1 + Stage 2 together, not lever-by-lever), using the existing blind-A/B harness methodology. This is the gate for calling the Director "live" in the product sense, as opposed to individual levers being LIVE in the gating sense (§4.4) along the way.

---

*This is a design spec; no code in this repo was changed to produce it. All file:line citations above were read directly from `origin/main` at commit `e563a6fea` during this research pass — re-verify before implementing if time has passed, since several of the audit's own claims from the same day were already stale by the time this spec was written.*
