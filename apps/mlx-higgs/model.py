"""
Higgs Audio V2 — DualFFN Llama model on Apple MLX.

Architecture: Llama 3.2 3B backbone with DualFFN audio adapter.
Text tokens (ID < 128000) route through the standard Llama FFN.
Audio tokens (ID >= 128000) route through a separate audio FFN.
Both share attention layers.

Reference: apps/rust-higgs-pipeline/src/tts/model.rs (Candle version)
Reference: boson_multimodal/model/higgs_audio/modeling_higgs_audio.py (Python/PyTorch)
"""

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import mlx.core as mx
import mlx.nn as nn


# ─── Configuration ────────────────────────────────────────────


@dataclass
class RopeScaling:
    factor: float = 32.0
    high_freq_factor: float = 4.0
    low_freq_factor: float = 1.0
    original_max_position_embeddings: int = 8192
    rope_type: str = "llama3"


@dataclass
class TextConfig:
    hidden_size: int = 3072
    num_hidden_layers: int = 28
    num_attention_heads: int = 24
    num_key_value_heads: int = 8
    intermediate_size: int = 8192
    vocab_size: int = 128256
    max_position_embeddings: int = 131072
    rms_norm_eps: float = 1e-5
    rope_theta: float = 500000.0
    head_dim: int = 128
    bos_token_id: int = 128000
    eos_token_id: int = 128001
    tie_word_embeddings: bool = True
    rope_scaling: Optional[RopeScaling] = None


@dataclass
class HiggsAudioConfig:
    text_config: TextConfig
    hidden_size: int = 3072
    audio_num_codebooks: int = 8
    audio_codebook_size: int = 1024
    audio_stream_bos_id: int = 1024
    audio_stream_eos_id: int = 1025
    audio_out_bos_token_id: int = 128013
    audio_eos_token_id: int = 128012
    audio_out_token_idx: int = 128016
    audio_dual_ffn_layers: list = None
    audio_ffn_hidden_size: int = 3072
    audio_ffn_intermediate_size: int = 8192
    audio_adapter_type: str = "dual_ffn_fast_forward"
    use_delay_pattern: bool = True
    audio_embed_avg: bool = False
    pad_token_id: int = 128001

    def __post_init__(self):
        if self.audio_dual_ffn_layers is None:
            self.audio_dual_ffn_layers = list(range(28))

    @property
    def audio_vocab_per_codebook(self) -> int:
        return self.audio_codebook_size + 2

    @property
    def audio_lm_head_size(self) -> int:
        return self.audio_num_codebooks * self.audio_vocab_per_codebook

    def has_dual_ffn(self, layer_idx: int) -> bool:
        return layer_idx in self.audio_dual_ffn_layers

    @property
    def is_fast_forward(self) -> bool:
        return self.audio_adapter_type == "dual_ffn_fast_forward"


def load_config(config_path: Path) -> HiggsAudioConfig:
    """Load config from HuggingFace config.json."""
    with open(config_path) as f:
        raw = json.load(f)

    tc_raw = raw.get("text_config", {})
    rope_raw = tc_raw.get("rope_scaling")
    rope_scaling = RopeScaling(**{
        k: v for k, v in rope_raw.items()
        if k in RopeScaling.__dataclass_fields__
    }) if rope_raw else None

    text_config = TextConfig(
        hidden_size=tc_raw.get("hidden_size", 3072),
        num_hidden_layers=tc_raw.get("num_hidden_layers", 28),
        num_attention_heads=tc_raw.get("num_attention_heads", 24),
        num_key_value_heads=tc_raw.get("num_key_value_heads", 8),
        intermediate_size=tc_raw.get("intermediate_size", 8192),
        vocab_size=tc_raw.get("vocab_size", 128256),
        max_position_embeddings=tc_raw.get("max_position_embeddings", 131072),
        rms_norm_eps=tc_raw.get("rms_norm_eps", 1e-5),
        rope_theta=tc_raw.get("rope_theta", 500000.0),
        head_dim=tc_raw.get("head_dim", 128),
        bos_token_id=tc_raw.get("bos_token_id", 128000),
        eos_token_id=tc_raw.get("eos_token_id", 128001),
        tie_word_embeddings=tc_raw.get("tie_word_embeddings", True),
        rope_scaling=rope_scaling,
    )

    return HiggsAudioConfig(
        text_config=text_config,
        hidden_size=raw.get("hidden_size", 3072),
        audio_num_codebooks=raw.get("audio_num_codebooks", 8),
        audio_codebook_size=raw.get("audio_codebook_size", 1024),
        audio_stream_bos_id=raw.get("audio_stream_bos_id", 1024),
        audio_stream_eos_id=raw.get("audio_stream_eos_id", 1025),
        audio_out_bos_token_id=raw.get("audio_out_bos_token_id", 128013),
        audio_eos_token_id=raw.get("audio_eos_token_id", 128012),
        audio_out_token_idx=raw.get("audio_out_token_idx", 128016),
        audio_dual_ffn_layers=raw.get("audio_dual_ffn_layers", list(range(28))),
        audio_ffn_hidden_size=raw.get("audio_ffn_hidden_size", 3072),
        audio_ffn_intermediate_size=raw.get("audio_ffn_intermediate_size", 8192),
        audio_adapter_type=raw.get("audio_adapter_type", "dual_ffn_fast_forward"),
        use_delay_pattern=raw.get("use_delay_pattern", True),
        audio_embed_avg=raw.get("audio_embed_avg", False),
        pad_token_id=raw.get("pad_token_id", 128001),
    )


