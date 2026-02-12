//! Top-level configuration for the 12Hz tokenizer.

use serde::Deserialize;

use crate::audio::decoder::config::TokenizerV2DecoderConfig;

/// Top-level configuration for the 12Hz tokenizer.
#[derive(Debug, Clone, Deserialize)]
pub struct TokenizerV2Config {
    /// Decoder configuration
    #[serde(default)]
    pub decoder_config: TokenizerV2DecoderConfig,

    /// Number of valid quantizers from encoder (default: 16)
    #[serde(default = "default_encoder_valid_num_quantizers")]
    pub encoder_valid_num_quantizers: usize,

    /// Input audio sample rate (default: 24000)
    #[serde(default = "default_input_sample_rate")]
    pub input_sample_rate: usize,

    /// Output audio sample rate (default: 24000)
    #[serde(default = "default_output_sample_rate")]
    pub output_sample_rate: usize,

    /// Decoder upsampling rate (samples per code) (default: 1920)
    #[serde(default = "default_decode_upsample_rate")]
    pub decode_upsample_rate: usize,

    /// Encoder downsampling rate (samples per code) (default: 1920)
    #[serde(default = "default_encode_downsample_rate")]
    pub encode_downsample_rate: usize,
}

fn default_encoder_valid_num_quantizers() -> usize {
    16
}
fn default_input_sample_rate() -> usize {
    24000
}
fn default_output_sample_rate() -> usize {
    24000
}
fn default_decode_upsample_rate() -> usize {
    1920
}
fn default_encode_downsample_rate() -> usize {
    1920
}

impl Default for TokenizerV2Config {
    fn default() -> Self {
        Self {
            decoder_config: TokenizerV2DecoderConfig::default(),
            encoder_valid_num_quantizers: default_encoder_valid_num_quantizers(),
            input_sample_rate: default_input_sample_rate(),
            output_sample_rate: default_output_sample_rate(),
            decode_upsample_rate: default_decode_upsample_rate(),
            encode_downsample_rate: default_encode_downsample_rate(),
        }
    }
}

impl TokenizerV2Config {
    /// Load from JSON string.
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }

    /// Get the tokenizer rate in Hz.
    pub fn tokenizer_rate(&self) -> f64 {
        self.output_sample_rate as f64 / self.decode_upsample_rate as f64
    }
}
