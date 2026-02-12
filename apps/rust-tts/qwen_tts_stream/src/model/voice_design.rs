//! Voice design from natural language descriptions.

/// Configuration for voice design.
#[derive(Debug, Clone)]
pub struct VoiceDesignConfig {
    /// Natural language description of desired voice
    /// e.g., "A deep, warm male voice with a slight British accent"
    pub voice_description: String,
    /// Language code
    pub language: String,
    /// Maximum number of tokens to generate
    pub max_new_tokens: usize,
}

impl Default for VoiceDesignConfig {
    fn default() -> Self {
        Self {
            voice_description: "A clear, natural speaking voice".to_string(),
            language: "en".to_string(),
            max_new_tokens: 2048,
        }
    }
}