# ─── Rotary Position Embeddings (Llama3 NTK) ──────────────────


class RotaryEmbedding:
    """Pre-computed cos/sin tables for rotary position embeddings."""

    def __init__(self, config: TextConfig, max_cache: int = 8192):
        head_dim = config.head_dim
        base = config.rope_theta

        # Compute inverse frequencies
        inv_freq = [
            1.0 / (base ** (i / head_dim))
            for i in range(0, head_dim, 2)
        ]

        # Apply Llama3 NTK scaling if configured
        if config.rope_scaling and config.rope_scaling.rope_type == "llama3":
            s = config.rope_scaling
            low_freq_wavelen = s.original_max_position_embeddings / s.low_freq_factor
            high_freq_wavelen = s.original_max_position_embeddings / s.high_freq_factor

            for i in range(len(inv_freq)):
                wavelen = 2.0 * math.pi / inv_freq[i]
                if wavelen < high_freq_wavelen:
                    pass  # High frequency: no scaling
                elif wavelen > low_freq_wavelen:
                    inv_freq[i] /= s.factor  # Low frequency: full scaling
                else:
                    smooth = (
                        s.original_max_position_embeddings / wavelen - s.low_freq_factor
                    ) / (s.high_freq_factor - s.low_freq_factor)
                    inv_freq[i] = (1.0 - smooth) * (inv_freq[i] / s.factor) + smooth * inv_freq[i]

        # Pre-compute cos/sin: (max_cache, head_dim)
        positions = mx.arange(max_cache).astype(mx.float32)
        inv_freq_mx = mx.array(inv_freq, dtype=mx.float32)
        freqs = positions[:, None] * inv_freq_mx[None, :]  # (max_cache, head_dim/2)
        emb = mx.concatenate([freqs, freqs], axis=-1)  # (max_cache, head_dim)
        self._cos = mx.cos(emb)
        self._sin = mx.sin(emb)

    def __call__(self, q, k, offset: int = 0):
        """Apply rotary embeddings. q, k shape: (batch, heads, seq, head_dim)."""
        seq_len = q.shape[2]
        cos = self._cos[offset:offset + seq_len][None, None, :, :]  # (1, 1, seq, dim)
        sin = self._sin[offset:offset + seq_len][None, None, :, :]

        cos = cos.astype(q.dtype)
        sin = sin.astype(q.dtype)

        q_rot = self._rotate_half(q, cos, sin)
        k_rot = self._rotate_half(k, cos, sin)
        return q_rot, k_rot

    @staticmethod
    def _rotate_half(x, cos, sin):
        half = x.shape[-1] // 2
        x1 = x[..., :half]
        x2 = x[..., half:]
        rotated = mx.concatenate([-x2, x1], axis=-1)
        return x * cos + rotated * sin


# ─── KV Cache ──────────────────────────────────────────────────


class KVCache:
    """Key-value cache for autoregressive generation."""

    def __init__(self):
        self.k: Optional[mx.array] = None
        self.v: Optional[mx.array] = None
        self.offset: int = 0

    def update(self, k: mx.array, v: mx.array):
        """Append new K, V and return the full accumulated tensors."""
        if self.k is None:
            self.k = k
            self.v = v
        else:
            self.k = mx.concatenate([self.k, k], axis=2)
            self.v = mx.concatenate([self.v, v], axis=2)

        self.offset = self.k.shape[2]
        return self.k, self.v

    def reset(self):
        self.k = None
        self.v = None
        self.offset = 0


# ─── Model Layers ─────────────────────────────────────────────


