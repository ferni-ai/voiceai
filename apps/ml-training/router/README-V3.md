# FTIS V3 - Ferni Tool Intelligence System

> High-accuracy tool routing with 95.7% tool classification and 100% open intent detection.

## Quick Start

### 1. Start the Inference Server

```bash
cd apps/ml-training/router
source .venv/bin/activate
python inference_server.py
```

The server runs on `http://localhost:8765` with MPS (Apple Silicon GPU) for ~100ms inference latency.

### 2. Test Predictions

```bash
curl -X POST http://localhost:8765/predict \
  -H "Content-Type: application/json" \
  -d '{"query": "play some music"}'
```

Response:
```json
{
  "predictions": [
    {"tool_id": "playMusic", "confidence": 0.99}
  ],
  "latency_ms": 98.5
}
```

### 3. Use from TypeScript

```typescript
import { getFtisV3Client } from './tools/intelligence/router/inference';

const client = getFtisV3Client();
await client.checkHealth();

const result = await client.predict({ query: "play some music" });
console.log(result.predictions); // [{ toolId: 'playMusic', confidence: 0.99 }]
```

## Model Details

| Property | Value |
|----------|-------|
| Base Model | Qwen/Qwen3-1.7B |
| Fine-tuning | LoRA (r=16, alpha=32) |
| Task | Multi-label classification |
| Tools | 40 |
| Optimal Threshold | 0.05 |

## Performance

| Metric | Value |
|--------|-------|
| Tool Classification Accuracy | 95.7% |
| Open Intent Detection | 100% |
| MPS Latency | ~100ms |
| CPU Latency (ONNX) | ~1000ms |

## Key Files

| File | Purpose |
|------|---------|
| `outputs/ferni-router-v3/final/` | Trained LoRA checkpoint |
| `data/label_map.json` | Tool label mapping (40 tools) |
| `inference_server.py` | FastAPI server with MPS |
| `quick_validate.py` | Quick CPU validation |
| `validate_v3.py` | Full validation suite |
| `find_optimal_threshold.py` | Threshold optimization |

## Training

The model was trained with:

- **6,536 examples** (3,437 tool queries + 2,118 open intents + 981 hard negatives)
- **70%+ open intents** to prevent false positives
- **Hard negatives** for confusing tool pairs

To retrain:

```bash
source .venv/bin/activate
python train_mps.py
```

## Export Formats

### ONNX (6.5GB)

```bash
source .venv312/bin/activate  # Python 3.12 required
python export_v3_optimum.py
```

Output: `/Users/sethford/Documents/voiceai/models/ferni-router-v3/`

### Merged PyTorch

```bash
python export_v3_optimum.py
```

Output: `outputs/ferni-router-v3/merged/`

## Inference Options

### Option 1: Rust ONNX Router (Recommended for Production)

The preferred approach - no Python runtime required:

```typescript
import { initializeFtisRouter, routeWithFtis } from '@/tools/semantic-router/integration/ftis-onnx-router.js';

// Initialize once at startup
await initializeFtisRouter();

// Route queries
const result = await routeWithFtis("play some jazz music");
console.log(result.toolId);     // "playMusic"
console.log(result.confidence); // 0.97
console.log(result.latencyMs);  // ~250-300ms
```

**Test the Rust router:**
```bash
cd apps/rust-perf && pnpm build
npx tsx apps/ml-training/router/test_rust_onnx.ts
```

| Metric | Value |
|--------|-------|
| Load time | ~17s (one-time) |
| Inference | ~250-300ms |
| Memory | ~7GB (model + runtime) |

### Option 2: Python MPS Server (Development/Fastest)

For Apple Silicon development with fastest inference:

```bash
cd apps/ml-training/router
source .venv/bin/activate
python inference_server.py
```

| Metric | Value |
|--------|-------|
| Load time | ~5s |
| Inference | ~100ms |
| Memory | ~4GB |

Note: Requires Python runtime

## Threshold Tuning

The model uses sigmoid outputs (multi-label classification), resulting in lower absolute confidences than softmax. The optimal threshold was determined by:

```
Threshold | Tool Acc | Open Acc
----------|----------|----------
  0.05    |  95.7%  | 100.0%  ← Optimal
  0.10    |  91.3%  | 100.0%
  0.20    |  87.0%  | 100.0%
  0.50    |  73.9%  | 100.0%
```

At threshold 0.05:
- Tool queries reach 5-99% confidence
- Open intents stay below 5% confidence
- Clear separation enables reliable classification

## Known Issues

1. **"text mom I'll be late"** - Low confidence (4.5%). Needs more training examples for SMS patterns.
2. **Single-word queries** ("music", "weather") - Lower confidence due to ambiguity.

## API Reference

### POST /predict

Predict tools for a query.

Request:
```json
{
  "query": "play some music",
  "threshold": 0.05,
  "top_k": 5
}
```

Response:
```json
{
  "predictions": [
    {"tool_id": "playMusic", "confidence": 0.99}
  ],
  "latency_ms": 98.5
}
```

### GET /health

Health check endpoint.

### GET /labels

Get all tool labels.
