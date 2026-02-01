#!/usr/bin/env python3
"""
Export FTIS V3 model to ONNX format for production inference.

IMPORTANT: Run with Python 3.12 venv (ONNX doesn't support Python 3.14 yet):
  source .venv312/bin/activate
  python export_v3_onnx.py
"""

import sys
import json
import shutil
import torch
import onnx
from pathlib import Path
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from peft import PeftModel
import numpy as np

# ==============================================================================
# CONFIG
# ==============================================================================

BASE_MODEL = "Qwen/Qwen3-1.7B"
CHECKPOINT_DIR = Path("outputs/ferni-router-v3/final")
DATA_DIR = Path("data")
OUTPUT_DIR = Path("/Users/sethford/Documents/voiceai/models/ferni-router-v3")

MAX_LENGTH = 128
OPSET_VERSION = 17  # Latest stable ONNX opset

# ==============================================================================
# MAIN
# ==============================================================================

def main():
    print("=" * 60)
    print("🚀 FTIS V3 ONNX Export")
    print("=" * 60)

    # Check Python version
    if sys.version_info >= (3, 14):
        print("⚠️  WARNING: Python 3.14+ detected - ONNX may not work!")
        print("   Use: source .venv312/bin/activate && python export_v3_onnx.py")

    # Load tokenizer
    print("\n📦 Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(CHECKPOINT_DIR, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    print(f"   ✅ Tokenizer: {tokenizer.__class__.__name__}")

    # Load label map
    print("\n📋 Loading label map...")
    with open(DATA_DIR / "label_map.json", 'r') as f:
        label_map = json.load(f)
    print(f"   ✅ {len(label_map)} tools")

    # Load base model
    print("\n🧠 Loading base model...")
    base_model = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL,
        num_labels=len(label_map),
        problem_type='multi_label_classification',
        trust_remote_code=True,
        torch_dtype=torch.float32,  # Use fp32 for ONNX compatibility
    )
    base_model.config.pad_token_id = tokenizer.pad_token_id
    print(f"   ✅ Base model loaded: {base_model.__class__.__name__}")

    # Load PEFT adapter
    print("\n🔄 Loading LoRA adapter...")
    model = PeftModel.from_pretrained(base_model, str(CHECKPOINT_DIR))
    print("   ✅ PEFT adapter loaded")

    # Merge LoRA weights
    print("\n🔗 Merging LoRA weights...")
    model = model.merge_and_unload()
    model.eval()
    print(f"   ✅ Merged model: {sum(p.numel() for p in model.parameters()):,} params")

    # Prepare dummy input
    print("\n📊 Preparing export...")
    dummy_text = "play some music"
    dummy_input = tokenizer(
        dummy_text,
        padding='max_length',
        truncation=True,
        max_length=MAX_LENGTH,
        return_tensors='pt'
    )

    input_ids = dummy_input['input_ids']
    attention_mask = dummy_input['attention_mask']

    # Verify model works
    print("   Testing inference...")
    with torch.no_grad():
        output = model(input_ids=input_ids, attention_mask=attention_mask)
        probs = torch.sigmoid(output.logits)
        print(f"   ✅ Test inference: {probs.max():.4f} max confidence")

    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Export to ONNX
    print(f"\n📤 Exporting to ONNX (opset {OPSET_VERSION})...")
    onnx_path = OUTPUT_DIR / "model.onnx"

    torch.onnx.export(
        model,
        (input_ids, attention_mask),
        str(onnx_path),
        input_names=['input_ids', 'attention_mask'],
        output_names=['logits'],
        dynamic_axes={
            'input_ids': {0: 'batch_size', 1: 'sequence_length'},
            'attention_mask': {0: 'batch_size', 1: 'sequence_length'},
            'logits': {0: 'batch_size'},
        },
        opset_version=OPSET_VERSION,
        do_constant_folding=True,
    )
    print(f"   ✅ Exported: {onnx_path}")

    # Verify ONNX model
    print("\n🔍 Verifying ONNX model...")
    onnx_model = onnx.load(str(onnx_path))
    onnx.checker.check_model(onnx_model)
    print("   ✅ ONNX model is valid")

    # Test with ONNX Runtime
    print("\n🏃 Testing with ONNX Runtime...")
    import onnxruntime as ort

    session = ort.InferenceSession(str(onnx_path), providers=['CPUExecutionProvider'])

    ort_inputs = {
        'input_ids': input_ids.numpy(),
        'attention_mask': attention_mask.numpy(),
    }
    ort_outputs = session.run(None, ort_inputs)
    onnx_probs = 1 / (1 + np.exp(-ort_outputs[0]))  # Sigmoid

    print(f"   ✅ ONNX inference: {onnx_probs.max():.4f} max confidence")

    # Compare outputs
    diff = np.abs(probs.numpy() - onnx_probs).max()
    print(f"   ✅ Max difference from PyTorch: {diff:.6f}")

    # Save tokenizer
    print("\n💾 Saving tokenizer...")
    tokenizer.save_pretrained(OUTPUT_DIR)
    print(f"   ✅ Tokenizer saved")

    # Save label map
    shutil.copy(DATA_DIR / "label_map.json", OUTPUT_DIR / "label_map.json")
    print(f"   ✅ Label map saved")

    # Create config file
    config = {
        "version": "3.0.0",
        "base_model": BASE_MODEL,
        "num_labels": len(label_map),
        "max_length": MAX_LENGTH,
        "optimal_threshold": 0.05,
        "opset_version": OPSET_VERSION,
        "exported_at": str(Path(__file__).parent / "export_v3_onnx.py"),
        "metrics": {
            "tool_accuracy": 0.957,
            "open_intent_accuracy": 1.0,
            "avg_latency_ms": 114.6,
        }
    }
    with open(OUTPUT_DIR / "config.json", 'w') as f:
        json.dump(config, f, indent=2)
    print(f"   ✅ Config saved")

    # Calculate sizes
    onnx_size = onnx_path.stat().st_size / 1024 / 1024
    total_size = sum(f.stat().st_size for f in OUTPUT_DIR.rglob("*") if f.is_file()) / 1024 / 1024

    print("\n" + "=" * 60)
    print("🎉 EXPORT COMPLETE!")
    print("=" * 60)
    print(f"📁 Output: {OUTPUT_DIR}")
    print(f"📊 ONNX size: {onnx_size:.1f} MB")
    print(f"📊 Total size: {total_size:.1f} MB")
    print(f"\n📋 Config:")
    print(json.dumps(config, indent=2))

if __name__ == "__main__":
    main()
