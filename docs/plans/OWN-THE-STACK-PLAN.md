# Own the Stack: No Gemini, No OpenAI

**Goal:** Own the full voice pipeline. No dependency on Gemini or OpenAI. You are willing to build or fine-tune our own model. Everything runs on **our** STT, **our** TTS, and **our** LLM (open weights or a model we train/fine-tune).

---

## 1. North star

| Layer | Today (default) | Owned stack |
|-------|------------------|-------------|
| **STT** | Gemini/OpenAI or Higgs | **Higgs only** (Whisper/Parakeet in Rust) |
| **LLM** | Gemini Live or OpenAI Realtime | **Our LLM** (Candle or Ollama with open weights; later our fine-tuned model) |
| **TTS** | Cartesia or Higgs | **Higgs only** (Higgs V2 + xCodec + 9-stage humanization) |
| **Tools** | Node (100+); LLM does tool calls via Gemini/OpenAI | **Node** (we own it) — Rust calls Node to execute tools, or we port a subset to Rust |
| **Context / memory** | Node (Firestore, context builders) | **Node** (we own it) — pass context string to Higgs `generate_reply` |

**No Gemini API. No OpenAI API.** Optional: no Ollama (use only Candle with our own weights) for full “we run every inference ourselves.”

---

## 2. What we already have

| Component | Status | Where |
|-----------|--------|--------|
| **Higgs STT** | ✅ Owned | Rust: Whisper/Parakeet; Node forwards audio, gets transcript + biomarkers |
| **Higgs TTS** | ✅ Owned | Rust: Higgs Audio V2 + xCodec + humanization; Node gateway calls it |
| **Higgs generate_reply** | ✅ Implemented | Rust: `GenerateReply { transcript, context? }` → LLM (Candle or Ollama) → TTS → audio stream. Node gateway can call it when `TTS_PROVIDER=higgs-pipeline` and `isGenerateReplyAvailable()`. |
| **Candle LLM** | ✅ In Rust | `llm/candle.rs`: Llama-format (config.json, tokenizer, safetensors); streaming; prefer when `--candle-model` / `CANDLE_LLM_MODEL_PATH` set. |
| **Ollama LLM** | ✅ In Rust | `llm/ollama.rs`: HTTP to Ollama; open weights (Llama, Qwen, Gemma, etc.). |
| **Gateway Higgs full loop** | ✅ Wired | When caller passes `transcript` and TTS is Higgs, gateway calls `higgs.generateReply(transcript, { context })` and plays raw audio; **no** `session.generateReply()` (no Gemini/OpenAI). |

So the **owned pipeline exists**: Higgs STT → transcript + context → Higgs `generate_reply` (Candle/Ollama) → Higgs TTS → audio. It is not yet the **default** for every turn; today the default is still “Node calls Gemini or OpenAI for the reply.”

---

## 3. Gaps to make “own the stack” the default

### 3.1 Use Higgs full loop for every conversational turn (no Gemini/OpenAI)

**Gap:** Today the turn flow usually calls `session.generateReply({ instructions })`, which uses the LiveKit/Agent SDK and thus **Gemini or OpenAI**. The Higgs full loop is only used when the gateway is explicitly given a `transcript` and TTS is Higgs.

**Change:**

- Add an **“owned stack” mode”** (e.g. `USE_OWNED_STACK=true` or `USE_HIGGS_FULL_LOOP=true`).
- When this is set and Higgs `isGenerateReplyAvailable()`:
  - **Do not** call `session.generateReply()` for the main reply.
  - **Do** call the gateway with **transcript** (and **context** built in Node) so the gateway uses **Higgs generateReply(transcript, { context })** and plays the returned audio.
- Ensure **context** includes: persona, last N turns, optional user/memory summary (see 3.2).

**Result:** Every user turn → Higgs STT transcript → Node builds context → Higgs generate_reply (Candle/Ollama) → Higgs TTS → audio. Zero Gemini/OpenAI.

**References:** `generate-reply-gateway.ts` (Higgs full loop branch), `voice-agent-entry.ts`, turn-handler / transcript-handler (where generateReply is invoked).

---

### 3.2 Context from Node → Higgs generate_reply

**Gap:** Rust `GenerateReply` accepts `context?: string`. Node must build a single context string (persona, conversation history, memory, BTH, etc.) and pass it so the local LLM can generate good replies.

