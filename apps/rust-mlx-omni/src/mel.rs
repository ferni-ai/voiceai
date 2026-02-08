//! Mel spectrogram: raw audio → mel filterbank features.
//!
//! Port of `apps/mlx-qwen3-omni/src/mlx_qwen3_omni/audio/mel.py`.
//! Reference: `apps/rust-perf/src/candle_mel.rs`.

use mlx_rs::{ops, Array};

/// Compute mel spectrogram from raw audio samples.
///
/// - `audio`: (samples,) f32, 16kHz mono.
/// - Returns: (1, num_mel_bins, time_frames) suitable for the audio encoder.
pub fn mel_spectrogram(
    audio: &Array,
    n_fft: usize,
    hop_length: usize,
    num_mel_bins: usize,
    sample_rate: usize,
) -> Result<Array, mlx_rs::error::Exception> {
    // 1. STFT via Hann window
    let n_fft_i = n_fft as i32;
    let hop_i = hop_length as i32;

    // Hann window
    let hann = hann_window(n_fft)?;

    // Pad audio to center frames
    let pad_len = n_fft / 2;
    let pad_width: [(i32, i32); 1] = [(pad_len as i32, pad_len as i32)];
    let audio = ops::pad(audio, &pad_width, None, None)?;

    // Frame the audio: extract overlapping windows
    let num_samples = audio.shape()[0];
    let num_frames = (num_samples - n_fft_i) / hop_i + 1;

    // Use as_strided to create frames efficiently
    let frames = create_frames(&audio, n_fft, hop_length, num_frames as usize)?;

    // Apply window and compute FFT magnitude
    let windowed = frames.multiply(&hann)?;
    let spectrum = mlx_rs::fft::rfft(&windowed, Some(n_fft_i), -1)?;

    // Power spectrum: |S|^2
    let real = spectrum.real()?;
    let imag = spectrum.imag()?;
    let power = real.multiply(&real)?.add(&imag.multiply(&imag)?)?;

    // 2. Mel filterbank
    let mel_basis = mel_filterbank(sample_rate, n_fft, num_mel_bins)?;

    // (num_frames, n_fft/2+1) @ (n_fft/2+1, num_mel_bins) → (num_frames, num_mel_bins)
    let mel_basis_t = mel_basis.transpose_axes(&[1, 0])?;
    let mel_spec = power.matmul(&mel_basis_t)?;

    // Log mel: log(max(mel, 1e-10))
    let floor = Array::from(1e-10_f32);
    let mel_spec = ops::maximum(&mel_spec, &floor)?;
    let log_mel = mel_spec.log()?;

    // Reshape to (1, num_mel_bins, time_frames)
    let log_mel = log_mel.transpose_axes(&[1, 0])?; // (mel, time)
    Ok(log_mel.expand_dims(0)?) // (1, mel, time)
}

/// Hann window of length n.
fn hann_window(n: usize) -> Result<Array, mlx_rs::error::Exception> {
    let n_f = n as f32;
    let pi2 = 2.0 * std::f32::consts::PI;
    let values: Vec<f32> = (0..n)
        .map(|i| 0.5 * (1.0 - (pi2 * i as f32 / n_f).cos()))
        .collect();
    Ok(Array::from_slice(&values, &[n as i32]))
}

/// Extract overlapping frames from audio signal.
fn create_frames(
    audio: &Array,
    frame_len: usize,
    hop_len: usize,
    num_frames: usize,
) -> Result<Array, mlx_rs::error::Exception> {
    // Build index array for gather
    let mut indices: Vec<i32> = Vec::with_capacity(num_frames * frame_len);
    for f in 0..num_frames {
        let start = f * hop_len;
        for i in 0..frame_len {
            indices.push((start + i) as i32);
        }
    }
    let idx = Array::from_slice(&indices, &[num_frames as i32, frame_len as i32]);
    // Flatten audio, gather, reshape
    let flat = audio.reshape(&[-1])?;
    let idx_flat = idx.reshape(&[-1])?;
    Ok(flat
        .take_axis(&idx_flat, 0)?
        .reshape(&[num_frames as i32, frame_len as i32])?)
}

/// Create mel filterbank matrix (num_mel_bins, n_fft/2+1).
fn mel_filterbank(
    sample_rate: usize,
    n_fft: usize,
    num_mel_bins: usize,
) -> Result<Array, mlx_rs::error::Exception> {
    let n_freqs = n_fft / 2 + 1;
    let sr = sample_rate as f64;

    // Mel scale: mel = 2595 * log10(1 + f/700)
    let f_min = 0.0_f64;
    let f_max = sr / 2.0;
    let mel_min = 2595.0 * (1.0 + f_min / 700.0).log10();
    let mel_max = 2595.0 * (1.0 + f_max / 700.0).log10();

    // Mel points
    let mel_points: Vec<f64> = (0..num_mel_bins + 2)
        .map(|i| mel_min + (mel_max - mel_min) * i as f64 / (num_mel_bins + 1) as f64)
        .collect();

    // Convert back to Hz
    let hz_points: Vec<f64> = mel_points
        .iter()
        .map(|&m| 700.0 * (10.0_f64.powf(m / 2595.0) - 1.0))
        .collect();

    // Convert to FFT bin indices
    let bin_points: Vec<f64> = hz_points
        .iter()
        .map(|&f| f * n_fft as f64 / sr)
        .collect();

    // Build filterbank
    let mut fb = vec![0.0_f32; num_mel_bins * n_freqs];
    for m in 0..num_mel_bins {
        let left = bin_points[m];
        let center = bin_points[m + 1];
        let right = bin_points[m + 2];

        for k in 0..n_freqs {
            let kf = k as f64;
            if kf >= left && kf <= center {
                fb[m * n_freqs + k] = ((kf - left) / (center - left)) as f32;
            } else if kf > center && kf <= right {
                fb[m * n_freqs + k] = ((right - kf) / (right - center)) as f32;
            }
        }
    }

    Ok(Array::from_slice(
        &fb,
        &[num_mel_bins as i32, n_freqs as i32],
    ))
}
