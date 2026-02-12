use candle_core::Tensor;

/// Generation options for TTS synthesis.
#[derive(Debug, Clone)]
pub struct GenerationOptions {
    /// Language for synthesis (e.g., "chinese", "english", "auto")
    pub language: String,
    /// Speaker name (for CustomVoice mode)
    pub speaker: Option<String>,
    /// Instruction text (for VoiceDesign mode) - raw text, not used directly
    pub instruct: Option<String>,
    /// Tokenized instruction IDs (prepended to prompt for style control)
    pub instruct_ids: Option<Tensor>,
    /// Use non-streaming mode (full text at once vs incremental)
    pub non_streaming_mode: bool,
    /// Speaker embedding for voice cloning (from reference audio)
    pub speaker_embed: Option<Tensor>,
    /// Reference audio codes for ICL mode
    pub ref_codes: Option<Tensor>,
    /// Reference text for ICL mode
    pub ref_text_ids: Option<Tensor>,
    /// Use x_vector_only mode (speaker embed without ICL)
    pub x_vector_only_mode: bool,
}

impl Default for GenerationOptions {
    fn default() -> Self {
        Self {
            language: "auto".to_string(),
            speaker: None,
            instruct: None,
            instruct_ids: None,
            non_streaming_mode: true,
            speaker_embed: None,
            ref_codes: None,
            ref_text_ids: None,
            x_vector_only_mode: false,
        }
    }
}

impl GenerationOptions {
    /// Create options for basic synthesis with language.
    pub fn with_language(language: &str) -> Self {
        Self {
            language: language.to_string(),
            ..Default::default()
        }
    }

    /// Create options for voice cloning with speaker embedding.
    pub fn voice_clone(speaker_embed: Tensor, x_vector_only: bool) -> Self {
        Self {
            speaker_embed: Some(speaker_embed),
            x_vector_only_mode: x_vector_only,
            ..Default::default()
        }
    }

    /// Create options for ICL (in-context learning) voice cloning.
    pub fn voice_clone_icl(speaker_embed: Tensor, ref_codes: Tensor, ref_text_ids: Tensor) -> Self {
        Self {
            speaker_embed: Some(speaker_embed),
            ref_codes: Some(ref_codes),
            ref_text_ids: Some(ref_text_ids),
            x_vector_only_mode: false,
            ..Default::default()
        }
    }
}
