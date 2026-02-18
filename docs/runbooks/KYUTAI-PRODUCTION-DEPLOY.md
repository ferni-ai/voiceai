# Kyutai DSM Production Deployment Runbook

> Deploy self-hosted STT + TTS sidecars alongside the Ferni voice agent on GCE.

## Prerequisites

| Requirement              | Details                                     |
| ------------------------ | ------------------------------------------- |
| GCE VM                   | `voiceai-agent-gce` with GPU (L4 or better) |
| GPU Machine              | `g2-standard-4` (1× NVIDIA L4, 24 GB VRAM)  |
| Docker                   | Installed on GCE VM                         |
| NVIDIA Container Toolkit | For `--gpus all` flag                       |
| Kyutai Bridge image      | Built and pushed to GCR                     |

## Architecture

```
┌─────────────────────────────────────────┐
│           GCE VM (g2-standard-4)        │
│                                         │
│  ┌──────────────┐  ┌──────────────┐     │
│  │ kyutai-stt   │  │ kyutai-tts   │     │
│  │ :8089        │  │ :8090        │     │
│  │ (Candle/CUDA)│  │ (Candle/CUDA)│     │
│  └──────┬───────┘  └──────┬───────┘     │
│         │                 │             │
│  ┌──────┴─────────────────┴──────┐      │
│  │     voiceai-agent (:8080)     │      │
│  │  USE_KYUTAI_STT=true          │      │
│  │  TTS_PROVIDER=kyutai          │      │
│  └───────────────────────────────┘      │
└─────────────────────────────────────────┘
```

## Deploy Steps

### 1. Build and Push the Bridge Image

```bash
# From project root — builds Rust bridge with CUDA
docker build --platform linux/amd64 \
  -f services/kyutai-bridge/Dockerfile \
  -t gcr.io/johnb-2025/kyutai-bridge:latest .

docker push gcr.io/johnb-2025/kyutai-bridge:latest
```

### 2. Deploy with Ferni CLI

```bash
# Enable Kyutai sidecars and GPU
KYUTAI_SIDECARS=true GCE_USE_GPU=true ferni deploy gce
```

This automatically:

1. Pulls `kyutai-bridge:latest` on the GCE VM
2. Starts STT sidecar on port 8089 (with `--stt-only` to save GPU memory)
3. Starts TTS sidecar on port 8090
4. Waits for both to pass `/health/ready` (model loading ~60-120s)
5. Deploys the voice agent with `USE_KYUTAI_STT=true` and `TTS_PROVIDER=kyutai`
6. Voice agent's `/health/ready` also checks sidecar health

### 3. Verify

```bash
# Check sidecar health (from GCE VM)
curl http://localhost:8089/health/ready   # STT
curl http://localhost:8090/health/ready   # TTS

# Check voice agent readiness (includes sidecar checks)
curl http://34.134.186.63:8080/health/ready

# Expected response when sidecars are healthy:
# {"ready":true,"checks":{"healthServer":true,"startupComplete":true,
#   "workersAvailable":true,"livekitConnected":true,"kyutaiSidecars":true}, ...}
```

## Alternative: Docker Compose (Manual)

For manual sidecar management without the Ferni CLI:

```bash
# SSH to GCE
gcloud compute ssh voiceai-agent-gce --zone us-central1-a

# Build and start sidecars
docker compose -f docker/docker-compose.dsm.yml up -d

# Start agent with Kyutai env vars
USE_KYUTAI_STT=true \
KYUTAI_STT_URL=ws://localhost:8089/api/asr-streaming \
TTS_PROVIDER=kyutai \
KYUTAI_TTS_URL=ws://localhost:8090/api/tts_streaming \
docker run ... voiceai-agent:latest
```

## Rollback

### Quick: Disable Kyutai sidecars

```bash
# Redeploy without Kyutai — falls back to Gemini STT + Cartesia TTS
ferni deploy gce
```

### Emergency: Stop sidecars

