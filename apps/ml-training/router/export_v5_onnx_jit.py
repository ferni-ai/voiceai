#!/usr/bin/env python3
"""
Export FTIS V5 to ONNX using TorchScript JIT (avoids onnxscript bug).

Usage:
    cd apps/ml-training/router
    source .venv/bin/activate
    python export_v5_onnx_jit.py
"""

import json
import shutil
import torch
import torch.nn as nn
from pathlib import Path
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from peft import PeftModel

# ==============================================================================
# CONFIG
# ==============================================================================

BASE_MODEL = "Qwen/Qwen3-1.7B"
CHECKPOINT_DIR = Path("outputs/ferni-router-v5-qwen3")
OUTPUT_DIR = Path("outputs/ferni-router-v5-onnx")
MAX_LENGTH = 128

# ==============================================================================
# WRAPPER MODEL FOR CLEAN ONNX EXPORT
# ==============================================================================

class ClassifierWrapper(nn.Module):
    """Wrapper to make model exportable to ONNX."""
    def __init__(self, model):
        super().__init__()
        self.model = model
        
    def forward(self, input_ids, attention_mask):
        outputs = self.model(input_ids=input_ids, attention_mask=attention_mask)
        return outputs.logits

# ==============================================================================
# MAIN
# ==============================================================================

def main():
    print("🚀 Exporting FTIS V5 to ONNX (JIT method)")
    print("=" * 60)
    
    # Load label map
    with open(CHECKPOINT_DIR / "label_map.json") as f:
        label_map = json.load(f)
    num_labels = len(label_map)
    print(f"📊 {num_labels} tool labels")
    
    # Load tokenizer
    print("\n📝 Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(CHECKPOINT_DIR, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    
    # Load model
    print(f"\n🤖 Loading model: {BASE_MODEL}")
    base_model = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL,
        num_labels=num_labels,
        problem_type='multi_label_classification',
        trust_remote_code=True,
        torch_dtype=torch.float32,
    )
    base_model.config.pad_token_id = tokenizer.pad_token_id
    
    # Load LoRA adapter and merge
    print(f"\n🔌 Loading LoRA from: {CHECKPOINT_DIR}")
    model = PeftModel.from_pretrained(base_model, str(CHECKPOINT_DIR))
    print("\n🔀 Merging LoRA weights...")
    model = model.merge_and_unload()
    model.eval()
    
    # Wrap for clean ONNX export
    print("\n📦 Creating wrapper model...")
    wrapper = ClassifierWrapper(model)
    wrapper.eval()
    
    # Create dummy input
    dummy_input = tokenizer(
        "play some music",
        return_tensors="pt",
        max_length=MAX_LENGTH,
        truncation=True,
        padding="max_length"
    )
    
    # Trace the model
    print("\n⚡ Tracing model with TorchScript...")
    traced = torch.jit.trace(
        wrapper,
        (dummy_input["input_ids"], dummy_input["attention_mask"]),
        strict=False
    )
    
    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    onnx_path = OUTPUT_DIR / "model.onnx"
    
    # Save TorchScript model (for now, ONNX export has Python 3.14 bug)
    torchscript_path = OUTPUT_DIR / "model.pt"
    print(f"\n💾 Saving TorchScript: {torchscript_path}")
    traced.save(str(torchscript_path))
    
    # Also try ONNX export with monkey-patched onnxscript
    onnx_path = OUTPUT_DIR / "model.onnx"
    print(f"\n💾 Attempting ONNX export: {onnx_path}")
    
    try:
        # Try to use torch.onnx.export directly
        from torch import onnx as torch_onnx
        torch_onnx.export(
            traced,
            (dummy_input["input_ids"], dummy_input["attention_mask"]),
            str(onnx_path),
            input_names=["input_ids", "attention_mask"],
            output_names=["logits"],
            dynamic_axes={
                "input_ids": {0: "batch"},
                "attention_mask": {0: "batch"},
                "logits": {0: "batch"},
            },
            opset_version=14,
            do_constant_folding=True,
        )
        print(f"✅ ONNX export succeeded!")
    except Exception as e:
        print(f"⚠️ ONNX export failed: {e}")
        print("   TorchScript model saved - can convert to ONNX on GCE VM or older Python")
    
    # Copy supporting files
    shutil.copy(CHECKPOINT_DIR / "label_map.json", OUTPUT_DIR / "label_map.json")
    
    # Save tokenizer
    print("\n💾 Saving tokenizer...")
    tokenizer.save_pretrained(OUTPUT_DIR / "tokenizer")
    tokenizer_json = OUTPUT_DIR / "tokenizer" / "tokenizer.json"
    if tokenizer_json.exists():
        shutil.copy(tokenizer_json, OUTPUT_DIR / "tokenizer.json")
    
    # Summary
    print("\n" + "=" * 60)
    print("✅ EXPORT COMPLETE!")
    print(f"📁 Output: {OUTPUT_DIR}")
    print("\nFiles:")
    
    total_size = 0
    for p in sorted(OUTPUT_DIR.rglob("*")):
        if p.is_file():
            size_mb = p.stat().st_size / (1024 * 1024)
            total_size += size_mb
            print(f"  {p.relative_to(OUTPUT_DIR)}: {size_mb:.1f} MB")
    
    print(f"\nTotal: {total_size:.1f} MB")

if __name__ == "__main__":
    main()
