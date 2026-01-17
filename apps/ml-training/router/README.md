# Ferni Router Model Training

This directory contains the training infrastructure for the Ferni Router Model - a fine-tuned Qwen 2.5 1.5B model for multi-label tool classification.

## Overview

The Ferni Router Model is a key component of the FTIS (Ferni Tool Intelligence System). It learns to predict which tools are relevant for a given user query, enabling fast (~50ms) tool selection without requiring an LLM call for every turn.

## Quick Start

### 1. Prepare Training Data

Export training data from production Firestore:

```bash
# From the main voiceai project
pnpm tsx scripts/ftis/generate-test-data.ts
```

This creates:
- `data/train.jsonl` - Training examples
- `data/validation.jsonl` - Validation examples
- `data/test.jsonl` - Test examples

### 2. Train the Model

```bash
# Using Docker
docker build -t ferni-router-trainer --target trainer .
docker run --gpus all -v $(pwd)/data:/app/data -v $(pwd)/outputs:/app/outputs ferni-router-trainer \
    python3 train.py --config config.yaml --data_dir /app/data --output_dir /app/outputs/ferni-router

# Or locally (requires GPU)
pip install -r requirements.txt
python train.py --config config.yaml --data_dir ./data
```

### 3. Evaluate

```bash
python evaluate.py --model_dir ./outputs/ferni-router/final --data_dir ./data
```

### 4. Export to ONNX

```bash
python export_onnx.py --model_dir ./outputs/ferni-router/final --output ./models/ferni-router.onnx
```

## Configuration

See `config.yaml` for all training hyperparameters:

- **Model**: Qwen 2.5 1.5B base
- **LoRA**: r=16, alpha=32
- **Training**: 3 epochs, lr=2e-5, batch_size=8
- **Data**: max_length=512

## Files

| File | Description |
|------|-------------|
| `train.py` | Main training script |
| `evaluate.py` | Model evaluation |
| `export_onnx.py` | ONNX export for inference |
| `config.yaml` | Training configuration |
| `requirements.txt` | Python dependencies |
| `Dockerfile` | Container definitions |

## Training Data Format

Each training example is a JSON line with:

```json
{
  "id": "example_123",
  "query": "Help me track my water intake",
  "selected_tools": ["trackHabit", "createReminder"],
  "persona_id": "maya",
  "emotion": "neutral",
  "time_of_day": "morning",
  "recent_tools": ["getWeather"],
  "was_successful": true,
  "source": "production"
}
```

## Model Architecture

- **Base**: Qwen 2.5 1.5B
- **Task**: Multi-label classification (sigmoid output)
- **Fine-tuning**: LoRA adapters on attention layers
- **Output**: Probability for each tool (0-1)

## Metrics

| Metric | Target | Description |
|--------|--------|-------------|
| Top-1 Accuracy | >78% | Correct tool is top prediction |
| Top-3 Accuracy | >93% | Correct tool in top 3 |
| F1 (micro) | >0.85 | Multi-label F1 score |
| Inference Latency | <50ms | ONNX runtime on CPU |

## Integration

The exported ONNX model is loaded by the TypeScript inference runtime:

```typescript
import { getRouterModel } from './router/inference/router-model.js';

const model = getRouterModel();
const predictions = await model.predict(query, context);
```

## Retraining

The model should be retrained:
- Weekly (scheduled: Sunday 3 AM)
- After significant tool additions/changes
- When accuracy drops below threshold

Use the `retrain.py` script for automated retraining:

```bash
python retrain.py --incremental --upload_gcs
```

## Hardware Requirements

- **Training**: NVIDIA GPU with 16GB+ VRAM (e.g., V100, A100)
- **Inference**: CPU only (ONNX runtime)

## License

Internal Ferni AI use only.
