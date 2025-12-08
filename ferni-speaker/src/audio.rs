//! Audio preprocessing utilities.
//!
//! Provides audio normalization and preprocessing compatible with
//! speaker embedding model expectations.

/// Preprocess audio samples for speaker embedding extraction.
///
/// Applies:
/// 1. DC offset removal
/// 2. Pre-emphasis filter
/// 3. Peak normalization
///
/// # Arguments
/// * `samples` - Raw audio samples (16kHz mono expected)
///
/// # Returns
/// * Preprocessed audio samples
pub fn preprocess(samples: &[f32]) -> Vec<f32> {
    if samples.is_empty() {
        return vec![];
    }

    // Step 1: Remove DC offset
    let mean: f32 = samples.iter().sum::<f32>() / samples.len() as f32;
    let dc_removed: Vec<f32> = samples.iter().map(|s| s - mean).collect();

    // Step 2: Pre-emphasis filter (emphasize high frequencies)
    // y[n] = x[n] - alpha * x[n-1], alpha typically 0.97
    let alpha = 0.97f32;
    let mut emphasized = Vec::with_capacity(dc_removed.len());
    emphasized.push(dc_removed[0]);
    for i in 1..dc_removed.len() {
        emphasized.push(dc_removed[i] - alpha * dc_removed[i - 1]);
    }

    // Step 3: Peak normalization (scale to [-1, 1])
    let max_abs = emphasized
        .iter()
        .map(|s| s.abs())
        .fold(0.0f32, |a, b| a.max(b));

    if max_abs > 1e-10 {
        emphasized.iter().map(|s| s / max_abs).collect()
    } else {
        emphasized
    }
}

/// Resample audio from source sample rate to target sample rate.
///
/// Uses linear interpolation (simple but effective for speech).
///
/// # Arguments
/// * `samples` - Input audio samples
/// * `source_rate` - Source sample rate
/// * `target_rate` - Target sample rate (typically 16000)
///
/// # Returns
/// * Resampled audio
pub fn resample(samples: &[f32], source_rate: u32, target_rate: u32) -> Vec<f32> {
    if source_rate == target_rate {
        return samples.to_vec();
    }

    let ratio = source_rate as f64 / target_rate as f64;
    let output_len = ((samples.len() as f64) / ratio).ceil() as usize;
    let mut output = Vec::with_capacity(output_len);

    for i in 0..output_len {
        let src_idx = i as f64 * ratio;
        let idx_floor = src_idx.floor() as usize;
        let idx_ceil = (idx_floor + 1).min(samples.len() - 1);
        let frac = (src_idx - idx_floor as f64) as f32;

        let sample = samples[idx_floor] * (1.0 - frac) + samples[idx_ceil] * frac;
        output.push(sample);
    }

    output
}

/// Convert stereo audio to mono by averaging channels.
///
/// # Arguments
/// * `samples` - Interleaved stereo samples [L, R, L, R, ...]
///
/// # Returns
/// * Mono samples
pub fn stereo_to_mono(samples: &[f32]) -> Vec<f32> {
    samples
        .chunks(2)
        .map(|chunk| {
            if chunk.len() == 2 {
                (chunk[0] + chunk[1]) / 2.0
            } else {
                chunk[0]
            }
        })
        .collect()
}

/// Trim silence from the beginning and end of audio.
///
/// # Arguments
/// * `samples` - Audio samples
/// * `threshold` - Amplitude threshold for silence detection
/// * `min_silence_ms` - Minimum silence duration to trim (in ms)
/// * `sample_rate` - Sample rate
///
/// # Returns
/// * Trimmed audio samples
pub fn trim_silence(
    samples: &[f32],
    threshold: f32,
    min_silence_ms: u32,
    sample_rate: u32,
) -> Vec<f32> {
    if samples.is_empty() {
        return vec![];
    }

    let min_silence_samples = (min_silence_ms as f32 * sample_rate as f32 / 1000.0) as usize;

    // Find start (first non-silent sample)
    let mut start = 0;
    let mut silence_count = 0;
    for (i, &sample) in samples.iter().enumerate() {
        if sample.abs() > threshold {
            silence_count = 0;
            start = i;
            break;
        } else {
            silence_count += 1;
        }
    }

    // Find end (last non-silent sample)
    let mut end = samples.len();
    silence_count = 0;
    for (i, &sample) in samples.iter().enumerate().rev() {
        if sample.abs() > threshold {
            silence_count = 0;
            end = i + 1;
            break;
        } else {
            silence_count += 1;
            if silence_count >= min_silence_samples {
                end = i;
            }
        }
    }

    if start >= end {
        return samples.to_vec(); // No trimming needed
    }

    samples[start..end].to_vec()
}

/// Calculate RMS energy of audio segment.
pub fn rms_energy(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum_sq: f32 = samples.iter().map(|s| s * s).sum();
    (sum_sq / samples.len() as f32).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_preprocess_dc_removal() {
        let samples = vec![1.0, 1.0, 1.0, 1.0];
        let processed = preprocess(&samples);
        let mean: f32 = processed.iter().sum::<f32>() / processed.len() as f32;
        assert!(mean.abs() < 0.01);
    }

    #[test]
    fn test_preprocess_normalization() {
        let samples = vec![0.0, 0.5, 0.0, -0.5];
        let processed = preprocess(&samples);
        let max_abs = processed.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
        assert!((max_abs - 1.0).abs() < 0.1);
    }

    #[test]
    fn test_stereo_to_mono() {
        let stereo = vec![0.2, 0.4, 0.6, 0.8];
        let mono = stereo_to_mono(&stereo);
        assert_eq!(mono.len(), 2);
        assert!((mono[0] - 0.3).abs() < 0.01);
        assert!((mono[1] - 0.7).abs() < 0.01);
    }

    #[test]
    fn test_resample() {
        let samples = vec![0.0, 1.0, 0.0, -1.0, 0.0];
        let resampled = resample(&samples, 48000, 16000);
        // 48000 -> 16000 is 3x downsampling
        assert!(resampled.len() < samples.len());
    }

    #[test]
    fn test_rms_energy() {
        let samples = vec![1.0, -1.0, 1.0, -1.0];
        let rms = rms_energy(&samples);
        assert!((rms - 1.0).abs() < 0.01);
    }
}

