/// Audio format utilities for WAV encoding and PCM conversion.
///
/// Converts f32 audio samples [-1.0, 1.0] to WAV (s16le PCM) or raw s16le bytes,
/// matching the formats expected by LocalTTSProvider in TypeScript.

/// Encode f32 mono samples as a WAV file with 16-bit PCM (s16le).
///
/// Returns complete WAV file bytes including the 44-byte header.
pub fn encode_wav_s16le(samples: &[f32], sample_rate: u32) -> Vec<u8> {
    let num_samples = samples.len();
    let data_size = num_samples * 2; // 2 bytes per s16 sample
    let riff_size = 36 + data_size;

    let mut buf = Vec::with_capacity(44 + data_size);

    // RIFF header
    buf.extend_from_slice(b"RIFF");
    buf.extend_from_slice(&(riff_size as u32).to_le_bytes());
    buf.extend_from_slice(b"WAVEfmt ");

    // fmt sub-chunk (16 bytes for PCM)
    buf.extend_from_slice(&16u32.to_le_bytes()); // sub-chunk size
    buf.extend_from_slice(&1u16.to_le_bytes()); // audio format: PCM
    buf.extend_from_slice(&1u16.to_le_bytes()); // channels: mono
    buf.extend_from_slice(&sample_rate.to_le_bytes()); // sample rate
    buf.extend_from_slice(&(sample_rate * 2).to_le_bytes()); // byte rate
    buf.extend_from_slice(&2u16.to_le_bytes()); // block align
    buf.extend_from_slice(&16u16.to_le_bytes()); // bits per sample

    // data sub-chunk
    buf.extend_from_slice(b"data");
    buf.extend_from_slice(&(data_size as u32).to_le_bytes());

    for &s in samples {
        let clamped = s.clamp(-1.0, 1.0);
        let sample_i16 = (clamped * 32767.0) as i16;
        buf.extend_from_slice(&sample_i16.to_le_bytes());
    }

    buf
}

/// Convert f32 samples to raw f32le bytes (little-endian).
///
/// Used for the `pcm-f32le` output format option.
pub fn f32_to_f32le(samples: &[f32]) -> Vec<u8> {
    let mut buf = Vec::with_capacity(samples.len() * 4);
    for &s in samples {
        buf.extend_from_slice(&s.to_le_bytes());
    }
    buf
}

