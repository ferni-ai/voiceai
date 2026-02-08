"""
Qwen3-Omni Talker: Thinker hidden states (layer 18) → codec logits (batch, seq, 32, 2048).

Input projection → 20 MoE decoder layers → 5 dense code predictor layers → lm_head.
Reference: apps/rust-perf/src/candle_talker.rs
"""

from __future__ import annotations

from typing import Any, Optional

import mlx.core as mx
import mlx.nn as nn

from mlx_qwen3_omni._base import KVCache, create_attention_mask, scaled_dot_product_attention
from mlx_qwen3_omni.thinker.layers import DecoderLayer, ThinkerModelArgs
from mlx_qwen3_omni.talker.config import (
    TalkerCodePredictorConfig,
    TalkerConfig,
    TalkerTextConfig,
)


def _talker_text_to_thinker_args(tc: TalkerTextConfig) -> ThinkerModelArgs:
    """Build ThinkerModelArgs from TalkerTextConfig so we can reuse DecoderLayer."""
    return ThinkerModelArgs(
        model_type="qwen3_omni_moe_talker",
        hidden_size=tc.hidden_size,
        num_hidden_layers=tc.num_hidden_layers,
        num_attention_heads=tc.num_attention_heads,
        num_key_value_heads=tc.num_key_value_heads,
        num_experts=tc.num_experts,
        num_experts_per_tok=tc.num_experts_per_tok,
        moe_intermediate_size=tc.moe_intermediate_size,
        shared_expert_intermediate_size=tc.shared_expert_intermediate_size,
        rms_norm_eps=tc.rms_norm_eps,
        vocab_size=tc.vocab_size,
        rope_theta=tc.rope_theta,
        attention_bias=False,
        use_qk_norm=True,
        head_dim=tc.head_dim,
        max_position_embeddings=tc.max_position_embeddings,
        tie_word_embeddings=False,
    )


def _code_predictor_to_thinker_args(cp: TalkerCodePredictorConfig) -> ThinkerModelArgs:
    """Build ThinkerModelArgs for code predictor attention (dense; we replace MoE with MLP)."""
    return ThinkerModelArgs(
        model_type="qwen3_omni_code_predictor",
        hidden_size=cp.hidden_size,
        num_hidden_layers=cp.num_hidden_layers,
        num_attention_heads=cp.num_attention_heads,
        num_key_value_heads=cp.num_key_value_heads,
        num_experts=1,
        num_experts_per_tok=1,
        moe_intermediate_size=cp.intermediate_size,
        shared_expert_intermediate_size=0,
        rms_norm_eps=cp.rms_norm_eps,
        vocab_size=cp.vocab_size,
        rope_theta=cp.rope_theta,
        attention_bias=False,
        use_qk_norm=True,
        head_dim=cp.head_dim,
        max_position_embeddings=cp.max_position_embeddings,
        tie_word_embeddings=False,
    )


class CodePredictorMLP(nn.Module):
    """SiLU-gated MLP (gate_proj, up_proj, down_proj). Dense, no MoE."""

    def __init__(self, hidden_size: int, intermediate_size: int) -> None:
        super().__init__()
        self.gate_proj = nn.Linear(hidden_size, intermediate_size, bias=False)
        self.up_proj = nn.Linear(hidden_size, intermediate_size, bias=False)
        self.down_proj = nn.Linear(intermediate_size, hidden_size, bias=False)

    def __call__(self, x: mx.array) -> mx.array:
        gate = nn.silu(self.gate_proj(x))
        up = self.up_proj(x)
        return self.down_proj(gate * up)


class CodePredictorLayer(nn.Module):
    """Single code predictor layer: pre-norm attention + pre-norm SiLU MLP + residuals."""

    def __init__(self, args: ThinkerModelArgs) -> None:
        super().__init__()
        from mlx_qwen3_omni.thinker.layers import Attention

        self.self_attn = Attention(args)
        self.mlp = CodePredictorMLP(args.hidden_size, args.moe_intermediate_size)
        self.input_layernorm = nn.RMSNorm(args.hidden_size, eps=args.rms_norm_eps)
        self.post_attention_layernorm = nn.RMSNorm(args.hidden_size, eps=args.rms_norm_eps)

    def __call__(
        self,
        x: mx.array,
        mask: Optional[mx.array] = None,
        cache: Optional[Any] = None,
    ) -> mx.array:
        r = self.self_attn(self.input_layernorm(x), mask, cache)
        h = x + r
        r = self.mlp(self.post_attention_layernorm(h))
        return h + r


