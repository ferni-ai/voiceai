#!/usr/bin/env python3
"""
Export Ferni Router V7 (two-stage Qwen3-1.7B LoRA) to ONNX.

V7 uses hierarchical classification:
  Stage 1: query → domain (44 classes)
  Stage 2: [domain] query → meta_tool (112 classes)

Each stage gets its own ONNX model, tokenizer, and label map.

Usage:
    cd apps/ml-training/router
    source .venv/bin/activate
    python export_v7_onnx.py                    # Export both stages
    python export_v7_onnx.py --stage stage1     # Export stage 1 only
    python export_v7_onnx.py --stage stage2     # Export stage 2 only
"""

import os
import argparse
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
MAX_LENGTH = 128

STAGES = {
    "stage1": {
        "checkpoint_dir": Path("outputs/ferni-router-v7-stage1"),
        "merged_dir": Path("outputs/ferni-router-v7-stage1-merged"),
        "output_dir": Path("outputs/ferni-router-v7-stage1-onnx"),
        "deploy_dir": "models/ferni-router-v7-stage1",
        "description": "Domain classifier (44 classes)",
    },
    "stage2": {
        "checkpoint_dir": Path("outputs/ferni-router-v7-stage2"),
        "merged_dir": Path("outputs/ferni-router-v7-stage2-merged"),
        "output_dir": Path("outputs/ferni-router-v7-stage2-onnx"),
        "deploy_dir": "models/ferni-router-v7-stage2",
        "description": "Meta-tool classifier (112 classes)",
    },
}


def export_stage(stage_name: str, config: dict) -> bool:
    """Export a single stage to ONNX. Returns True on success."""

    checkpoint_dir = config["checkpoint_dir"]
    merged_dir = config["merged_dir"]
    output_dir = config["output_dir"]

    print(f"\n{'='*60}")
    print(f"Exporting V7 {stage_name}: {config['description']}")
    print(f"{'='*60}")

    # Check checkpoint exists
    final_dir = checkpoint_dir / "final"
    if not final_dir.exists():
        # Try checkpoint_dir directly (in case final/ wasn't saved)
        if not (checkpoint_dir / "adapter_config.json").exists():
            print(f"❌ Checkpoint not found: {final_dir}")
            print(f"   Train with: python train.py --config config_v7_{stage_name}.yaml")
            return False
        final_dir = checkpoint_dir

    # Load label map
    label_map_path = checkpoint_dir / "label_map.json"
    if not label_map_path.exists():
        print(f"❌ Label map not found: {label_map_path}")
        return False

    with open(label_map_path) as f:
        label_map = json.load(f)
    num_labels = len(label_map)
    print(f"📊 {num_labels} labels")

    # Load tokenizer
    print(f"📝 Loading tokenizer from {final_dir}...")
    tokenizer = AutoTokenizer.from_pretrained(final_dir, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # Load base model
    print(f"🤖 Loading base model: {BASE_MODEL}")
    base_model = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL,
        num_labels=num_labels,
        problem_type="single_label_classification",
        trust_remote_code=True,
        torch_dtype=torch.float32,
    )
    base_model.config.pad_token_id = tokenizer.pad_token_id

    # Load LoRA adapter
    print(f"🔌 Loading LoRA adapter from: {final_dir}")
    model = PeftModel.from_pretrained(base_model, str(final_dir))

    # Merge LoRA weights
    print("🔀 Merging LoRA weights...")
    model = model.merge_and_unload()
    model.config.use_cache = False  # Disable KV cache for ONNX (avoids DynamicCache JIT error)
    model.eval()

    # Save merged model
    merged_dir.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(merged_dir, safe_serialization=True)
    tokenizer.save_pretrained(merged_dir)

    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)

    # Prepare dummy input
    test_query = "[calendar] schedule a meeting" if stage_name == "stage2" else "schedule a meeting"
    print(f"📦 Exporting to ONNX (max_length={MAX_LENGTH})...")
    dummy_input = tokenizer(
        test_query,
        return_tensors="pt",
        max_length=MAX_LENGTH,
        truncation=True,
        padding="max_length",
    )

    onnx_path = output_dir / "model.onnx"

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
    print("📦 Consolidating external data...")
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
    for p in output_dir.iterdir():
        if p.is_file() and p.name not in kept_names and p.name.startswith("onnx__"):
            p.unlink()
    del onnx_model

    # Copy label map
    shutil.copy(label_map_path, output_dir / "label_map.json")

    # Save tokenizer
    tokenizer.save_pretrained(output_dir / "tokenizer")
    tokenizer_json = output_dir / "tokenizer" / "tokenizer.json"
    if tokenizer_json.exists():
        shutil.copy(tokenizer_json, output_dir / "tokenizer.json")

    # Print file sizes
    total_size = 0
    print(f"\n📁 Output: {output_dir}")
    for p in sorted(output_dir.rglob("*")):
        if p.is_file():
            size_mb = p.stat().st_size / (1024 * 1024)
            total_size += size_mb
            print(f"  {p.relative_to(output_dir)}: {size_mb:.1f} MB")
    print(f"  Total: {total_size:.1f} MB")

    return True


def main():
    parser = argparse.ArgumentParser(description="Export V7 router models to ONNX")
    parser.add_argument(
        "--stage",
        choices=["stage1", "stage2", "both"],
        default="both",
        help="Which stage to export (default: both)",
    )
    args = parser.parse_args()

    print("🚀 Exporting Ferni Router V7 to ONNX")

    stages_to_export = ["stage1", "stage2"] if args.stage == "both" else [args.stage]

    results = {}
    for stage in stages_to_export:
        results[stage] = export_stage(stage, STAGES[stage])

    # Summary
    print(f"\n{'='*60}")
    print("EXPORT SUMMARY")
    print(f"{'='*60}")
    for stage, success in results.items():
        status = "✅" if success else "❌"
        print(f"  {status} {stage}: {STAGES[stage]['description']}")

    if all(results.values()):
        print("\n📋 Deploy to models/ directory:")
        for stage in stages_to_export:
            config = STAGES[stage]
            print(f"""
    # {stage}
    mkdir -p {config['deploy_dir']}
    cp {config['output_dir']}/model.onnx {config['deploy_dir']}/
    cp {config['output_dir']}/tokenizer.json {config['deploy_dir']}/
    cp {config['checkpoint_dir']}/label_map.json {config['deploy_dir']}/""")

            # Check for external data
            onnx_data = config['output_dir'] / "model.onnx_data"
            if onnx_data.exists():
                print(f"    cp {onnx_data} {config['deploy_dir']}/")

        print("\n\n🦀 V7 uses two models in sequence:")
        print("    1. Stage 1 classifies: query → domain")
        print("    2. Stage 2 classifies: [domain] query → meta_tool")


if __name__ == "__main__":
    main()
