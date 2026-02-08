"""
Code2Wav: codec token indices → 24 kHz waveform.

Codebook embedding + 8-layer transformer decoder + ConvNet upsampler (480x).
Reference: apps/rust-perf/src/candle_code2wav.rs
"""

from mlx_qwen3_omni.code2wav.config import Code2WavConfig
from mlx_qwen3_omni.code2wav.model import Qwen3OmniCode2Wav

__all__ = ["Qwen3OmniCode2Wav", "Code2WavConfig"]
