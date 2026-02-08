"""
Qwen3-Omni Code2Wav: codec token indices (batch, seq, num_quantizers) → waveform (batch, samples).

Embed → 8-layer decoder → ConvNet upsampler (480x) → tanh. Reference: candle_code2wav.rs
"""

from __future__ import annotations

from typing import Any, Optional

import mlx.core as mx
import mlx.nn as nn

from mlx_qwen3_omni._base import create_causal_mask, scaled_dot_product_attention
from mlx_qwen3_omni.code2wav.config import Code2WavConfig


def _silu_gate(gate: mx.array, up: mx.array) -> mx.array:
    return nn.silu(gate) * up


class Code2WavDecoderAttention(nn.Module):
    """Causal self-attention (no RoPE) for Code2Wav decoder. QK norm, GQA."""

    def __init__(self, config: Code2WavConfig) -> None:
        super().__init__()
        hidden = config.hidden_size
        n_heads = config.num_attention_heads
        n_kv = config.num_key_value_heads
        head_dim = hidden // n_heads
        self.n_heads = n_heads
        self.n_kv_heads = n_kv
        self.head_dim = head_dim
        self.scale = head_dim**-0.5
        self.q_proj = nn.Linear(hidden, n_heads * head_dim, bias=False)
        self.k_proj = nn.Linear(hidden, n_kv * head_dim, bias=False)
        self.v_proj = nn.Linear(hidden, n_kv * head_dim, bias=False)
        self.o_proj = nn.Linear(n_heads * head_dim, hidden, bias=False)
        self.q_norm = nn.RMSNorm(head_dim, eps=config.rms_norm_eps)
        self.k_norm = nn.RMSNorm(head_dim, eps=config.rms_norm_eps)

    def __call__(
        self,
        x: mx.array,
        mask: Optional[mx.array] = None,
    ) -> mx.array:
        B, L, _ = x.shape
        q = self.q_proj(x).reshape(B, L, self.n_heads, self.head_dim).transpose(0, 2, 1, 3)
        k = self.k_proj(x).reshape(B, L, self.n_kv_heads, self.head_dim).transpose(0, 2, 1, 3)
        v = self.v_proj(x).reshape(B, L, self.n_kv_heads, self.head_dim).transpose(0, 2, 1, 3)
        q = self.q_norm(q)
        k = self.k_norm(k)
        n_rep = self.n_heads // self.n_kv_heads
        if n_rep > 1:
            k = mx.repeat(k, n_rep, axis=1)
            v = mx.repeat(v, n_rep, axis=1)
        out = scaled_dot_product_attention(q, k, v, self.scale, mask=mask)
        out = out.transpose(0, 2, 1, 3).reshape(B, L, -1)
        return self.o_proj(out)


class Code2WavDecoderMLP(nn.Module):
    """SiLU-gated MLP for Code2Wav decoder."""

    def __init__(self, hidden: int, intermediate: int) -> None:
        super().__init__()
        self.gate_proj = nn.Linear(hidden, intermediate, bias=False)
        self.up_proj = nn.Linear(hidden, intermediate, bias=False)
        self.down_proj = nn.Linear(intermediate, hidden, bias=False)

    def __call__(self, x: mx.array) -> mx.array:
        return self.down_proj(_silu_gate(self.gate_proj(x), self.up_proj(x)))


class Code2WavDecoderLayer(nn.Module):
    """Pre-norm attention + pre-norm SiLU MLP + residuals."""

    def __init__(self, config: Code2WavConfig) -> None:
        super().__init__()
        self.self_attn = Code2WavDecoderAttention(config)
        self.mlp = Code2WavDecoderMLP(config.hidden_size, config.intermediate_size)
        self.input_layernorm = nn.RMSNorm(config.hidden_size, eps=config.rms_norm_eps)
        self.post_attention_layernorm = nn.RMSNorm(config.hidden_size, eps=config.rms_norm_eps)

    def __call__(self, x: mx.array, mask: Optional[mx.array] = None) -> mx.array:
        r = self.self_attn(self.input_layernorm(x), mask)
        h = x + r
        r = self.mlp(self.post_attention_layernorm(h))
        return h + r


