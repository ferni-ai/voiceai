"""
Talker: Thinker hidden states (layer 18) → codec token logits for Code2Wav.

20 MoE decoder layers + 5 dense code predictor layers → (batch, seq, 32, 2048).
Reference: apps/rust-perf/src/candle_talker.rs
"""

from mlx_qwen3_omni.talker.config import TalkerConfig, TalkerCodePredictorConfig, TalkerTextConfig
from mlx_qwen3_omni.talker.model import Qwen3OmniTalker

__all__ = [
    "Qwen3OmniTalker",
    "TalkerConfig",
    "TalkerTextConfig",
    "TalkerCodePredictorConfig",
]