class TalkerTextDecoder(nn.Module):
    """20 MoE decoder layers + final RMSNorm. Input: projected hidden (B, L, 1024)."""

    def __init__(self, config: TalkerTextConfig) -> None:
        super().__init__()
        args = _talker_text_to_thinker_args(config)
        self.layers = [DecoderLayer(args) for _ in range(config.num_hidden_layers)]
        self.norm = nn.RMSNorm(config.hidden_size, eps=config.rms_norm_eps)
        self._num_layers = config.num_hidden_layers

    def __call__(
        self,
        hidden_states: mx.array,
        mask: Optional[mx.array] = None,
        cache: Optional[list[Any]] = None,
    ) -> mx.array:
        if cache is None:
            cache = [None] * len(self.layers)
        h = hidden_states
        for layer, c in zip(self.layers, cache):
            h = layer(h, mask, c)
        return self.norm(h)


class CodePredictor(nn.Module):
    """5 dense decoder layers + norm + lm_head → (batch, seq, num_code_groups, vocab_size)."""

    def __init__(self, config: TalkerCodePredictorConfig) -> None:
        super().__init__()
        args = _code_predictor_to_thinker_args(config)
        self.layers = [CodePredictorLayer(args) for _ in range(config.num_hidden_layers)]
        self.norm = nn.RMSNorm(config.hidden_size, eps=config.rms_norm_eps)
        self.lm_head = nn.Linear(
            config.hidden_size,
            config.num_code_groups * config.vocab_size,
            bias=False,
        )
        self.num_code_groups = config.num_code_groups
        self.vocab_size = config.vocab_size
        self._num_layers = config.num_hidden_layers

    def __call__(
        self,
        hidden_states: mx.array,
        mask: Optional[mx.array] = None,
        cache: Optional[list[Any]] = None,
    ) -> mx.array:
        if cache is None:
            cache = [None] * len(self.layers)
        h = hidden_states
        for layer, c in zip(self.layers, cache):
            h = layer(h, mask, c)
        h = self.norm(h)
        logits = self.lm_head(h)
        B, L, _ = logits.shape
        return logits.reshape(B, L, self.num_code_groups, self.vocab_size)


class Qwen3OmniTalker(nn.Module):
    """
    Talker: Thinker hidden states (batch, seq, 2048) → codec logits (batch, seq, 32, 2048).

    input_proj → text_decoder (20 MoE) → code_predictor (5 dense) → lm_head.
    """

    def __init__(self, config: TalkerConfig | dict[str, Any]) -> None:
        super().__init__()
        if isinstance(config, dict):
            config = TalkerConfig.from_dict(config)
        self.config = config
        tc = config.text_config or TalkerTextConfig()
        cp = config.code_predictor_config or TalkerCodePredictorConfig()

        self.input_proj = nn.Linear(config.thinker_hidden_size, tc.hidden_size, bias=False)
        self.text_decoder = TalkerTextDecoder(tc)
        self.code_predictor = CodePredictor(cp)
        self._text_layers = tc.num_hidden_layers
        self._code_layers = cp.num_hidden_layers

    def make_cache(self) -> "TalkerKvCache":
        """Create empty KV caches for text decoder (20) and code predictor (5)."""
        return TalkerKvCache(
            text_decoder=[KVCache() for _ in range(self._text_layers)],
            code_predictor=[KVCache() for _ in range(self._code_layers)],
        )

    def __call__(
        self,
        thinker_hidden_states: mx.array,
        cache: Optional["TalkerKvCache"] = None,
        seqlen_offset: int = 0,
    ) -> mx.array:
        """
        Forward: thinker_hidden_states (batch, seq, 2048) → codec logits (batch, seq, 32, 2048).
        """
        projected = self.input_proj(thinker_hidden_states)
        B, L, _ = projected.shape
        first_cache = cache.text_decoder[0] if cache is not None else None
        mask = (
            create_attention_mask(projected, first_cache, return_array=True)
            if L > 1
            else None
        )

        text_cache = cache.text_decoder if cache else [None] * self._text_layers
        hidden = self.text_decoder(projected, mask, text_cache)

        code_cache = cache.code_predictor if cache else [None] * self._code_layers
        return self.code_predictor(hidden, mask, code_cache)


class TalkerKvCache:
    """KV cache for Talker: text decoder (20 layers) + code predictor (5 layers)."""

    def __init__(
        self,
        text_decoder: list[Any],
        code_predictor: list[Any],
    ) -> None:
        self.text_decoder = text_decoder
        self.code_predictor = code_predictor
