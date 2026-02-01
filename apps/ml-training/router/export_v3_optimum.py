#!/usr/bin/env python3
"""
Export FTIS V3 model to ONNX using Optimum (handles modern transformers better).

Run with Python 3.12:
  source .venv312/bin/activate
  python export_v3_optimum.py
"""

import sys
import json
import shutil
import torch
import numpy as np
from pathlib import Path
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from peft import PeftModel

# ==============================================================================
# CONFIG
# ==============================================================================

BASE_MODEL = "Qwen/Qwen3-1.7B"
CHECKPOINT_DIR = Path("outputs/ferni-router-v3/final")
DATA_DIR = Path("data")
MERGED_DIR = Path("outputs/ferni-router-v3/merged")  # Intermediate merged model
OUTPUT_DIR = Path("/Users/sethford/Documents/voiceai/models/ferni-router-v3")

MAX_LENGTH = 128

# ==============================================================================
# MAIN
# ==============================================================================

def main():
    print("=" * 60)
    print("🚀 FTIS V3 Export via Optimum")
    print("=" * 60)

    # Load tokenizer
    print("\n📦 Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(CHECKPOINT_DIR, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    print(f"   ✅ Tokenizer loaded")

    # Load label map
    with open(DATA_DIR / "label_map.json", 'r') as f:
        label_map = json.load(f)
    print(f"   ✅ {len(label_map)} tools")

    # Load and merge model
    print("\n🧠 Loading and merging model...")
    base_model = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL,
        num_labels=len(label_map),
        problem_type='multi_label_classification',
        trust_remote_code=True,
        torch_dtype=torch.float32,
    )
    base_model.config.pad_token_id = tokenizer.pad_token_id

    model = PeftModel.from_pretrained(base_model, str(CHECKPOINT_DIR))
    model = model.merge_and_unload()
    model.eval()
    print(f"   ✅ Model merged: {sum(p.numel() for p in model.parameters()):,} params")

    # Save merged model temporarily
    print("\n💾 Saving merged model...")
    MERGED_DIR.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(MERGED_DIR, safe_serialization=True)
    tokenizer.save_pretrained(MERGED_DIR)
    shutil.copy(DATA_DIR / "label_map.json", MERGED_DIR / "label_map.json")
    print(f"   ✅ Saved to {MERGED_DIR}")

    # Export with Optimum
    print("\n📤 Exporting to ONNX with Optimum...")
    from optimum.onnxruntime import ORTModelForSequenceClassification

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    try:
        # Use Optimum's from_pretrained with export=True
        ort_model = ORTModelForSequenceClassification.from_pretrained(
            MERGED_DIR,
            export=True,
            trust_remote_code=True,
        )
        ort_model.save_pretrained(OUTPUT_DIR)
        tokenizer.save_pretrained(OUTPUT_DIR)
        print(f"   ✅ Exported with Optimum")

        # Test inference
        print("\n🏃 Testing ONNX inference...")
        test_input = tokenizer("play some music", return_tensors="pt", padding="max_length", max_length=MAX_LENGTH, truncation=True)
        with torch.no_grad():
            outputs = ort_model(**test_input)
            probs = torch.sigmoid(outputs.logits).numpy()[0]
            print(f"   ✅ Max confidence: {probs.max():.4f}")

    except Exception as e:
        print(f"   ❌ Optimum export failed: {e}")
        print("\n⚠️  Falling back to merged PyTorch model (no ONNX)")

        # Just copy the merged model
        for f in MERGED_DIR.iterdir():
            if f.is_file():
                shutil.copy(f, OUTPUT_DIR / f.name)
        print(f"   ✅ Copied merged PyTorch model to {OUTPUT_DIR}")

    # Copy label map
    shutil.copy(DATA_DIR / "label_map.json", OUTPUT_DIR / "label_map.json")

    # Create config
    config = {
        "version": "3.0.0",
        "base_model": BASE_MODEL,
        "num_labels": len(label_map),
        "max_length": MAX_LENGTH,
        "optimal_threshold": 0.05,
        "metrics": {
            "tool_accuracy": 0.957,
            "open_intent_accuracy": 1.0,
        }
    }
    with open(OUTPUT_DIR / "config.json", 'w') as f:
        json.dump(config, f, indent=2)

    # Calculate sizes
    total_size = sum(f.stat().st_size for f in OUTPUT_DIR.rglob("*") if f.is_file()) / 1024 / 1024

    print("\n" + "=" * 60)
    print("🎉 EXPORT COMPLETE!")
    print("=" * 60)
    print(f"📁 Output: {OUTPUT_DIR}")
    print(f"📊 Total size: {total_size:.1f} MB")

if __name__ == "__main__":
    main()
