//! Mel spectrogram computation for Whisper-compatible audio encoder input.
//! Pure Rust: 400-sample FFT window, 160-sample hop, 80 mel bins.
//! Used when `audio-encoder` feature is enabled.

#![cfg(feature = "audio-encoder")]

use std::f32::consts::PI;

/// Whisper-style: n_fft=400 → 201 frequency bins.
pub const N_FFT: usize = 400;
/// Hop length in samples (10ms at 16kHz).
pub const HOP_LENGTH: usize = 160;
/// Number of mel filterbanks.
pub const N_MELS: usize = 80;

/// Number of frequency bins (n_fft / 2 + 1).
const N_FREQ: usize = N_FFT / 2 + 1;

/// Hertz to mel scale.
#[inline]
fn hz_to_mel(hz: f32) -> f32 {
    2595.0 * (1.0 + hz / 700.0).log10()
}

/// Mel to Hertz.
#[inline]
fn mel_to_hz(mel: f32) -> f32 {
    700.0 * (10.0f32.powf(mel / 2595.0) - 1.0)
}

/// Build mel filterbank matrix [n_mels, n_freq].
/// Each row is a triangular filter in the power spectrum.
fn build_mel_filterbank(sample_rate: u32) -> Vec<Vec<f32>> {
    let f_max = sample_rate as f32 / 2.0;
    let mel_max = hz_to_mel(f_max);
    let mel_min = 0.0f32;
    // 80 bins → 82 points (edges)
    let mel_points: Vec<f32> = (0..N_MELS + 2)
        .map(|i| mel_min + (mel_max - mel_min) * i as f32 / (N_MELS + 1) as f32)
        .collect();
    let hz_points: Vec<f32> = mel_points.iter().map(|&m| mel_to_hz(m)).collect();
    // Bin indices in FFT (0..=N_FREQ-1) correspond to k * sample_rate / n_fft Hz.
    let bin_hz = |k: usize| k as f32 * sample_rate as f32 / N_FFT as f32;

    let mut filterbank = vec![vec![0.0f32; N_FREQ]; N_MELS];
    for i in 0..N_MELS {
        let left_hz = hz_points[i];
        let center_hz = hz_points[i + 1];
        let right_hz = hz_points[i + 2];
        for k in 0..N_FREQ {
            let hz = bin_hz(k);
            let weight = if hz <= left_hz || hz >= right_hz {
                0.0
            } else if hz < center_hz {
                (hz - left_hz) / (center_hz - left_hz)
            } else {
                (right_hz - hz) / (right_hz - center_hz)
            };
            filterbank[i][k] = weight;
        }
    }
    filterbank
}

/// In-place DFT for real signal of length N_FFT. Writes magnitude squared into `out[0..N_FREQ]`.
fn dft_magnitude_squared(windowed: &[f32], out: &mut [f32]) {
    let n = windowed.len();
    for k in 0..N_FREQ {
        let mut re = 0.0f32;
        let mut im = 0.0f32;
        let omega = 2.0 * PI * k as f32 / n as f32;
        for (t, &x) in windowed.iter().enumerate() {
            let angle = omega * t as f32;
            re += x * angle.cos();
            im -= x * angle.sin();
        }
        let mag_sq = re * re + im * im;
        out[k] = mag_sq / (n * n) as f32;
    }
}

/// Compute log-mel spectrogram: (n_frames, 80).
/// Input: f32 PCM at `sample_rate` (expected 16kHz).
pub fn compute_mel_spectrogram(audio: &[f32], sample_rate: u32) -> Vec<Vec<f32>> {
    let filterbank = build_mel_filterbank(sample_rate);
    let hann: Vec<f32> = (0..N_FFT)
        .map(|i| 0.5 * (1.0 - (2.0 * PI * i as f32 / (N_FFT - 1).max(1) as f32).cos()))
        .collect();

    let n_frames = if audio.len() >= N_FFT {
        (audio.len() - N_FFT) / HOP_LENGTH + 1
    } else {
        0
    };

    let mut power = vec![0.0f32; N_FREQ];
    let mut output = Vec::with_capacity(n_frames);

    for frame_idx in 0..n_frames {
        let start = frame_idx * HOP_LENGTH;
        for k in 0..N_FREQ {
            power[k] = 0.0;
        }
        let windowed: Vec<f32> = (0..N_FFT)
            .map(|i| {
                let s = audio.get(start + i).copied().unwrap_or(0.0);
                s * hann[i]
            })
            .collect();
        dft_magnitude_squared(&windowed, &mut power);

        let mut mel_frame = vec![0.0f32; N_MELS];
        for (i, filter) in filterbank.iter().enumerate() {
            let mut sum = 0.0f32;
            for (p, &w) in power.iter().zip(filter.iter()) {
                sum += p * w;
            }
            mel_frame[i] = (1.0 + sum).ln();
        }
        output.push(mel_frame);
    }

    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mel_shape() {
        let audio: Vec<f32> = (0..16000).map(|i| 0.01 * (i as f32 * 0.1).sin()).collect();
        let mel = compute_mel_spectrogram(&audio, 16000);
        let n_frames = (16000 - N_FFT) / HOP_LENGTH + 1;
        assert_eq!(mel.len(), n_frames);
        for frame in &mel {
            assert_eq!(frame.len(), N_MELS);
        }
    }
}
