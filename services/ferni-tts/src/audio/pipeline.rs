//! Audio Processing Pipeline
//!
//! Handles format conversion, resampling, and chunk processing.

use super::{AudioChunk, AudioFormat};
use crate::error::{Error, Result};

/// Audio pipeline configuration
#[derive(Debug, Clone)]
pub struct AudioPipelineConfig {
    /// Output format
    pub output_format: AudioFormat,

    /// Chunk size in bytes (for streaming)
    pub chunk_size: usize,

    /// Whether to normalize volume
    pub normalize: bool,

    /// Target peak level for normalization (0.0-1.0)
    pub target_peak: f32,
}

impl Default for AudioPipelineConfig {
    fn default() -> Self {
        Self {
            output_format: AudioFormat::default(),
            chunk_size: 4800, // 100ms at 24kHz/16bit/mono
            normalize: true,
            target_peak: 0.9,
        }
    }
}

/// Audio processing pipeline
pub struct AudioPipeline {
    config: AudioPipelineConfig,
    buffer: Vec<u8>,
    chunk_index: u32,
}

impl AudioPipeline {
    /// Create a new audio pipeline
    pub fn new(config: AudioPipelineConfig) -> Self {
        Self {
            config,
            buffer: Vec::with_capacity(config.chunk_size * 4),
            chunk_index: 0,
        }
    }

    /// Create with default config
    pub fn default_pipeline() -> Self {
        Self::new(AudioPipelineConfig::default())
    }

    /// Process input audio and return chunks
    pub fn process(&mut self, input: &[u8], input_format: AudioFormat) -> Result<Vec<AudioChunk>> {
        // Convert format if needed
        let converted = if input_format != self.config.output_format {
            self.convert_format(input, input_format)?
        } else {
            input.to_vec()
        };

        // Normalize if enabled
        let normalized = if self.config.normalize {
            self.normalize_audio(&converted)?
        } else {
            converted
        };

        // Add to buffer
        self.buffer.extend_from_slice(&normalized);

        // Extract complete chunks
        let mut chunks = Vec::new();
        while self.buffer.len() >= self.config.chunk_size {
            let chunk_data: Vec<u8> = self.buffer.drain(..self.config.chunk_size).collect();
            chunks.push(AudioChunk::new(
                chunk_data,
                self.config.output_format,
                self.chunk_index,
            ));
            self.chunk_index += 1;
        }

        Ok(chunks)
    }

    /// Flush remaining buffer as final chunk
    pub fn flush(&mut self) -> Option<AudioChunk> {
        if self.buffer.is_empty() {
            return None;
        }

        let chunk_data = std::mem::take(&mut self.buffer);
        let chunk = AudioChunk::new(
            chunk_data,
            self.config.output_format,
            self.chunk_index,
        ).with_final();

        self.chunk_index += 1;
        Some(chunk)
    }

    /// Reset pipeline state
    pub fn reset(&mut self) {
        self.buffer.clear();
        self.chunk_index = 0;
    }

    /// Convert audio format
    fn convert_format(&self, input: &[u8], input_format: AudioFormat) -> Result<Vec<u8>> {
        let output_format = &self.config.output_format;

        // Handle sample rate conversion
        if input_format.sample_rate != output_format.sample_rate {
            return self.resample(input, input_format);
        }

        // Handle bit depth conversion
        if input_format.bits_per_sample != output_format.bits_per_sample {
            return self.convert_bit_depth(input, input_format);
        }

        // Handle channel conversion
        if input_format.channels != output_format.channels {
            return self.convert_channels(input, input_format);
        }

        Ok(input.to_vec())
    }

    /// Resample audio to target sample rate
    fn resample(&self, input: &[u8], input_format: AudioFormat) -> Result<Vec<u8>> {
        // Simple linear interpolation resampling
        // For production, use rubato crate for high-quality resampling

        let input_rate = input_format.sample_rate as f64;
        let output_rate = self.config.output_format.sample_rate as f64;
        let ratio = output_rate / input_rate;

        let bytes_per_sample = input_format.bytes_per_sample();
        let input_samples = input.len() / bytes_per_sample;
        let output_samples = (input_samples as f64 * ratio) as usize;

        let mut output = Vec::with_capacity(output_samples * bytes_per_sample);

        for i in 0..output_samples {
            let src_pos = i as f64 / ratio;
            let src_idx = src_pos as usize;
            let frac = src_pos - src_idx as f64;

            // Get samples for interpolation
            let s0 = self.get_sample_i16(input, src_idx, bytes_per_sample);
            let s1 = self.get_sample_i16(input, (src_idx + 1).min(input_samples - 1), bytes_per_sample);

            // Linear interpolation
            let interpolated = s0 as f64 + (s1 as f64 - s0 as f64) * frac;
            let sample = interpolated as i16;

            // Write output sample
            output.extend_from_slice(&sample.to_le_bytes());
        }

        Ok(output)
    }

    /// Get a sample as i16
    fn get_sample_i16(&self, data: &[u8], index: usize, bytes_per_sample: usize) -> i16 {
        let offset = index * bytes_per_sample;
        if offset + 2 <= data.len() {
            i16::from_le_bytes([data[offset], data[offset + 1]])
        } else {
            0
        }
    }

