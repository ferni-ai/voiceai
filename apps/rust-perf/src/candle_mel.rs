//! Mel spectrogram for Qwen3-Omni Audio Encoder (AuT).
//!
//! Computes 128-bin log-mel spectrogram from raw 16 kHz mono audio.
//! Matches Whisper-style mel extraction: Hann window, STFT (hop=160, win=400),
//! mel filterbank (0–8 kHz), log-mel.

use candle_core::{Device, Result as CandleResult, Tensor};
use num_complex::Complex;
use rustfft::{Fft, FftPlanner};
use std::sync::Arc;

/// Default STFT hop length (samples).
pub const HOP_LENGTH: usize = 160;
/// Default window length (samples).
pub const N_FFT: usize = 400;
/// Number of mel bins (Qwen3-Omni audio_config.num_mel_bins).
pub const N_MELS: usize = 128;
/// Sample rate (Hz).
pub const SAMPLE_RATE: u32 = 16_000;
/// Mel scale: high frequency bound (Hz).
pub const FMAX: f32 = 8000.0;
/// Mel scale: low frequency bound (Hz).
pub const FMIN: f32 = 0.0;

/// Pre-allocated mel spectrogram extractor.
pub struct MelSpectrogram {
    n_fft: usize,
    hop_length: usize,
    n_mels: usize,
    /// Hann window (n_fft)
    window: Vec<f32>,
    /// Mel filterbank (n_mels, n_freq) where n_freq = n_fft/2 + 1
    mel_fb: Vec<f32>,
    /// FFT plan
    fft: Arc<dyn Fft<f32>>,
    /// Scratch for FFT
    scratch: Vec<Complex<f32>>,
}

impl MelSpectrogram {
    /// Build mel filterbank matrix (n_mels, n_freq).
    /// Uses Slaney-style triangular filters in mel space.
    fn build_mel_filterbank(
        n_mels: usize,
        n_freq: usize,
        sample_rate: u32,
        fmin: f32,
        fmax: f32,
    ) -> Vec<f32> {
        let sr = sample_rate as f32;
        let mel_low = hz_to_mel(fmin);
        let mel_high = hz_to_mel(fmax);
        let mel_points: Vec<f32> = (0..n_mels + 2)
            .map(|i| mel_low + (mel_high - mel_low) * i as f32 / (n_mels + 1) as f32)
            .collect();
        let hz_points: Vec<f32> = mel_points.iter().map(|&m| mel_to_hz(m)).collect();
        let bin_points: Vec<f32> = hz_points
            .iter()
            .map(|&f| (n_freq as f32 - 1.0) * f / (sr / 2.0))
            .collect();

        let mut mel_fb = vec![0.0f32; n_mels * n_freq];
        for i in 0..n_mels {
            let left = bin_points[i];
            let center = bin_points[i + 1];
            let right = bin_points[i + 2];
            for j in 0..n_freq {
                let jf = j as f32;
                let v = if jf < left || jf > right {
                    0.0
                } else if jf < center {
                    (jf - left) / (center - left).max(1e-6)
                } else {
                    (right - jf) / (right - center).max(1e-6)
                };
                mel_fb[i * n_freq + j] = v;
            }
        }
        mel_fb
    }

    /// Create a new mel spectrogram extractor with default Qwen3-Omni parameters.
    pub fn new() -> Self {
        Self::with_params(N_FFT, HOP_LENGTH, N_MELS, SAMPLE_RATE, FMIN, FMAX)
    }

