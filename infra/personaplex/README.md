# PersonaPlex GCE GPU Infrastructure

Deploy PersonaPlex on a GPU-enabled GCE instance for custom voice embeddings and full-duplex conversations.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GCE GPU Instance                         │
│                 (personaplex-server)                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────┐    ┌──────────────────────┐          │
│   │  PersonaPlex    │    │  Voice Embeddings    │          │
│   │  Server         │    │  (.pt files)         │          │
│   │  (port 8998)    │    │  /opt/voices/        │          │
│   └────────┬────────┘    └──────────────────────┘          │
│            │                                                │
│   ┌────────▼────────┐                                      │
│   │  NVIDIA L4 GPU  │                                      │
│   │  (24GB VRAM)    │                                      │
│   └─────────────────┘                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ WSS (port 8998)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Ferni Voice Agent                        │
│                  (voiceai-agent-gce)                        │
│                                                             │
│   PersonaPlex Client ──► Enhanced Prompts + Custom Voices  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## GPU Options

| GPU           | VRAM | Cost/Hour | Recommendation         |
| ------------- | ---- | --------- | ---------------------- |
| **NVIDIA L4** | 24GB | ~$0.70    | ✅ Best for inference  |
| NVIDIA T4     | 16GB | ~$0.35    | Budget option          |
| NVIDIA A100   | 40GB | ~$2.50    | Overkill for inference |

## Quick Start

```bash
# Deploy PersonaPlex server
ferni personaplex deploy

# Generate voice embeddings
ferni personaplex generate-voices

# Check health
ferni personaplex health

# View logs
ferni personaplex logs
```

## Files

| File                 | Purpose                    |
| -------------------- | -------------------------- |
| `deploy.sh`          | Main deployment script     |
| `Dockerfile`         | PersonaPlex container      |
| `startup.sh`         | VM startup script          |
| `generate-voices.sh` | Voice embedding generation |

## Cost Estimate

| Component             | Cost/Month |
| --------------------- | ---------- |
| L4 GPU VM (24/7)      | ~$500      |
| L4 GPU VM (on-demand) | ~$50-100   |
| Storage (100GB)       | ~$10       |

**Recommendation**: Use preemptible/spot instances + auto-shutdown to reduce costs.

## Environment Variables

```bash
# Required
HF_TOKEN=hf_xxx              # HuggingFace token (for model download)
PERSONAPLEX_VOICE_DIR=/opt/voices

# Optional
PERSONAPLEX_PORT=8998
PERSONAPLEX_SSL_DIR=/tmp/ssl
```
