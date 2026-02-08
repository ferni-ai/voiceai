//! # Audio Pipeline Module
//!
//! High-performance audio processing for TTS output.
//!
//! ## Capabilities
//!
//! - PCM/WAV encoding
//! - Sample rate conversion (8kHz-48kHz)
//! - Chunk-based streaming
//! - Buffer management
//! - Volume normalization

mod pipeline;
mod streaming;
mod encoding;

pub use pipeline::{AudioPipeline, AudioPipelineConfig};
pub use streaming::{AudioStream, StreamingConfig};
pub use encoding::{encode_wav_header, AudioEncoder};

use serde::{Deserialize, Serialize};

/// Audio format specification
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct AudioFormat {
    /// Sample rate in Hz
    pub sample_rate: u32,

    /// Bits per sample (8, 16, 24, 32)
    pub bits_per_sample: u8,

    /// Number of channels (1 = mono, 2 = stereo)
    pub channels: u8,
}

impl Default for AudioFormat {
    fn default() -> Self {
        Self {
            sample_rate: 24000, // Standard TTS output
            bits_per_sample: 16,
            channels: 1, // Mono for voice
        }
    }
}

impl AudioFormat {
    /// Create format for a specific sample rate
    pub fn with_sample_rate(sample_rate: u32) -> Self {
        Self {
            sample_rate,
            ..Default::default()
        }
    }

    /// Bytes per sample
    pub fn bytes_per_sample(&self) -> usize {
        (self.bits_per_sample / 8) as usize
    }

    /// Bytes per second
    pub fn bytes_per_second(&self) -> usize {
        self.sample_rate as usize * self.bytes_per_sample() * self.channels as usize
    }

    /// Calculate duration in milliseconds for byte count
    pub fn duration_ms(&self, bytes: usize) -> u64 {
        let bytes_per_ms = self.bytes_per_second() / 1000;
        if bytes_per_ms > 0 {
            bytes as u64 / bytes_per_ms as u64
        } else {
            0
        }
    }

    /// Calculate byte count for duration in milliseconds
    pub fn bytes_for_duration(&self, duration_ms: u64) -> usize {
        (self.bytes_per_second() as u64 * duration_ms / 1000) as usize
    }
}

/// A chunk of audio data
#[derive(Debug, Clone)]
pub struct AudioChunk {
    /// Raw PCM data
    pub data: Vec<u8>,

    /// Audio format
    pub format: AudioFormat,

    /// Chunk index in stream
    pub index: u32,

    /// Is this the last chunk?
    pub is_final: bool,

    /// Timestamp in milliseconds from start
    pub timestamp_ms: u64,
}

impl AudioChunk {
    /// Create a new audio chunk
    pub fn new(data: Vec<u8>, format: AudioFormat, index: u32) -> Self {
        let timestamp_ms = format.duration_ms(data.len()) * index as u64;
        Self {
            data,
            format,
            index,
            is_final: false,
            timestamp_ms,
        }
    }

    /// Mark as final chunk
    pub fn with_final(mut self) -> Self {
        self.is_final = true;
        self
    }

    /// Duration of this chunk in milliseconds
    pub fn duration_ms(&self) -> u64 {
        self.format.duration_ms(self.data.len())
    }

    /// Number of samples in this chunk
    pub fn sample_count(&self) -> usize {
        self.data.len() / self.format.bytes_per_sample() / self.format.channels as usize
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_format() {
        let fmt = AudioFormat::default();
        assert_eq!(fmt.sample_rate, 24000);
        assert_eq!(fmt.bits_per_sample, 16);
        assert_eq!(fmt.channels, 1);
    }

    #[test]
    fn test_bytes_per_second() {
        let fmt = AudioFormat::default();
        // 24000 samples/sec * 2 bytes/sample * 1 channel = 48000 bytes/sec
        assert_eq!(fmt.bytes_per_second(), 48000);
    }

    #[test]
    fn test_duration_calculation() {
        let fmt = AudioFormat::default();
        // 48000 bytes = 1 second
        assert_eq!(fmt.duration_ms(48000), 1000);
        // 24000 bytes = 0.5 seconds
        assert_eq!(fmt.duration_ms(24000), 500);
    }

    #[test]
    fn test_bytes_for_duration() {
        let fmt = AudioFormat::default();
        // 1 second = 48000 bytes
        assert_eq!(fmt.bytes_for_duration(1000), 48000);
        // 100ms = 4800 bytes
        assert_eq!(fmt.bytes_for_duration(100), 4800);
    }
}
