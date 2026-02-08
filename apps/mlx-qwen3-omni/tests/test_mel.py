"""Tests for mel spectrogram preprocessing."""

import numpy as np
import pytest

from mlx_qwen3_omni.audio.mel import (
    HOP_LENGTH,
    N_FFT,
    N_MELS,
    SAMPLE_RATE,
    MelSpectrogram,
    compute_mel,
)


def test_mel_constants():
    assert N_FFT == 400
    assert HOP_LENGTH == 160
    assert N_MELS == 128
    assert SAMPLE_RATE == 16_000


def test_mel_compute_empty():
    mel = MelSpectrogram()
    out = mel.compute([])
    assert out.shape == (1, N_MELS, 1)
    assert out.dtype == np.float32


def test_mel_compute_short():
    mel = MelSpectrogram()
    samples = np.array([0.01 * np.sin(0.1 * i) for i in range(800)], dtype=np.float32)
    out = mel.compute(samples)
    assert out.shape[0] == 1
    assert out.shape[1] == N_MELS
    assert out.shape[2] >= 1
    assert out.dtype == np.float32


def test_compute_mel_one_shot():
    samples = np.random.randn(1600).astype(np.float32) * 0.01
    out = compute_mel(samples)
    assert out.shape == (1, N_MELS, out.shape[2])
    assert out.dtype == np.float32