class RMSNorm(nn.Module):
    """RMS normalization (pre-norm, Llama-style)."""

    def __init__(self, dims: int, eps: float = 1e-5):
        super().__init__()
        self.weight = mx.ones((dims,))
        self.eps = eps

    def __call__(self, x):
        dtype = x.dtype
        x = x.astype(mx.float32)
        variance = mx.mean(x * x, axis=-1, keepdims=True)
        x_normed = x * mx.rsqrt(variance + self.eps)
        return (x_normed * self.weight.astype(mx.float32)).astype(dtype)


class MLP(nn.Module):
    """SiLU-gated MLP (gate_proj * up_proj, then down_proj)."""

    def __init__(self, hidden_size: int, intermediate_size: int):
        super().__init__()
        self.gate_proj = nn.Linear(hidden_size, intermediate_size, bias=False)
        self.up_proj = nn.Linear(hidden_size, intermediate_size, bias=False)
        self.down_proj = nn.Linear(intermediate_size, hidden_size, bias=False)

    def __call__(self, x):
        return self.down_proj(nn.silu(self.gate_proj(x)) * self.up_proj(x))


class Attention(nn.Module):
    """Grouped Query Attention with rotary embeddings."""

    def __init__(self, config: TextConfig):
        super().__init__()
        self.num_heads = config.num_attention_heads
        self.num_kv_heads = config.num_key_value_heads
        self.head_dim = config.head_dim
        self.scale = self.head_dim ** -0.5

        self.q_proj = nn.Linear(config.hidden_size, self.num_heads * self.head_dim, bias=False)
        self.k_proj = nn.Linear(config.hidden_size, self.num_kv_heads * self.head_dim, bias=False)
        self.v_proj = nn.Linear(config.hidden_size, self.num_kv_heads * self.head_dim, bias=False)
        self.o_proj = nn.Linear(self.num_heads * self.head_dim, config.hidden_size, bias=False)

    def __call__(self, x, rotary, cache: KVCache, mask=None):
        B, L, _ = x.shape

        q = self.q_proj(x).reshape(B, L, self.num_heads, self.head_dim).transpose(0, 2, 1, 3)
        k = self.k_proj(x).reshape(B, L, self.num_kv_heads, self.head_dim).transpose(0, 2, 1, 3)
        v = self.v_proj(x).reshape(B, L, self.num_kv_heads, self.head_dim).transpose(0, 2, 1, 3)

        q, k = rotary(q, k, offset=cache.offset)
        k, v = cache.update(k, v)

        # Repeat KV heads for GQA
        repeats = self.num_heads // self.num_kv_heads
        if repeats > 1:
            k = mx.repeat(k, repeats, axis=1)
            v = mx.repeat(v, repeats, axis=1)

        # Scaled dot-product attention
        attn = (q @ k.transpose(0, 1, 3, 2)) * self.scale
        if mask is not None:
            attn = attn + mask
        attn = mx.softmax(attn.astype(mx.float32), axis=-1).astype(q.dtype)
        out = (attn @ v).transpose(0, 2, 1, 3).reshape(B, L, -1)

        return self.o_proj(out)


class DualFFNDecoderLayer(nn.Module):
    """Transformer layer with DualFFN: text and audio tokens share
    attention but route through separate FFN paths."""

    def __init__(self, config: HiggsAudioConfig, fast_forward: bool):
        super().__init__()
        tc = config.text_config
        self.fast_forward = fast_forward

        # Shared attention
        self.input_layernorm = RMSNorm(tc.hidden_size, tc.rms_norm_eps)
        self.self_attn = Attention(tc)

        # Text FFN path
        self.post_attention_layernorm = RMSNorm(tc.hidden_size, tc.rms_norm_eps)
        self.mlp = MLP(tc.hidden_size, tc.intermediate_size)

        # Audio FFN path
        self.audio_input_layernorm = RMSNorm(config.audio_ffn_hidden_size, tc.rms_norm_eps)
        self.audio_post_attention_layernorm = RMSNorm(config.audio_ffn_hidden_size, tc.rms_norm_eps)
        self.audio_mlp = MLP(config.audio_ffn_hidden_size, config.audio_ffn_intermediate_size)

    def __call__(self, x, rotary, cache: KVCache, causal_mask=None, audio_mask=None):
        residual = x

        # Pre-attention norm: use audio norm when all tokens are audio
        is_all_audio = audio_mask is not None and mx.all(audio_mask).item()
        if self.fast_forward or not is_all_audio:
            normed = self.input_layernorm(x)
        else:
            normed = self.audio_input_layernorm(x)

        attn_out = self.self_attn(normed, rotary, cache, causal_mask)
        hidden = residual + attn_out

        # FFN routing
        residual = hidden
        if audio_mask is not None and is_all_audio:
            normed = self.audio_post_attention_layernorm(hidden)
            return residual + self.audio_mlp(normed)
        else:
            normed = self.post_attention_layernorm(hidden)
            return residual + self.mlp(normed)


