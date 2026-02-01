#!/usr/bin/env python3
"""
FTIS V5 Inference Server

High-performance inference server using PyTorch with MPS (Apple Silicon GPU).
Uses Qwen3-1.7B with LoRA adapter for multi-label tool classification.

Model Performance (V5):
  - F1 Score: 81.1%
  - Precision: 86.1%
  - Top-1 Accuracy: 79.8%
  - Top-3 Accuracy: 97.7%
  - 108 tool labels

Usage:
  cd apps/ml-training/router
  source .venv/bin/activate
  python inference_server.py

Then test:
  curl -X POST http://localhost:8765/predict \
    -H "Content-Type: application/json" \
    -d '{"query": "play some music"}'
"""

import json
import time
import torch
from pathlib import Path
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from peft import PeftModel
import uvicorn

# ==============================================================================
# CONFIG
# ==============================================================================

BASE_MODEL = "Qwen/Qwen3-1.7B"
CHECKPOINT_DIR = Path("outputs/ferni-router-v5-qwen3")  # V5 with Qwen3-1.7B
MAX_LENGTH = 128
DEFAULT_THRESHOLD = 0.05
HOST = "0.0.0.0"
PORT = 8765

# ==============================================================================
# MODEL LOADING
# ==============================================================================

print("🚀 Loading FTIS V5 model (Qwen3-1.7B)...")

tokenizer = AutoTokenizer.from_pretrained(CHECKPOINT_DIR, trust_remote_code=True)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

# Load label map from checkpoint directory (108 tools)
with open(CHECKPOINT_DIR / "label_map.json", 'r') as f:
    label_map = json.load(f)
id_to_label = {v: k for k, v in label_map.items()}
print(f"   Loaded {len(label_map)} tool labels")

# Determine best device and dtype
if torch.backends.mps.is_available():
    device = 'mps'
    # MPS doesn't support bfloat16, use float16
    dtype = torch.float16
elif torch.cuda.is_available():
    device = 'cuda'
    dtype = torch.bfloat16  # Model was trained with bf16
else:
    device = 'cpu'
    dtype = torch.float32

print(f"   Using device: {device}, dtype: {dtype}")

base_model = AutoModelForSequenceClassification.from_pretrained(
    BASE_MODEL,
    num_labels=len(label_map),
    problem_type='multi_label_classification',
    trust_remote_code=True,
    torch_dtype=dtype,
)
base_model.config.pad_token_id = tokenizer.pad_token_id

model = PeftModel.from_pretrained(base_model, str(CHECKPOINT_DIR))
model.eval()
model = model.to(device)
print(f"✅ Model loaded on {device}")

# Warmup
warmup_input = tokenizer("warmup", return_tensors='pt', padding='max_length', max_length=MAX_LENGTH, truncation=True)
warmup_input = {k: v.to(device) for k, v in warmup_input.items()}
with torch.no_grad():
    _ = model(**warmup_input)
print("✅ Warmup complete")

# ==============================================================================
# API
# ==============================================================================

app = FastAPI(title="FTIS V5 Inference Server")

class PredictRequest(BaseModel):
    query: str
    threshold: float = DEFAULT_THRESHOLD
    top_k: int = 5

class ToolPrediction(BaseModel):
    tool_id: str
    confidence: float

class PredictResponse(BaseModel):
    predictions: list[ToolPrediction]
    latency_ms: float

@app.post("/predict", response_model=PredictResponse)
async def predict(request: PredictRequest):
    start = time.perf_counter()

    try:
        # Tokenize
        inputs = tokenizer(
            request.query,
            return_tensors='pt',
            padding='max_length',
            max_length=MAX_LENGTH,
            truncation=True
        )
        inputs = {k: v.to(device) for k, v in inputs.items()}

        # Inference
        with torch.no_grad():
            outputs = model(**inputs)
            probs = torch.sigmoid(outputs.logits).cpu().numpy()[0]

        # Decode predictions
        predictions = []
        for idx, prob in enumerate(probs):
            if prob >= request.threshold:
                predictions.append(ToolPrediction(
                    tool_id=id_to_label[idx],
                    confidence=float(prob)
                ))

        # Sort by confidence, take top_k
        predictions = sorted(predictions, key=lambda x: -x.confidence)[:request.top_k]

        latency = (time.perf_counter() - start) * 1000

        return PredictResponse(predictions=predictions, latency_ms=latency)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "device": device,
        "num_tools": len(label_map),
        "model": BASE_MODEL,
    }

@app.get("/labels")
async def labels():
    return {"labels": list(label_map.keys())}

# ==============================================================================
# MAIN
# ==============================================================================

if __name__ == "__main__":
    print(f"\n🌐 Starting server on http://{HOST}:{PORT}")
    print(f"   Swagger docs: http://localhost:{PORT}/docs")
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
