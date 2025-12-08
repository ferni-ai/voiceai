//! Mel spectrogram computation.
//!
//! Implements mel spectrogram extraction compatible with librosa/torchaudio
//! for use with speaker embedding models.

use anyhow::{Context, Result};
use rustfft::{num_complex::Complex, FftPlanner};

// Constants matching typical ECAPA-TDNN preprocessing
const N_FFT: usize = 512;
const HOP_LENGTH: usize = 160; // 10ms at 16kHz
const WIN_LENGTH: usize = 400; // 25ms at 16kHz

/// Compute mel spectrogram from audio samples.
///
/// # Arguments
/// * `samples` - Audio samples (should be preprocessed)
/// * `sample_rate` - Sample rate (expected 16000)
/// * `n_mels` - Number of mel bands (expected 80)
///
/// # Returns
/// * Tuple of (mel_spectrogram, n_frames)
pub fn compute_mel_spectrogram(
    samples: &[f32],
    sample_rate: u32,
    n_mels: usize,
) -> Result<(Vec<f32>, usize)> {
    // Compute STFT
    let spectrogram = compute_stft(samples)?;
    let n_frames = spectrogram.len() / (N_FFT / 2 + 1);

    // Create mel filterbank
    let mel_basis = create_mel_filterbank(sample_rate, N_FFT, n_mels);

    // Apply mel filterbank
    let mut mel_spec = vec![0.0f32; n_mels * n_frames];
    let n_bins = N_FFT / 2 + 1;

    for frame in 0..n_frames {
        for mel in 0..n_mels {
            let mut sum = 0.0f32;
            for bin in 0..n_bins {
                sum += spectrogram[frame * n_bins + bin] * mel_basis[mel * n_bins + bin];
            }
            // Log mel spectrogram (add small epsilon to avoid log(0))
            mel_spec[mel * n_frames + frame] = (sum + 1e-10).ln();
        }
    }

    // Normalize (mean=0, std=1 per mel band)
    normalize_mel_spectrogram(&mut mel_spec, n_mels, n_frames);

    Ok((mel_spec, n_frames))
}

/// Compute Short-Time Fourier Transform.
fn compute_stft(samples: &[f32]) -> Result<Vec<f32>> {
    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(N_FFT);

    let window = hann_window(WIN_LENGTH);
    let n_bins = N_FFT / 2 + 1;

    // Calculate number of frames
    let n_frames = if samples.len() >= N_FFT {
        (samples.len() - N_FFT) / HOP_LENGTH + 1
    } else {
        1
    };

    let mut spectrogram = vec![0.0f32; n_bins * n_frames];

    // Pad samples if needed
    let padded_len = (n_frames - 1) * HOP_LENGTH + N_FFT;
    let mut padded = vec![0.0f32; padded_len];
    let copy_len = samples.len().min(padded_len);
    padded[..copy_len].copy_from_slice(&samples[..copy_len]);

    let mut buffer = vec![Complex::new(0.0f32, 0.0f32); N_FFT];

    for (frame_idx, start) in (0..padded.len().saturating_sub(N_FFT - 1))
        .step_by(HOP_LENGTH)
        .take(n_frames)
        .enumerate()
    {
        // Apply window and copy to buffer
        for i in 0..N_FFT {
            let sample_idx = start + i;
            let sample = if sample_idx < padded.len() {
                padded[sample_idx]
            } else {
                0.0
            };
            let win = if i < WIN_LENGTH { window[i] } else { 0.0 };
            buffer[i] = Complex::new(sample * win, 0.0);
        }

        // FFT
        fft.process(&mut buffer);

        // Power spectrum (magnitude squared)
        for (i, c) in buffer[..n_bins].iter().enumerate() {
            spectrogram[frame_idx * n_bins + i] = c.norm_sqr();
        }
    }

    Ok(spectrogram)
}

