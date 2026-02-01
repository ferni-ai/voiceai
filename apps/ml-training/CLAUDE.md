# ML Training (`apps/ml-training/`)

> **Machine learning model training for the Ferni Router - semantic tool classification**

This directory contains Python-based ML training pipelines for fine-tuning language models used in Ferni's tool routing system.

---

## Quick Reference

```bash
# Navigate to training directory
cd apps/ml-training/router

# Activate virtual environment
source .venv/bin/activate  # or .venv312/bin/activate

# Install dependencies
pip install -r requirements.txt

# Generate training data
npx ts-node generate-training-data.ts

# Train the model
python train.py --config config.yaml

# Evaluate
python evaluate.py --checkpoint outputs/best_model

# Export to ONNX for production
python export_onnx.py --checkpoint outputs/best_model --output ferni_router.onnx
```

---

## Directory Structure

```
ml-training/
├── router/                      # Ferni Router Model training
│   ├── README.md               # Comprehensive training documentation
│   ├── train.py                # Main training script (Hugging Face Trainer)
│   ├── evaluate.py             # Model evaluation with metrics
│   ├── export_onnx.py          # ONNX export for inference
│   ├── config.yaml             # Training hyperparameters
│   ├── config-full.yaml        # Full training config
│   ├── generate-training-data.ts    # Synthetic data generation (TypeScript)
│   ├── generate_full_data.py        # Full dataset generation (Python)
│   ├── requirements.txt        # Python dependencies
│   ├── .venv/                  # Python virtual environment (~10GB)
│   └── outputs/                # Training checkpoints, logs
│
└── CLAUDE.md                   # This file
```

---

## Model Architecture

| Component | Value |
|-----------|-------|
| **Base Model** | Qwen/Qwen3-1.7B |
| **Fine-tuning** | LoRA (r=16, alpha=32) + RouterTrainer (separate LRs) |
| **Task** | Single-label tool classification |
| **Output** | 861 labels (860 tools + __no_tool__) |
| **Top-1 Accuracy** | 98.0% |
| **Top-3 Accuracy** | 99.7% |
| **F1 Weighted** | 0.980 |

### Why Qwen3-1.7B? (FTIS V3 Upgrade)

- **Better tool calling**: Native function calling support, BFCL leader
- **Outperforms larger models**: Qwen3-1.7B beats Qwen2.5-3B on most benchmarks
- **Same inference speed**: <50ms target maintained
- **Excellent multilingual support**: Same as Qwen2.5
- **LoRA efficient**: Trainable params ~4M

Upgraded from Qwen2.5-1.5B in January 2026 to address tool calling reliability issues.

---

## Integration with Ferni

```
User Input → Semantic Router → [Ferni Router Model] → Tool Selection
                                      ↓
                              Embedding + Classification
                                      ↓
                              Top-K Tool Domains
```

The trained model is exported to ONNX and used by:
- `src/tools/semantic-router/` - Semantic tool routing
- `apps/rust-perf/` - SIMD-optimized inference (optional)

---

## Performance Targets

| Metric | Target | Achieved (V5-860) | Purpose |
|--------|--------|-------------------|---------|
| Top-1 Accuracy | >78% | **98.0%** | Primary tool selection |
| Top-3 Accuracy | >93% | **99.7%** | Fallback candidates |
| F1 Score | >0.85 | **0.980** | Balanced precision/recall |
| Inference Latency | <50ms | ~60-70ms (GPU) | Real-time voice |

---

## Training Data

Training data is generated synthetically from:
1. Tool definitions in `src/tools/domains/`
2. Example phrases from semantic router
3. Augmented variations (paraphrase, typos, etc.)

### Data Format

```json
{
  "input": "play some jazz music",
  "labels": ["music", "entertainment"],
  "metadata": {
    "source": "synthetic",
    "variation": "original"
  }
}
```

---

## Size Warning

⚠️ **This directory is ~10GB** due to Python virtual environments (`.venv`, `.venv312`).

Consider:
- Adding to `.gitignore` if not already
- Using cloud training (Colab, Lambda Labs)
- Cleaning unused venvs: `rm -rf .venv312` if not needed

---

## Detailed Documentation

See `router/README.md` for:
- Complete training workflow
- Hyperparameter tuning guide
- Evaluation metrics explanation
- ONNX export instructions
- Troubleshooting

---

## Related Files

| File | Purpose |
|------|---------|
| `src/tools/semantic-router/CLAUDE.md` | Semantic router that uses this model |
| `apps/rust-perf/CLAUDE.md` | Rust SIMD inference (optional) |
| `src/tools/orchestrator/unified-tool-orchestrator.ts` | Tool selection orchestration |

---

*Last updated: January 2026*