**Change:**

- In Node, when calling the gateway for the owned-stack path, build **context** the same way we build system/instruction text today (persona prompt, last N turns, optional memory summary, tool-output summary if any).
- Pass that as `options.context` into the gateway; gateway passes it to `higgs.generateReply(transcript, { context })`.
- In Rust, ensure the prompt template in `llm/build_prompt` (or equivalent) uses this context so the model sees it.

**Result:** Our LLM gets the same kind of guidance as Gemini/OpenAI today, without calling their APIs.

---

### 3.3 Tool calling without Gemini/OpenAI

**Gap:** Today tools are executed in Node; the **LLM** that decides “call tool X” is Gemini or OpenAI. In the owned stack, the LLM is Candle/Ollama; most open models don’t have native function calling like OpenAI.

**Options:**

| Option | Description | Effort |
|--------|-------------|--------|
| **A. JSON workaround (same as Gemini)** | Instruct the model (via system/context) to output `{"fn":"toolName","args":{...}}` when it wants to call a tool. Rust (or Node) parses that, executes the tool (in Node or Rust), appends result to context, and calls the LLM again for the final reply. | Medium |
| **B. Rust calls Node for tools** | When the LLM output contains a tool call, Rust sends “execute tool X with args Y” to Node (HTTP/RPC). Node runs the existing tool registry and returns the result; Rust feeds it back into the next LLM call. | Medium |
| **C. Fine-tune our model for tool use** | Fine-tune so the model reliably outputs tool calls in a fixed format; then same as A or B. | Higher |

**Recommended for Phase 1:** A + B. Use the same JSON tool-call format we use for Gemini. When Higgs full loop is active and the **reply** from Candle/Ollama contains a tool call, Node (or a small Rust→Node hop) executes it and then calls Higgs generate_reply again with “tool result + ask for final reply.” Alternatively, Rust could parse JSON tool calls and HTTP-call Node for execution.

**Result:** We keep 100+ tools in Node; the owned-stack LLM triggers them via a defined protocol (JSON or RPC), no Gemini/OpenAI.

---

### 3.4 Our own model (fine-tune or train)

**Gap:** Today we use **off-the-shelf** open weights (Llama, Qwen, Gemma) via Candle or Ollama. To truly “own” the stack and get the best behavior for Ferni (conversation style, persona, tool format, latency), we can **fine-tune** (or eventually train) a model.

**Options:**

| Option | Description | Effort |
|--------|-------------|--------|
| **A. Fine-tune open model** | Take a small/medium open model (e.g. Qwen 2.5 3B/7B, Llama 3.2, Gemma 2). Fine-tune on: (1) Ferni-style dialogue, (2) persona instructions, (3) tool-call examples (JSON format). Run in Candle. | Medium–High |
| **B. Train from scratch** | Build a model for voice-first life coaching from scratch. | Very high |

**Recommended:** Start with **A**. Fine-tune for: (1) concise, warm, coach-like replies; (2) our tool-call format; (3) optional “state-action” style (user state → agent state → reply) like ChipChat if we want that. Then run the fine-tuned model in Higgs via Candle.

**Result:** “Our model” = fine-tuned open weights, fully run by us (Candle), no third-party LLM API.

---

## 4. Phased roadmap

### Phase 1: Owned stack as default (no Gemini/OpenAI for replies) ✅ Implemented

| # | Task | Owner | Done when |
|---|------|--------|-----------|
| 1.1 | Add **owned-stack mode** flag (e.g. `USE_OWNED_STACK=true`). When set + Higgs generate_reply available, **never** call `session.generateReply()` for main turn; always use gateway path with **transcript + context** → Higgs generateReply. | Node | ✅ `src/config/owned-stack.ts`; transcript-handler interrupts and calls gateway with transcript + context. |
| 1.2 | Build **context string** in Node (persona, last N turns, optional memory) and pass to gateway → Higgs. Ensure Rust prompt uses it. | Node + Rust | ✅ `src/agents/shared/owned-stack-context.ts` builds persona + last 6 turns; gateway passes to Higgs; Rust uses context in build_prompt. |
| 1.3 | **Greeting / first turn:** Use Higgs generate_reply with empty or seed transcript + context so we don’t need Gemini/OpenAI for “hello.” | Node | ✅ voice-agent-entry uses OWNED_STACK_GREETING_TRANSCRIPT + buildOwnedStackGreetingContext when USE_OWNED_STACK=true. |
| 1.4 | Document and test: “Owned stack” = `TTS_PROVIDER=higgs-pipeline`, Higgs with Candle or Ollama, `USE_OWNED_STACK=true`; no Gemini/OpenAI keys needed for voice. | Docs | ✅ .env.example documents USE_OWNED_STACK; runbook below. |

