"""Tests for Talker: Thinker hidden → codec logits."""

import pytest

import mlx.core as mx
from mlx_qwen3_omni.talker import Qwen3OmniTalker, TalkerConfig


def test_talker_config_default():
    cfg = TalkerConfig.from_dict({})
    assert cfg.thinker_hidden_size == 2048
    assert cfg.accept_hidden_layer == 18
    assert cfg.num_code_groups == 32
    assert cfg.text_config.hidden_size == 1024
    assert cfg.text_config.num_experts_per_tok == 8
    assert cfg.code_predictor_config.num_hidden_layers == 5
    assert cfg.code_predictor_config.vocab_size == 2048


def test_talker_forward_shape():
    """Talker forward: (1, 4, 2048) → (1, 4, 32, 2048)."""
    config = TalkerConfig.from_dict({})
    talker = Qwen3OmniTalker(config)
    thinker_hidden = mx.random.normal((1, 4, 2048))
    out = talker(thinker_hidden)
    assert out.shape == (1, 4, 32, 2048)


def test_talker_kv_cache():
    """KV cache: prefill then decode one step."""
    config = TalkerConfig.from_dict({})
    talker = Qwen3OmniTalker(config)
    cache = talker.make_cache()
    x1 = mx.random.normal((1, 4, 2048))
    _ = talker(x1, cache=cache)
    x2 = mx.random.normal((1, 1, 2048))
    out = talker(x2, cache=cache)
    assert out.shape == (1, 1, 32, 2048)
    assert cache.text_decoder[0].offset == 5
    assert cache.code_predictor[0].offset == 5


def test_talker_codec_logits_shape():
    """Code predictor output: (batch, seq, 32, 2048)."""
    config = TalkerConfig.from_dict({})
    talker = Qwen3OmniTalker(config)
    for seq in (1, 3, 8):
        x = mx.random.normal((1, seq, 2048))
        out = talker(x)
        assert out.shape == (1, seq, 32, 2048)