/// Create Hann window.
fn hann_window(size: usize) -> Vec<f32> {
    (0..size)
        .map(|i| {
            let x = std::f32::consts::PI * i as f32 / (size - 1) as f32;
            0.5 * (1.0 - (2.0 * x).cos())
        })
        .collect()
}

/// Create mel filterbank.
fn create_mel_filterbank(sample_rate: u32, n_fft: usize, n_mels: usize) -> Vec<f32> {
    let fmax = sample_rate as f32 / 2.0;
    let fmin = 0.0f32;

    // Convert to mel scale
    let mel_min = hz_to_mel(fmin);
    let mel_max = hz_to_mel(fmax);

    // Create mel points (n_mels + 2 for triangular filters)
    let mel_points: Vec<f32> = (0..=n_mels + 1)
        .map(|i| mel_to_hz(mel_min + (mel_max - mel_min) * i as f32 / (n_mels + 1) as f32))
        .collect();

    // Convert to FFT bins
    let n_bins = n_fft / 2 + 1;
    let bins: Vec<usize> = mel_points
        .iter()
        .map(|f| ((n_fft as f32 + 1.0) * f / sample_rate as f32).floor() as usize)
        .map(|b| b.min(n_bins - 1))
        .collect();

    // Create triangular filterbank
    let mut filterbank = vec![0.0f32; n_mels * n_bins];

    for m in 0..n_mels {
        let left = bins[m];
        let center = bins[m + 1];
        let right = bins[m + 2];

        // Rising edge
        if center > left {
            for k in left..center {
                filterbank[m * n_bins + k] = (k - left) as f32 / (center - left) as f32;
            }
        }

        // Falling edge
        if right > center {
            for k in center..right {
                filterbank[m * n_bins + k] = (right - k) as f32 / (right - center) as f32;
            }
        }
    }

    filterbank
}

/// Convert Hz to mel scale.
fn hz_to_mel(hz: f32) -> f32 {
    2595.0 * (1.0 + hz / 700.0).log10()
}

/// Convert mel scale to Hz.
fn mel_to_hz(mel: f32) -> f32 {
    700.0 * (10.0_f32.powf(mel / 2595.0) - 1.0)
}

/// Normalize mel spectrogram (per-band normalization).
fn normalize_mel_spectrogram(mel_spec: &mut [f32], n_mels: usize, n_frames: usize) {
    for mel in 0..n_mels {
        // Calculate mean
        let mut sum = 0.0f32;
        for frame in 0..n_frames {
            sum += mel_spec[mel * n_frames + frame];
        }
        let mean = sum / n_frames as f32;

        // Calculate std
        let mut var_sum = 0.0f32;
        for frame in 0..n_frames {
            let diff = mel_spec[mel * n_frames + frame] - mean;
            var_sum += diff * diff;
        }
        let std = (var_sum / n_frames as f32).sqrt().max(1e-10);

        // Normalize
        for frame in 0..n_frames {
            mel_spec[mel * n_frames + frame] = (mel_spec[mel * n_frames + frame] - mean) / std;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hz_to_mel_to_hz() {
        let hz = 1000.0;
        let mel = hz_to_mel(hz);
        let hz_back = mel_to_hz(mel);
        assert!((hz - hz_back).abs() < 0.01);
    }

    #[test]
    fn test_hann_window() {
        let window = hann_window(400);
        assert_eq!(window.len(), 400);
        // First and last should be close to 0
        assert!(window[0] < 0.01);
        assert!(window[399] < 0.01);
        // Middle should be close to 1
        assert!((window[200] - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_mel_spectrogram_shape() {
        // 1 second of audio at 16kHz
        let samples = vec![0.0f32; 16000];
        let (mel, n_frames) = compute_mel_spectrogram(&samples, 16000, 80).unwrap();

        // Should have 80 mel bands
        assert_eq!(mel.len(), 80 * n_frames);
        // Approximately 100 frames for 1 second with 10ms hop
        assert!(n_frames > 90 && n_frames < 110);
    }
}

