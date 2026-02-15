# Voice: Lowest Latency & Best E2E (Mac vs GCE)

**Short answer:**  
- **Mac:** Same-box STT + LLM + TTS (Kyutai MLX bridge on localhost, or Qwen3-Omni in-process) + agent on Mac → minimal RTT.  
- **GCE:** Same-box or same-VPC STT + LLM + TTS (Kyutai Rust sidecars on same VM/VPC, or Candle/vLLM on GCE) + agent on GCE → minimal RTT.

Latency is dominated by **where each step runs** (network hops) and **inference speed** (local GPU/Metal vs cloud API). Best E2E = **minimize round-trips** and **colocate** inference with the voice agent.

---

## 1. E2E pipeline (what runs where)

```
User device  ←→  LiveKit  ←→  Voice agent (Node)  ←→  STT / LLM / TTS
```

- **Voice agent** today: **Mac** (local dev) or **GCE** (production) at `34.134.186.63`.
- **STT:** Kyutai (WebSocket to bridge/sidecar), or Gemini Live / OpenAI (cloud).
- **LLM:** Gemini Live / OpenAI Realtime (cloud), or Qwen3-Omni (local/GCE server).
- **TTS:** Cartesia (cloud), or Kyutai (WebSocket to bridge/sidecar), or Qwen3-Omni.

Every hop (agent → STT, agent → LLM, agent → TTS) adds **RTT**. Same machine or same VPC = low RTT; cross-region cloud = higher RTT.

---

## 2. Mac (local dev) – lowest latency

| Setup | STT | LLM | TTS | RTT / latency | Best for |
|-------|-----|-----|-----|----------------|----------|
| **A. Kyutai on localhost** | Kyutai MLX bridge (localhost:8089) | Gemini/OpenAI (cloud) | Kyutai MLX bridge (localhost:8090) | STT/TTS: ~0 ms (loopback); LLM: cloud RTT | Real Kyutai voice, no Python if you use Rust bridge later |
| **B. Qwen3-Omni in-process** | (Omni does STT) | Qwen3-Omni Thinker (same process) | (Omni does TTS) | No network for speech→speech; one process | Best E2E if Omni full pipeline is ready |
| **C. All cloud** | Gemini/OpenAI | Gemini/OpenAI | Cartesia | 2–3 cloud round-trips (tens–100+ ms each) | Easiest; no local models |

**Recommendation for Mac:**

- **Lowest latency:** **A** (Kyutai bridge on localhost) or **B** (Qwen3-Omni in-process when full pipeline exists). STT and TTS are then **same-box** (no extra network). LLM is still cloud unless you run Qwen3-Omni (B).
- **Best E2E quality + low latency:** A with real MLX models (`--use-mlx`) or a **Rust Kyutai bridge** (same protocol, no Python). See [KYUTAI-LOCAL-TEST.md](KYUTAI-LOCAL-TEST.md) and [KYUTAI-RUST-NO-PYTHON-PLAN.md](../plans/KYUTAI-RUST-NO-PYTHON-PLAN.md).

---

## 3. GCE (production) – lowest latency

| Setup | STT | LLM | TTS | RTT / latency | Best for |
|-------|-----|-----|-----|----------------|----------|
| **A. Same-box Kyutai** | Kyutai Rust sidecar on **same GCE VM** (or same VPC) | Gemini/OpenAI (cloud) | Kyutai Rust sidecar **same VM/VPC** | STT/TTS: &lt;1 ms (localhost) or &lt;5 ms (VPC); LLM: cloud RTT | Production Kyutai voice, minimal RTT |
| **B. Same-box Omni** | (Omni) | Qwen3-Omni (Candle/vLLM on **same GCE** or same VPC) | (Omni) | No cross-region for speech→speech | Best E2E when Omni full pipeline is on GCE |
| **C. All cloud** | Gemini/OpenAI | Gemini/OpenAI | Cartesia | Agent → cloud × 3; adds RTT per hop | Easiest; no GCE inference |

**Recommendation for GCE:**

- **Lowest latency:** **A** – run Kyutai STT and TTS (Rust `moshi-server` or future Rust bridge) on the **same GCE instance** as the voice agent, or in the same VPC. Point `KYUTAI_STT_URL` / `KYUTAI_TTS_URL` at localhost or internal VPC URLs. See [KYUTAI-DSM-SETUP.md](KYUTAI-DSM-SETUP.md).
- **Best E2E:** A today; **B** when Qwen3-Omni full pipeline (audio→audio) is deployed on GCE (Candle or vLLM).

---

## 4. Summary table

| Platform | Lowest-latency setup | Main idea |
|----------|----------------------|-----------|
| **Mac** | Kyutai MLX bridge (or Rust bridge) on **localhost**; agent on Mac | STT/TTS = loopback RTT; LLM = only cloud hop |
| **Mac** | Qwen3-Omni **in-process** (when full pipeline ready) | No network for speech→speech |
| **GCE** | Kyutai STT/TTS **same VM or same VPC** as voice agent | STT/TTS = localhost or single-digit ms |
| **GCE** | Qwen3-Omni (Candle/vLLM) **on GCE** same box/VPC | Same-box speech→speech |

**Rule of thumb:** Put STT and TTS as close as possible to the voice agent (same machine or same VPC). Prefer same-box over cloud APIs for STT/TTS if you care about latency.

---

## 5. References

- [KYUTAI-LOCAL-TEST.md](KYUTAI-LOCAL-TEST.md) – Mac: bridge, mock vs real MLX  
- [KYUTAI-DSM-SETUP.md](KYUTAI-DSM-SETUP.md) – GCE: Rust sidecars, configs  
- [KYUTAI-RUST-NO-PYTHON-PLAN.md](../plans/KYUTAI-RUST-NO-PYTHON-PLAN.md) – Rust-only bridge (no Python)  
- [MLX-ONNX-CANDLE-LOCAL-GCE.md](../architecture/MLX-ONNX-CANDLE-LOCAL-GCE.md) – What runs where (ONNX, Candle, MLX)  
- [QWEN3-OMNI-LOCAL-AND-GCE.md](QWEN3-OMNI-LOCAL-AND-GCE.md) – Qwen3-Omni local + GCE E2E
