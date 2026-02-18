#!/usr/bin/env python3
"""Standalone xCodec decoder ONNX export — no boson_multimodal needed.

Reconstructs the decoder pipeline (RVQ codebook lookup → fc_post2 → DAC decoder)
from the raw model.pth weights and exports to ONNX.

Architecture (from config.json + weight inspection):
  - RVQ: 8 codebooks, 1024 bins, codebook_dim=64, projected in/out from 1024
  - fc_post2: Linear(1024, 256) — project to acoustic dim
  - decoder_2: DAC-style conv decoder, ratios [8,5,4,2,3], n_filters=32, D=256
    Uses Snake activations + weight-normalized convolutions
    Total upsampling = 8*5*4*2*3 = 960x → 24kHz from 25 tokens/sec

Usage:
    source .venv-higgs/bin/activate
    python scripts/higgs/export_xcodec_standalone.py
"""

import argparse
import sys
from pathlib import Path

import torch
import torch.nn as nn
import numpy as np


class RVQDecode(nn.Module):
    """Residual Vector Quantizer decode-only path.
    
    Each codebook layer has:
      - embed: (1024, 64) codebook vectors
      - project_in: Linear(1024, 64) 
      - project_out: Linear(64, 1024)
    
    Decode: code_idx → embed lookup → project_out → sum across layers
    """
    
    def __init__(self, n_q: int = 8, bins: int = 1024, codebook_dim: int = 64, dim: int = 1024):
        super().__init__()
        self.n_q = n_q
        self.bins = bins
        self.codebook_dim = codebook_dim
        self.dim = dim
        
        # Codebook embeddings for each layer
        self.embeds = nn.ParameterList([
            nn.Parameter(torch.randn(bins, codebook_dim))
            for _ in range(n_q)
        ])
        
        # Project out from codebook dim back to full dim
        self.project_outs = nn.ModuleList([
            nn.Linear(codebook_dim, dim)
            for _ in range(n_q)
        ])
    
    def forward(self, codes: torch.Tensor) -> torch.Tensor:
        """
        Args:
            codes: (batch, n_q, time) int64 — code indices per codebook
        Returns:
            quantized: (batch, dim, time) — sum of decoded codebook vectors
        """
        batch, n_q, time = codes.shape
        result = torch.zeros(batch, time, self.dim, device=codes.device)
        
        for i in range(self.n_q):
            # Lookup: (batch, time) -> (batch, time, codebook_dim)
            layer_codes = codes[:, i, :]  # (batch, time)
            embedded = self.embeds[i][layer_codes]  # (batch, time, codebook_dim)
            # Project back to full dim
            projected = self.project_outs[i](embedded)  # (batch, time, dim)
            result = result + projected
        
        # Return as (batch, dim, time) for conv decoder
        return result.transpose(1, 2)


class XCodecDecoderStandalone(nn.Module):
    """Full xCodec decode pipeline: codes → RVQ → fc_post2 → DAC decoder → audio"""
    
    def __init__(self, rvq: RVQDecode, fc_post2: nn.Linear, decoder_2: nn.Module):
        super().__init__()
        self.rvq = rvq
        self.fc_post2 = fc_post2
        self.decoder_2 = decoder_2
    
    def forward(self, codes: torch.Tensor) -> torch.Tensor:
        """
        Args:
            codes: (batch, n_q, time) int64
        Returns:
            audio: (batch, 1, samples) float32
        """
        # RVQ decode: (batch, n_q, time) -> (batch, 1024, time)
        quantized = self.rvq(codes)
        
        # fc_post2: project 1024 -> 256 (need to transpose for linear)
        quantized = quantized.transpose(1, 2)  # (batch, time, 1024)
        acoustic = self.fc_post2(quantized)      # (batch, time, 256)
        acoustic = acoustic.transpose(1, 2)     # (batch, 256, time)
        
        # DAC decoder: (batch, 256, time) -> (batch, 1, samples)
        audio = self.decoder_2(acoustic)
        
        return audio


def load_dac_decoder(state_dict, channels=1024, D=256, ratios=[8, 5, 4, 2, 3]):
    """Load DAC decoder architecture from descript-audio-codec library.
    
    The DAC Decoder channels parameter is the initial hidden dim (1024 for Higgs),
    which then halves at each upsample stage: 1024→512→256→128→64→32→1
    """
    from dac.model.dac import Decoder
    
    decoder = Decoder(
        input_channel=D,
        channels=channels,
        rates=ratios,
    )
    
    # Load weights
    decoder_sd = {}
    for k, v in state_dict.items():
        if k.startswith("decoder_2."):
            new_key = k[len("decoder_2."):]
            decoder_sd[new_key] = v
    
    # The DAC decoder uses the exact same architecture
    missing, unexpected = decoder.load_state_dict(decoder_sd, strict=False)
    
    if missing:
        print(f"  Warning: {len(missing)} missing keys in decoder")
        for k in missing[:5]:
            print(f"    {k}")
    if unexpected:
        print(f"  Warning: {len(unexpected)} unexpected keys in decoder")
        for k in unexpected[:5]:
            print(f"    {k}")
    
    return decoder


