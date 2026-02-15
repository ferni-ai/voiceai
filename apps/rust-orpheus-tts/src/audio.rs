/// Audio format utilities for PCM conversion and WAV encoding.
///
/// Matches the formats expected by LocalTTSProvider in TypeScript.

pub const SAMPLE_RATE: u32 = 24000;

/// Convert f32 samples [-1.0, 1.0] to raw 16-bit signed PCM bytes (s16le).
pub fn f32_to_s16le(samples: &[f32]) -> Vec<u8> {
    let mut buf = Vec::with_capacity(samples.len() * 2);
    for &s in samples {
        let clamped = s.clamp(-1.0, 1.0);
        let sample_i16 = (clamped * 32767.0) as i16;
        buf.extend_from_slice(&sample_i16.to_le_bytes());
    }
    buf
}

/// Encode f32 mono samples as a WAV file with 16-bit PCM (s16le).
pub fn encode_wav_s16le(samples: &[f32], sample_rate: u32) -> Vec<u8> {
    let num_samples = samples.len();
    let data_size = num_samples * 2;
    let riff_size = 36 + data_size;

    let mut buf = Vec::with_capacity(44 + data_size);

    // RIFF header
    buf.extend_from_slice(b"RIFF");
    buf.extend_from_slice(&(riff_size as u32).to_le_bytes());
    buf.extend_from_slice(b"WAVEfmt ");

    // fmt sub-chunk (16 bytes for PCM)
    buf.extend_from_slice(&16u32.to_le_bytes());
    buf.extend_from_slice(&1u16.to_le_bytes()); // PCM
    buf.extend_from_slice(&1u16.to_le_bytes()); // mono
    buf.extend_from_slice(&sample_rate.to_le_bytes());
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn s16le_silence() {
        let pcm = f32_to_s16le(&[0.0]);
        assert_eq!(pcm.len(), 2);
        assert_eq!(i16::from_le_bytes([pcm[0], pcm[1]]), 0);
    }

    #[test]
    fn s16le_clamps() {
        let pcm = f32_to_s16le(&[2.0, -3.0]);
        let s1 = i16::from_le_bytes([pcm[0], pcm[1]]);
        let s2 = i16::from_le_bytes([pcm[2], pcm[3]]);
        assert_eq!(s1, 32767);
        assert_eq!(s2, -32767);
    }

    #[test]
    fn wav_header_correct() {
        let wav = encode_wav_s16le(&[], 24000);
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(wav.len(), 44);
    }
}
