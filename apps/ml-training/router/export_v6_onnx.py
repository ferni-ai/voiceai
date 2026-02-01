#!/usr/bin/env python3
"""
Export Ferni Router V6 (Qwen3-1.7B LoRA) to ONNX for fast Rust inference.

The Rust ONNX runtime achieves ~20-50ms latency vs ~700ms in Python/PyTorch.

Usage:
    cd apps/ml-training/router
    source .venv/bin/activate
    python export_v6_onnx.py
"""

import os

import json
import shutil
import torch
from pathlib import Path
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from peft import PeftModel

# ==============================================================================
# CONFIG
# ==============================================================================

BASE_MODEL = "Qwen/Qwen3-1.7B"
CHECKPOINT_DIR = Path("outputs/ferni-router-v6")
MERGED_DIR = Path("outputs/ferni-router-v6-merged")  # Intermediate merged model
OUTPUT_DIR = Path("outputs/ferni-router-v6-onnx")
MAX_LENGTH = 128

# ==============================================================================
# EXPORT
# ==============================================================================

def main():
    print("🚀 Exporting Ferni Router V6 to ONNX")
    print("=" * 60)

    # Load label map to get num_labels
    with open(CHECKPOINT_DIR / "label_map.json") as f:
        label_map = json.load(f)
    num_labels = len(label_map)
    print(f"📊 {num_labels} tool labels")

    # Load tokenizer from the final checkpoint
    final_dir = CHECKPOINT_DIR / "final"
    print(f"\n📝 Loading tokenizer from {final_dir}...")
    tokenizer = AutoTokenizer.from_pretrained(final_dir, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # Load base model with classification head
    # V6 uses single_label_classification (CrossEntropyLoss, not BCEWithLogitsLoss)
    print(f"\n🤖 Loading base model: {BASE_MODEL}")
    base_model = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL,
        num_labels=num_labels,
        problem_type="single_label_classification",
        trust_remote_code=True,
        torch_dtype=torch.float32,  # ONNX export needs float32
    )
    base_model.config.pad_token_id = tokenizer.pad_token_id

    # Load LoRA adapter from final checkpoint
    print(f"\n🔌 Loading LoRA adapter from: {final_dir}")
    model = PeftModel.from_pretrained(base_model, str(final_dir))

    # Merge LoRA weights into base model (required for ONNX export)
    print("\n🔀 Merging LoRA weights into base model...")
    model = model.merge_and_unload()
    model.config.use_cache = False  # Disable KV cache for ONNX (avoids DynamicCache JIT error)
    model.eval()

    # Save merged model
    print(f"\n💾 Saving merged model to: {MERGED_DIR}")
    MERGED_DIR.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(MERGED_DIR, safe_serialization=True)
    tokenizer.save_pretrained(MERGED_DIR)

    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Prepare dummy input
    print(f"\n📦 Exporting to ONNX (max_length={MAX_LENGTH})...")
    dummy_input = tokenizer(
        "play some music",
        return_tensors="pt",
        max_length=MAX_LENGTH,
        truncation=True,
        padding="max_length"
    )

    onnx_path = OUTPUT_DIR / "model.onnx"

    # Export with dynamo=False to use legacy TorchScript exporter
    # (dynamo/onnxscript has bugs on Python 3.14)
    torch.onnx.export(
        model,
        (dummy_input["input_ids"], dummy_input["attention_mask"]),
        str(onnx_path),
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch_size"},
            "attention_mask": {0: "batch_size"},
            "logits": {0: "batch_size"},
        },
        opset_version=14,
        do_constant_folding=True,
        export_params=True,
        dynamo=False,
    )

    # Consolidate external data into single file (Rust ONNX Runtime expects model.onnx_data)
    import onnx
    print("\n📦 Consolidating external data...")
    onnx_model = onnx.load(str(onnx_path), load_external_data=True)
    onnx.save_model(
        onnx_model,
        str(onnx_path),
        save_as_external_data=True,
        all_tensors_to_one_file=True,
        location="model.onnx_data",
        size_threshold=1024,
    )
    # Clean up individual tensor files left by torch export
    kept_names = {"model.onnx", "model.onnx_data"}
    for p in OUTPUT_DIR.iterdir():
        if p.is_file() and p.name not in kept_names and p.name.startswith("onnx__"):
            p.unlink()
    del onnx_model

    # Copy label map
    shutil.copy(CHECKPOINT_DIR / "label_map.json", OUTPUT_DIR / "label_map.json")

    # Save tokenizer in ONNX-compatible format
    print("\n💾 Saving tokenizer...")
    tokenizer.save_pretrained(OUTPUT_DIR / "tokenizer")

    # Also save the raw tokenizer.json for Rust
    tokenizer_json = OUTPUT_DIR / "tokenizer" / "tokenizer.json"
    if tokenizer_json.exists():
        shutil.copy(tokenizer_json, OUTPUT_DIR / "tokenizer.json")

    # Get file sizes
    print("\n" + "=" * 60)
    print("✅ EXPORT COMPLETE!")
    print(f"📁 Output: {OUTPUT_DIR}")
    print("\nFiles created:")

    total_size = 0
    for p in sorted(OUTPUT_DIR.rglob("*")):
        if p.is_file():
            size_mb = p.stat().st_size / (1024 * 1024)
            total_size += size_mb
            print(f"  {p.relative_to(OUTPUT_DIR)}: {size_mb:.1f} MB")

    print(f"\nTotal size: {total_size:.1f} MB")

    print("\n📋 Deploy to models/ directory:")
    print(f"""
    mkdir -p models/ferni-router-v6-860
    cp {OUTPUT_DIR}/model.onnx models/ferni-router-v6-860/
    cp {OUTPUT_DIR}/tokenizer.json models/ferni-router-v6-860/
    cp {CHECKPOINT_DIR}/label_map.json models/ferni-router-v6-860/
    """)

    # Check for external data file (large models split ONNX data)
    onnx_data = OUTPUT_DIR / "model.onnx_data"
    if onnx_data.exists():
        print(f"⚠️  External data file detected: {onnx_data}")
        print(f"    Also copy: cp {onnx_data} models/ferni-router-v6-860/")


if __name__ == "__main__":
    main()