```bash
# SSH to GCE
gcloud compute ssh voiceai-agent-gce --zone us-central1-a

docker stop kyutai-stt kyutai-tts
docker rm kyutai-stt kyutai-tts

# Agent will automatically detect sidecars unreachable and /health/ready will report not ready
# Redeploy without KYUTAI_SIDECARS=true to restore cloud STT/TTS
ferni deploy gce
```

## Monitoring

### Health Endpoints

| Endpoint                             | What it checks                  |
| ------------------------------------ | ------------------------------- |
| `http://localhost:8089/health`       | STT sidecar alive               |
| `http://localhost:8089/health/ready` | STT models loaded and warm      |
| `http://localhost:8090/health`       | TTS sidecar alive               |
| `http://localhost:8090/health/ready` | TTS models loaded and warm      |
| `http://localhost:8080/health/ready` | Voice agent + sidecars combined |

### Logs

```bash
# Sidecar logs
docker logs kyutai-stt --tail 50 -f
docker logs kyutai-tts --tail 50 -f

# Voice agent logs (includes Kyutai health status)
ferni logs agent --tail
```

### GPU Memory

```bash
# SSH to GCE, check GPU utilization
nvidia-smi

# Expected: ~6-8 GB VRAM for STT + TTS models on L4
```

## Latency Targets

| Metric                 | Target  | How to Verify                                |
| ---------------------- | ------- | -------------------------------------------- |
| STT first interim      | < 150ms | Check `KyutaiSTT` logs: `interim_latency_ms` |
| STT final transcript   | < 300ms | Check `KyutaiSTT` logs: `final_latency_ms`   |
| TTS time-to-first-byte | < 250ms | Check `KyutaiTTS` logs: `ttfb_ms`            |
| E2E first audio        | < 500ms | Check `e2e-latency-tracker` logs             |

## Troubleshooting

| Problem                                         | Cause                                        | Fix                                                                                      |
| ----------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `/health/ready` reports `kyutaiSidecars: false` | Sidecars not running or models still loading | Check `docker ps`, wait for model load, or restart sidecars                              |
| `CUDA out of memory`                            | Too many concurrent sessions                 | Reduce concurrency limit in bridge config, or use `--stt-only` for STT container         |
| Slow first response                             | Model cold start                             | Expected — first inference after model load is slower. Bridge does warmup automatically. |
| Choppy audio                                    | GPU contention                               | Check `nvidia-smi` for memory pressure. Consider upgrading to L4x2 or A100.              |
| `moshi crate` version mismatch                  | Rust bridge vs upstream incompatibility      | Pin `moshi = "0.6"` in Cargo.toml, rebuild image                                         |

## Environment Variables Reference

| Variable          | Default                                 | Description                                     |
| ----------------- | --------------------------------------- | ----------------------------------------------- |
| `KYUTAI_SIDECARS` | `false`                                 | Enable sidecar deployment in `ferni deploy gce` |
| `GCE_USE_GPU`     | `false`                                 | Use GPU machine type for GCE VM                 |
| `USE_KYUTAI_STT`  | `false`                                 | Route STT through Kyutai sidecar                |
| `TTS_PROVIDER`    | `cartesia`                              | Set to `kyutai` for self-hosted TTS             |
| `KYUTAI_STT_URL`  | `ws://localhost:8089/api/asr-streaming` | STT WebSocket endpoint                          |
| `KYUTAI_TTS_URL`  | `ws://localhost:8090/api/tts_streaming` | TTS WebSocket endpoint                          |

## Cost Comparison

| Component | Cloud                       | Self-Hosted                 | Monthly Savings (est.)          |
| --------- | --------------------------- | --------------------------- | ------------------------------- |
| STT       | ~$0.06/min (Gemini Live)    | $0 (local GPU)              | ~$180/month at 3K min           |
| TTS       | ~$0.015/1K chars (Cartesia) | $0 (local GPU)              | ~$150/month at 10M chars        |
| GPU VM    | —                           | ~$300/month (g2-standard-4) | —                               |
| **Net**   | ~$330/month                 | ~$300/month                 | **~$30/month + no rate limits** |

Break-even at ~3K voice minutes/month. Above that, self-hosted wins.
