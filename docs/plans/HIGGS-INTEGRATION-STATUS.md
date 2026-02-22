# Higgs Integration Status

Audit of what’s **complete**, **wired**, **not wired**, and **gaps** for the Higgs pipeline with Ferni.

**Last updated:** Feb 2026 — Higgs STT, biomarkers, PersonaAwareTTS/createUnifiedTTS, and session lifecycle are now wired.

---

## Complete and wired

| Area | Detail |
|------|--------|
| **TTS (batch)** | Gateway → `getTTSProvider()` → Higgs when `TTS_PROVIDER=higgs-pipeline` or `higgs`. `synthesize()` is used on cache miss. |
| **TTS (streaming)** | Gateway uses `provider.synthesizeStreaming` when present; Higgs implements it. Same provider selection. |
| **Provider selection** | `src/speech/tts-gateway/providers/index.ts` `getTTSProvider()` returns `HiggsPipelineProvider` for `higgs-pipeline` / `higgs`. |
| **Agent TTS path** | When `USE_TTS_GATEWAY` is not `false`, `tts-wrapper.ts` uses `createGatewayTTSNode()` → gateway → `getTTSProvider()` → Higgs. |
| **Config** | `HIGGS_PIPELINE_URL` in `model-provider-config.ts` and `.env.example`. |
| **Unit tests** | `higgs-pipeline.test.ts`, `higgs-provider.test.ts` cover provider, selection, synthesize, streaming, STT methods, reconnect, disconnect. |

---

## Wired (Feb 2026)

| Area | Detail |
|------|--------|
| **Higgs STT** | User audio is forwarded to Higgs in `audio-processor.ts` via `sendUserAudioToHiggs()` when `TTS_PROVIDER=higgs-pipeline` and frame sample rate is 16kHz. |
| **Voice biomarkers** | On final transcript, `fetchHiggsTranscriptAndBiomarkers()` is called; biomarkers are stored on `userData.voiceBiomarkers` for downstream use. |
| **PersonaAwareTTS / createUnifiedTTS** | `getDefaultTTSProvider()` and `createUnifiedTTS()` support `higgs-pipeline`; PersonaAwareTTS uses `HiggsTTSAdapter` when provider is Higgs. |
| **Session lifecycle** | On room disconnect, Higgs provider `endSession()` is called (sends `end_session`, keeps WebSocket open); next use sends `start_session` again. |

---

## Resolved (Feb 2026)

| Area | Detail |
|------|--------|
| **createUnifiedTTS / getDefaultTTSProvider** | Now support `higgs-pipeline`; when set, they return/use `HiggsTTSAdapter`. |
| **PersonaAwareTTS** | Now supports `provider === 'higgs-pipeline'` and uses `HiggsTTSAdapter` for synthesize/stream. |

---

## Design notes (optional future improvements)

| Area | Detail |
|------|--------|
| **Singleton provider** | One WebSocket per process; multiple sessions share it. TTS is fine (request_id). STT buffers are shared — if multiple concurrent calls use Higgs STT, audio could mix; consider per-session connection or session_id on server for multi-session STT. |
| **Session ID** | Gateway `sessionId` is for logging only; provider has its own `sessionId`. Re-session on disconnect is implemented via `endSession()` + `ensureSession()`. |

---

## Generate Reply (Full Voice Loop)

| Area | Detail |
|------|--------|
| **Protocol** | Rust: `ClientMessage::GenerateReply { transcript, context?, max_tokens?, request_id? }`. Server streams reply audio via AudioStart → binary → AudioDone (same as streaming TTS). |
| **LLM backends** | Ollama (HTTP) wired; Candle (local) implemented (Llama-format: config.json, tokenizer.json, safetensors in model path). Prefer Candle when `--candle-model` / `CANDLE_LLM_MODEL_PATH` set; else Ollama when `--ollama-url` / `OLLAMA_URL`. |
| **TypeScript client** | `HiggsPipelineProvider.generateReply()`, `generateReplyStreaming()`, `isGenerateReplyAvailable()`. Sends `generate_reply`, consumes AudioStart/binary/AudioDone. |
| **Gateway wiring** | `generate-reply-gateway.ts`: optional `options.transcript`. When `TTS_PROVIDER=higgs-pipeline` and Higgs `isGenerateReplyAvailable()`, gateway calls Higgs `generateReply(transcript)` (returns `{ buffer, sampleRate }`), plays via `playRawAudioToSession(sessionId, buffer, sampleRate)`. Raw-audio handler optional; auto-registered when TTS is Higgs. If no handler, falls back to `session.generateReply()`. |
| **Health** | `/health/ready` returns `generate_reply_available: true` when an LLM backend is configured. |
| **Tests** | Protocol roundtrip (Rust + TS); Higgs provider tests for generateReply, generateReplyStreaming, isGenerateReplyAvailable. |

**Raw-audio playback:** When `TTS_PROVIDER=higgs-pipeline`, the gateway registers a raw-audio handler on session registration (`registerSessionForReconnection`). The handler uses `sampleRate` from Higgs `audio_start` (returned with the buffer), retries briefly if `output.audio` is not yet set, converts reply PCM to `AudioFrame`s via `splitCachedAudioIntoFrames`, and pushes via `session.output.audio.captureFrame()` so Higgs full-loop audio plays in the room. All audit items (sample rate, retry, unit test, Candle device, E2E tests) are done — see `HIGGS-INTEGRATION-AUDIT.md`.

---

## Summary

| Category | Status |
|----------|--------|
| **TTS with Ferni (live call)** | Complete and wired when `TTS_PROVIDER=higgs-pipeline` and gateway enabled. |
| **Higgs STT (Whisper)** | Wired: user audio forwarded in audio-processor; triggerTranscription on final transcript. |
| **Biomarkers** | Wired: stored on `userData.voiceBiomarkers` when Higgs STT is used. |
| **Generate reply** | Protocol + Ollama + Candle (Llama-format) + TypeScript client + gateway wired; raw-audio handler auto-registered when TTS is Higgs so Higgs reply audio plays in room. |
| **Other TTS callers** | Higgs available via `createUnifiedTTS` / PersonaAwareTTS (`HiggsTTSAdapter`). |
| **Session lifecycle** | `endSession()` called on room disconnect; re-session on next use. |
