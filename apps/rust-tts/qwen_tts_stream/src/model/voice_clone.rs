//! Voice cloning configuration and prompt structures.

use candle_core::Tensor;

/// Configuration for voice cloning generation.
#[derive(Debug, Clone)]
pub struct VoiceCloneConfig {
    /// Maximum number of tokens to generate
    pub max_new_tokens: usize,
    /// Minimum duration in seconds
    pub min_duration: Option<f32>,
    /// Maximum duration in seconds
    pub max_duration: Option<f32>,
}

impl Default for VoiceCloneConfig {
    fn default() -> Self {
        Self {
            max_new_tokens: 2048,
            min_duration: None,
            max_duration: Some(30.0),
        }
    }
}

/// Container for one sample's voice-clone prompt information.
///
/// This struct holds all the information needed to perform voice cloning
/// for a single sample in a batch.
///
/// # Modes
///
/// - **X-vector only mode** (`x_vector_only_mode = true`): Only the speaker embedding
///   is used. No in-context learning. `ref_code` and `ref_text` are ignored.
///
/// - **ICL mode** (`icl_mode = true`): In-context learning mode where the model
///   learns from the reference audio and transcript. Requires both `ref_code`
///   and `ref_text` to be present.
///
/// # Example
///
/// ```no_run
/// use qwen_tts::model::voice_clone::VoiceClonePromptItem;
/// use candle_core::{Device, Tensor, DType};
///
/// # fn main() -> candle_core::Result<()> {
/// let device = Device::Cpu;
/// let speaker_embedding = Tensor::zeros((1024,), DType::F32, &device)?;
/// let ref_codes = Tensor::zeros((100, 32), DType::I64, &device)?;
///
/// // X-vector only mode - just clone speaker characteristics
/// let prompt = VoiceClonePromptItem::x_vector_only(speaker_embedding.clone());
///
/// // ICL mode - learn from reference audio and transcript
/// let prompt = VoiceClonePromptItem::icl(
///     ref_codes,
///     speaker_embedding,
///     "Hello, this is a reference transcript.".to_string(),
/// );
/// # Ok(())
/// # }
/// ```
#[derive(Debug, Clone)]
pub struct VoiceClonePromptItem {
    /// Reference audio codes from the tokenizer.
    ///
    /// Shape depends on tokenizer type:
    /// - 12Hz (V2): `(codes_len, num_quantizers)` - 2D tensor
    /// - 25Hz (V1): `(codes_len,)` - 1D tensor
    ///
    /// Required for ICL mode, optional for x-vector only mode.
    pub ref_code: Option<Tensor>,

    /// Speaker embedding extracted from reference audio.
    ///
    /// Shape: `(speaker_dim,)` typically 1024 dimensions.
    /// Always required.
    pub ref_spk_embedding: Tensor,

    /// Whether to use x-vector (speaker embedding) only mode.
    ///
    /// When true, only the speaker embedding is used for voice cloning.
    /// The model won't use ICL (in-context learning) from reference audio.
    pub x_vector_only_mode: bool,

    /// Whether in-context learning mode is enabled.
    ///
    /// When true (and x_vector_only_mode is false), the model uses both
    /// the speaker embedding and learns from the reference audio/transcript.
    /// Requires `ref_code` and `ref_text` to be present.
    pub icl_mode: bool,

    /// Reference transcript text.
    ///
    /// The text spoken in the reference audio. Required for ICL mode
    /// so the model can learn the correspondence between text and audio.
    pub ref_text: Option<String>,
}

impl VoiceClonePromptItem {
    /// Create a new voice clone prompt for x-vector only mode.
    ///
    /// In this mode, only the speaker embedding is used for voice cloning.
    /// This is simpler but may not capture prosodic patterns as well as ICL mode.
    ///
    /// # Arguments
    ///
    /// * `ref_spk_embedding` - Speaker embedding tensor of shape `(speaker_dim,)`
    pub fn x_vector_only(ref_spk_embedding: Tensor) -> Self {
        Self {
            ref_code: None,
            ref_spk_embedding,
            x_vector_only_mode: true,
            icl_mode: false,
            ref_text: None,
        }
    }

