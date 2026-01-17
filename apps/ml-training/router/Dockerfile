# Ferni Router Model Training Container
# Multi-stage build for training and export

# ==============================================================================
# Stage 1: Training environment
# ==============================================================================
FROM nvidia/cuda:12.1-cudnn8-runtime-ubuntu22.04 AS trainer

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 \
    python3.10-venv \
    python3-pip \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create working directory
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy training scripts
COPY train.py .
COPY evaluate.py .
COPY export_onnx.py .
COPY config.yaml .

# Create directories
RUN mkdir -p data outputs logs models

# Default command: show help
CMD ["python3", "train.py", "--help"]

# ==============================================================================
# Stage 2: Export environment (CPU-only, smaller)
# ==============================================================================
FROM python:3.10-slim AS exporter

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install only what's needed for export
RUN pip3 install --no-cache-dir \
    torch>=2.2.0 \
    transformers>=4.40.0 \
    peft>=0.10.0 \
    onnx>=1.15.0 \
    onnxruntime>=1.17.0 \
    optimum>=1.18.0

COPY export_onnx.py .

CMD ["python3", "export_onnx.py", "--help"]

# ==============================================================================
# Stage 3: Inference test environment
# ==============================================================================
FROM python:3.10-slim AS inference

ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN pip3 install --no-cache-dir \
    onnxruntime>=1.17.0 \
    transformers>=4.40.0 \
    numpy>=1.24.0

# Copy test script
COPY <<EOF /app/test_inference.py
#!/usr/bin/env python3
"""Quick inference test for exported ONNX model."""
import json
import sys
import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer

def test_inference(model_path: str, tokenizer_path: str, query: str):
    # Load tokenizer
    tokenizer = AutoTokenizer.from_pretrained(tokenizer_path)
    
    # Load ONNX model
    session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    
    # Tokenize
    inputs = tokenizer(query, return_tensors="np", padding="max_length", max_length=512, truncation=True)
    
    # Run inference
    outputs = session.run(None, {
        "input_ids": inputs["input_ids"],
        "attention_mask": inputs["attention_mask"],
    })
    
    # Get predictions
    logits = outputs[0][0]
    probs = 1 / (1 + np.exp(-logits))  # Sigmoid
    top_indices = np.argsort(probs)[::-1][:5]
    
    print(f"Query: {query}")
    print(f"Top 5 predictions:")
    for i, idx in enumerate(top_indices):
        print(f"  {i+1}. Index {idx}: {probs[idx]:.4f}")
    
    return top_indices, probs

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python test_inference.py <model.onnx> <tokenizer_dir> <query>")
        sys.exit(1)
    
    test_inference(sys.argv[1], sys.argv[2], sys.argv[3])
EOF

CMD ["python3", "test_inference.py"]