/// Convert f32 samples [-1.0, 1.0] to raw 16-bit signed PCM bytes (s16le).
///
/// This is the format expected by the `/synthesize` endpoint (custom API).
pub fn f32_to_s16le(samples: &[f32]) -> Vec<u8> {
    let mut buf = Vec::with_capacity(samples.len() * 2);
    for &s in samples {
        let clamped = s.clamp(-1.0, 1.0);
        let sample_i16 = (clamped * 32767.0) as i16;
        buf.extend_from_slice(&sample_i16.to_le_bytes());
    }
    buf
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── WAV encoding ─────────────────────────────────────────

    #[test]
    fn wav_header_magic_bytes() {
        let wav = encode_wav_s16le(&[], 24000);
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(&wav[12..16], b"fmt ");
        assert_eq!(&wav[36..40], b"data");
    }

    #[test]
    fn wav_header_size_44_bytes() {
        let wav = encode_wav_s16le(&[], 24000);
        assert_eq!(wav.len(), 44, "empty WAV should be exactly 44 bytes (header only)");
    }

    #[test]
    fn wav_sample_rate_encoded() {
        let wav = encode_wav_s16le(&[], 24000);
        let sr = u32::from_le_bytes([wav[24], wav[25], wav[26], wav[27]]);
        assert_eq!(sr, 24000);
    }

    #[test]
    fn wav_mono_channel() {
        let wav = encode_wav_s16le(&[], 24000);
        let channels = u16::from_le_bytes([wav[22], wav[23]]);
        assert_eq!(channels, 1);
    }

    #[test]
    fn wav_16bit_pcm() {
        let wav = encode_wav_s16le(&[], 24000);
        let bits = u16::from_le_bytes([wav[34], wav[35]]);
        assert_eq!(bits, 16);
        let format = u16::from_le_bytes([wav[20], wav[21]]);
        assert_eq!(format, 1, "audio format should be 1 (PCM)");
    }

    #[test]
    fn wav_data_size_matches_samples() {
        let samples = vec![0.0f32; 100];
        let wav = encode_wav_s16le(&samples, 24000);
        assert_eq!(wav.len(), 244);
        let data_size = u32::from_le_bytes([wav[40], wav[41], wav[42], wav[43]]);
        assert_eq!(data_size, 200);
    }

    #[test]
    fn wav_riff_size_field() {
        let samples = vec![0.0f32; 100];
        let wav = encode_wav_s16le(&samples, 24000);
        let riff_size = u32::from_le_bytes([wav[4], wav[5], wav[6], wav[7]]);
        assert_eq!(riff_size, 236);
    }

    // ── Sample value encoding ────────────────────────────────

    #[test]
    fn silence_encodes_to_zero() {
        let wav = encode_wav_s16le(&[0.0], 24000);
        let sample = i16::from_le_bytes([wav[44], wav[45]]);
        assert_eq!(sample, 0);
    }

    #[test]
    fn positive_peak_clamps() {
        let wav = encode_wav_s16le(&[1.0], 24000);
        let sample = i16::from_le_bytes([wav[44], wav[45]]);
        assert_eq!(sample, 32767);
    }

    #[test]
    fn negative_peak_clamps() {
        let wav = encode_wav_s16le(&[-1.0], 24000);
        let sample = i16::from_le_bytes([wav[44], wav[45]]);
        assert_eq!(sample, -32767);
    }

    #[test]
    fn values_beyond_range_are_clamped() {
        let wav = encode_wav_s16le(&[2.0, -3.0], 24000);
        let s1 = i16::from_le_bytes([wav[44], wav[45]]);
        let s2 = i16::from_le_bytes([wav[46], wav[47]]);
        assert_eq!(s1, 32767, "values >1.0 should clamp to max");
        assert_eq!(s2, -32767, "values <-1.0 should clamp to min");
    }

    // ── f32_to_s16le (raw PCM) ──────────────────────────────

    #[test]
    fn pcm_size_is_double_samples() {
        let pcm = f32_to_s16le(&[0.0; 50]);
        assert_eq!(pcm.len(), 100);
    }

    #[test]
    fn pcm_silence() {
        let pcm = f32_to_s16le(&[0.0]);
        let sample = i16::from_le_bytes([pcm[0], pcm[1]]);
        assert_eq!(sample, 0);
    }

    #[test]
    fn pcm_matches_wav_data() {
        let samples = vec![0.5, -0.5, 0.0, 1.0, -1.0];
        let wav = encode_wav_s16le(&samples, 24000);
        let pcm = f32_to_s16le(&samples);
        assert_eq!(&wav[44..], &pcm[..], "PCM data should match WAV data section");
    }

    #[test]
    fn pcm_empty_input() {
        let pcm = f32_to_s16le(&[]);
        assert!(pcm.is_empty());
    }

    #[test]
    fn pcm_clamping_consistent_with_wav() {
        let extreme = vec![5.0, -5.0, 0.0];
        let wav = encode_wav_s16le(&extreme, 24000);
        let pcm = f32_to_s16le(&extreme);
        assert_eq!(&wav[44..], &pcm[..]);
    }

    // ── f32_to_f32le (raw float PCM) ─────────────────────

    #[test]
    fn f32le_size_is_4x_samples() {
        let buf = f32_to_f32le(&[0.0; 10]);
        assert_eq!(buf.len(), 40);
    }

    #[test]
    fn f32le_roundtrip() {
        let samples = vec![0.5, -0.5, 0.0, 1.0, -1.0];
        let buf = f32_to_f32le(&samples);
        for (i, &expected) in samples.iter().enumerate() {
            let offset = i * 4;
            let val = f32::from_le_bytes([buf[offset], buf[offset+1], buf[offset+2], buf[offset+3]]);
            assert!((val - expected).abs() < 1e-6, "sample {i}: {val} != {expected}");
        }
    }

    #[test]
    fn f32le_empty_input() {
        let buf = f32_to_f32le(&[]);
        assert!(buf.is_empty());
    }
}
