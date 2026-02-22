# Our Model: Fine-Tuned LLM for Ferni

This guide covers how to fine-tune and deploy our own model in the owned stack.

---

## 1. Model requirements

The Candle backend in Higgs expects a **Llama-format** model directory:

```
my-model/
├── config.json                    # LlamaConfig (hidden_size, vocab_size, etc.)
├── tokenizer.json                 # HuggingFace tokenizer
├── model.safetensors              # Single weights file (< 10GB)
│   OR
├── model.safetensors.index.json   # Index for sharded weights
├── model-00001-of-00003.safetensors
├── model-00002-of-00003.safetensors
└── model-00003-of-00003.safetensors
```

**Supported base models** (Llama-architecture compatible):

| Model | Params | Notes |
|-------|--------|-------|
| Qwen 2.5 | 3B / 7B | Good multilingual; fast on Metal |
| Llama 3.2 | 3B / 8B | Strong English; well-supported |
| Gemma 2 | 2B / 9B | Google; efficient small sizes |

---

## 2. Fine-tuning recipe

### 2.1 Data

Collect or curate dialogue data:

- **Ferni-style conversation** — warm, concise, voice-first replies (1-3 sentences)
- **Persona examples** — each persona's distinct voice and speciality
- **Tool-call examples** — `{"fn":"toolName","args":{...}}` in the correct format
- **Negative examples** — no markdown, no bullet points, no corporate language

Format: JSONL with `{"prompt": "...", "completion": "..."}` or chat-format.

### 2.2 Fine-tune

```bash
# Example with Axolotl (recommended for Llama-format)
pip install axolotl

# Create config (see axolotl docs)
cat > ferni-finetune.yml <<'EOF'
base_model: Qwen/Qwen2.5-3B
model_type: LlamaForCausalLM
output_dir: ./ferni-model-v1
dataset:
  - path: ./data/ferni-dialogue.jsonl
    type: completion
lora_r: 16
lora_alpha: 32
epochs: 3
batch_size: 4
learning_rate: 2e-5
EOF

accelerate launch -m axolotl.cli.train ferni-finetune.yml
```

### 2.3 Merge LoRA and export

```bash
# Merge LoRA weights into base model
python -m axolotl.cli.merge ferni-finetune.yml --output ./ferni-model-v1-merged

# Verify: directory should contain config.json, tokenizer.json, model.safetensors
ls ./ferni-model-v1-merged/
```

---

## 3. Deploy with Higgs

### 3.1 Point Higgs at the model

```bash
# Via env var
export CANDLE_LLM_MODEL_PATH=/path/to/ferni-model-v1-merged

# Or via CLI arg
cargo run --release -- --candle-model /path/to/ferni-model-v1-merged
```

When `CANDLE_LLM_MODEL_PATH` is set, Candle is **automatically preferred** over Ollama (no other config needed).

### 3.2 Verify

```bash
# Start Higgs
cd apps/rust-higgs-pipeline
cargo run --release -- --candle-model /path/to/ferni-model-v1-merged

# Look for log:
# LLM: Candle backend configured for generate_reply

# Test via WebSocket (or use the Node voice agent):
# Send: {"type":"start_session","session_id":"test","persona":"ferni"}
# Send: {"type":"generate_reply","transcript":"Hey, how are you?","request_id":1}
# Expect: audio_start, binary chunks, audio_done with text field
```

### 3.3 Use with owned stack

```bash
# .env
USE_OWNED_STACK=true
TTS_PROVIDER=higgs-pipeline
CANDLE_LLM_MODEL_PATH=/path/to/ferni-model-v1-merged

# No GOOGLE_API_KEY or OPENAI_API_KEY needed!
pnpm dev
```

---

## 4. Node config helpers

```typescript
import {
  isUsingCandleModel,
  getCandleModelPath,
  getLlmBackendSummary,
} from '../config/owned-model.js';

console.log(getLlmBackendSummary());
// "Candle (/path/to/ferni-model-v1-merged)"
```

---

## 5. Iteration

| Step | What | How |
|------|------|-----|
| 1 | Start with open weights | `OLLAMA_MODEL=qwen2.5:3b` or Candle with Qwen 2.5 3B |
| 2 | Collect Ferni dialogue | Export from Firestore or generate synthetic |
| 3 | Fine-tune | LoRA on Qwen 2.5 3B (fast, 1-2 hours on A100) |
| 4 | Evaluate | Voice test: latency, coherence, persona consistency |
| 5 | Iterate | More data, adjust hyperparams, try larger base |

---

## References

- `apps/rust-higgs-pipeline/src/llm/candle.rs` — Candle backend (load, generate)
- `apps/rust-higgs-pipeline/src/llm/mod.rs` — `build_prompt`, `default_system_prompt`
- `src/config/owned-model.ts` — Node-side config helpers
- `src/config/owned-stack.ts` — Owned stack mode flag
- `docs/plans/OWN-THE-STACK-PLAN.md` — Full roadmap
