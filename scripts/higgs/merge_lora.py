#!/usr/bin/env python3
"""Merge LoRA adapter weights into the base Higgs Audio V2 model.

This produces a single set of merged safetensors that can be loaded
directly by the Rust server without any runtime LoRA overhead.

Usage:
    python scripts/higgs/merge_lora.py \
        --base models/higgs-audio-v2 \
        --lora models/higgs-v2-ferni-lora \
        --output models/higgs-v2-ferni

    # Then run the Rust server with merged weights:
    ./target/release/higgs-tts-server --model-path models/higgs-v2-ferni
"""

import argparse
import json
import shutil
import sys
from pathlib import Path


def check_dependencies():
    missing = []
    for pkg in ["transformers", "peft", "torch"]:
        try:
            __import__(pkg)
        except ImportError:
            missing.append(pkg)
    if missing:
        print(f"Missing: {', '.join(missing)}")
        print(f"Install: pip install {' '.join(missing)}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Merge LoRA adapter into Higgs Audio V2 base model")
    parser.add_argument("--base", type=Path, default=Path("models/higgs-audio-v2"),
                        help="Path to base model")
    parser.add_argument("--lora", type=Path, required=True,
                        help="Path to LoRA adapter directory")
    parser.add_argument("--output", type=Path, default=None,
                        help="Output path for merged model (default: <lora>-merged)")
    parser.add_argument("--dtype", type=str, default="float32", choices=["float32", "float16", "bfloat16"],
                        help="Output dtype (default: float32)")
    args = parser.parse_args()

    output = args.output or Path(str(args.lora) + "-merged")

    print("=" * 60)
    print("  Higgs Audio V2 — LoRA Weight Merge")
    print("=" * 60)
    print(f"  Base model: {args.base}")
    print(f"  LoRA:       {args.lora}")
    print(f"  Output:     {output}")
    print(f"  dtype:      {args.dtype}")
    print()

    check_dependencies()

    import torch
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer

    dtype_map = {
        "float32": torch.float32,
        "float16": torch.float16,
        "bfloat16": torch.bfloat16,
    }
    torch_dtype = dtype_map[args.dtype]

    # Load base model
    print("Loading base model...")
    base_model = AutoModelForCausalLM.from_pretrained(
        str(args.base),
        trust_remote_code=True,
        torch_dtype=torch_dtype,
        device_map="cpu",
    )

    # Load LoRA adapter
    print("Loading LoRA adapter...")
    model = PeftModel.from_pretrained(base_model, str(args.lora))

    # Merge weights
    print("Merging LoRA weights into base model...")
    merged = model.merge_and_unload()

    # Count changed parameters
    base_params = sum(p.numel() for p in base_model.parameters())
    merged_params = sum(p.numel() for p in merged.parameters())
    print(f"  Base params:   {base_params:,}")
    print(f"  Merged params: {merged_params:,}")

    # Save merged model
    print(f"\nSaving merged model to {output}...")
    output.mkdir(parents=True, exist_ok=True)
    merged.save_pretrained(str(output), safe_serialization=True)

    # Copy tokenizer and config files
    print("Copying tokenizer and config files...")
    for filename in [
        "tokenizer.json",
        "tokenizer_config.json",
        "special_tokens_map.json",
        "config.json",
        "generation_config.json",
    ]:
        src = args.base / filename
        if src.exists():
            shutil.copy2(src, output / filename)
            print(f"  Copied {filename}")

    # Copy xcodec decoder if present
    decoder_path = args.base / "xcodec_decoder.onnx"
    if decoder_path.exists():
        shutil.copy2(decoder_path, output / "xcodec_decoder.onnx")
        print("  Copied xcodec_decoder.onnx")

    # Save merge metadata
    metadata = {
        "base_model": str(args.base),
        "lora_adapter": str(args.lora),
        "dtype": args.dtype,
        "merge_method": "peft_merge_and_unload",
    }

    # Load training config if available
    training_config = args.lora / "training_config.json"
    if training_config.exists():
        with open(training_config) as f:
            metadata["training_config"] = json.load(f)

    with open(output / "merge_metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    # Report sizes
    total_size = sum(f.stat().st_size for f in output.glob("*.safetensors"))
    print(f"\nMerged model size: {total_size / 1024 / 1024 / 1024:.1f} GB")

    print()
    print("=" * 60)
    print("  Merge complete!")
    print()
    print("  Run the Rust server with merged weights:")
    print(f"    ./target/release/higgs-tts-server --model-path {output}")
    print()
    print("  Quick test:")
    print(f"    curl -X POST http://localhost:8501/v1/audio/speech \\")
    print(f'      -d \'{{"input":"Hello! This is Ferni speaking.","voice":"ferni"}}\' \\')
    print(f"      -o test_ferni.wav && afplay test_ferni.wav")
    print("=" * 60)


if __name__ == "__main__":
    main()
