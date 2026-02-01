#!/usr/bin/env python3
"""
Export FTIS V3 model for Candle GPU inference (safetensors format).

Merges LoRA adapter with base model and saves as safetensors files
that can be loaded directly by Rust Candle (no ONNX conversion!).

This gives us Metal GPU acceleration on Apple Silicon with ~50ms inference.

Usage:
  source .venv312/bin/activate
  python export_for_candle.py
"""

import sys
import json
import torch
from pathlib import Path
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from peft import PeftModel
from safetensors.torch import save_file
from datetime import datetime

# ==============================================================================
# CONFIG
# ==============================================================================

BASE_MODEL = "Qwen/Qwen3-1.7B"
CHECKPOINT_DIR = Path("outputs/ferni-router-v3/final")
DATA_DIR = Path("data")
OUTPUT_DIR = Path("/Users/sethford/Documents/voiceai/models/ferni-router-candle")

MAX_LENGTH = 128


def main():
    print("=" * 60)
    print("🚀 FTIS V3 Export for Candle (safetensors)")
    print("=" * 60)

    if sys.version_info >= (3, 14):
        print("⚠️  WARNING: Python 3.14+ detected")
        sys.exit(1)

    print(f"   Python: {sys.version_info.major}.{sys.version_info.minor}")

    # Load label map to get num_labels
    print("\n📋 Loading label map...")
    with open(DATA_DIR / "label_map.json", 'r') as f:
        label_map = json.load(f)
    num_labels = len(label_map)
    print(f"   ✅ {num_labels} tools")

    # Load tokenizer
    print("\n📦 Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(CHECKPOINT_DIR, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    print(f"   ✅ Tokenizer loaded")

    # Load base model for sequence classification
    print("\n🧠 Loading base model...")
    base_model = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL,
        num_labels=num_labels,
        problem_type='multi_label_classification',
        trust_remote_code=True,
        torch_dtype=torch.float32,  # Use fp32 for compatibility
    )
    base_model.config.pad_token_id = tokenizer.pad_token_id
    print(f"   ✅ Base model loaded: {base_model.__class__.__name__}")

    # Load PEFT adapter
    print("\n🔄 Loading LoRA adapter...")
    model = PeftModel.from_pretrained(base_model, str(CHECKPOINT_DIR))
    print("   ✅ PEFT adapter loaded")

    # Merge LoRA weights into base model
    print("\n🔗 Merging LoRA weights...")
    model = model.merge_and_unload()
    model.eval()
    print(f"   ✅ Merged model: {sum(p.numel() for p in model.parameters()):,} params")

    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Save merged model in safetensors format
    print(f"\n💾 Saving merged model to {OUTPUT_DIR}...")

    # Get state dict
    state_dict = model.state_dict()

    # Count tensors and estimate size
    total_params = sum(t.numel() for t in state_dict.values())
    print(f"   Total parameters: {total_params:,}")

    # Split into multiple files if too large (Candle expects index file for large models)
    # Qwen3-1.7B is ~6.4GB in fp32, need to split
    MAX_SHARD_SIZE = 2 * 1024 * 1024 * 1024  # 2GB per shard

    # Group tensors by prefix for logical sharding
    shards = {}
    current_shard = {}
    current_shard_size = 0
    shard_idx = 0

    for name, tensor in state_dict.items():
        tensor_size = tensor.numel() * tensor.element_size()

        if current_shard_size + tensor_size > MAX_SHARD_SIZE and current_shard:
            # Save current shard
            shard_filename = f"model-{shard_idx + 1:05d}-of-{99999:05d}.safetensors"  # Placeholder
            shards[shard_idx] = current_shard
            shard_idx += 1
            current_shard = {}
            current_shard_size = 0

        current_shard[name] = tensor
        current_shard_size += tensor_size

    # Don't forget the last shard
    if current_shard:
        shards[shard_idx] = current_shard

    total_shards = len(shards)
    print(f"   Splitting into {total_shards} shard(s)")

    # Build weight map for index file
    weight_map = {}

    for idx, shard_tensors in shards.items():
        shard_filename = f"model-{idx + 1:05d}-of-{total_shards:05d}.safetensors"
        shard_path = OUTPUT_DIR / shard_filename

        # Save shard
        save_file(shard_tensors, str(shard_path))
        print(f"   ✅ Saved {shard_filename} ({len(shard_tensors)} tensors)")

        # Record in weight map
        for name in shard_tensors.keys():
            weight_map[name] = shard_filename

    # Create model.safetensors.index.json
    index = {
        "metadata": {
            "total_size": sum(t.numel() * t.element_size() for t in state_dict.values())
        },
        "weight_map": weight_map
    }
    index_path = OUTPUT_DIR / "model.safetensors.index.json"
    with open(index_path, 'w') as f:
        json.dump(index, f, indent=2)
    print(f"   ✅ Saved model.safetensors.index.json")

    # Save config.json (Candle needs this)
    config_dict = model.config.to_dict()
    config_dict["num_labels"] = num_labels
    config_dict["problem_type"] = "multi_label_classification"
    config_path = OUTPUT_DIR / "config.json"
    with open(config_path, 'w') as f:
        json.dump(config_dict, f, indent=2)
    print(f"   ✅ Saved config.json")

    # Save tokenizer
    tokenizer.save_pretrained(OUTPUT_DIR)
    print(f"   ✅ Saved tokenizer files")

    # Save label map
    label_map_path = OUTPUT_DIR / "label_map.json"
    with open(label_map_path, 'w') as f:
        json.dump(label_map, f, indent=2)
    print(f"   ✅ Saved label_map.json")

    # Create metadata file
    metadata = {
        "version": "3.0.1",
        "base_model": BASE_MODEL,
        "num_labels": num_labels,
        "max_length": MAX_LENGTH,
        "optimal_threshold": 0.05,
        "exported_at": datetime.now().isoformat(),
        "export_format": "safetensors",
        "target_runtime": "candle",
        "training_checkpoint": str(CHECKPOINT_DIR),
        "metrics": {
            "tool_f1": 0.8324,
            "top1_accuracy": 0.8447,
            "top3_accuracy": 0.9094,
            "open_intent_accuracy": 1.0,
        }
    }
    metadata_path = OUTPUT_DIR / "metadata.json"
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"   ✅ Saved metadata.json")

    # Calculate total size
    total_size_mb = sum(f.stat().st_size for f in OUTPUT_DIR.rglob("*") if f.is_file()) / 1024 / 1024

    print("\n" + "=" * 60)
    print("🎉 EXPORT COMPLETE!")
    print("=" * 60)
    print(f"📁 Output: {OUTPUT_DIR}")
    print(f"📊 Total size: {total_size_mb:.1f} MB")
    print(f"📋 Files:")
    for f in sorted(OUTPUT_DIR.glob("*")):
        size_mb = f.stat().st_size / 1024 / 1024
        print(f"   - {f.name} ({size_mb:.1f} MB)")

    # Verify with quick test
    print("\n🧪 Quick verification...")
    test_input = tokenizer("play some music", return_tensors="pt", padding="max_length", max_length=MAX_LENGTH, truncation=True)
    with torch.no_grad():
        outputs = model(**test_input)
        probs = torch.sigmoid(outputs.logits)
        top_idx = probs.argmax().item()
        top_prob = probs[0, top_idx].item()

    # Get label name
    idx_to_label = {v: k for k, v in label_map.items()}
    top_label = idx_to_label.get(top_idx, "unknown")

    print(f"   Test: 'play some music' → {top_label} ({top_prob:.2%})")
    print(f"\n✅ Ready for Candle GPU inference!")


if __name__ == "__main__":
    main()
