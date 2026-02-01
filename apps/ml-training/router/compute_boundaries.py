#!/usr/bin/env python3
"""
Compute Decision Boundaries for FTIS V3

Computes tool centroids and decision boundaries using trained model embeddings.
This enables out-of-distribution (OOD) detection for open intent queries.

Usage:
  cd apps/ml-training/router
  source .venv/bin/activate
  python compute_boundaries.py

Output:
  - boundaries.json: Centroids and thresholds per tool
  - Used by semantic router for OOD detection
"""

import json
import torch
import numpy as np
from pathlib import Path
from transformers import AutoModelForSequenceClassification, AutoTokenizer
from peft import PeftModel
from sklearn.metrics import pairwise_distances
from collections import defaultdict
from tqdm import tqdm

# ==============================================================================
# CONFIG
# ==============================================================================
BASE_MODEL = "Qwen/Qwen3-1.7B"
CHECKPOINT_DIR = Path("outputs/ferni-router-v3/final")
DATA_DIR = Path("data")
OUTPUT_FILE = DATA_DIR / "boundaries.json"

MAX_LENGTH = 256
BATCH_SIZE = 8

def load_model_and_tokenizer():
    """Load fine-tuned model with LoRA adapters."""
    print("📦 Loading model and tokenizer...")

    tokenizer = AutoTokenizer.from_pretrained(CHECKPOINT_DIR, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # Load base model
    with open(DATA_DIR / "label_map.json", 'r') as f:
        label_map = json.load(f)
    num_labels = len(label_map)

    base_model = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL,
        num_labels=num_labels,
        problem_type="multi_label_classification",
        trust_remote_code=True,
    )
    base_model.config.pad_token_id = tokenizer.pad_token_id

    # Load LoRA adapters
    model = PeftModel.from_pretrained(base_model, str(CHECKPOINT_DIR))
    model.eval()

    # Move to MPS if available
    if torch.backends.mps.is_available():
        model = model.to("mps")
        print("   ✅ Using MPS (Apple Silicon GPU)")

    print(f"   Labels: {num_labels}")
    return model, tokenizer, label_map

def load_training_data():
    """Load training data for centroid computation."""
    print("\n📂 Loading training data...")

    with open(DATA_DIR / "train.jsonl", 'r') as f:
        data = [json.loads(line) for line in f]

    # Separate tool intents from open intents
    tool_examples = [d for d in data if not d.get('is_open_intent', False)]
    open_examples = [d for d in data if d.get('is_open_intent', False)]

    print(f"   Tool examples: {len(tool_examples):,}")
    print(f"   Open intents:  {len(open_examples):,}")

    return tool_examples, open_examples

def get_embeddings(model, tokenizer, texts, device="mps"):
    """Extract embeddings from the model's last hidden state."""
    embeddings = []

    for i in range(0, len(texts), BATCH_SIZE):
        batch_texts = texts[i:i + BATCH_SIZE]

        inputs = tokenizer(
            batch_texts,
            padding="max_length",
            truncation=True,
            max_length=MAX_LENGTH,
            return_tensors="pt"
        )

        if device == "mps":
            inputs = {k: v.to("mps") for k, v in inputs.items()}

        with torch.no_grad():
            outputs = model.base_model.model.model(
                input_ids=inputs["input_ids"],
                attention_mask=inputs["attention_mask"],
            )
            # Use mean of last hidden state as embedding
            hidden_states = outputs.last_hidden_state
            attention_mask = inputs["attention_mask"].unsqueeze(-1)
            masked_hidden = hidden_states * attention_mask
            mean_embedding = masked_hidden.sum(dim=1) / attention_mask.sum(dim=1)
            embeddings.append(mean_embedding.cpu().numpy())

    return np.vstack(embeddings)

def compute_centroids(model, tokenizer, tool_examples, label_map):
    """Compute centroid for each tool class."""
    print("\n📊 Computing tool centroids...")

    # Group examples by tool
    tool_to_examples = defaultdict(list)
    for ex in tool_examples:
        for tool in ex.get('selected_tools', []):
            if tool in label_map:
                tool_to_examples[tool].append(ex['query'])

    # Compute centroid for each tool
    centroids = {}
    device = "mps" if torch.backends.mps.is_available() else "cpu"

    for tool, queries in tqdm(tool_to_examples.items(), desc="Computing centroids"):
        if len(queries) < 3:
            print(f"   ⚠️ Skipping {tool}: only {len(queries)} examples")
            continue

        embeddings = get_embeddings(model, tokenizer, queries, device)
        centroid = embeddings.mean(axis=0)

        # Compute radius (max distance from centroid)
        distances = pairwise_distances([centroid], embeddings, metric='cosine')[0]
        radius = float(np.percentile(distances, 95))  # 95th percentile

        centroids[tool] = {
            "centroid": centroid.tolist(),
            "radius": radius,
            "num_examples": len(queries),
            "mean_distance": float(distances.mean()),
            "std_distance": float(distances.std()),
        }

    return centroids

def compute_open_intent_threshold(model, tokenizer, open_examples, centroids):
    """Compute threshold for open intent detection."""
    print("\n📊 Computing open intent threshold...")

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    queries = [ex['query'] for ex in open_examples[:200]]  # Sample for speed

    embeddings = get_embeddings(model, tokenizer, queries, device)

    # Compute distance to nearest centroid for each open intent
    centroid_array = np.array([c["centroid"] for c in centroids.values()])

    min_distances = []
    for emb in embeddings:
        distances = pairwise_distances([emb], centroid_array, metric='cosine')[0]
        min_distances.append(distances.min())

    # Threshold: 5th percentile of open intent distances
    # (most open intents should be FARTHER than this)
    threshold = float(np.percentile(min_distances, 5))

    print(f"   Open intent distances: mean={np.mean(min_distances):.4f}, std={np.std(min_distances):.4f}")
    print(f"   Open intent threshold: {threshold:.4f}")

    return {
        "threshold": threshold,
        "mean_distance": float(np.mean(min_distances)),
        "std_distance": float(np.std(min_distances)),
        "num_samples": len(queries),
    }

def main():
    print("=" * 60)
    print("🎯 FTIS V3 Decision Boundary Computation")
    print("=" * 60)

    # Load model
    model, tokenizer, label_map = load_model_and_tokenizer()

    # Load data
    tool_examples, open_examples = load_training_data()

    # Compute centroids
    centroids = compute_centroids(model, tokenizer, tool_examples, label_map)

    # Compute open intent threshold
    open_intent_stats = compute_open_intent_threshold(
        model, tokenizer, open_examples, centroids
    )

    # Save results
    print("\n💾 Saving boundaries...")

    result = {
        "version": "v3",
        "model": BASE_MODEL,
        "checkpoint": str(CHECKPOINT_DIR),
        "num_tools": len(centroids),
        "open_intent": open_intent_stats,
        "centroids": centroids,
    }

    with open(OUTPUT_FILE, 'w') as f:
        json.dump(result, f, indent=2)

    print(f"   ✅ Saved to {OUTPUT_FILE}")

    # Summary
    print("\n" + "=" * 60)
    print("✅ DECISION BOUNDARIES COMPLETE!")
    print("=" * 60)
    print(f"   Tools with centroids: {len(centroids)}")
    print(f"   Open intent threshold: {open_intent_stats['threshold']:.4f}")
    print("")
    print("Next steps:")
    print("   1. Export to ONNX: python export_onnx.py")
    print("   2. Deploy to semantic router")
    print("=" * 60)

if __name__ == "__main__":
    main()
