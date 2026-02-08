# Stress Testing Qwen3-Omni (Text Modality)

Load-test the **Qwen3-Omni Thinker** and platform using **text-only** modality (no STT/TTS/audio). Use this to validate throughput and latency before or without running the full voice pipeline.

---

## Qwen / Thinker only

**We use Qwen (Thinker), not Ollama.** The stress test targets an OpenAI-compatible `/v1/chat/completions` endpoint:

- **Thinker** – Your Qwen3-Omni inference server (e.g. vLLM on port 8000).
- **Env:** Set `QWEN3_OMNI_URL` (and optionally `QWEN3_OMNI_MODEL`) to match your Thinker, or pass `--url` and `--model` to the script.

**Qwen3-Omni does not run on ONNX.** The model is served via vLLM (or another OpenAI-compatible server). Our codebase uses ONNX only for the **tool router** (Qwen3-1.7B classifier), not for the Omni Thinker.

---

## Text-only modality

- **Env:** `QWEN3_OMNI_TEXT_ONLY=true`  
  When set, the integration can run in text-in/text-out mode (no audio). Used for stress tests and headless runs.
- **Thinker:** The Thinker API is OpenAI-compatible chat completions; text-in/text-out is native. For vLLM, you can restrict output to text with `--modalities text` (see [QWEN-OMNI-2026-BEST-PRACTICES.md](./QWEN-OMNI-2026-BEST-PRACTICES.md)).

---

## Running the stress test script

The script sends text chat completion requests to the **Thinker (Qwen)** and reports latency and throughput.

**Prerequisites**

- Thinker server running (e.g. vLLM serving Qwen3-Omni on port 8000, or your `QWEN3_OMNI_URL`).

**Run**

```bash
# Default: 20 requests, 1 at a time, http://localhost:8000, model Qwen3-Omni
node scripts/qwen3-omni/stress-test.mjs

# Custom URL and request count (Qwen Thinker)
node scripts/qwen3-omni/stress-test.mjs --url http://localhost:8000 --requests 100

# Use env for URL/model (e.g. in CI or against a remote Thinker)
export QWEN3_OMNI_URL=https://your-thinker.example.com
export QWEN3_OMNI_MODEL=Qwen3-Omni
node scripts/qwen3-omni/stress-test.mjs --requests 50

# Concurrent load (e.g. 5 concurrent requests, 50 total)
node scripts/qwen3-omni/stress-test.mjs --requests 50 --concurrency 5

# Shorter responses (faster turns)
node scripts/qwen3-omni/stress-test.mjs --max-tokens 64
```

**Options**

| Option          | Default                                     | Description                     |
| --------------- | ------------------------------------------- | ------------------------------- |
| `--url`         | `QWEN3_OMNI_URL` or `http://localhost:8000` | Thinker base URL (Qwen)         |
| `--model`       | `Qwen3-Omni`                                | Model name (must match Thinker) |
| `--requests`    | 20                                          | Total number of requests        |
| `--concurrency` | 1                                           | Concurrent requests             |
| `--max-tokens`  | 128                                         | Max tokens per response         |

**Output**

- Completed / failed counts
- Wall time and throughput (req/s)
- Latency percentiles (p50, p95, p99) in ms

---

## Interpreting results

- **Throughput:** Requests per second; increase `--concurrency` to find saturation.
- **Latency p95/p99:** High percentiles indicate tail latency; compare before/after changes.
- **Failures:** Check Thinker logs and GPU memory; reduce concurrency or batch size if OOM.

---

## EvalScope (formal evaluation)

For benchmark-grade evaluation (e.g. OmniBench), use EvalScope against your Thinker URL:

```bash
pip install 'evalscope[app,perf]' -U
evalscope perf --model Qwen3-Omni-30B-A3B-Instruct --url http://localhost:8000/v1/chat/completions ...
```

See [QWEN-OMNI-2026-BEST-PRACTICES.md](./QWEN-OMNI-2026-BEST-PRACTICES.md) for vLLM flags and A100 recommendations.

---

## Related

- [QWEN-OMNI-2026-BEST-PRACTICES.md](./QWEN-OMNI-2026-BEST-PRACTICES.md) – EvalScope, vLLM, output modality
- [DIRECTOR-MODE-LOCAL-DEV.md](./DIRECTOR-MODE-LOCAL-DEV.md) – Director Mode and Qwen3-Omni setup
- `src/integrations/qwen3-omni/config.ts` – `isQwen3OmniTextOnly()`, `getQwen3OmniConfig().textOnly`
