# Model provider

Builds the voice pipeline the agent runs: which models hear the caller, write
the reply and decide when a turn ends. `index.ts` is the public barrel; other
agent code also imports individual files from this folder directly.

## The default pipeline: the Cartesia cascade

`CartesiaCascadeProvider` (`cartesia-cascade.ts`) runs on dev and prod:

- **STT**: Cartesia `ink-2` (`CASCADE_STT_MODEL`). ink-2 also decides when the
  caller has finished (`getSessionTurnDetection()` returns `'stt'`;
  `CASCADE_TURN_DETECTION=vad` restores a silence timer). Its thresholds come
  from `INK_TURN_PROFILES`: `responsive` by default, or `balanced` / `patient`
  through `CASCADE_TURN_PROFILE`, with `CASCADE_TURN_EAGER` and
  `CASCADE_TURN_END` as checked overrides.
- **LLM**: `gemini-3.5-flash` on Vertex (`CASCADE_LLM_MODEL`) at MINIMAL
  thinking, with native function calling. It is wrapped in `HedgedLLM`: if it
  has produced nothing after 1300 ms (`CASCADE_LLM_HEDGE_MS`, `off` disables),
  `gemini-3.5-flash-lite` (`CASCADE_LLM_BACKUP_MODEL`) starts too and the first
  to commit wins. `CASCADE_FAST_LANE=on` (off by default) sends turns that
  need no tool to a faster model (`fast-lane.ts`).
- **TTS**: the persona's Cartesia Sonic voice, not built here. It is created in
  `src/speech/tts/persona-aware.ts`; sessions call `createPersonaAwareTTS`
  through `src/speech/voice-manager/`.

## How a provider is selected

`getModelProvider()` in `factory.ts` returns one cached provider for
`VOICE_PIPELINE`, read only in `src/config/model-provider-config.ts`:

| `VOICE_PIPELINE`       | Provider                    | Status                                                                        |
| ---------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| unset or anything else | `CartesiaCascadeProvider`   | default, runs on dev and prod                                                 |
| `gemini-native-audio`  | `GeminiNativeAudioProvider` | opt-in: Gemini Live hears and speaks; Cartesia only renders the voice samples |
| `openai-realtime`      | `OpenAIRealtimeProvider`    | opt-in                                                                        |
| `gemini-live`          | `GeminiLiveProvider`        | legacy opt-in; its text-output model is retired                               |

Tests inject a provider with `setModelProvider()` and reset with
`clearModelProvider()`.

## Files

| File                       | Purpose                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `index.ts`                 | Public exports                                                                                                                 |
| `types.ts`                 | The `ModelProvider` interface and provider ids                                                                                 |
| `factory.ts`               | `getModelProvider()`, the cached provider for `VOICE_PIPELINE`, and test injection                                             |
| `cartesia-cascade.ts`      | The default provider: ink-2 STT options, turn profiles, keyterms, Gemini LLM, hedge and fast-lane options                      |
| `hedged-llm.ts`            | Starts a backup model when the primary is slow to its first word; keeps whichever commits first                                |
| `fast-lane.ts`             | Sends chit-chat turns to a faster model and turns that may need a tool to the main one (`CASCADE_FAST_LANE`)                   |
| `gemini-declarations.ts`   | Converts each tool set to Gemini function declarations once and caches them                                                    |
| `cache-warm.ts`            | Warms the reply model's prompt cache while the greeting plays (`CASCADE_CACHE_WARM`, `FIRST_TURN_FAST` or `LLM_CONTEXT_CACHE`) |
| `after-greeting.ts`        | What runs once the greeting starts: arms the cache warm                                                                        |
| `handoff-cache-warm.ts`    | Warms the incoming persona's prompt cache after a handoff (`HANDOFF_CACHE_WARM`, with the cache warm on)                       |
| `after-tool-hedge.ts`      | `LOOKUP_BRIDGE`'s switch and its hedge delay for the reply after a tool result                                                 |
| `forward-prewarm.ts`       | Forwards `prewarm()` from wrapper LLMs to the models they wrap                                                                 |
| `vertex-keepalive.ts`      | Keeps Vertex AI sockets open between turns (`VERTEX_KEEPALIVE`)                                                                |
| `stt-audio-diagnostics.ts` | Logs what each STT stream was fed and what came back (`STT_AUDIO_DIAGNOSTICS`)                                                 |
| `stt-audio-levels.ts`      | Pure level sums and the "speech heard, no words" detector for those diagnostics                                                |
| `gemini-native-audio.ts`   | The `gemini-native-audio` provider                                                                                             |
| `replicated-voice.ts`      | Voice samples rendered through the Cartesia API from each persona's voice, for the native-audio pipeline                       |
| `openai-realtime.ts`       | The `openai-realtime` provider                                                                                                 |
| `gemini-live.ts`           | The legacy `gemini-live` provider                                                                                              |
| `ollama-llm-adapter.ts`    | A LiveKit LLM over a local Ollama server; exported from `index.ts`, imported by nothing else                                   |

## Tests

```bash
pnpm vitest run src/agents/model-provider
```

The tests are in `__tests__/` (`factory.test.ts`, `cartesia-cascade.test.ts`,
`hedged-llm.test.ts`, ...). `openai-realtime.ts` and `gemini-live.ts` have no
test file of their own.