    /// Create a new voice clone prompt for ICL (in-context learning) mode.
    ///
    /// In this mode, the model learns from both the speaker embedding and
    /// the reference audio/transcript pair. This typically produces better
    /// results for matching prosody and speaking style.
    ///
    /// # Arguments
    ///
    /// * `ref_code` - Audio codes from the tokenizer
    /// * `ref_spk_embedding` - Speaker embedding tensor
    /// * `ref_text` - Transcript of the reference audio
    pub fn icl(ref_code: Tensor, ref_spk_embedding: Tensor, ref_text: String) -> Self {
        Self {
            ref_code: Some(ref_code),
            ref_spk_embedding,
            x_vector_only_mode: false,
            icl_mode: true,
            ref_text: Some(ref_text),
        }
    }

    /// Create a new voice clone prompt with all fields specified.
    pub fn new(
        ref_code: Option<Tensor>,
        ref_spk_embedding: Tensor,
        x_vector_only_mode: bool,
        ref_text: Option<String>,
    ) -> Self {
        Self {
            ref_code,
            ref_spk_embedding,
            x_vector_only_mode,
            icl_mode: !x_vector_only_mode,
            ref_text,
        }
    }

    /// Check if this prompt is valid for its mode.
    ///
    /// Returns an error message if validation fails.
    pub fn validate(&self) -> Result<(), String> {
        if self.icl_mode && !self.x_vector_only_mode {
            // ICL mode requires ref_code and ref_text
            if self.ref_code.is_none() {
                return Err("ICL mode requires ref_code to be present".to_string());
            }
            if self.ref_text.is_none() {
                return Err("ICL mode requires ref_text to be present".to_string());
            }
        }
        Ok(())
    }

    /// Returns true if this prompt uses ICL mode.
    pub fn is_icl(&self) -> bool {
        self.icl_mode && !self.x_vector_only_mode
    }

