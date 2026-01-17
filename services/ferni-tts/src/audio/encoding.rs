//! Audio Encoding
//!
//! WAV header generation and audio encoding utilities.

use super::AudioFormat;
use crate::error::Result;

/// Generate a WAV header for the given format and data size
pub fn encode_wav_header(format: &AudioFormat, data_size: u32) -> [u8; 44] {
    let mut header = [0u8; 44];

    let channels = format.channels as u16;
    let sample_rate = format.sample_rate;
    let bits_per_sample = format.bits_per_sample as u16;
    let byte_rate = sample_rate * channels as u32 * bits_per_sample as u32 / 8;
    let block_align = channels * bits_per_sample / 8;

    // RIFF header
    header[0..4].copy_from_slice(b"RIFF");
    header[4..8].copy_from_slice(&(36 + data_size).to_le_bytes()); // File size - 8
    header[8..12].copy_from_slice(b"WAVE");

    // Format chunk
    header[12..16].copy_from_slice(b"fmt ");
    header[16..20].copy_from_slice(&16u32.to_le_bytes()); // Chunk size
    header[20..22].copy_from_slice(&1u16.to_le_bytes()); // Audio format (1 = PCM)
    header[22..24].copy_from_slice(&channels.to_le_bytes());
    header[24..28].copy_from_slice(&sample_rate.to_le_bytes());
    header[28..32].copy_from_slice(&byte_rate.to_le_bytes());
    header[32..34].copy_from_slice(&block_align.to_le_bytes());
    header[34..36].copy_from_slice(&bits_per_sample.to_le_bytes());

    // Data chunk
    header[36..40].copy_from_slice(b"data");
    header[40..44].copy_from_slice(&data_size.to_le_bytes());

    header
}

/// Audio encoder supporting multiple formats
pub struct AudioEncoder {
    format: AudioFormat,
}

impl AudioEncoder {
    pub fn new(format: AudioFormat) -> Self {
        Self { format }
    }

    /// Encode PCM data as WAV
    pub fn encode_wav(&self, pcm_data: &[u8]) -> Vec<u8> {
        let header = encode_wav_header(&self.format, pcm_data.len() as u32);
        let mut wav = Vec::with_capacity(44 + pcm_data.len());
        wav.extend_from_slice(&header);
        wav.extend_from_slice(pcm_data);
        wav
    }

    /// Encode PCM data as raw PCM (no header)
    pub fn encode_pcm(&self, pcm_data: &[u8]) -> Vec<u8> {
        pcm_data.to_vec()
    }

    /// Get the format
    pub fn format(&self) -> &AudioFormat {
        &self.format
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wav_header() {
        let format = AudioFormat::default();
        let header = encode_wav_header(&format, 48000);

        // Check RIFF header
        assert_eq!(&header[0..4], b"RIFF");
        assert_eq!(&header[8..12], b"WAVE");

        // Check format chunk
        assert_eq!(&header[12..16], b"fmt ");
        assert_eq!(u16::from_le_bytes([header[20], header[21]]), 1); // PCM

        // Check sample rate
        let sample_rate = u32::from_le_bytes([header[24], header[25], header[26], header[27]]);
        assert_eq!(sample_rate, 24000);

        // Check data chunk
        assert_eq!(&header[36..40], b"data");
        let data_size = u32::from_le_bytes([header[40], header[41], header[42], header[43]]);
        assert_eq!(data_size, 48000);
    }

    #[test]
    fn test_encoder_wav() {
        let encoder = AudioEncoder::new(AudioFormat::default());
        let pcm = vec![0u8; 1000];
        let wav = encoder.encode_wav(&pcm);

        assert_eq!(wav.len(), 44 + 1000);
        assert_eq!(&wav[0..4], b"RIFF");
    }
}
