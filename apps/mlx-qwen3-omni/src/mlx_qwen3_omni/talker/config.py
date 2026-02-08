"""
Talker config: text decoder (20 MoE) + code predictor (5 dense).
Defaults match HuggingFace Qwen3OmniMoeTalkerConfig.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class TalkerTextConfig:
    """Talker text decoder: 20 MoE layers, 128 experts, top-8."""

    vocab_size: int = 4206
    hidden_size: int = 1024
    num_hidden_layers: int = 20
    num_attention_heads: int = 16
    num_key_value_heads: int = 2
    num_experts: int = 128
    num_experts_per_tok: int = 8
    moe_intermediate_size: int = 384
    shared_expert_intermediate_size: int = 0
    rms_norm_eps: float = 1e-6
    rope_theta: float = 1_000_000.0
    max_position_embeddings: int = 65536
    head_dim: int = 64

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "TalkerTextConfig":
        return cls(
            vocab_size=d.get("vocab_size", 4206),
            hidden_size=d.get("hidden_size", 1024),
            num_hidden_layers=d.get("num_hidden_layers", 20),
            num_attention_heads=d.get("num_attention_heads", 16),
            num_key_value_heads=d.get("num_key_value_heads", 2),
            num_experts=d.get("num_experts", 128),
            num_experts_per_tok=d.get("num_experts_per_tok", 8),
            moe_intermediate_size=d.get("moe_intermediate_size", 384),
            shared_expert_intermediate_size=d.get("shared_expert_intermediate_size", 0),
            rms_norm_eps=float(d.get("rms_norm_eps", 1e-6)),
            rope_theta=float(d.get("rope_theta", 1_000_000.0)),
            max_position_embeddings=d.get("max_position_embeddings", 65536),
            head_dim=d.get("head_dim", 64),
        )


@dataclass
class TalkerCodePredictorConfig:
    """Code predictor: 5 dense decoder layers, output 32 x 2048 codec logits."""

    hidden_size: int = 1024
    num_hidden_layers: int = 5
    num_attention_heads: int = 16
    num_key_value_heads: int = 8
    intermediate_size: int = 3072
    rms_norm_eps: float = 1e-6
    rope_theta: float = 1_000_000.0
    max_position_embeddings: int = 65536
    head_dim: int = 64
    num_code_groups: int = 32
    vocab_size: int = 2048

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "TalkerCodePredictorConfig":
        return cls(
            hidden_size=d.get("hidden_size", 1024),
            num_hidden_layers=d.get("num_hidden_layers", 5),
            num_attention_heads=d.get("num_attention_heads", 16),
            num_key_value_heads=d.get("num_key_value_heads", 8),
            intermediate_size=d.get("intermediate_size", 3072),
            rms_norm_eps=float(d.get("rms_norm_eps", 1e-6)),
            rope_theta=float(d.get("rope_theta", 1_000_000.0)),
            max_position_embeddings=d.get("max_position_embeddings", 65536),
            head_dim=d.get("head_dim", 64),
            num_code_groups=d.get("num_code_groups", 32),
            vocab_size=d.get("vocab_size", 2048),
        )


@dataclass
class TalkerConfig:
    """Full Talker config: thinker hidden size, accept layer, text + code predictor."""

    thinker_hidden_size: int = 2048
    accept_hidden_layer: int = 18
    num_code_groups: int = 32
    text_config: TalkerTextConfig | None = None
    code_predictor_config: TalkerCodePredictorConfig | None = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "TalkerConfig":
        talker = d.get("talker_config") or d
        if isinstance(talker, dict):
            text = talker.get("text_config") or {}
            code = talker.get("code_predictor_config") or {}
        else:
            text, code = {}, {}
        if isinstance(text, dict):
            text = TalkerTextConfig.from_dict(text)
        if isinstance(code, dict):
            code = TalkerCodePredictorConfig.from_dict(code)
        return cls(
            thinker_hidden_size=talker.get("thinker_hidden_size", 2048) if isinstance(talker, dict) else 2048,
            accept_hidden_layer=talker.get("accept_hidden_layer", 18) if isinstance(talker, dict) else 18,
            num_code_groups=talker.get("num_code_groups", 32) if isinstance(talker, dict) else 32,
            text_config=text,
            code_predictor_config=code,
        )
