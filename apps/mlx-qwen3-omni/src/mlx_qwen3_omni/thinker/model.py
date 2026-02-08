"""
Qwen3-Omni Thinker model in MLX: MoE backbone (text-only Phase 1) → text logits.
"""

from __future__ import annotations

from typing import Any, Optional

import mlx.core as mx
import mlx.nn as nn

from mlx_qwen3_omni._base import create_attention_mask
from mlx_qwen3_omni.thinker.layers import (
    DecoderLayer,
    ThinkerModelArgs,
)


class ThinkerModel(nn.Module):
    """Thinker backbone: embed → layers → norm (no lm_head)."""

    def __init__(self, args: ThinkerModelArgs):
        super().__init__()
        self.args = args
        self.vocab_size = args.vocab_size
        self.num_hidden_layers = args.num_hidden_layers
        self.embed_tokens = nn.Embedding(args.vocab_size, args.hidden_size)
        self.layers = [
            DecoderLayer(args=args) for _ in range(args.num_hidden_layers)
        ]
        self.norm = nn.RMSNorm(args.hidden_size, eps=args.rms_norm_eps)

    def __call__(
        self,
        inputs: mx.array,
        cache: Optional[list[Any]] = None,
        audio_features: Optional[mx.array] = None,
    ) -> mx.array:
        final, _ = self._forward_with_extract(
            inputs, cache, audio_features, extract_layer=None
        )
        return final

    def _forward_with_extract(
        self,
        inputs: mx.array,
        cache: Optional[list[Any]] = None,
        audio_features: Optional[mx.array] = None,
        extract_layer: Optional[int] = None,
    ) -> tuple[mx.array, Optional[mx.array]]:
        """Forward; optionally return hidden state at extract_layer (0-indexed, e.g. 18 for Talker)."""
        if audio_features is not None:
            text_emb = self.embed_tokens(inputs)
            h = mx.concatenate([audio_features, text_emb], axis=1)
        else:
            h = self.embed_tokens(inputs)
        if cache is None:
            cache = [None] * len(self.layers)
        mask = create_attention_mask(h, cache[0] if cache else None)
        extracted = None
        for i, (layer, c) in enumerate(zip(self.layers, cache)):
            h = layer(h, mask, c)
            if extract_layer is not None and i == extract_layer:
                extracted = h
        final = self.norm(h)
        if extracted is None:
            extracted = final
        return final, extracted


class Qwen3OmniThinker(nn.Module):
    """
    Thinker: MoE backbone → text logits.
    Phase 1: text-only (no modality encoders). Forward takes input_ids only.
    """

    def __init__(self, config: dict[str, Any]):
        super().__init__()
        if "text_config" in config:
            args = ThinkerModelArgs.from_dict(config)
        else:
            args = ThinkerModelArgs.from_dict({"text_config": config})
        self.args = args
        self.model_type = args.model_type
        self.model = ThinkerModel(args)
        self.lm_head = (
            None
            if args.tie_word_embeddings
            else nn.Linear(args.hidden_size, args.vocab_size, bias=False)
        )

    def __call__(
        self,
        input_ids: mx.array,
        cache: Optional[list[Any]] = None,
        audio_features: Optional[mx.array] = None,
    ) -> mx.array:
        out = self.model(input_ids, cache, audio_features)
        if self.lm_head is not None:
            out = self.lm_head(out)
        else:
            out = self.model.embed_tokens.as_linear(out)
        return out

    def forward_with_hidden_states(
        self,
        input_ids: mx.array,
        cache: Optional[list[Any]] = None,
        audio_features: Optional[mx.array] = None,
        extract_layer: int = 18,
    ) -> tuple[mx.array, mx.array]:
        """
        Forward and return (logits, hidden_at_layer).
        hidden_at_layer is the hidden state at extract_layer (default 18) for Talker input.
        """
        final_hidden, extracted = self.model._forward_with_extract(
            input_ids, cache, audio_features, extract_layer=extract_layer
        )
        if self.lm_head is not None:
            logits = self.lm_head(final_hidden)
        else:
            logits = self.model.embed_tokens.as_linear(final_hidden)
        return logits, extracted

    def sanitize(self, weights: dict[str, mx.array]) -> dict[str, mx.array]:
        """Convert HF experts.0..N.* to switch_mlp.* (stacked) like qwen2_moe.
        Keys are model.layers.* after _map_hf_to_mlx (backbone prefix is model.).
        """
        # Check for HF MoE layout (experts.0, experts.1, ...)
        if "model.layers.0.mlp.experts.0.up_proj.weight" not in weights:
            return weights
        args = self.args
        for layer_idx in range(args.num_hidden_layers):
            prefix = f"model.layers.{layer_idx}.mlp"
            for proj in ["up_proj", "down_proj", "gate_proj"]:
                for suffix in ["weight", "scales", "biases"]:
                    key = f"{prefix}.experts.0.{proj}.{suffix}"
                    if key not in weights:
                        continue
                    to_join = [
                        weights.pop(f"{prefix}.experts.{e}.{proj}.{suffix}")
                        for e in range(args.num_experts)
                    ]
                    weights[f"{prefix}.switch_mlp.{proj}.{suffix}"] = mx.stack(to_join)
        return weights

    @property
    def layers(self) -> list[DecoderLayer]:
        return self.model.layers

    def make_cache(self) -> list[Any]:
        from mlx_qwen3_omni._base import KVCache
        return [KVCache() for _ in range(len(self.model.layers))]
