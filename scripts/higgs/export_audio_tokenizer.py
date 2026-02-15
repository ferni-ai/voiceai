#!/usr/bin/env python3
"""Export the Higgs Audio V2 tokenizer decoder to ONNX.

The Higgs Audio V2 model uses a custom audio tokenizer (xcodec-derived) with:
  - RVQ quantizer (8 codebooks, 1024 bins)
  - fc_post2 linear projection (1024 → 256)
  - DAC decoder (conv-upsampling, ratios=[8,5,4,2,3] → 960x upsampling)

This script loads the full tokenizer from model.pth, wraps the decode pipeline
(RVQ codebook lookup → fc_post2 → decoder_2) into a single module, and exports
it as ONNX for the Rust server to load via ONNX Runtime.

Requirements:
    pip install torch torchaudio onnx onnxruntime einops \
        vector-quantize-pytorch transformers huggingface_hub librosa \
        descript-audiotools descript-audio-codec

    Also install boson_multimodal:
        cd /path/to/higgs-audio && pip install -e .

Usage:
    python scripts/higgs/export_audio_tokenizer.py
    python scripts/higgs/export_audio_tokenizer.py \
        --tokenizer-path models/higgs-audio-v2-tokenizer \
        --output models/higgs-audio-v2/xcodec_decoder.onnx

Output:
    models/higgs-audio-v2/xcodec_decoder.onnx (~200-400 MB)

ONNX Interface:
    Input:  "codes" — int64 tensor, shape (batch, num_codebooks, time_steps)
    Output: "audio" — float32 tensor, shape (batch, 1, audio_samples)
    Where audio_samples = time_steps * 960 (hop_length)
"""

import argparse
import sys
from pathlib import Path

import torch
import torch.nn as nn


class HiggsDecoderONNX(nn.Module):
    """Wraps the Higgs Audio tokenizer decode pipeline for ONNX export.

    Pipeline: codes → RVQ decode → fc_post2 → decoder_2 → audio

    The RVQ decode performs codebook lookups and sums across quantizer layers.
    fc_post2 projects from quantizer dimension to acoustic dimension.
    decoder_2 is a DAC-style convolutional decoder that upsamples to audio.
    """

    def __init__(self, tokenizer):
        super().__init__()
        self.quantizer = tokenizer.quantizer
        self.fc_post2 = tokenizer.fc_post2
        self.decoder_2 = tokenizer.decoder_2

    def forward(self, codes: torch.Tensor) -> torch.Tensor:
        """
        Args:
            codes: (batch, num_codebooks, time_steps) int64 tensor
                   Code indices for each codebook.

        Returns:
            audio: (batch, 1, audio_samples) float32 tensor
                   Decoded audio waveform.
        """
        # RVQ decode expects (n_q, batch, time)
        codes = codes.permute(1, 0, 2)

        # Codebook lookup + sum across quantizer layers
        quantized = self.quantizer.decode(codes)  # (batch, quantizer_dim, time)

        # Project to acoustic space
        quantized = quantized.transpose(1, 2)  # (batch, time, quantizer_dim)
        acoustic = self.fc_post2(quantized)  # (batch, time, D=256)
        acoustic = acoustic.transpose(1, 2)  # (batch, D, time)

        # Decode to audio waveform
        audio = self.decoder_2(acoustic)  # (batch, 1, audio_samples)

        return audio


def load_tokenizer(tokenizer_path: Path, device: str = "cpu"):
    """Load the HiggsAudioTokenizer from a local directory."""
    import json

    config_path = tokenizer_path / "config.json"
    model_path = tokenizer_path / "model.pth"

    if not config_path.exists():
        print(f"Error: {config_path} not found")
        sys.exit(1)
    if not model_path.exists():
        print(f"Error: {model_path} not found")
        sys.exit(1)

    config = json.load(open(config_path))
    print(f"  Config: n_q={config['n_q']}, bins={config['bins']}, "
          f"D={config['D']}, ratios={config['ratios']}, sr={config['sample_rate']}")

    from boson_multimodal.audio_processing.higgs_audio_tokenizer import HiggsAudioTokenizer

    tokenizer = HiggsAudioTokenizer(**config, device=device)

    # Load weights (strict=False because semantic model weights may differ)
    state_dict = torch.load(model_path, map_location=device, weights_only=False)
    missing, unexpected = tokenizer.load_state_dict(state_dict, strict=False)

    if missing:
        # Filter out semantic model keys — we don't need them for decode
        decode_missing = [k for k in missing if not k.startswith("semantic_model.")]
        if decode_missing:
            print(f"  Warning: Missing decode-relevant keys: {decode_missing}")
    if unexpected:
        print(f"  Warning: {len(unexpected)} unexpected keys (ignored)")

    tokenizer.eval()
    print(f"  Loaded tokenizer ({sum(p.numel() for p in tokenizer.parameters()) / 1e6:.1f}M params)")
    return tokenizer


