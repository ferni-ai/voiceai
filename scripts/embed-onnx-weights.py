#!/usr/bin/env python3
"""
Embed ONNX external data into a single .onnx file.

Use this so Core ML (macOS) can load FTIS router models that were exported
with separate .onnx_data files. Core ML does not support external data;
embedding weights produces a single file that Core ML can use.

Usage:
    python scripts/embed-onnx-weights.py models/ferni-router-v7-stage1
    python scripts/embed-onnx-weights.py models/ferni-router-v7-stage2

Creates model_embedded.onnx in the same directory. Point the classifier at
model_embedded.onnx on macOS to use Core ML (Apple GPU/ANE).
"""

import argparse
import os
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Embed ONNX external data into a single file")
    parser.add_argument(
        "model_dir",
        type=str,
        help="Directory containing model.onnx (and optionally model.onnx_data)",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=str,
        default=None,
        help="Output path (default: <model_dir>/model_embedded.onnx)",
    )
    args = parser.parse_args()

    try:
        import onnx
    except ImportError:
        print("pip install onnx", file=sys.stderr)
        sys.exit(1)

    model_dir = os.path.abspath(args.model_dir)
    onnx_path = os.path.join(model_dir, "model.onnx")
    if not os.path.isfile(onnx_path):
        print(f"Not found: {onnx_path}", file=sys.stderr)
        sys.exit(1)

    output_path = args.output or os.path.join(model_dir, "model_embedded.onnx")

    # Load model (ONNX loads external data from same directory by default when present)
    model = onnx.load(onnx_path, load_external_data=True)
    # Save with all data in one file (no external data)
    onnx.save(model, output_path, save_as_external_data=False)
    print(f"Saved: {output_path}")
    print("Use this file on macOS for Core ML (Apple GPU/ANE).")


if __name__ == "__main__":
    main()