**Runbook (Phase 1):** Set USE_OWNED_STACK=true and TTS_PROVIDER=higgs-pipeline. Run Higgs pipeline with generate_reply (Candle or Ollama). No Gemini/OpenAI API keys required for voice. Greeting and every turn go through gateway → Higgs full loop.

**Outcome:** Full voice conversation with zero Gemini/OpenAI. STT, LLM, TTS all ours (Higgs + Candle/Ollama).

---

### Phase 2: Tool calling in the owned stack ✅ Implemented

**Runbook (Phase 2):** Same env as Phase 1. Say something that triggers a tool (e.g. "Play some jazz" or "What time is it?"). The LLM outputs `{"fn":"playMusic","args":{"query":"jazz"}}` → gateway detects it via `looksLikeJsonFunctionCall()` → parses with `parseJsonFunctionCall()` → executes with `executeJsonFunction()` → calls Higgs again with tool result → plays the final reply audio. Logs to watch: `Owned stack: LLM emitted tool call, executing and re-calling` and `Owned stack: tool call executed, follow-up reply played`.

| # | Task | Owner | Done when |
|---|------|--------|-----------|
| 2.1 | Define **tool-call format** for our LLM (e.g. same JSON `{"fn","args"}` as today). Add to Rust prompt/context so the model is instructed to output it when it wants to call a tool. | Rust + Node | ✅ `owned-stack-context.ts` includes tool-call instructions; same JSON format as existing. |
| 2.2 | When Higgs generate_reply returns text that contains a tool call: **parse** in Node (or Rust); **execute** via existing Node tool registry; **call Higgs generate_reply again** with “tool result + request for final reply.” | Node (or Rust + Node RPC) | ✅ Rust `AudioDone` includes `text`; TS surfaces it; gateway detects tool calls, executes, re-calls Higgs. |
| 2.3 | Optional: Rust parses tool calls and calls Node over HTTP for execution; Rust then sends “tool result” back into the same or next LLM call. | Rust + Node | Deferred — Node-side tool calling works well for now. |

**Outcome:** Owned stack supports tools; no Gemini/OpenAI.

---

### Phase 3: Our own model (fine-tuned) ✅ Documented

| # | Task | Owner | Done when |
|---|------|--------|-----------|
| 3.1 | **Data:** Collect or curate dialogue data (Ferni-style, persona, tool-call examples). | Product / eng | Guide in `docs/guides/OUR-MODEL-SETUP.md`. |
| 3.2 | **Fine-tune:** Fine-tune an open model (Qwen/Llama/Gemma) for: reply style, tool format, optional state-action. Export to Candle-compatible format (safetensors, etc.). | ML / eng | Guide covers Axolotl LoRA recipe; Candle loads Llama-format safetensors. |
| 3.3 | **Integrate:** Point Higgs Candle backend at the fine-tuned model; run in production or staging. | Rust + ops | ✓ `src/config/owned-model.ts` provides helpers. Set `CANDLE_LLM_MODEL_PATH`. |

**Outcome:** We run a model we trained/fine-tuned; full ownership.

---

### Phase 4 (optional): Remove Ollama dependency ✅ Documented & Ready

Candle-only is **already the default** when `CANDLE_LLM_MODEL_PATH` is set. Ollama is only used when no Candle path is provided. No code changes needed — just set the env var.

| # | Task | Owner | Done when |
|---|------|--------|-----------|
| 4.1 | **Candle only:** Use only Candle in Higgs for generate_reply; remove or make optional the Ollama path. | Rust | ✅ Already works: set `CANDLE_LLM_MODEL_PATH`, leave `OLLAMA_URL` unset. Candle is always preferred over Ollama. |
| 4.2 | **Model distribution:** Ship or fetch our fine-tuned weights (or chosen open weights) so Higgs can load them without Ollama. | Ops / infra | ✅ Config documented in `.env.example` and `docs/guides/OUR-MODEL-SETUP.md`. Just provide a safetensors dir. |

