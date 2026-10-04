# LLM request cost on the cascade's critical path

What one Gemini request costs before it leaves the voice agent, for the
production Cartesia cascade (Ink-2 STT → Gemini 3.5 Flash on Vertex → Cartesia
TTS). Measured offline by `scripts/perf/llm-request-cost.ts`.

## How it is measured

The harness builds the request through production code and stubs only the
network:

| Part          | Built by                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| System prompt | `loadModelBaseInstructions` + `loadSystemPrompt('ferni')` + `timeContext`, joined by `composeAgentInstructions` with the cascade's prompt modules (what `agent-setup.ts` gives the agent)               |
| Tools         | `buildHandoffTools` + `loadEssentialDomains`, `filterInitialSpawnTools` (essential-only policy), capped by `capToolsToLimit(resolveInitialToolLimit(getMaxTools()))`, i.e. the initial agent's tool set |
| History       | the agent instructions + 8 short voice exchanges + the new user turn                                                                                                                                    |
| LLM           | `CartesiaCascadeProvider.createLLMModel()`: a `HedgedLLM` over two `@livekit/agents-plugin-google` LLMs                                                                                                 |
| Network       | the plugin's own `@google/genai` `Models.generateContentStreamInternal`, stubbed to record the request and answer with one text chunk                                                                   |

Tokens are estimated as chars / 4, the estimator `prompt-loader.ts` uses; the
repo has no Gemini tokenizer. Tool schemas are counted as the JSON of the
function declarations actually sent. CPU numbers are medians of 50 runs with
`performance.now()` on a laptop under load (load average 19 to 36 from other
work), so treat them as ranges.

The harness passes no user profile, so the handoff tools are the build-time
set (no unlock filtering). Production env overrides (`PROMPT_MODE`,
`TOOL_LIMIT`, `ESSENTIAL_TOOL_DOMAINS`) live in LiveKit Cloud secrets and were
not read; numbers are for the code defaults, plus `PROMPT_MODE=character`.

## Baseline (origin/main fe1bb07c5, 2026-10-04)

|                         | `PROMPT_MODE` full (default) | `PROMPT_MODE=character` |
| ----------------------- | ---------------------------- | ----------------------- |
| System prompt           | 14,443 tokens                | 3,127 tokens            |
| Tool schemas (64 tools) | 7,773 tokens                 | 7,773 tokens            |
| History (8 exchanges)   | 361 tokens                   | 361 tokens              |
| Total per request       | 22,576 tokens                | 11,261 tokens           |

- **Tools per request: 64.** The initial set is 124 tools (handoff +
  essential domains); `DEFAULT_INITIAL_TOOL_LIMIT` caps it at 64. All 124 would
  be 14,031 tokens of schemas. Largest declarations: foodDelivery 307,
  manageContact 296, setReminder 234, addTask 226, restaurant 219 tokens. No
  enum has more than 10 values.
- **Schemas converted per request: 64 of 64.** The plugin converts every tool
  (Zod → JSON Schema → JSON copy → OpenAPI schema) inside `LLMStream.run()`, so
  on every request, every SDK retry, and again for the hedge backup.
- **Conversion CPU: 0.65 to 1.37 ms median per request** for the 64 sent tools
  (1.2 to 2.5 ms for all 124), across three runs. `chat()` to request handed to
  the SDK: 2.7 to 3.6 ms median.
- **Hedging is already conditional.** `HedgedLLM` starts only the primary and
  starts the backup (gemini-3.5-flash-lite) when the primary has produced no
  text or tool call after `CASCADE_LLM_HEDGE_MS` (default 1300 ms), or ends or
  fails with nothing. With a fast primary the harness saw 1 request; with a
  slow one, 2. Both send the full system prompt and all 64 tools, and the
  backup converted all 64 schemas again.

## Fix 1: convert each tool set once

`src/agents/model-provider/gemini-declarations.ts` keeps the plugin's own
conversion per tool set (key: each tool's name, description and schema object)
in an LRU of 32 sets shared by the process, and `CachedDeclarationsLLM` sends
the cached declarations. The cascade's primary and hedge backup share it.

|                                                                                      | Before          | After                            |
| ------------------------------------------------------------------------------------ | --------------- | -------------------------------- |
| Declarations converted per request (harness, median of 50)                           | 64              | 0                                |
| Declarations converted by a hedge backup                                             | 64              | 0                                |
| CPU for the declarations, 64 tools (same process, interleaved, median of 50, 3 runs) | 0.51 to 0.72 ms | 0.038 to 0.058 ms (cache lookup) |
| `chat()` to request handed to the SDK (harness, 3 runs)                              | 2.7 to 3.6 ms   | 1.8 to 2.0 ms                    |

The request body is unchanged: tests compare it with the plugin's own
conversion.

## What this means

Schema conversion is real but small: about 1 ms of a ~1 s first-token time.
Nearly all of the cost is the prompt itself: the system prompt dominates in
full mode, and the tool schemas are about a third of the request in full mode
and two thirds in character mode. The 2026-09-28 and 09-30 measurements
(`src/tools/dynamic-loader/essential-domains.ts`, `scripts/tool-retrieval/`)
found gemini-3.5-flash's first-token time flat between ~30 and ~130 tools and
no gain from cutting the prompt from 12.9k to 8.0k tokens, so fewer tokens are
not expected to make replies faster at today's size.

Re-run: `npx tsx scripts/perf/llm-request-cost.ts [--prompt-mode character] [--json]`.
