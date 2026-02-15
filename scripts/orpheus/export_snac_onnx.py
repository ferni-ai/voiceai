#!/usr/bin/env python3
"""Export SNAC 24kHz decoder to ONNX for Rust inference.

Exports only the decoder path (codes → audio) since that's all we need for TTS.

Usage:
    pip install snac torch onnx
    python export_snac_onnx.py [--output models/snac_24khz_decoder.onnx]

The SNAC 24kHz model has 3 codebook levels:
  Level 0: ~12 Hz (coarsest) - N codes
  Level 1: ~23 Hz (middle)   - 2*N codes
  Level 2: ~47 Hz (finest)   - 4*N codes
"""

import argparse
import os
import sys

import torch
import torch.nn as nn


class SNACDecoderWrapper(nn.Module):
    """Wraps SNAC model's decode method for ONNX export.

    Takes 3 separate code tensors (one per level) and returns audio.
    """

    def __init__(self, snac_model):
        super().__init__()
        self.snac = snac_model

    def forward(
        self,
        codes_0: torch.Tensor,
        codes_1: torch.Tensor,
        codes_2: torch.Tensor,
    ) -> torch.Tensor:
        codes = [codes_0, codes_1, codes_2]
        audio = self.snac.decode(codes)
        return audio


def main():
    parser = argparse.ArgumentParser(description="Export SNAC 24kHz decoder to ONNX")
    parser.add_argument(
        "--output",
        default="models/snac_24khz_decoder.onnx",
        help="Output ONNX file path",
    )
    parser.add_argument(
        "--opset",
        type=int,
        default=17,
        help="ONNX opset version",
    )
    args = parser.parse_args()

    print("Loading SNAC 24kHz model from HuggingFace...")
    try:
        from snac import SNAC
    except ImportError:
        print("Error: 'snac' package not found. Install with: pip install snac")
        sys.exit(1)

    model = SNAC.from_pretrained("hubertsiuzdak/snac_24khz")
    model.eval()

    wrapper = SNACDecoderWrapper(model)

    # Create dummy inputs matching the 1:2:4 ratio
    # 8 coarsest frames ≈ 667ms of audio
    n_frames = 8
    codes_0 = torch.randint(0, 4096, (1, n_frames), dtype=torch.long)
    codes_1 = torch.randint(0, 4096, (1, n_frames * 2), dtype=torch.long)
    codes_2 = torch.randint(0, 4096, (1, n_frames * 4), dtype=torch.long)

    # Verify the model runs
    print("Running test inference...")
    with torch.no_grad():
        test_audio = wrapper(codes_0, codes_1, codes_2)
    print(f"  Input:  L0={list(codes_0.shape)}, L1={list(codes_1.shape)}, L2={list(codes_2.shape)}")
    print(f"  Output: {list(test_audio.shape)} ({test_audio.shape[-1]} samples = {test_audio.shape[-1]/24000:.3f}s)")

    # Export to ONNX
    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)

    print(f"Exporting to ONNX (opset {args.opset})...")
    torch.onnx.export(
        wrapper,
        (codes_0, codes_1, codes_2),
        args.output,
        input_names=["codes_0", "codes_1", "codes_2"],
        output_names=["audio"],
        dynamic_axes={
            "codes_0": {0: "batch", 1: "time_0"},
            "codes_1": {0: "batch", 1: "time_1"},
            "codes_2": {0: "batch", 1: "time_2"},
            "audio": {0: "batch", 2: "audio_len"},
        },
        opset_version=args.opset,
        do_constant_folding=True,
    )

    file_size = os.path.getsize(args.output) / (1024 * 1024)
    print(f"Exported: {args.output} ({file_size:.1f} MB)")

    # Verify the ONNX model loads
    try:
        import onnxruntime as ort

        print("Verifying ONNX model with onnxruntime...")
        sess = ort.InferenceSession(args.output)
        for inp in sess.get_inputs():
            print(f"  Input: {inp.name} shape={inp.shape} dtype={inp.type}")
        for out in sess.get_outputs():
            print(f"  Output: {out.name} shape={out.shape} dtype={out.type}")

        # Run inference
        result = sess.run(
            None,
            {
                "codes_0": codes_0.numpy(),
                "codes_1": codes_1.numpy(),
                "codes_2": codes_2.numpy(),
            },
        )
        print(f"  ONNX inference output shape: {result[0].shape}")
        print("ONNX verification passed!")
    except ImportError:
        print("(onnxruntime not installed, skipping verification)")

    print("\nDone! Use with Rust server:")
    print(f"  orpheus-tts-server --snac-model {args.output}")


if __name__ == "__main__":
    main()
