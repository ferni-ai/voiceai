"""
Thinker: MoE multimodal backbone (text, image, audio, video) → text.

Phase 1: MoE transformer (text-only) implemented; encoders stubbed.
"""

from mlx_qwen3_omni.thinker.layers import ThinkerModelArgs
from mlx_qwen3_omni.thinker.model import Qwen3OmniThinker

__all__ = ["Qwen3OmniThinker", "ThinkerModelArgs"]
