"""
Tests for generate (load model + config from MLX dir).
"""

import json
from pathlib import Path

import pytest

from mlx_qwen3_omni.generate import load_model_and_config
from mlx_qwen3_omni.thinker import Qwen3OmniThinker


def test_load_model_and_config(tmp_path: Path) -> None:
    """Load Thinker and config from dir with thinker_config.json + model.safetensors."""
    config = {
        "text_config": {
            "model_type": "qwen3_omni_moe_thinker",
            "hidden_size": 64,
            "num_hidden_layers": 2,
            "num_attention_heads": 4,
            "num_key_value_heads": 2,
            "num_experts": 4,
            "num_experts_per_tok": 2,
            "moe_intermediate_size": 32,
            "shared_expert_intermediate_size": 0,
            "rms_norm_eps": 1e-6,
            "vocab_size": 256,
            "rope_theta": 10000.0,
            "attention_bias": False,
            "tie_word_embeddings": False,
        }
    }
    (tmp_path / "thinker_config.json").write_text(json.dumps(config, indent=2))

    model = Qwen3OmniThinker(config)
    model.save_weights(str(tmp_path / "model.safetensors"))

    loaded_model, loaded_config, _ = load_model_and_config(tmp_path)
    assert loaded_model is not None
    assert isinstance(loaded_model, Qwen3OmniThinker)
    assert loaded_config["text_config"]["hidden_size"] == 64
    assert loaded_model.args.hidden_size == 64
    assert loaded_model.args.num_hidden_layers == 2


def test_generate_max_tokens_zero_returns_decoded_prompt() -> None:
    """generate(..., max_new_tokens=0) returns tokenizer.decode(prompt) without running model."""
    from mlx_qwen3_omni.generate import generate

    config = {
        "text_config": {
            "hidden_size": 64,
            "num_hidden_layers": 2,
            "num_attention_heads": 4,
            "num_key_value_heads": 2,
            "num_experts": 4,
            "num_experts_per_tok": 2,
            "moe_intermediate_size": 32,
            "shared_expert_intermediate_size": 0,
            "rms_norm_eps": 1e-6,
            "vocab_size": 256,
        }
    }
    model = Qwen3OmniThinker(config)

    class MockTokenizer:
        def encode(self, text, add_special_tokens=True):
            return [1, 2, 3] if text else [1]

        def decode(self, ids, skip_special_tokens=True):
            return "decoded"

    out = generate(model, MockTokenizer(), "hello", max_new_tokens=0)
    assert out == "decoded"