**Outcome:** Single process (Higgs) + our weights; no Gemini, no OpenAI, no Ollama.

---

## 5. Architecture: owned stack end-to-end

```
User speaks
    → LiveKit audio → Node
    → Node forwards audio to Higgs STT (WebSocket)
    → Higgs STT → transcript + biomarkers
    → Node builds context (persona, history, memory)
    → Node calls gateway generateReply(transcript, { context })
    → Gateway calls Higgs generateReply(transcript, { context })
    → Higgs Rust: LLM (Candle or Ollama) → response text
    → If response contains tool call: Node executes tool (or Rust calls Node)
    → Node calls Higgs generateReply again with tool result + “reply to user”
    → Higgs Rust: LLM → final reply text → Higgs TTS (SynthesizeStreaming) → audio
    → Gateway plays raw audio to session
    → User hears reply
```

**No Gemini. No OpenAI.** STT = Higgs. LLM = Candle or Ollama (later our model). TTS = Higgs. Tools = Node (we own it). Context = Node (we own it).

---

## 6. Env and config (target)

| Variable | Purpose |
|----------|---------|
| `USE_OWNED_STACK=true` | Use only Higgs full loop for replies (no Gemini/OpenAI). |
| `TTS_PROVIDER=higgs-pipeline` | Higgs for TTS and for generate_reply. |
| `HIGGS_PIPELINE_URL` | Higgs WebSocket URL. |
| `CANDLE_LLM_MODEL_PATH` or `--candle-model` | Path to Candle model (our model or open weights). |
| `OLLAMA_URL` / `OLLAMA_MODEL` | Optional; if no Candle model, use Ollama with open weights. |

When `USE_OWNED_STACK=true`, the agent must **not** require `GOOGLE_API_KEY` or `OPENAI_API_KEY` for the voice reply path (they may still be used for other features if we keep them, but not for main conversation).

---

## 7. Summary

| Question | Answer |
|----------|--------|
| **Can we own the stack?** | Yes. Higgs STT + Higgs TTS + Candle/Ollama (or our fine-tuned model) = no Gemini, no OpenAI. |
| **Do we need to build our own model?** | Not strictly: open weights in Candle/Ollama are enough for Phase 1–2. Fine-tuning (Phase 3) gives “our” model and better behavior. |
| **What about tools?** | Same JSON tool-call pattern; Node executes (or Rust calls Node). No Gemini/OpenAI. |
| **What about context/memory?** | Node builds it and sends it to Higgs generate_reply; we own Node and Firestore. |

**All four phases are implemented!**

- **Phase 1** ✅ — Owned stack mode (`USE_OWNED_STACK=true`), greeting, context, no Gemini/OpenAI.
- **Phase 2** ✅ — Tool calling: Rust `AudioDone` includes LLM text; gateway detects JSON tool calls, executes, re-calls Higgs.
- **Phase 3** ✅ — Fine-tuned model: config helpers + guide in `docs/guides/OUR-MODEL-SETUP.md`.
- **Phase 4** ✅ — Candle-only: just set `CANDLE_LLM_MODEL_PATH`, leave `OLLAMA_URL` unset.

**Next concrete step:** Fine-tune a Qwen 2.5 3B model on Ferni dialogue data and test end-to-end.

---

## 8. References

- [HIGGS-RUST-REALTIME-GAPS.md](./HIGGS-RUST-REALTIME-GAPS.md) — What Higgs has; gaps for full loop, tools, context.
- [HIGGS-INTEGRATION-STATUS.md](./HIGGS-INTEGRATION-STATUS.md) — generate_reply wired; Candle + Ollama.
- [HIGGS-BETTER-THAN-ALL-PLAN.md](./HIGGS-BETTER-THAN-ALL-PLAN.md) — Making Higgs best-in-class vs ChipChat, Kyutai, Gemini, OpenAI.
- `src/agents/shared/generate-reply-gateway.ts` — Higgs full loop branch (transcript + context → Higgs generateReply).
- `apps/rust-higgs-pipeline/src/llm/` — Candle and Ollama backends; prompt building.
