//! Custom voice configuration for predefined speakers.

/// Configuration for custom voice generation.
#[derive(Debug, Clone)]
pub struct CustomVoiceConfig {
    /// Speaker name (must be in model's spk_id mapping)
    pub speaker_name: String,
    /// Language code
    pub language: String,
    /// Maximum number of tokens to generate
    pub max_new_tokens: usize,
}

impl Default for CustomVoiceConfig {
    fn default() -> Self {
        Self {
            speaker_name: "default".to_string(),
            language: "en".to_string(),
            max_new_tokens: 2048,
        }
    }
}
