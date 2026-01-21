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
python generate_training_data.py

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
│   ├── config_production.yaml  # Production training config
│   ├── generate_training_data.py    # Synthetic data generation
│   ├── generate_production_data.py  # Production data pipeline
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
| **Base Model** | Qwen/Qwen2.5-1.5B |
| **Fine-tuning** | LoRA (r=16, alpha=32) |
| **Task** | Multi-label tool classification |
| **Output** | 118 tool domains |

### Why Qwen 2.5 1.5B?

- Small enough for fast inference (<50ms target)
- Large enough for semantic understanding
- Excellent multilingual support
- LoRA reduces trainable params from 1.5B to ~4M

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

| Metric | Target | Purpose |
|--------|--------|---------|
| Top-1 Accuracy | >78% | Primary tool selection |
| Top-3 Accuracy | >93% | Fallback candidates |
| F1 Score | >0.85 | Balanced precision/recall |
| Inference Latency | <50ms | Real-time voice |

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
