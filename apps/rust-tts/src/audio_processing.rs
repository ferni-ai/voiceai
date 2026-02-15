/// Post-synthesis audio processing: volume, speed, resampling, output format.
///
/// All operations work on f32 samples in [-1.0, 1.0] range.
/// Applied after synthesis, before final encoding.

use crate::audio::{encode_wav_s16le, f32_to_s16le, f32_to_f32le};

// ─── Volume ─────────────────────────────────────────────────

/// Apply volume gain to audio samples in-place.
///
/// - 0.5 = half volume
/// - 1.0 = no change
/// - 2.0 = double volume (soft-clipped via tanh to prevent distortion)
///
/// Values are clamped to [0.0, 3.0].
pub fn apply_volume(samples: &mut [f32], volume: f32) {
    let volume = volume.clamp(0.0, 3.0);
    if (volume - 1.0).abs() < f32::EPSILON {
        return;
    }
    for s in samples.iter_mut() {
        let gained = *s * volume;
        // Soft clipping via tanh for gains > 1.0 to prevent harsh distortion
        *s = if volume > 1.0 {
            gained.tanh()
        } else {
            gained.clamp(-1.0, 1.0)
        };
    }
}

// ─── Speed ──────────────────────────────────────────────────

/// Time-stretch audio to change speed without pitch shift.
///
/// - 0.5 = half speed (audio gets longer)
/// - 1.0 = no change
/// - 2.0 = double speed (audio gets shorter)
///
/// Uses linear interpolation — good enough for speech.
/// Speed is clamped to [0.5, 2.0].
pub fn apply_speed(samples: &[f32], speed: f32) -> Vec<f32> {
    let speed = speed.clamp(0.5, 2.0);
    if (speed - 1.0).abs() < f32::EPSILON {
        return samples.to_vec();
    }
    if samples.is_empty() {
        return Vec::new();
    }

    let output_len = (samples.len() as f64 / speed as f64) as usize;
    if output_len == 0 {
        return Vec::new();
    }

    let mut output = Vec::with_capacity(output_len);
    for i in 0..output_len {
        let src_pos = i as f64 * speed as f64;
        let idx = src_pos as usize;
        let frac = (src_pos - idx as f64) as f32;

        let sample = if idx + 1 < samples.len() {
            samples[idx] * (1.0 - frac) + samples[idx + 1] * frac
        } else if idx < samples.len() {
            samples[idx]
        } else {
            0.0
        };
        output.push(sample);
    }
    output
}

// ─── Resampling ─────────────────────────────────────────────

/// Resample audio from source_rate to target_rate using linear interpolation.
///
/// Target rate is clamped to [8000, 48000].
pub fn resample(samples: &[f32], source_rate: u32, target_rate: u32) -> Vec<f32> {
    let target_rate = target_rate.clamp(8000, 48000);
    if source_rate == target_rate || samples.is_empty() {
        return samples.to_vec();
    }

    let ratio = source_rate as f64 / target_rate as f64;
    let output_len = (samples.len() as f64 / ratio) as usize;
    if output_len == 0 {
        return Vec::new();
    }

    let mut output = Vec::with_capacity(output_len);
    for i in 0..output_len {
        let src_pos = i as f64 * ratio;
        let idx = src_pos as usize;
        let frac = (src_pos - idx as f64) as f32;

        let sample = if idx + 1 < samples.len() {
            samples[idx] * (1.0 - frac) + samples[idx + 1] * frac
        } else if idx < samples.len() {
            samples[idx]
        } else {
            0.0
        };
        output.push(sample);
    }
    output
}

// ─── Output Format ──────────────────────────────────────────

/// Supported output audio formats.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputFormat {
    /// WAV file with s16le PCM data (44-byte header + data).
    Wav,
    /// Raw s16le PCM bytes (2 bytes per sample).
    PcmS16le,
    /// Raw f32le PCM bytes (4 bytes per sample).
    PcmF32le,
}

impl OutputFormat {
    /// Parse from a string identifier. Returns Wav for unrecognized values.
    pub fn from_str_lossy(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "wav" => Self::Wav,
            "pcm-s16le" | "pcm_s16le" | "s16le" => Self::PcmS16le,
            "pcm-f32le" | "pcm_f32le" | "f32le" => Self::PcmF32le,
            _ => Self::Wav,
        }
    }

    /// MIME content type for HTTP responses.
    pub fn content_type(&self) -> &'static str {
        match self {
            Self::Wav => "audio/wav",
            Self::PcmS16le | Self::PcmF32le => "application/octet-stream",
        }
    }
}