class Code2WavDecoder(nn.Module):
    """input_proj → 8 layers → norm → final_proj to decoder_dim."""

    def __init__(self, config: Code2WavConfig) -> None:
        super().__init__()
        embed_out = config.codebook_dim * config.num_quantizers
        self.input_proj = nn.Linear(embed_out, config.hidden_size, bias=False)
        self.layers = [Code2WavDecoderLayer(config) for _ in range(config.num_hidden_layers)]
        self.norm = nn.RMSNorm(config.hidden_size, eps=config.rms_norm_eps)
        self.final_proj = nn.Linear(config.hidden_size, config.decoder_dim, bias=False)
        self._num_layers = config.num_hidden_layers

    def __call__(self, hidden: mx.array, mask: Optional[mx.array] = None) -> mx.array:
        x = self.input_proj(hidden)
        for layer in self.layers:
            x = layer(x, mask)
        x = self.norm(x)
        return self.final_proj(x)


class UpsampleBlock(nn.Module):
    """ConvTranspose1d (upsample by rate) + SiLU."""

    def __init__(
        self,
        in_channels: int,
        out_channels: int,
        rate: int,
    ) -> None:
        super().__init__()
        kernel_size = rate * 2
        padding = (kernel_size - rate) // 2
        self.conv_transpose = nn.ConvTranspose1d(
            in_channels,
            out_channels,
            kernel_size=kernel_size,
            stride=rate,
            padding=padding,
        )

    def __call__(self, x: mx.array) -> mx.array:
        # x: (B, L, C) for MLX ConvTranspose1d NLC
        return nn.silu(self.conv_transpose(x))


class ConvNetUpsampler(nn.Module):
    """decoder_dim → 512 → 256 → 128 → 64 → 1, rates [8,5,4,3] = 480x."""

    def __init__(self, config: Code2WavConfig) -> None:
        super().__init__()
        rates = config.upsample_rates
        num_stages = len(rates)
        initial_channels = max(512, 1 << num_stages)
        self.input_conv = nn.Conv1d(
            config.decoder_dim,
            initial_channels,
            kernel_size=7,
            stride=1,
            padding=3,
        )
        channels = initial_channels
        self.upsample_blocks = []
        for i, rate in enumerate(rates):
            out_ch = channels // 2
            block = UpsampleBlock(channels, out_ch, rate)
            setattr(self, f"block_{i}", block)
            self.upsample_blocks.append(block)
            channels = out_ch
        self.output_conv = nn.Conv1d(channels, 1, kernel_size=7, stride=1, padding=3)
        self._num_blocks = len(rates)

    def __call__(self, x: mx.array) -> mx.array:
        # x: (B, L, decoder_dim) -> Conv1d expects (B, L, C) in MLX
        out = self.input_conv(x)
        for block in self.upsample_blocks:
            out = block(out)
        out = self.output_conv(out)
        out = mx.tanh(out)
        # (B, L_out, 1) -> (B, L_out)
        return out.squeeze(-1)


class Qwen3OmniCode2Wav(nn.Module):
    """
    Code2Wav: codec_token_ids (batch, seq, num_quantizers) → waveform (batch, samples).

    Embed → 8-layer decoder → ConvNet upsampler (480x) → tanh. Sample rate 24 kHz.
    """

    def __init__(self, config: Code2WavConfig | None = None) -> None:
        super().__init__()
        self.config = config or Code2WavConfig()
        c = self.config
        self.embed = nn.Embedding(c.codebook_size, c.codebook_dim)
        self.decoder = Code2WavDecoder(c)
        self.upsampler = ConvNetUpsampler(c)

    def __call__(self, codec_token_ids: mx.array) -> mx.array:
        """
        codec_token_ids: (batch, seq, num_quantizers), int indices.
        Returns: (batch, seq * 480) waveform in [-1, 1].
        """
        B, L, num_q = codec_token_ids.shape
        embedded_list = []
        for q in range(num_q):
            ids = codec_token_ids[:, :, q]
            e = self.embed(ids)
            embedded_list.append(e)
        stacked = mx.stack(embedded_list, axis=2)
        hidden = stacked.reshape(B, L, num_q * self.config.codebook_dim)

        mask = create_causal_mask(L) if L > 1 else None
        hidden = self.decoder(hidden, mask)
        return self.upsampler(hidden)

    @property
    def sample_rate(self) -> int:
        return self.config.sample_rate

    def total_upsample_factor(self) -> int:
        return self.config.total_upsample_factor()
