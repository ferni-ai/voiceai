"""
Code2Wav config: codebook, decoder, upsampler.
Defaults match HuggingFace Qwen3-Omni code2wav_config.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class Code2WavConfig:
    """Code2Wav: codebook + 8-layer decoder + ConvNet upsampler (8,5,4,3 = 480x)."""

    hidden_size: int = 1024
    num_hidden_layers: int = 8
    num_attention_heads: int = 16
    num_key_value_heads: int = 16
    intermediate_size: int = 3072
    rms_norm_eps: float = 1e-5
    codebook_size: int = 2048
    codebook_dim: int = 512
    num_quantizers: int = 16
    semantic_codebook_size: int = 4096
    num_semantic_quantizers: int = 1
    sliding_window: int = 72
    decoder_dim: int = 1536
    upsample_rates: tuple[int, ...] = (8, 5, 4, 3)
    sample_rate: int = 24_000

    def total_upsample_factor(self) -> int:
        p = 1
        for r in self.upsample_rates:
            p *= r
        return p

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Code2WavConfig":
        if not isinstance(d, dict):
            return cls()
        upsample = d.get("upsample_rates")
        if isinstance(upsample, list):
            upsample = tuple(upsample)
        elif upsample is None:
            upsample = (8, 5, 4, 3)
        return cls(
            hidden_size=d.get("hidden_size", 1024),
            num_hidden_layers=d.get("num_hidden_layers", 8),
            num_attention_heads=d.get("num_attention_heads", 16),
            num_key_value_heads=d.get("num_key_value_heads", 16),
            intermediate_size=d.get("intermediate_size", 3072),
            rms_norm_eps=float(d.get("rms_norm_eps", 1e-5)),
            codebook_size=d.get("codebook_size", 2048),
            codebook_dim=d.get("codebook_dim", 512),
            num_quantizers=d.get("num_quantizers", 16),
            semantic_codebook_size=d.get("semantic_codebook_size", 4096),
            num_semantic_quantizers=d.get("num_semantic_quantizers", 1),
            sliding_window=d.get("sliding_window", 72),
            decoder_dim=d.get("decoder_dim", 1536),
            upsample_rates=upsample,
            sample_rate=d.get("sample_rate", 24_000),
        )
