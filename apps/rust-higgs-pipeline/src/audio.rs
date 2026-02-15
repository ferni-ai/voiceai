//! Audio Format Utilities — PCM conversions and WAV encoding.

/// Output sample rate for TTS audio.
pub const TTS_SAMPLE_RATE: u32 = 24000;

/// Input sample rate for STT audio.
pub const STT_SAMPLE_RATE: u32 = 16000;

/// Duration of each streaming audio chunk in milliseconds.
pub const CHUNK_DURATION_MS: u32 = 200;

/// Number of TTS samples per streaming audio chunk (200ms @ 24kHz).
pub const TTS_CHUNK_SAMPLES: usize = 4800; // TTS_SAMPLE_RATE * CHUNK_DURATION_MS / 1000

/// Centralized audio rate configuration.
#[derive(Debug, Clone)]
pub struct AudioConfig {
    pub stt_sample_rate: u32,
    pub tts_sample_rate: u32,
    pub chunk_duration_ms: u32,
}

impl Default for AudioConfig {
    fn default() -> Self {
        Self {
            stt_sample_rate: STT_SAMPLE_RATE,
            tts_sample_rate: TTS_SAMPLE_RATE,
            chunk_duration_ms: CHUNK_DURATION_MS,
        }
    }
}

impl AudioConfig {
    /// Number of TTS samples per streaming chunk.
    pub fn tts_chunk_samples(&self) -> usize {
        (self.tts_sample_rate * self.chunk_duration_ms / 1000) as usize
    }
}

/// Convert f32 samples [-1.0, 1.0] to i16 little-endian bytes.
pub fn f32_to_s16le(samples: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(samples.len() * 2);
    for &s in samples {
        let clamped = s.clamp(-1.0, 1.0);
        let val = (clamped * 32767.0) as i16;
        bytes.extend_from_slice(&val.to_le_bytes());
    }
    bytes
}

/// Convert i16 samples to f32 [-1.0, 1.0].
///
/// Uses 32768.0 divisor so i16::MIN (-32768) maps to exactly -1.0.
/// Note: i16::MAX (32767) maps to ~0.99997, not exactly 1.0 — this
/// asymmetry is intentional and matches the standard PCM convention.
pub fn i16_to_f32(samples: &[i16]) -> Vec<f32> {
    samples.iter().map(|&s| s as f32 / 32768.0).collect()
}

/// Convert f32 samples to i16.
///
/// Uses 32767.0 multiplier so 1.0 maps to i16::MAX (32767), avoiding
/// overflow to i16::MIN. Intentionally asymmetric with `i16_to_f32`
/// (which divides by 32768.0) per standard PCM convention.
pub fn f32_to_i16(samples: &[f32]) -> Vec<i16> {
    samples
        .iter()
        .map(|&s| (s.clamp(-1.0, 1.0) * 32767.0) as i16)
        .collect()
}

/// Encode samples as WAV (s16le).
pub fn encode_wav_s16le(samples: &[f32], sample_rate: u32) -> Vec<u8> {
    let data = f32_to_s16le(samples);
    let data_len = data.len() as u32;
    let channels: u16 = 1;
    let bits_per_sample: u16 = 16;
    let byte_rate = sample_rate * channels as u32 * bits_per_sample as u32 / 8;
    let block_align = channels * bits_per_sample / 8;

    let mut wav = Vec::with_capacity(44 + data.len());
    // RIFF header
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data_len).to_le_bytes());
    wav.extend_from_slice(b"WAVE");
    // fmt chunk
    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes()); // PCM
    wav.extend_from_slice(&channels.to_le_bytes());
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&block_align.to_le_bytes());
    wav.extend_from_slice(&bits_per_sample.to_le_bytes());
    // data chunk
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    wav.extend_from_slice(&data);
    wav
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_f32_to_s16le_range() {
        let samples = vec![-1.0, 0.0, 1.0, 0.5, -0.5];
        let bytes = f32_to_s16le(&samples);
        assert_eq!(bytes.len(), 10);
    }

    #[test]
    fn test_i16_to_f32_roundtrip() {
        let original: Vec<i16> = vec![-32768, 0, 32767, 16384, -16384];
        let f32s = i16_to_f32(&original);
        let back = f32_to_i16(&f32s);
        for (a, b) in original.iter().zip(back.iter()) {
            assert!((a - b).abs() <= 1, "Roundtrip mismatch: {} vs {}", a, b);
        }
    }

    #[test]
    fn test_wav_header() {
        let samples = vec![0.0; 100];
        let wav = encode_wav_s16le(&samples, 24000);
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(&wav[36..40], b"data");
        assert_eq!(wav.len(), 44 + 200); // 100 samples * 2 bytes
    }
}
