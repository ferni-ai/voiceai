"""
Audio encoder (AuT) for Qwen3-Omni Thinker.

Conv2d stem + sinusoidal pos embed + 32 transformer encoder layers
(LayerNorm, MHA with bias, FFN GELU) + projection to Thinker hidden_size (2048).
Reference: apps/rust-perf/src/candle_audio_encoder.rs
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Optional

import mlx.core as mx
import mlx.nn as nn


# Default audio config (Qwen3-Omni audio_config).
NUM_MEL_BINS = 128
D_MODEL = 1280
ENCODER_LAYERS = 32
ENCODER_ATTENTION_HEADS = 20
ENCODER_FFN_DIM = 5120
OUTPUT_DIM = 2048
MAX_SOURCE_POSITIONS = 1500
DOWNSAMPLE_HIDDEN_SIZE = 480


def _conv_output_mel_dim(num_mel_bins: int = NUM_MEL_BINS, num_convs: int = 3) -> int:
    """Spatial mel dimension after 3x stride-2 convs (PyTorch formula)."""
    d = num_mel_bins
    for _ in range(num_convs):
        d = (d + 2 * 1 - 3) // 2 + 1  # (d + 2*pad - k) // stride + 1
    return d


def _gelu(x: mx.array) -> mx.array:
    """GELU(x) ≈ 0.5 * x * (1 + tanh(sqrt(2/π) * (x + 0.044715 * x^3)))."""
    sqrt_2_over_pi = math.sqrt(2.0 / math.pi)
    return 0.5 * x * (1.0 + mx.tanh(sqrt_2_over_pi * (x + 0.044715 * (x**3))))


@dataclass
class AudioEncoderConfig:
    """Audio encoder config (from thinker_config.audio_config)."""

    num_mel_bins: int = NUM_MEL_BINS
    d_model: int = D_MODEL
    encoder_layers: int = ENCODER_LAYERS
    encoder_attention_heads: int = ENCODER_ATTENTION_HEADS
    encoder_ffn_dim: int = ENCODER_FFN_DIM
    output_dim: int = OUTPUT_DIM
    max_source_positions: int = MAX_SOURCE_POSITIONS
    downsample_hidden_size: int = DOWNSAMPLE_HIDDEN_SIZE
    scale_embedding: bool = False

    @property
    def conv_output_mel_dim(self) -> int:
        return _conv_output_mel_dim(self.num_mel_bins)

    @property
    def conv_out_input_dim(self) -> int:
        return self.downsample_hidden_size * self.conv_output_mel_dim

    @classmethod
    def from_dict(cls, params: dict[str, Any]) -> "AudioEncoderConfig":
        audio = (
            params.get("thinker_config", {}).get("audio_config")
            or params.get("audio_config")
            or params
        )
        if not isinstance(audio, dict):
            audio = {}
        return cls(
            num_mel_bins=audio.get("num_mel_bins", NUM_MEL_BINS),
            d_model=audio.get("d_model", D_MODEL),
            encoder_layers=audio.get("encoder_layers", ENCODER_LAYERS),
            encoder_attention_heads=audio.get(
                "encoder_attention_heads", ENCODER_ATTENTION_HEADS
            ),
            encoder_ffn_dim=audio.get("encoder_ffn_dim", ENCODER_FFN_DIM),
            output_dim=audio.get("output_dim", OUTPUT_DIM),
            max_source_positions=audio.get(
                "max_source_positions", MAX_SOURCE_POSITIONS
            ),
            downsample_hidden_size=audio.get(
                "downsample_hidden_size", DOWNSAMPLE_HIDDEN_SIZE
            ),
            scale_embedding=audio.get("scale_embedding", False),
        )


class SinusoidalPositionEmbedding(nn.Module):
    """Sinusoidal positional embedding (max_source_positions, d_model). Sin/cos interleaved."""

    def __init__(
        self,
        max_length: int,
        channels: int,
    ) -> None:
        super().__init__()
        half = channels // 2
        log_inc = math.log(10000.0) / max(half - 1, 1)
        inv_timescales = [math.exp(log_inc * i) for i in range(half)]
        sin_emb = []
        cos_emb = []
        for t_i in range(max_length):
            row = [t_i * inv for inv in inv_timescales]
            sin_emb.append([math.sin(s) for s in row])
            cos_emb.append([math.cos(s) for s in row])
        # (max_length, channels) = concat(sin, cos) on last axis
        self.embedding = mx.array(
            [sin_emb[i] + cos_emb[i] for i in range(max_length)]
        )

    def __call__(self, seq_len: int) -> mx.array:
        return self.embedding[:seq_len]


class AudioEncoderLayer(nn.Module):
    """Single encoder layer: pre-LayerNorm, MHA (with bias), pre-LayerNorm, FFN GELU."""

    def __init__(self, config: AudioEncoderConfig) -> None:
        super().__init__()
        embed_dim = config.d_model
        num_heads = config.encoder_attention_heads
        head_dim = embed_dim // num_heads
        self.self_attn_layer_norm = nn.LayerNorm(embed_dim, eps=1e-5)
        self.q_proj = nn.Linear(embed_dim, embed_dim, bias=True)
        self.k_proj = nn.Linear(embed_dim, embed_dim, bias=True)
        self.v_proj = nn.Linear(embed_dim, embed_dim, bias=True)
        self.out_proj = nn.Linear(embed_dim, embed_dim, bias=True)
        self.final_layer_norm = nn.LayerNorm(embed_dim, eps=1e-5)
        self.fc1 = nn.Linear(embed_dim, config.encoder_ffn_dim, bias=True)
        self.fc2 = nn.Linear(config.encoder_ffn_dim, embed_dim, bias=True)
        self.embed_dim = embed_dim
        self.num_heads = num_heads
        self.head_dim = head_dim
        self.scale = head_dim**-0.5

    def __call__(
        self,
        x: mx.array,
        attention_mask: Optional[mx.array] = None,
    ) -> mx.array:
        B, L, _ = x.shape
        residual = x
        x = self.self_attn_layer_norm(x)
        q = self.q_proj(x).reshape(B, L, self.num_heads, self.head_dim).transpose(
            0, 2, 1, 3
        )
        k = self.k_proj(x).reshape(B, L, self.num_heads, self.head_dim).transpose(
            0, 2, 1, 3
        )
        v = self.v_proj(x).reshape(B, L, self.num_heads, self.head_dim).transpose(
            0, 2, 1, 3
        )
        attn = mx.matmul(q, k.transpose(0, 1, 3, 2)) * self.scale
        if attention_mask is not None:
            attn = attn + attention_mask
        attn = mx.softmax(attn, axis=-1)
        out = mx.matmul(attn, v)
        out = out.transpose(0, 2, 1, 3).reshape(B, L, self.embed_dim)
        out = self.out_proj(out)
        x = residual + out

        residual = x
        x = self.final_layer_norm(x)
        x = _gelu(self.fc1(x))
        x = self.fc2(x)
        return residual + x


class Qwen3OmniAudioEncoder(nn.Module):
    """
    Qwen3-Omni Audio Encoder (AuT).
    Input: mel (batch, num_mel_bins, time) or (batch, 1, num_mel_bins, time) for Conv2d NHWC.
    Output: (batch, seq, output_dim) = (batch, seq, 2048).
    """

    def __init__(self, config: Optional[AudioEncoderConfig] = None) -> None:
        super().__init__()
        self.config = config or AudioEncoderConfig()
        c = self.config
        # Conv2d stem: MLX uses NHWC (batch, height, width, channels)
        self.conv2d1 = nn.Conv2d(
            1,
            c.downsample_hidden_size,
            kernel_size=3,
            stride=2,
            padding=1,
            bias=False,
        )
        self.conv2d2 = nn.Conv2d(
            c.downsample_hidden_size,
            c.downsample_hidden_size,
            kernel_size=3,
            stride=2,
            padding=1,
            bias=False,
        )
        self.conv2d3 = nn.Conv2d(
            c.downsample_hidden_size,
            c.downsample_hidden_size,
            kernel_size=3,
            stride=2,
            padding=1,
            bias=False,
        )
        self.conv_out = nn.Linear(c.conv_out_input_dim, c.d_model, bias=False)
        self.positional_embedding = SinusoidalPositionEmbedding(
            c.max_source_positions, c.d_model
        )
        for i in range(c.encoder_layers):
            setattr(self, f"layer_{i}", AudioEncoderLayer(c))
        self._num_layers = c.encoder_layers
        self.ln_post = nn.LayerNorm(c.d_model, eps=1e-5)
        self.proj1 = nn.Linear(c.d_model, c.d_model, bias=True)
        self.proj2 = nn.Linear(c.d_model, c.output_dim, bias=True)
        self.embed_scale = math.sqrt(c.d_model) if c.scale_embedding else 1.0

    def __call__(
        self,
        input_features: mx.array,
        attention_mask: Optional[mx.array] = None,
    ) -> mx.array:
        """
        Forward.
        input_features: (batch, num_mel_bins, time) e.g. (1, 128, T).
        Returns: (batch, seq, output_dim).
        """
        # Ensure (B, H, W, C) for Conv2d: (B, 128, T) -> (B, 128, T, 1)
        if input_features.ndim == 3:
            x = mx.expand_dims(input_features, axis=-1)
        else:
            x = input_features
        x = self.conv2d1(x)
        x = self.conv2d2(x)
        x = self.conv2d3(x)
        # x: (B, H', W', C) -> flatten to (B, W', H'*C) for sequence
        B, H, W, C = x.shape
        x = x.transpose(0, 2, 1, 3).reshape(B, W, H * C)
        x = self.conv_out(x)
        seq_len = x.shape[1]
        x = x * self.embed_scale
        pos = self.positional_embedding(seq_len)
        x = x + pos
        for i in range(self._num_layers):
            x = getattr(self, f"layer_{i}")(x, attention_mask)
        x = self.ln_post(x)
        x = _gelu(self.proj1(x))
        x = self.proj2(x)
        return x


def encode_audio(audio: mx.array, config: dict) -> mx.array:
    """
    Encode raw audio to Thinker hidden_size (2048) embeddings.
    Expects audio to be mel spectrogram (1, n_mels, time) or raw samples (then use mel first).
    """
    if isinstance(config, dict):
        encoder_config = AudioEncoderConfig.from_dict(config)
    else:
        encoder_config = config
    model = Qwen3OmniAudioEncoder(encoder_config)
    return model(audio)
