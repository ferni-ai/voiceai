"""Tests for Code2Wav: codec tokens → waveform."""

import pytest

import mlx.core as mx
from mlx_qwen3_omni.code2wav import Qwen3OmniCode2Wav, Code2WavConfig


def test_code2wav_config_default():
    cfg = Code2WavConfig()
    assert cfg.hidden_size == 1024
    assert cfg.num_quantizers == 16
    assert cfg.total_upsample_factor() == 480
    assert cfg.sample_rate == 24_000


def test_code2wav_forward_shape():
    """Code2Wav: (1, 10, 16) codec tokens → (1, ~10*480) samples."""
    c2w = Qwen3OmniCode2Wav()
    batch, seq, num_q = 1, 10, 16
    ids = mx.zeros((batch, seq, num_q), dtype=mx.int32)
    out = c2w(ids)
    expected_samples = seq * c2w.total_upsample_factor()
    assert out.shape[0] == batch
    assert out.shape[1] >= expected_samples * 0.95
    assert out.shape[1] <= expected_samples * 1.05
    assert mx.all(mx.abs(out) <= 1.0 + 1e-5).item()


def test_code2wav_upsampler_output_length():
    """Upsampler: output length ≈ input_len * 480 (implementation-dependent)."""
    c2w = Qwen3OmniCode2Wav()
    for seq in (2, 5, 8):
        ids = mx.zeros((1, seq, 16), dtype=mx.int32)
        out = c2w(ids)
        expected = seq * 480
        assert abs(out.shape[1] - expected) <= expected // 10


def test_code2wav_waveform_range():
    """Output waveform in [-1, 1] (tanh)."""
    c2w = Qwen3OmniCode2Wav()
    ids = mx.zeros((1, 3, 16), dtype=mx.int32)
    out = c2w(ids)
    assert float(mx.min(out).item()) >= -1.01
    assert float(mx.max(out).item()) <= 1.01
