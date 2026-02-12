//! Top-level Qwen3-TTS configuration.

use serde::Deserialize;

use crate::config::{speaker_encoder_config::SpeakerEncoderConfig, talker_config::TalkerConfig};

/// Top-level configuration for the Qwen3-TTS model.
///
/// This configuration combines all sub-model configurations:
/// - `talker_config`: Main talker model (includes code predictor config)
/// - `speaker_encoder_config`: ECAPA-TDNN speaker encoder
///
/// The model also includes special token IDs for TTS formatting.
#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    /// Talker model configuration
    #[serde(default)]
    pub talker_config: TalkerConfig,

    /// Speaker encoder configuration (optional - only present in Base model for voice cloning)
    /// For CustomVoice and VoiceDesign models, this will be None.
    pub speaker_encoder_config: Option<SpeakerEncoderConfig>,

    /// Tokenizer type: "12hz" or "25hz"
    pub tokenizer_type: Option<String>,

    /// Model size identifier
    pub tts_model_size: Option<String>,

    /// Model type identifier
    pub tts_model_type: Option<String>,

    /// Image/Message start token ID (default: 151644)
    #[serde(default = "default_im_start_token_id")]
    pub im_start_token_id: usize,

    /// Image/Message end token ID (default: 151645)
    #[serde(default = "default_im_end_token_id")]
    pub im_end_token_id: usize,

    /// TTS padding token ID (default: 151671)
    #[serde(default = "default_tts_pad_token_id")]
    pub tts_pad_token_id: usize,

    /// TTS BOS token ID (default: 151672)
    #[serde(default = "default_tts_bos_token_id")]
    pub tts_bos_token_id: usize,

    /// TTS EOS token ID (default: 151673)
    #[serde(default = "default_tts_eos_token_id")]
    pub tts_eos_token_id: usize,
}

fn default_im_start_token_id() -> usize {
    151644
}
fn default_im_end_token_id() -> usize {
    151645
}
fn default_tts_pad_token_id() -> usize {
    151671
}
fn default_tts_bos_token_id() -> usize {
    151672
}
fn default_tts_eos_token_id() -> usize {
    151673
}

impl Default for Config {
    fn default() -> Self {
        Self {
            talker_config: TalkerConfig::default(),
            speaker_encoder_config: None, // Optional - only for Base model
            tokenizer_type: Some("12hz".to_string()),
            tts_model_size: None,
            tts_model_type: None,
            im_start_token_id: default_im_start_token_id(),
            im_end_token_id: default_im_end_token_id(),
            tts_pad_token_id: default_tts_pad_token_id(),
            tts_bos_token_id: default_tts_bos_token_id(),
            tts_eos_token_id: default_tts_eos_token_id(),
        }
    }
}

impl Config {
    /// Load configuration from a JSON file.
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }

    /// Get the tokenizer rate in Hz
    pub fn tokenizer_rate(&self) -> usize {
        match self.tokenizer_type.as_deref() {
            Some("12hz") => 12,
            Some("25hz") => 25,
            _ => 12, // default to 12hz
        }
    }
}
