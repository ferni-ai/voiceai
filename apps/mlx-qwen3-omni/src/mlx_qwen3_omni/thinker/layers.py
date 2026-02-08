"""
Thinker layers in MLX: attention, MoE block (SwitchGLU + optional shared expert), RoPE, RMSNorm.
Mirrors Qwen2MoE / Qwen3-Omni Thinker text backbone.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Optional

import mlx.core as mx
import mlx.nn as nn

from mlx_qwen3_omni._base import create_attention_mask, scaled_dot_product_attention


def _swiglu(gate: mx.array, x: mx.array) -> mx.array:
    return nn.silu(gate) * x


class _SwitchLinear(nn.Module):
    """Per-expert linear; weight shape (num_experts, output_dims, input_dims)."""

    def __init__(self, input_dims: int, output_dims: int, num_experts: int):
        super().__init__()
        scale = math.sqrt(1 / input_dims)
        self.weight = mx.random.uniform(
            low=-scale, high=scale, shape=(num_experts, output_dims, input_dims)
        )

    def __call__(self, x: mx.array, indices: mx.array, sorted_indices: bool = False) -> mx.array:
        # x (N, input_dims), indices (N,); weight (E, output_dims, input_dims)
        w = mx.take(self.weight, indices, axis=0)  # (N, output_dims, input_dims)
        # (N, input_dims) @ (N, input_dims, output_dims) -> (N, output_dims)
        return mx.squeeze(mx.matmul(x[:, None, :], w.swapaxes(-1, -2)), axis=1)


class _SwitchGLU(nn.Module):
    """SwitchGLU: gate_proj, up_proj, down_proj with SiLU(gate)*up. x (B,L,dim), indices (B,L,top_k) -> (B,L,top_k,dim)."""

    def __init__(self, input_dims: int, hidden_dims: int, num_experts: int):
        super().__init__()
        self.gate_proj = _SwitchLinear(input_dims, hidden_dims, num_experts)
        self.up_proj = _SwitchLinear(input_dims, hidden_dims, num_experts)
        self.down_proj = _SwitchLinear(hidden_dims, input_dims, num_experts)

    def __call__(self, x: mx.array, indices: mx.array) -> mx.array:
        B, L, D = x.shape
        _, _, K = indices.shape
        # (B, L, dim) -> (B, L, top_k, dim) so each token runs through top_k experts
        x_flat = mx.broadcast_to(mx.expand_dims(x, 2), (B, L, K, D)).reshape(-1, D)
        idx_flat = indices.reshape(-1)
        do_sort = idx_flat.size >= 64
        if do_sort:
            order = mx.argsort(idx_flat)
            inv_order = mx.argsort(order)
            x_flat = x_flat[order]
            idx_flat = idx_flat[order]
        idx_flat = mx.stop_gradient(idx_flat)
        up = self.up_proj(x_flat, idx_flat, sorted_indices=do_sort)
        gate = self.gate_proj(x_flat, idx_flat, sorted_indices=do_sort)
        y = self.down_proj(_swiglu(gate, up), idx_flat, sorted_indices=do_sort)
        if do_sort:
            y = y[inv_order]
        return y.reshape(B, L, K, D)


@dataclass
class ThinkerModelArgs:
    """Args for Thinker text backbone (from thinker_config.text_config)."""

    model_type: str
    hidden_size: int
    num_hidden_layers: int
    num_attention_heads: int
    num_key_value_heads: int
    num_experts: int
    num_experts_per_tok: int
    moe_intermediate_size: int
    shared_expert_intermediate_size: int
    rms_norm_eps: float
    vocab_size: int
    rope_theta: float = 1_000_000
    attention_bias: bool = False
    use_qk_norm: bool = True
    head_dim: Optional[int] = None
    max_position_embeddings: Optional[int] = None
    tie_word_embeddings: bool = False

    @classmethod
    def from_dict(cls, params: dict[str, Any]) -> "ThinkerModelArgs":
        # Flatten text_config if nested
        text = params.get("text_config", params)
        head_dim = text.get("head_dim")
        if head_dim is None and "hidden_size" in text and "num_attention_heads" in text:
            head_dim = text["hidden_size"] // text["num_attention_heads"]
        return cls(
            model_type=text.get("model_type", "qwen3_omni_moe_thinker"),
            hidden_size=text.get("hidden_size", 2048),
            num_hidden_layers=text.get("num_hidden_layers", 48),
            num_attention_heads=text.get("num_attention_heads", 32),
            num_key_value_heads=text.get("num_key_value_heads", 4),
            num_experts=text.get("num_experts", 128),
            num_experts_per_tok=text.get("num_experts_per_tok", 8),
            moe_intermediate_size=text.get("moe_intermediate_size", 768),
            shared_expert_intermediate_size=text.get("shared_expert_intermediate_size", 0),
            rms_norm_eps=text.get("rms_norm_eps", 1e-6),
            vocab_size=text.get("vocab_size", 152_064),
            rope_theta=float(text.get("rope_theta", 1_000_000)),
            attention_bias=text.get("attention_bias", False),
            use_qk_norm=text.get("use_qk_norm", True),
            head_dim=head_dim,
            max_position_embeddings=text.get("max_position_embeddings"),
            tie_word_embeddings=text.get("tie_word_embeddings", False),
        )


class Attention(nn.Module):
    def __init__(self, args: ThinkerModelArgs):
        super().__init__()
        dim = args.hidden_size
        n_heads = args.num_attention_heads
        n_kv_heads = args.num_key_value_heads
        head_dim = args.head_dim or (dim // n_heads)
        self.n_heads = n_heads
        self.n_kv_heads = n_kv_heads
        self.scale = head_dim**-0.5

        self.q_proj = nn.Linear(dim, n_heads * head_dim, bias=args.attention_bias)
        self.k_proj = nn.Linear(dim, n_kv_heads * head_dim, bias=args.attention_bias)
        self.v_proj = nn.Linear(dim, n_kv_heads * head_dim, bias=args.attention_bias)
        self.o_proj = nn.Linear(n_heads * head_dim, dim, bias=False)

        # QK normalization (RMSNorm on Q/K after projection, before RoPE)
        self.use_qk_norm = getattr(args, "use_qk_norm", True)
        if self.use_qk_norm:
            self.q_norm = nn.RMSNorm(head_dim, eps=args.rms_norm_eps)
            self.k_norm = nn.RMSNorm(head_dim, eps=args.rms_norm_eps)
        else:
            self.q_norm = None
            self.k_norm = None

        self.rope = nn.RoPE(head_dim, traditional=False, base=args.rope_theta)

    def __call__(
        self,
        x: mx.array,
        mask: Optional[mx.array] = None,
        cache: Optional[Any] = None,
    ) -> mx.array:
        B, L, D = x.shape
        queries = self.q_proj(x)
        keys = self.k_proj(x)
        values = self.v_proj(x)

        queries = queries.reshape(B, L, self.n_heads, -1)
        keys = keys.reshape(B, L, self.n_kv_heads, -1)
        values = values.reshape(B, L, self.n_kv_heads, -1)

        if self.q_norm is not None and self.k_norm is not None:
            queries = self.q_norm(queries)
            keys = self.k_norm(keys)

        queries = queries.transpose(0, 2, 1, 3)
        keys = keys.transpose(0, 2, 1, 3)
        values = values.transpose(0, 2, 1, 3)

        if cache is not None:
            queries = self.rope(queries, offset=cache.offset)
            keys = self.rope(keys, offset=cache.offset)
            keys, values = cache.update_and_fetch(keys, values)
        else:
            queries = self.rope(queries)
            keys = self.rope(keys)

        output = scaled_dot_product_attention(
            queries, keys, values, cache=cache, scale=self.scale, mask=mask
        )
        output = output.transpose(0, 2, 1, 3).reshape(B, L, -1)
        return self.o_proj(output)


class MLP(nn.Module):
    """Single expert MLP (gate/up/down with SwiGLU)."""

    def __init__(self, dim: int, hidden_dim: int):
        super().__init__()
        self.gate_proj = nn.Linear(dim, hidden_dim, bias=False)
        self.down_proj = nn.Linear(hidden_dim, dim, bias=False)
        self.up_proj = nn.Linear(dim, hidden_dim, bias=False)

    def __call__(self, x: mx.array) -> mx.array:
        return self.down_proj(_swiglu(self.gate_proj(x), self.up_proj(x)))


class SparseMoeBlock(nn.Module):
    """MoE block: router + SwitchGLU experts + optional shared expert."""

    def __init__(self, args: ThinkerModelArgs):
        super().__init__()
        dim = args.hidden_size
        intermediate_size = args.moe_intermediate_size
        shared_size = args.shared_expert_intermediate_size
        num_experts = args.num_experts
        top_k = args.num_experts_per_tok

        self.gate = nn.Linear(dim, num_experts, bias=False)
        self.switch_mlp = _SwitchGLU(dim, intermediate_size, num_experts)
        self.num_experts = num_experts
        self.top_k = top_k

        self.shared_expert = MLP(dim, shared_size) if shared_size > 0 else None
        self.shared_expert_gate = nn.Linear(dim, 1, bias=False) if shared_size > 0 else None

    def __call__(self, x: mx.array) -> mx.array:
        gates = self.gate(x)
        k = self.top_k
        # norm_topk_prob: select top-k first, then softmax only over those (not all 128 experts)
        inds = mx.stop_gradient(mx.argpartition(-gates, kth=k - 1, axis=-1)[..., :k])
        topk_gates = mx.take_along_axis(gates, inds, axis=-1)
        scores = mx.softmax(topk_gates, axis=-1, precise=True)

        y = self.switch_mlp(x, inds)  # (B, L, top_k, dim)
        y = (y * scores[..., None]).sum(axis=-2)  # (B, L, dim)

        if self.shared_expert is not None and self.shared_expert_gate is not None:
            shared_out = self.shared_expert(x)
            shared_out = mx.sigmoid(self.shared_expert_gate(x)) * shared_out
            y = y + shared_out

        return y


class DecoderLayer(nn.Module):
    def __init__(self, args: ThinkerModelArgs):
        super().__init__()
        self.self_attn = Attention(args)
        self.mlp = SparseMoeBlock(args)
        self.input_layernorm = nn.RMSNorm(args.hidden_size, eps=args.rms_norm_eps)
        self.post_attention_layernorm = nn.RMSNorm(
            args.hidden_size, eps=args.rms_norm_eps
        )
        self.args = args

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


__all__ = [
    "ThinkerModelArgs",
    "Attention",
    "MLP",
    "SparseMoeBlock",
    "DecoderLayer",
]
