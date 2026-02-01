#!/usr/bin/env python3
"""
Native PyTorch ONNX Export for FTIS V3

Uses torch.onnx.export directly instead of optimum (which requires onnxruntime).
This works on Python 3.14 and Apple Silicon.

Usage:
  cd apps/ml-training/router
  source .venv/bin/activate
  python export_onnx_native.py

Output:
  - outputs/ferni-router-v3/onnx/model.onnx
  - outputs/ferni-router-v3/onnx/config.json
"""

import json
import torch
import numpy as np
from pathlib import Path
from transformers import AutoModelForSequenceClassification, AutoTokenizer
from peft import PeftModel

# ==============================================================================
# CONFIG
# ==============================================================================

BASE_MODEL = "Qwen/Qwen3-1.7B"
CHECKPOINT_DIR = Path("outputs/ferni-router-v3/final")
DATA_DIR = Path("data")
OUTPUT_DIR = Path("outputs/ferni-router-v3/onnx")

MAX_LENGTH = 256

def main():
    print("=" * 60)
    print("🔄 FTIS V3 Native ONNX Export")
    print("=" * 60)

    # Load tokenizer
    print("\n📦 Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(CHECKPOINT_DIR, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # Load label map
    with open(DATA_DIR / "label_map.json", 'r') as f:
        label_map = json.load(f)
    num_labels = len(label_map)

    # Load base model
    print("\n📦 Loading base model...")
    base_model = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL,
        num_labels=num_labels,
        problem_type="multi_label_classification",
        trust_remote_code=True,
        torchscript=True,  # Enable for better ONNX export
    )
    base_model.config.pad_token_id = tokenizer.pad_token_id

    # Load LoRA adapters
    print("\n📦 Loading LoRA adapters...")
    model = PeftModel.from_pretrained(base_model, str(CHECKPOINT_DIR))

    # Merge LoRA weights into base model (required for ONNX export)
    print("\n🔀 Merging LoRA weights...")
    model = model.merge_and_unload()
    model.eval()

    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Create dummy input
    print("\n📐 Creating dummy input...")
    dummy_text = "play some music"
    inputs = tokenizer(
        dummy_text,
        padding="max_length",
        truncation=True,
        max_length=MAX_LENGTH,
        return_tensors="pt"
    )

    # Move to CPU for export
    model = model.cpu()
    input_ids = inputs["input_ids"]
    attention_mask = inputs["attention_mask"]

    # Export to ONNX
    print("\n🔧 Exporting to ONNX...")
    output_path = OUTPUT_DIR / "model.onnx"

    torch.onnx.export(
        model,
        (input_ids, attention_mask),
        str(output_path),
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch_size", 1: "sequence"},
            "attention_mask": {0: "batch_size", 1: "sequence"},
            "logits": {0: "batch_size"},
        },
        opset_version=17,
        do_constant_folding=True,
    )

    # Verify file exists
    if output_path.exists():
        size_mb = output_path.stat().st_size / (1024 * 1024)
        print(f"   ✅ Exported: {output_path} ({size_mb:.1f} MB)")
    else:
        print("   ❌ Export failed!")
        return

    # Save config
    config_path = OUTPUT_DIR / "config.json"
    config = {
        "version": "v3",
        "base_model": BASE_MODEL,
        "checkpoint": str(CHECKPOINT_DIR),
        "num_labels": num_labels,
        "max_length": MAX_LENGTH,
        "label_map": label_map,
        "opset_version": 17,
    }
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    print(f"   ✅ Config: {config_path}")

    # Copy boundaries file
    boundaries_src = DATA_DIR / "boundaries.json"
    boundaries_dst = OUTPUT_DIR / "boundaries.json"
    if boundaries_src.exists():
        import shutil
        shutil.copy(boundaries_src, boundaries_dst)
        print(f"   ✅ Boundaries: {boundaries_dst}")

    print("\n" + "=" * 60)
    print("✅ ONNX EXPORT COMPLETE!")
    print("=" * 60)
    print(f"   Model: {output_path}")
    print(f"   Size:  {size_mb:.1f} MB")
    print(f"   Labels: {num_labels}")
    print("\n   Next steps:")
    print("   1. Copy to semantic router")
    print("   2. Update inference code")
    print("=" * 60)

if __name__ == "__main__":
    main()