def export_onnx(wrapper: nn.Module, output_path: Path, num_codebooks: int = 8):
    """Export the decode wrapper to ONNX format."""
    print(f"\nExporting decoder to ONNX: {output_path}")

    wrapper.eval()

    # Create dummy input: (batch=1, num_codebooks=8, time_steps=10)
    dummy_codes = torch.randint(0, 1024, (1, num_codebooks, 10), dtype=torch.long)

    # Test forward pass
    with torch.no_grad():
        test_output = wrapper(dummy_codes)

    print(f"  Input shape:  {dummy_codes.shape}")
    print(f"  Output shape: {test_output.shape}")
    print(f"  Output range: [{test_output.min():.4f}, {test_output.max():.4f}]")

    expected_samples = 10 * 960  # time_steps * hop_length
    actual_samples = test_output.shape[-1]
    print(f"  Expected ~{expected_samples} samples, got {actual_samples} "
          f"(ratio: {actual_samples / 10:.0f}x)")

    # Export to ONNX
    output_path.parent.mkdir(parents=True, exist_ok=True)

    torch.onnx.export(
        wrapper,
        (dummy_codes,),
        str(output_path),
        input_names=["codes"],
        output_names=["audio"],
        dynamic_axes={
            "codes": {0: "batch", 2: "time_steps"},
            "audio": {0: "batch", 2: "audio_samples"},
        },
        opset_version=17,
        do_constant_folding=True,
    )

    size_mb = output_path.stat().st_size / 1024 / 1024
    print(f"  Exported: {output_path} ({size_mb:.1f} MB)")

    # Validate with ONNX Runtime
    try:
        import onnxruntime as ort

        session = ort.InferenceSession(str(output_path))
        codes_np = dummy_codes.numpy()
        result = session.run(None, {"codes": codes_np})
        print(f"  ONNX Runtime validation passed, output shape: {result[0].shape}")

        # Check outputs match
        max_diff = abs(test_output.numpy() - result[0]).max()
        print(f"  Max diff (PyTorch vs ONNX): {max_diff:.6f}")
    except ImportError:
        print("  onnxruntime not installed, skipping validation")
    except Exception as e:
        print(f"  ONNX Runtime validation failed: {e}")


def main():
    parser = argparse.ArgumentParser(
        description="Export Higgs Audio V2 tokenizer decoder to ONNX"
    )
    parser.add_argument(
        "--tokenizer-path",
        type=Path,
        default=Path("models/higgs-audio-v2-tokenizer"),
        help="Path to tokenizer directory (contains config.json + model.pth)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output ONNX path (default: models/higgs-audio-v2/xcodec_decoder.onnx)",
    )
    parser.add_argument(
        "--num-codebooks",
        type=int,
        default=8,
        help="Number of audio codebooks (default: 8)",
    )
    args = parser.parse_args()

    output_path = args.output or Path("models/higgs-audio-v2/xcodec_decoder.onnx")

    print("=" * 60)
    print("  Higgs Audio V2 — Tokenizer Decoder ONNX Export")
    print("=" * 60)
    print(f"  Tokenizer: {args.tokenizer_path}")
    print(f"  Output:    {output_path}")
    print()

    # Load the full tokenizer
    print("Loading tokenizer...")
    tokenizer = load_tokenizer(args.tokenizer_path, device="cpu")

    # Create decode wrapper (only the parts needed for codes → audio)
    print("\nCreating decode wrapper (quantizer + fc_post2 + decoder_2)...")
    wrapper = HiggsDecoderONNX(tokenizer)
    decode_params = sum(p.numel() for p in wrapper.parameters()) / 1e6
    print(f"  Decode params: {decode_params:.1f}M")

    # Export to ONNX
    export_onnx(wrapper, output_path, args.num_codebooks)

    print(f"\nDone! Next steps:")
    print(f"  cargo build --release -p higgs-tts-server")
    print(f"  ./target/release/higgs-tts-server \\")
    print(f"    --model-path models/higgs-audio-v2 \\")
    print(f"    --decoder-model {output_path}")


if __name__ == "__main__":
    main()