def build_rvq(state_dict, n_q=8, bins=1024, codebook_dim=64, dim=1024):
    """Build RVQ from raw state_dict weights."""
    rvq = RVQDecode(n_q=n_q, bins=bins, codebook_dim=codebook_dim, dim=dim)
    
    for i in range(n_q):
        # Load codebook embeddings
        embed_key = f"quantizer.vq.layers.{i}._codebook.embed"
        if embed_key in state_dict:
            rvq.embeds[i].data = state_dict[embed_key].clone()
        
        # Load project_out weights
        pout_w_key = f"quantizer.vq.layers.{i}.project_out.weight"
        pout_b_key = f"quantizer.vq.layers.{i}.project_out.bias"
        if pout_w_key in state_dict:
            rvq.project_outs[i].weight.data = state_dict[pout_w_key].clone()
        if pout_b_key in state_dict:
            rvq.project_outs[i].bias.data = state_dict[pout_b_key].clone()
    
    return rvq


def main():
    parser = argparse.ArgumentParser(description="Standalone xCodec ONNX export")
    parser.add_argument("--tokenizer-path", type=Path, default=Path("models/higgs-audio-v2-tokenizer"))
    parser.add_argument("--output", type=Path, default=Path("models/higgs-audio-v2/xcodec_decoder.onnx"))
    parser.add_argument("--num-codebooks", type=int, default=8)
    args = parser.parse_args()
    
    print("=" * 60)
    print("  xCodec Decoder — Standalone ONNX Export")
    print("=" * 60)
    
    model_path = args.tokenizer_path / "model.pth"
    if not model_path.exists():
        print(f"Error: {model_path} not found")
        sys.exit(1)
    
    # Load raw state dict
    print(f"\nLoading weights from {model_path}...")
    sd = torch.load(model_path, map_location="cpu", weights_only=False)
    print(f"  {len(sd)} total keys")
    
    # Build RVQ
    print("\nBuilding RVQ decoder (8 codebooks, 1024 bins, dim=64→1024)...")
    rvq = build_rvq(sd, n_q=8, bins=1024, codebook_dim=64, dim=1024)
    print(f"  RVQ params: {sum(p.numel() for p in rvq.parameters()) / 1e6:.1f}M")
    
    # Build fc_post2
    print("\nLoading fc_post2 (Linear 1024→256)...")
    fc_post2 = nn.Linear(1024, 256)
    fc_post2.weight.data = sd["fc_post2.weight"].clone()
    fc_post2.bias.data = sd["fc_post2.bias"].clone()
    
    # Build DAC decoder
    print("\nLoading DAC decoder (ratios [8,5,4,2,3], 960x upsampling)...")
    decoder_2 = load_dac_decoder(sd, channels=1024, D=256, ratios=[8, 5, 4, 2, 3])
    print(f"  Decoder params: {sum(p.numel() for p in decoder_2.parameters()) / 1e6:.1f}M")
    
    # Assemble full pipeline
    print("\nAssembling full decode pipeline...")
    model = XCodecDecoderStandalone(rvq, fc_post2, decoder_2)
    model.eval()
    total_params = sum(p.numel() for p in model.parameters()) / 1e6
    print(f"  Total params: {total_params:.1f}M")
    
    # Test forward pass
    print("\nTesting forward pass...")
    dummy_codes = torch.randint(0, 1024, (1, 8, 10), dtype=torch.long)
    with torch.no_grad():
        test_out = model(dummy_codes)
    print(f"  Input:  {dummy_codes.shape}")
    print(f"  Output: {test_out.shape}")
    print(f"  Range:  [{test_out.min():.4f}, {test_out.max():.4f}]")
    expected = 10 * 960
    actual = test_out.shape[-1]
    print(f"  Expected ~{expected} samples, got {actual} (ratio: {actual/10:.0f}x)")
    
    # Export ONNX
    print(f"\nExporting to ONNX: {args.output}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    
    torch.onnx.export(
        model,
        (dummy_codes,),
        str(args.output),
        input_names=["codes"],
        output_names=["audio"],
        dynamic_axes={
            "codes": {0: "batch", 2: "time_steps"},
            "audio": {0: "batch", 2: "audio_samples"},
        },
        opset_version=17,
        do_constant_folding=True,
    )
    
    size_mb = args.output.stat().st_size / 1024 / 1024
    print(f"  Exported: {args.output} ({size_mb:.1f} MB)")
    
    # Validate with ONNX Runtime
    try:
        import onnxruntime as ort
        session = ort.InferenceSession(str(args.output))
        codes_np = dummy_codes.numpy()
        result = session.run(None, {"codes": codes_np})
        print(f"  ONNX Runtime validation: output shape {result[0].shape}")
        max_diff = abs(test_out.numpy() - result[0]).max()
        print(f"  Max diff (PyTorch vs ONNX): {max_diff:.6f}")
    except Exception as e:
        print(f"  ONNX Runtime validation failed: {e}")
    
    print(f"\nDone! xCodec decoder exported to {args.output}")


if __name__ == "__main__":
    main()