    /// Convert bit depth
    fn convert_bit_depth(&self, input: &[u8], input_format: AudioFormat) -> Result<Vec<u8>> {
        let output_format = &self.config.output_format;

        match (input_format.bits_per_sample, output_format.bits_per_sample) {
            (16, 16) => Ok(input.to_vec()),
            (8, 16) => {
                // 8-bit to 16-bit
                let mut output = Vec::with_capacity(input.len() * 2);
                for &sample in input {
                    let s16 = ((sample as i16 - 128) * 256) as i16;
                    output.extend_from_slice(&s16.to_le_bytes());
                }
                Ok(output)
            }
            (32, 16) => {
                // 32-bit float to 16-bit
                let mut output = Vec::with_capacity(input.len() / 2);
                for chunk in input.chunks(4) {
                    if chunk.len() == 4 {
                        let f32_sample = f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
                        let i16_sample = (f32_sample * 32767.0).clamp(-32768.0, 32767.0) as i16;
                        output.extend_from_slice(&i16_sample.to_le_bytes());
                    }
                }
                Ok(output)
            }
            _ => Err(Error::AudioFormat {
                expected: format!("{}->16 bit conversion", input_format.bits_per_sample),
                actual: format!("{} bit", output_format.bits_per_sample),
            }),
        }
    }

    /// Convert channels (mono <-> stereo)
    fn convert_channels(&self, input: &[u8], input_format: AudioFormat) -> Result<Vec<u8>> {
        let bytes_per_sample = input_format.bytes_per_sample();

        match (input_format.channels, self.config.output_format.channels) {
            (2, 1) => {
                // Stereo to mono: average channels
                let mut output = Vec::with_capacity(input.len() / 2);
                for chunk in input.chunks(bytes_per_sample * 2) {
                    if chunk.len() >= bytes_per_sample * 2 {
                        let left = i16::from_le_bytes([chunk[0], chunk[1]]);
                        let right = i16::from_le_bytes([chunk[2], chunk[3]]);
                        let mono = ((left as i32 + right as i32) / 2) as i16;
                        output.extend_from_slice(&mono.to_le_bytes());
                    }
                }
                Ok(output)
            }
            (1, 2) => {
                // Mono to stereo: duplicate channel
                let mut output = Vec::with_capacity(input.len() * 2);
                for chunk in input.chunks(bytes_per_sample) {
                    output.extend_from_slice(chunk);
                    output.extend_from_slice(chunk);
                }
                Ok(output)
            }
            _ => Ok(input.to_vec()),
        }
    }

    /// Normalize audio to target peak level
    fn normalize_audio(&self, input: &[u8]) -> Result<Vec<u8>> {
        if input.len() < 2 {
            return Ok(input.to_vec());
        }

        // Find peak level
        let mut peak: i16 = 0;
        for chunk in input.chunks(2) {
            if chunk.len() == 2 {
                let sample = i16::from_le_bytes([chunk[0], chunk[1]]).abs();
                peak = peak.max(sample);
            }
        }

        // Calculate gain
        if peak == 0 {
            return Ok(input.to_vec());
        }

        let target = (self.config.target_peak * 32767.0) as i16;
        let gain = target as f32 / peak as f32;

        // Apply gain (skip if already normalized)
        if (gain - 1.0).abs() < 0.01 {
            return Ok(input.to_vec());
        }

        let mut output = Vec::with_capacity(input.len());
        for chunk in input.chunks(2) {
            if chunk.len() == 2 {
                let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
                let normalized = (sample as f32 * gain).clamp(-32768.0, 32767.0) as i16;
                output.extend_from_slice(&normalized.to_le_bytes());
            }
        }

        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pipeline_chunking() {
        let mut pipeline = AudioPipeline::new(AudioPipelineConfig {
            chunk_size: 100,
            ..Default::default()
        });

        let input = vec![0u8; 350];
        let chunks = pipeline.process(&input, AudioFormat::default()).unwrap();

        assert_eq!(chunks.len(), 3, "Should produce 3 complete chunks");
        assert_eq!(pipeline.buffer.len(), 50, "Should have 50 bytes remaining");

        let final_chunk = pipeline.flush();
        assert!(final_chunk.is_some(), "Should have final chunk");
        assert!(final_chunk.unwrap().is_final, "Final chunk should be marked as final");
    }

    #[test]
    fn test_stereo_to_mono() {
        let pipeline = AudioPipeline::default_pipeline();

        // Stereo: left=1000, right=2000
        let stereo = vec![
            0xE8, 0x03, // 1000 (left)
            0xD0, 0x07, // 2000 (right)
        ];

        let stereo_format = AudioFormat {
            channels: 2,
            ..Default::default()
        };

        let mono = pipeline.convert_channels(&stereo, stereo_format).unwrap();

        // Should be average: (1000 + 2000) / 2 = 1500
        let sample = i16::from_le_bytes([mono[0], mono[1]]);
        assert_eq!(sample, 1500);
    }

    #[test]
    fn test_normalization() {
        let pipeline = AudioPipeline::new(AudioPipelineConfig {
            normalize: true,
            target_peak: 0.5,
            ..Default::default()
        });

        // Input with peak at ~16000 (half of max)
        let input = vec![
            0x00, 0x3E, // 15872
            0x00, 0xC2, // -15872
        ];

        let normalized = pipeline.normalize_audio(&input).unwrap();

        // Peak should now be around 0.5 * 32767 = 16383
        let peak_sample = i16::from_le_bytes([normalized[0], normalized[1]]).abs();
        assert!(peak_sample > 16000 && peak_sample < 16500, "Peak should be ~16383, got {}", peak_sample);
    }
}
