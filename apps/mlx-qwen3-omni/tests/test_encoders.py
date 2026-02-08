"""Tests for audio encoder (AuT)."""

import numpy as np
import pytest

import mlx.core as mx
from mlx_qwen3_omni.encoders.audio import (
    AudioEncoderConfig,
    Qwen3OmniAudioEncoder,
    _conv_output_mel_dim,
)


def test_audio_encoder_config_default():
    cfg = AudioEncoderConfig()
    assert cfg.d_model == 1280
    assert cfg.encoder_layers == 32
    assert cfg.output_dim == 2048


def test_conv_output_mel_dim():
    # After 3 stride-2 convs from 128: 128->64->32->16
    assert _conv_output_mel_dim(128, 3) == 16


def test_aut_forward_shape():
    """AuT forward with random mel input: output (batch, seq, 2048)."""
    encoder = Qwen3OmniAudioEncoder()
    # Mel shape: (batch=1, num_mel_bins=128, time=100)
    mel = mx.random.normal((1, 128, 100))
    out = encoder(mel)
    assert out.shape[0] == 1
    assert out.shape[2] == 2048
    # Seq length is time reduced by 3x stride-2 convs: 100 -> 50 -> 25 -> 13
    assert out.shape[1] >= 1


def test_aut_conv_stem_dimensions():
    """Conv stem: 3x stride-2 reduces (128, T) to (16, T/8)."""
    encoder = Qwen3OmniAudioEncoder()
    # (1, 128, 64) mel -> after convs: H=16, W=8
    mel = mx.random.normal((1, 128, 64))
    out = encoder(mel)
    # seq = 8 (time dimension after 3 stride-2)
    assert out.shape[1] == 8
    assert out.shape[2] == 2048
