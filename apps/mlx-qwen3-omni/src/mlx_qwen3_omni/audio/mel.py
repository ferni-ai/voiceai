"""
Mel spectrogram for Qwen3-Omni Audio Encoder (AuT).

Computes 128-bin log-mel spectrogram from raw 16 kHz mono audio.
Matches Whisper-style mel extraction: Hann window, STFT (hop=160, win=400),
mel filterbank (0–8 kHz), log-mel. Reference: apps/rust-perf/src/candle_mel.rs
"""

from __future__ import annotations

import math
from typing import Union

import numpy as np

# Default STFT hop length (samples).
HOP_LENGTH = 160
# Default window length (samples).
N_FFT = 400
# Number of mel bins (Qwen3-Omni audio_config.num_mel_bins).
N_MELS = 128
# Sample rate (Hz).
SAMPLE_RATE = 16_000
# Mel scale: high frequency bound (Hz).
FMAX = 8000.0
# Mel scale: low frequency bound (Hz).
FMIN = 0.0


def _hz_to_mel(hz: float) -> float:
    return 2595.0 * math.log10(1.0 + hz / 700.0)


def _mel_to_hz(mel: float) -> float:
    return 700.0 * (10.0 ** (mel / 2595.0) - 1.0)


def _build_mel_filterbank(
    n_mels: int,
    n_freq: int,
    sample_rate: int,
    fmin: float,
    fmax: float,
) -> np.ndarray:
    """Build mel filterbank matrix (n_mels, n_freq). Slaney-style triangular filters."""
    sr = float(sample_rate)
    mel_low = _hz_to_mel(fmin)
    mel_high = _hz_to_mel(fmax)
    mel_points = np.linspace(mel_low, mel_high, n_mels + 2)
    hz_points = np.array([_mel_to_hz(float(m)) for m in mel_points])
    bin_points = (n_freq - 1) * hz_points / (sr / 2.0)

    mel_fb = np.zeros((n_mels, n_freq), dtype=np.float32)
    for i in range(n_mels):
        left = bin_points[i]
        center = bin_points[i + 1]
        right = bin_points[i + 2]
        for j in range(n_freq):
            jf = float(j)
            if jf < left or jf > right:
                v = 0.0
            elif jf < center:
                v = (jf - left) / max(center - left, 1e-6)
            else:
                v = (right - jf) / max(right - center, 1e-6)
            mel_fb[i, j] = v
    return mel_fb


class MelSpectrogram:
    """
    Pre-allocated mel spectrogram extractor.
    Output shape: (1, n_mels, time_frames) to match Rust candle_mel.
    """

    def __init__(
        self,
        n_fft: int = N_FFT,
        hop_length: int = HOP_LENGTH,
        n_mels: int = N_MELS,
        sample_rate: int = SAMPLE_RATE,
        fmin: float = FMIN,
        fmax: float = FMAX,
    ) -> None:
        self.n_fft = n_fft
        self.hop_length = hop_length
        self.n_mels = n_mels
        self.sample_rate = sample_rate
        self.fmin = fmin
        self.fmax = fmax
        n_freq = n_fft // 2 + 1
        self._window = np.hanning(n_fft).astype(np.float32)
        self._mel_fb = _build_mel_filterbank(
            n_mels, n_freq, sample_rate, fmin, fmax
        )

    def compute(self, samples: Union[np.ndarray, list[float]]) -> np.ndarray:
        """
        Compute log-mel spectrogram from raw audio samples.
        Returns array of shape (1, n_mels, time_frames).
        """
        if isinstance(samples, list):
            samples = np.array(samples, dtype=np.float32)
        else:
            samples = np.asarray(samples, dtype=np.float32)
        if samples.ndim != 1:
            raise ValueError("samples must be 1D (mono)")
        n_freq = self.n_fft // 2 + 1
        n_frames = 1 + max(0, (samples.size - self.n_fft) // self.hop_length)
        if n_frames == 0:
            return np.zeros((1, self.n_mels, 1), dtype=np.float32)

        # STFT: frame-by-frame with Hann window
        mel_out = np.zeros((n_frames, self.n_mels), dtype=np.float32)
        for t in range(n_frames):
            start = t * self.hop_length
            frame = np.zeros(self.n_fft, dtype=np.float32)
            end = min(start + self.n_fft, samples.size)
            frame[: end - start] = samples[start:end] * self._window[: end - start]
            # FFT (real) -> power spectrum
            fft_out = np.fft.rfft(frame)
            power = (fft_out.real ** 2 + fft_out.imag ** 2).astype(np.float32)
            # Mel filterbank
            mel_out[t, :] = self._mel_fb @ power

        # Log-mel (log1p to avoid log(0))
        mel_out = np.log1p(mel_out)
        # (n_frames, n_mels) -> (1, n_mels, n_frames)
        return mel_out.T[np.newaxis, :, :]


def compute_mel(
    samples: Union[np.ndarray, list[float]],
    n_fft: int = N_FFT,
    hop_length: int = HOP_LENGTH,
    n_mels: int = N_MELS,
    sample_rate: int = SAMPLE_RATE,
    fmin: float = FMIN,
    fmax: float = FMAX,
) -> np.ndarray:
    """
    One-shot log-mel spectrogram from raw audio.
    Returns (1, n_mels, time_frames).
    """
    mel = MelSpectrogram(
        n_fft=n_fft,
        hop_length=hop_length,
        n_mels=n_mels,
        sample_rate=sample_rate,
        fmin=fmin,
        fmax=fmax,
    )
    return mel.compute(samples)
