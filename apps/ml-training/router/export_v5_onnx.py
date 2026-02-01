#!/usr/bin/env python3
"""
Export FTIS V5 (Qwen3-1.7B LoRA) to ONNX for fast Rust inference.

The Rust ONNX runtime achieves ~20-50ms latency vs ~700ms in Python/PyTorch.

Usage:
    cd apps/ml-training/router
    source .venv/bin/activate
    python export_v5_onnx.py
"""

import os
# Force legacy ONNX exporter (onnxscript has bugs with Python 3.14)
os.environ["TORCH_ONNX_USE_OLD_EXPORTER"] = "1"

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
CHECKPOINT_DIR = Path("outputs/ferni-router-v5-qwen3")
MERGED_DIR = Path("outputs/ferni-router-v5-merged")  # Intermediate merged model
OUTPUT_DIR = Path("outputs/ferni-router-v5-onnx")
MAX_LENGTH = 128

# ==============================================================================
# EXPORT
# ==============================================================================

def main():
    print("🚀 Exporting FTIS V5 to ONNX")
    print("=" * 60)
    
    # Load label map to get num_labels
    with open(CHECKPOINT_DIR / "label_map.json") as f:
        label_map = json.load(f)
    num_labels = len(label_map)
    print(f"📊 {num_labels} tool labels")
    
    # Load tokenizer from checkpoint
    print("\n📝 Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(CHECKPOINT_DIR, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    
    # Load base model with classification head
    print(f"\n🤖 Loading base model: {BASE_MODEL}")
    base_model = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL,
        num_labels=num_labels,
        problem_type='multi_label_classification',
        trust_remote_code=True,
        torch_dtype=torch.float32,  # ONNX export needs float32
    )
    base_model.config.pad_token_id = tokenizer.pad_token_id
    
    # Load LoRA adapter
    print(f"\n🔌 Loading LoRA adapter from: {CHECKPOINT_DIR}")
    model = PeftModel.from_pretrained(base_model, str(CHECKPOINT_DIR))
    
    # Merge LoRA weights into base model (required for ONNX export)
    print("\n🔀 Merging LoRA weights into base model...")
    model = model.merge_and_unload()
    model.eval()
    
    # Save merged model for optimum export
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
    
    # Export with legacy API (onnxscript has bugs with Python 3.14)
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
        verbose=False,
    )
    
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
    
    print("\n🦀 To use with Rust ONNX router:")
    print(f"""
    import {{ OnnxRouter }} from '@ferni/rust-perf';
    
    const router = new OnnxRouter({{
        modelPath: '{OUTPUT_DIR / "model.onnx"}',
        tokenizerPath: '{OUTPUT_DIR / "tokenizer.json"}',
        labelMapPath: '{OUTPUT_DIR / "label_map.json"}',
        maxLength: {MAX_LENGTH},
        threshold: 0.05,
        topK: 5,
    }});
    
    router.warmup();
    const result = router.predict("play some music");
    console.log(result); // ~20-50ms latency!
    """)

if __name__ == "__main__":
    main()