# ─── Full Model ───────────────────────────────────────────────


class HiggsAudioModel(nn.Module):
    """Higgs Audio V2 model on MLX."""

    def __init__(self, config: HiggsAudioConfig):
        super().__init__()
        self.config = config
        tc = config.text_config

        self.embed_tokens = nn.Embedding(tc.vocab_size, tc.hidden_size)

        self.layers = [
            DualFFNDecoderLayer(config, fast_forward=not config.has_dual_ffn(i))
            for i in range(tc.num_hidden_layers)
        ]

        self.norm = RMSNorm(tc.hidden_size, tc.rms_norm_eps)

        # Output heads
        self.text_lm_head = nn.Linear(tc.hidden_size, tc.vocab_size, bias=False)
        self.audio_lm_head = nn.Linear(tc.hidden_size, config.audio_lm_head_size, bias=False)

        # Audio codebook embeddings
        cb_vocab = config.audio_num_codebooks * config.audio_vocab_per_codebook
        self.audio_codebook_embeddings = nn.Embedding(cb_vocab, tc.hidden_size)

        self.rotary = RotaryEmbedding(tc)
        self.caches = [KVCache() for _ in range(tc.num_hidden_layers)]

    def forward(self, input_embeds, audio_mask=None):
        """Forward pass through all layers."""
        B, L, _ = input_embeds.shape

        # Build causal mask for prefill
        if L > 1:
            mask = nn.MultiHeadAttention.create_additive_causal_mask(L)
            mask = mask.astype(input_embeds.dtype)
        else:
            mask = None

        hidden = input_embeds
        for i, layer in enumerate(self.layers):
            hidden = layer(hidden, self.rotary, self.caches[i], mask, audio_mask)

        return self.norm(hidden)

    def embed_text(self, input_ids):
        """Embed text token IDs."""
        return self.embed_tokens(input_ids)

    def embed_audio_codes(self, codes: list[int]):
        """Embed 8 codebook IDs, sum across codebooks. Returns (1, 1, hidden)."""
        vocab_per_cb = self.config.audio_vocab_per_codebook
        shifted_ids = [code + cb * vocab_per_cb for cb, code in enumerate(codes)]
        ids = mx.array([shifted_ids])  # (1, 8)
        embeds = self.audio_codebook_embeddings(ids)  # (1, 8, hidden)
        return mx.sum(embeds, axis=1, keepdims=True)  # (1, 1, hidden)

    def text_logits(self, hidden):
        return self.text_lm_head(hidden)

    def audio_logits(self, hidden):
        """Returns (batch, seq, num_codebooks, vocab_per_cb)."""
        raw = self.audio_lm_head(hidden)
        B, S = raw.shape[0], raw.shape[1]
        return raw.reshape(B, S, self.config.audio_num_codebooks, self.config.audio_vocab_per_codebook)

    def reset_caches(self):
        for cache in self.caches:
            cache.reset()


# ─── Weight Loading ────────────────────────────────────────────


def _remap_key(key: str) -> str:
    """Map safetensors weight names to our MLX model structure.

    HuggingFace weight names use 'model.' prefix and different naming.
    """
    # Strip 'model.' prefix
    if key.startswith("model."):
        key = key[len("model."):]

    # audio_decoder_proj.text_lm_head -> text_lm_head
    if key.startswith("audio_decoder_proj.text_lm_head."):
        key = key.replace("audio_decoder_proj.text_lm_head.", "text_lm_head.")
    elif key.startswith("audio_decoder_proj.audio_lm_head."):
        key = key.replace("audio_decoder_proj.audio_lm_head.", "audio_lm_head.")

    return key


def load_weights(model: HiggsAudioModel, model_dir: Path, dtype=mx.bfloat16):
    """Load weights from HuggingFace safetensors into the MLX model."""
    weight_files = sorted(model_dir.glob("model-*.safetensors"))
    if not weight_files:
        raise FileNotFoundError(f"No safetensors files in {model_dir}")

    print(f"Loading {len(weight_files)} safetensors files...")

    weights = {}
    for wf in weight_files:
        print(f"  Loading {wf.name}...")
        # mx.load handles bfloat16 safetensors natively
        tensors = mx.load(str(wf))
        for name, array in tensors.items():
            mapped_name = _remap_key(name)
            weights[mapped_name] = array.astype(dtype)

    print(f"Loaded {len(weights)} tensors, applying to model...")

    # MLX load_weights expects list of (key, array) tuples
    model.load_weights(list(weights.items()))

    print("Weights loaded successfully.")
    return model