    /// Create with explicit parameters.
    pub fn with_params(
        n_fft: usize,
        hop_length: usize,
        n_mels: usize,
        sample_rate: u32,
        fmin: f32,
        fmax: f32,
    ) -> Self {
        let n_freq = n_fft / 2 + 1;
        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(n_fft);
        let scratch_len = fft.get_inplace_scratch_len();

        let window: Vec<f32> = (0..n_fft)
            .map(|i| {
                let x = std::f32::consts::PI * i as f32 / (n_fft - 1) as f32;
                0.5 * (1.0 - x.cos())
            })
            .collect();

        let mel_fb = Self::build_mel_filterbank(n_mels, n_freq, sample_rate, fmin, fmax);

        Self {
            n_fft,
            hop_length,
            n_mels,
            window,
            mel_fb,
            fft,
            scratch: vec![Complex::new(0.0, 0.0); scratch_len],
        }
    }

    /// Compute log-mel spectrogram from raw audio samples.
    /// Returns tensor of shape [1, n_mels, time_frames] on the given device.
    pub fn compute(&mut self, samples: &[f32], device: &Device) -> CandleResult<Tensor> {
        let n_freq = self.n_fft / 2 + 1;
        let n_frames = 1 + (samples.len().saturating_sub(self.n_fft)) / self.hop_length;
        if n_frames == 0 {
            return Ok(Tensor::zeros(
                &[1, self.n_mels, 1],
                candle_core::DType::F32,
                device,
            )?);
        }

        let mut mel_out = vec![0.0f32; self.n_mels * n_frames];
        let mut frame_buf = vec![Complex::new(0.0, 0.0); self.n_fft];

        for t in 0..n_frames {
            let start = t * self.hop_length;
            for i in 0..self.n_fft {
                let idx = start + i;
                let s = if idx < samples.len() {
                    samples[idx] * self.window[i]
                } else {
                    0.0
                };
                frame_buf[i] = Complex::new(s, 0.0);
            }

            self.fft
                .process_with_scratch(&mut frame_buf, &mut self.scratch);

            // Power spectrum (magnitude squared), then mel
            for m in 0..self.n_mels {
                let mut sum = 0.0f32;
                for i in 0..n_freq {
                    let c = frame_buf[i];
                    let power = c.re * c.re + c.im * c.im;
                    sum += self.mel_fb[m * n_freq + i] * power;
                }
                mel_out[t * self.n_mels + m] = sum;
            }
        }

        // Log-mel (log1p to avoid log(0))
        for x in mel_out.iter_mut() {
            *x = (*x + 1.0).ln();
        }

        let tensor = Tensor::from_vec(mel_out, (n_frames, self.n_mels), device)?
            .t()?
            .unsqueeze(0)?;
        Ok(tensor)
    }
}

impl Default for MelSpectrogram {
    fn default() -> Self {
        Self::new()
    }
}

#[inline]
fn hz_to_mel(hz: f32) -> f32 {
    2595.0 * (1.0 + hz / 700.0).log10()
}

#[inline]
fn mel_to_hz(mel: f32) -> f32 {
    700.0 * (10.0f32.powf(mel / 2595.0) - 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mel_default() {
        let mel = MelSpectrogram::new();
        assert_eq!(mel.n_fft, N_FFT);
        assert_eq!(mel.hop_length, HOP_LENGTH);
        assert_eq!(mel.n_mels, N_MELS);
    }

    #[test]
    fn test_mel_compute_empty() {
        let device = Device::Cpu;
        let mut mel = MelSpectrogram::new();
        let out = mel.compute(&[], &device).unwrap();
        let shape = out.dims3().unwrap();
        assert_eq!(shape.0, 1);
        assert_eq!(shape.1, N_MELS);
        assert_eq!(shape.2, 1);
    }

    #[test]
    fn test_mel_compute_short() {
        let device = Device::Cpu;
        let mut mel = MelSpectrogram::new();
        let samples: Vec<f32> = (0..800).map(|i| 0.01 * (i as f32 * 0.1).sin()).collect();
        let out = mel.compute(&samples, &device).unwrap();
        let shape = out.dims3().unwrap();
        assert_eq!(shape.0, 1);
        assert_eq!(shape.1, N_MELS);
        assert!(shape.2 >= 1);
    }
}