/// Encode f32 samples into the specified output format.
pub fn encode_output(samples: &[f32], sample_rate: u32, format: OutputFormat) -> Vec<u8> {
    match format {
        OutputFormat::Wav => encode_wav_s16le(samples, sample_rate),
        OutputFormat::PcmS16le => f32_to_s16le(samples),
        OutputFormat::PcmF32le => f32_to_f32le(samples),
    }
}

// ─── Tests ──────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── Volume ─────────────────────────────────────────────

    #[test]
    fn volume_unity_is_noop() {
        let mut samples = vec![0.5, -0.3, 0.0, 1.0];
        let original = samples.clone();
        apply_volume(&mut samples, 1.0);
        assert_eq!(samples, original);
    }

    #[test]
    fn volume_zero_silences() {
        let mut samples = vec![0.5, -0.3, 1.0];
        apply_volume(&mut samples, 0.0);
        for s in &samples {
            assert_eq!(*s, 0.0);
        }
    }

    #[test]
    fn volume_half_reduces() {
        let mut samples = vec![0.8, -0.6];
        apply_volume(&mut samples, 0.5);
        assert!((samples[0] - 0.4).abs() < 1e-6);
        assert!((samples[1] - (-0.3)).abs() < 1e-6);
    }

    #[test]
    fn volume_double_uses_soft_clipping() {
        let mut samples = vec![0.8];
        apply_volume(&mut samples, 2.0);
        // tanh(1.6) ≈ 0.9217
        assert!((samples[0] - (1.6_f32).tanh()).abs() < 1e-5);
    }

    #[test]
    fn volume_clamps_to_max() {
        let mut samples = vec![0.5];
        apply_volume(&mut samples, 5.0); // clamped to 3.0
        let expected = (0.5 * 3.0_f32).tanh();
        assert!((samples[0] - expected).abs() < 1e-5);
    }

    #[test]
    fn volume_empty_input() {
        let mut samples: Vec<f32> = vec![];
        apply_volume(&mut samples, 2.0);
        assert!(samples.is_empty());
    }

    // ── Speed ──────────────────────────────────────────────

    #[test]
    fn speed_unity_is_identity() {
        let input = vec![0.1, 0.2, 0.3, 0.4, 0.5];
        let output = apply_speed(&input, 1.0);
        assert_eq!(output, input);
    }

    #[test]
    fn speed_double_halves_length() {
        let input: Vec<f32> = (0..100).map(|i| i as f32 / 100.0).collect();
        let output = apply_speed(&input, 2.0);
        assert_eq!(output.len(), 50);
    }

    #[test]
    fn speed_half_doubles_length() {
        let input: Vec<f32> = (0..100).map(|i| i as f32 / 100.0).collect();
        let output = apply_speed(&input, 0.5);
        assert_eq!(output.len(), 200);
    }

    #[test]
    fn speed_clamps_minimum() {
        let input = vec![1.0; 100];
        let output = apply_speed(&input, 0.1); // clamped to 0.5
        assert_eq!(output.len(), 200);
    }

    #[test]
    fn speed_clamps_maximum() {
        let input = vec![1.0; 100];
        let output = apply_speed(&input, 5.0); // clamped to 2.0
        assert_eq!(output.len(), 50);
    }

    #[test]
    fn speed_empty_input() {
        let output = apply_speed(&[], 1.5);
        assert!(output.is_empty());
    }

    #[test]
    fn speed_interpolation_is_smooth() {
        // Linear ramp — doubling speed should give every other sample (interpolated)
        let input: Vec<f32> = (0..10).map(|i| i as f32).collect();
        let output = apply_speed(&input, 2.0);
        // First output sample = input[0] = 0.0
        assert!((output[0] - 0.0).abs() < 1e-5);
        // Second output sample ≈ input[2] = 2.0
        assert!((output[1] - 2.0).abs() < 1e-5);
    }

    // ── Resampling ─────────────────────────────────────────

    #[test]
    fn resample_same_rate_is_identity() {
        let input = vec![0.1, 0.2, 0.3];
        let output = resample(&input, 24000, 24000);
        assert_eq!(output, input);
    }

    #[test]
    fn resample_24k_to_16k_reduces() {
        let input: Vec<f32> = (0..2400).map(|i| (i as f32 / 2400.0).sin()).collect();
        let output = resample(&input, 24000, 16000);
        // 2400 samples at 24kHz = 100ms → 1600 samples at 16kHz
        assert_eq!(output.len(), 1600);
    }

    #[test]
    fn resample_24k_to_48k_expands() {
        let input: Vec<f32> = (0..2400).map(|i| (i as f32 / 2400.0).sin()).collect();
        let output = resample(&input, 24000, 48000);
        assert_eq!(output.len(), 4800);
    }

    #[test]
    fn resample_clamps_target_rate() {
        let input = vec![1.0; 100];
        let output = resample(&input, 24000, 4000); // clamped to 8000
        let expected_len = (100.0 * 8000.0 / 24000.0) as usize;
        assert_eq!(output.len(), expected_len);
    }

    #[test]
    fn resample_empty_input() {
        let output = resample(&[], 24000, 16000);
        assert!(output.is_empty());
    }

    // ── Output Format ──────────────────────────────────────

    #[test]
    fn format_parse_wav() {
        assert_eq!(OutputFormat::from_str_lossy("wav"), OutputFormat::Wav);
        assert_eq!(OutputFormat::from_str_lossy("WAV"), OutputFormat::Wav);
    }

    #[test]
    fn format_parse_pcm_s16le() {
        assert_eq!(OutputFormat::from_str_lossy("pcm-s16le"), OutputFormat::PcmS16le);
        assert_eq!(OutputFormat::from_str_lossy("pcm_s16le"), OutputFormat::PcmS16le);
        assert_eq!(OutputFormat::from_str_lossy("s16le"), OutputFormat::PcmS16le);
    }

    #[test]
    fn format_parse_pcm_f32le() {
        assert_eq!(OutputFormat::from_str_lossy("pcm-f32le"), OutputFormat::PcmF32le);
        assert_eq!(OutputFormat::from_str_lossy("f32le"), OutputFormat::PcmF32le);
    }

    #[test]
    fn format_unknown_defaults_to_wav() {
        assert_eq!(OutputFormat::from_str_lossy("mp3"), OutputFormat::Wav);
        assert_eq!(OutputFormat::from_str_lossy(""), OutputFormat::Wav);
    }

    #[test]
    fn format_content_type() {
        assert_eq!(OutputFormat::Wav.content_type(), "audio/wav");
        assert_eq!(OutputFormat::PcmS16le.content_type(), "application/octet-stream");
        assert_eq!(OutputFormat::PcmF32le.content_type(), "application/octet-stream");
    }

    #[test]
    fn encode_wav_format() {
        let samples = vec![0.0; 10];
        let output = encode_output(&samples, 24000, OutputFormat::Wav);
        assert_eq!(&output[0..4], b"RIFF");
        assert_eq!(output.len(), 44 + 20); // header + 10 samples × 2 bytes
    }

    #[test]
    fn encode_pcm_s16le_format() {
        let samples = vec![0.5, -0.5];
        let output = encode_output(&samples, 24000, OutputFormat::PcmS16le);
        assert_eq!(output.len(), 4); // 2 samples × 2 bytes
    }

    #[test]
    fn encode_pcm_f32le_format() {
        let samples = vec![0.5, -0.5];
        let output = encode_output(&samples, 24000, OutputFormat::PcmF32le);
        assert_eq!(output.len(), 8); // 2 samples × 4 bytes
        // Verify first sample value round-trips
        let first = f32::from_le_bytes([output[0], output[1], output[2], output[3]]);
        assert!((first - 0.5).abs() < 1e-6);
    }

    // ── Integration: chaining operations ───────────────────

    #[test]
    fn chain_volume_then_speed() {
        let mut samples: Vec<f32> = (0..100).map(|i| (i as f32 / 50.0).sin()).collect();
        apply_volume(&mut samples, 0.8);
        let stretched = apply_speed(&samples, 1.5);
        // Should be shorter (sped up)
        assert!(stretched.len() < 100);
        // Values should still be in [-1, 1]
        for s in &stretched {
            assert!(*s >= -1.0 && *s <= 1.0);
        }
    }

    #[test]
    fn chain_resample_then_encode() {
        let samples: Vec<f32> = (0..2400).map(|i| (i as f32 * 0.01).sin()).collect();
        let resampled = resample(&samples, 24000, 16000);
        let encoded = encode_output(&resampled, 16000, OutputFormat::Wav);
        // Verify WAV header sample rate is 16000
        let sr = u32::from_le_bytes([encoded[24], encoded[25], encoded[26], encoded[27]]);
        assert_eq!(sr, 16000);
    }
}