    /// Returns true if this prompt uses x-vector only mode.
    pub fn is_x_vector_only(&self) -> bool {
        self.x_vector_only_mode
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use candle_core::{DType, Device};

    fn create_test_embedding() -> Tensor {
        Tensor::zeros((1024,), DType::F32, &Device::Cpu).unwrap()
    }

    fn create_test_codes() -> Tensor {
        Tensor::zeros((100, 32), DType::I64, &Device::Cpu).unwrap()
    }

    // =========================================================================
    // X-Vector Only Mode Tests
    // =========================================================================

    #[test]
    fn test_x_vector_only_creation() {
        let embedding = create_test_embedding();
        let prompt = VoiceClonePromptItem::x_vector_only(embedding);

        assert!(
            prompt.ref_code.is_none(),
            "x_vector_only should have no ref_code"
        );
        assert!(
            prompt.x_vector_only_mode,
            "x_vector_only_mode should be true"
        );
        assert!(!prompt.icl_mode, "icl_mode should be false");
        assert!(
            prompt.ref_text.is_none(),
            "x_vector_only should have no ref_text"
        );
    }

    #[test]
    fn test_x_vector_only_validates() {
        let embedding = create_test_embedding();
        let prompt = VoiceClonePromptItem::x_vector_only(embedding);

        let result = prompt.validate();
        assert!(
            result.is_ok(),
            "x_vector_only prompt should validate successfully"
        );
    }

    #[test]
    fn test_is_x_vector_only_predicate() {
        let embedding = create_test_embedding();
        let prompt = VoiceClonePromptItem::x_vector_only(embedding);

        assert!(
            prompt.is_x_vector_only(),
            "is_x_vector_only() should return true"
        );
        assert!(
            !prompt.is_icl(),
            "is_icl() should return false for x_vector_only"
        );
    }

    // =========================================================================
    // ICL Mode Tests
    // =========================================================================

    #[test]
    fn test_icl_creation() {
        let codes = create_test_codes();
        let embedding = create_test_embedding();
        let ref_text = "Hello, this is a test.".to_string();

        let prompt = VoiceClonePromptItem::icl(codes, embedding, ref_text.clone());

        assert!(prompt.ref_code.is_some(), "icl should have ref_code");
        assert!(
            !prompt.x_vector_only_mode,
            "x_vector_only_mode should be false for icl"
        );
        assert!(prompt.icl_mode, "icl_mode should be true");
        assert_eq!(prompt.ref_text, Some(ref_text), "ref_text should match");
    }

    #[test]
    fn test_icl_validates_with_all_fields() {
        let codes = create_test_codes();
        let embedding = create_test_embedding();
        let ref_text = "Hello, this is a test.".to_string();

        let prompt = VoiceClonePromptItem::icl(codes, embedding, ref_text);

        let result = prompt.validate();
        assert!(
            result.is_ok(),
            "icl prompt with all fields should validate successfully"
        );
    }

    #[test]
    fn test_is_icl_predicate() {
        let codes = create_test_codes();
        let embedding = create_test_embedding();
        let ref_text = "Hello, this is a test.".to_string();

        let prompt = VoiceClonePromptItem::icl(codes, embedding, ref_text);

        assert!(
            prompt.is_icl(),
            "is_icl() should return true for icl prompt"
        );
        assert!(
            !prompt.is_x_vector_only(),
            "is_x_vector_only() should return false for icl"
        );
    }

    // =========================================================================
    // ICL Validation Failure Tests
    // =========================================================================

    #[test]
    fn test_icl_missing_ref_code_fails_validation() {
        let embedding = create_test_embedding();

        // Create an ICL prompt manually without ref_code
        let prompt = VoiceClonePromptItem {
            ref_code: None,
            ref_spk_embedding: embedding,
            x_vector_only_mode: false,
            icl_mode: true,
            ref_text: Some("Some text".to_string()),
        };

        let result = prompt.validate();
        assert!(
            result.is_err(),
            "ICL prompt without ref_code should fail validation"
        );
        let err_msg = result.unwrap_err();
        assert!(
            err_msg.contains("ref_code"),
            "Error should mention ref_code: {}",
            err_msg
        );
    }

    #[test]
    fn test_icl_missing_ref_text_fails_validation() {
        let codes = create_test_codes();
        let embedding = create_test_embedding();

        // Create an ICL prompt manually without ref_text
        let prompt = VoiceClonePromptItem {
            ref_code: Some(codes),
            ref_spk_embedding: embedding,
            x_vector_only_mode: false,
            icl_mode: true,
            ref_text: None,
        };

        let result = prompt.validate();
        assert!(
            result.is_err(),
            "ICL prompt without ref_text should fail validation"
        );
        let err_msg = result.unwrap_err();
        assert!(
            err_msg.contains("ref_text"),
            "Error should mention ref_text: {}",
            err_msg
        );
    }

    // =========================================================================
    // Constructor new() Tests
    // =========================================================================

    #[test]
    fn test_new_constructor_x_vector_mode() {
        let embedding = create_test_embedding();

        let prompt = VoiceClonePromptItem::new(
            None, embedding, true, // x_vector_only_mode
            None,
        );

        assert!(prompt.x_vector_only_mode);
        assert!(
            !prompt.icl_mode,
            "icl_mode should be opposite of x_vector_only_mode"
        );
    }

    #[test]
    fn test_new_constructor_icl_mode() {
        let codes = create_test_codes();
        let embedding = create_test_embedding();
        let ref_text = "Test text".to_string();

        let prompt = VoiceClonePromptItem::new(
            Some(codes),
            embedding,
            false, // x_vector_only_mode
            Some(ref_text),
        );

        assert!(!prompt.x_vector_only_mode);
        assert!(
            prompt.icl_mode,
            "icl_mode should be opposite of x_vector_only_mode"
        );
    }

    // =========================================================================
    // VoiceCloneConfig Tests
    // =========================================================================

    #[test]
    fn test_voice_clone_config_default() {
        let config = VoiceCloneConfig::default();

        assert_eq!(config.max_new_tokens, 2048);
        assert!(config.min_duration.is_none());
        assert_eq!(config.max_duration, Some(30.0));
    }
}
