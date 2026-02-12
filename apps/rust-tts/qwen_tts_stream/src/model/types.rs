use candle_core::Tensor;

/// TTS model type.
///
/// Different model types support different generation APIs:
/// - `Base`: Supports voice cloning with reference audio
/// - `CustomVoice`: Supports predefined speakers with optional instructions
/// - `VoiceDesign`: Supports voice design from natural language descriptions
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TTSModelType {
    /// Base model - supports voice cloning from reference audio
    Base,
    /// Custom voice model - supports predefined speakers
    CustomVoice,
    /// Voice design model - supports natural language voice descriptions
    VoiceDesign,
    /// Unknown model type
    Unknown,
}

impl TTSModelType {
    /// Parse model type from config string.
    pub fn parse(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "base" => Self::Base,
            "custom_voice" | "customvoice" => Self::CustomVoice,
            "voice_design" | "voicedesign" => Self::VoiceDesign,
            _ => Self::Unknown,
        }
    }

    /// Check if this model type supports voice cloning (Base model API).
    pub fn allows_voice_clone(&self) -> bool {
        matches!(self, Self::Base | Self::Unknown)
    }

    /// Check if this model type supports custom voice (predefined speakers).
    pub fn allows_custom_voice(&self) -> bool {
        matches!(self, Self::CustomVoice | Self::Unknown)
    }

    /// Check if this model type supports voice design (text descriptions).
    pub fn allows_voice_design(&self) -> bool {
        matches!(self, Self::VoiceDesign | Self::Unknown)
    }
}

/// Generation result containing audio and metadata.
///
/// This struct mirrors the Python return type `Tuple[List[np.ndarray], int]`
/// but in a more idiomatic Rust form.
#[derive(Debug)]
pub struct GenerationResult {
    /// Generated audio waveform tensor.
    ///
    /// Shape depends on batch size:
    /// - Single sample: `(samples,)`
    /// - Batched: `(batch, samples)` or list of tensors
    pub audio: Tensor,

    /// Sample rate of the generated audio (typically 24000 Hz).
    pub sample_rate: usize,

    /// Generated audio codes before decoding (for debugging).
    pub codes: Option<Tensor>,

    /// Effective lengths for each batch item (for variable-length outputs).
    pub effective_lengths: Option<Vec<usize>>,
}

impl GenerationResult {
    /// Create a new generation result.
    pub fn new(audio: Tensor, sample_rate: usize) -> Self {
        Self {
            audio,
            sample_rate,
            codes: None,
            effective_lengths: None,
        }
    }

    /// Create a generation result with codes.
    pub fn with_codes(audio: Tensor, sample_rate: usize, codes: Tensor) -> Self {
        Self {
            audio,
            sample_rate,
            codes: Some(codes),
            effective_lengths: None,
        }
    }

    /// Create a generation result with effective lengths for batched outputs.
    pub fn with_effective_lengths(
        audio: Tensor,
        sample_rate: usize,
        effective_lengths: Vec<usize>,
    ) -> Self {
        Self {
            audio,
            sample_rate,
            codes: None,
            effective_lengths: Some(effective_lengths),
        }
    }
}

/// Supported languages for TTS.
pub const SUPPORTED_LANGUAGES: &[&str] = &[
    "auto", "chinese", "english", "japanese", "korean", "french", "german", "spanish",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tts_model_type_parse_base() {
        assert_eq!(TTSModelType::parse("base"), TTSModelType::Base);
        assert_eq!(TTSModelType::parse("Base"), TTSModelType::Base);
        assert_eq!(TTSModelType::parse("BASE"), TTSModelType::Base);
    }

    #[test]
    fn test_tts_model_type_parse_custom_voice() {
        assert_eq!(
            TTSModelType::parse("custom_voice"),
            TTSModelType::CustomVoice
        );
        assert_eq!(
            TTSModelType::parse("customvoice"),
            TTSModelType::CustomVoice
        );
        assert_eq!(
            TTSModelType::parse("CustomVoice"),
            TTSModelType::CustomVoice
        );
        assert_eq!(
            TTSModelType::parse("CUSTOM_VOICE"),
            TTSModelType::CustomVoice
        );
    }

    #[test]
    fn test_tts_model_type_parse_voice_design() {
        assert_eq!(
            TTSModelType::parse("voice_design"),
            TTSModelType::VoiceDesign
        );
        assert_eq!(
            TTSModelType::parse("voicedesign"),
            TTSModelType::VoiceDesign
        );
        assert_eq!(
            TTSModelType::parse("VoiceDesign"),
            TTSModelType::VoiceDesign
        );
        assert_eq!(
            TTSModelType::parse("VOICE_DESIGN"),
            TTSModelType::VoiceDesign
        );
    }

    #[test]
    fn test_tts_model_type_parse_unknown() {
        assert_eq!(TTSModelType::parse("unknown"), TTSModelType::Unknown);
        assert_eq!(TTSModelType::parse(""), TTSModelType::Unknown);
        assert_eq!(
            TTSModelType::parse("some_other_type"),
            TTSModelType::Unknown
        );
    }

    #[test]
    fn test_supported_languages() {
        // Check that all expected languages are present
        assert!(SUPPORTED_LANGUAGES.contains(&"auto"));
        assert!(SUPPORTED_LANGUAGES.contains(&"english"));
        assert!(SUPPORTED_LANGUAGES.contains(&"chinese"));
        assert!(SUPPORTED_LANGUAGES.contains(&"japanese"));
        assert!(SUPPORTED_LANGUAGES.contains(&"korean"));
        assert!(SUPPORTED_LANGUAGES.contains(&"french"));
        assert!(SUPPORTED_LANGUAGES.contains(&"german"));
        assert!(SUPPORTED_LANGUAGES.contains(&"spanish"));
        assert_eq!(SUPPORTED_LANGUAGES.len(), 8);
    }

    #[test]
    fn test_generation_result_new() {
        let device = candle_core::Device::Cpu;
        let audio = candle_core::Tensor::zeros((1000,), candle_core::DType::F32, &device).unwrap();
        let result = GenerationResult::new(audio, 24000);

        assert_eq!(result.sample_rate, 24000);
        assert!(result.codes.is_none());
        assert!(result.effective_lengths.is_none());
    }

    #[test]
    fn test_generation_result_with_codes() {
        let device = candle_core::Device::Cpu;
        let audio = candle_core::Tensor::zeros((1000,), candle_core::DType::F32, &device).unwrap();
        let codes =
            candle_core::Tensor::zeros((32, 100), candle_core::DType::I64, &device).unwrap();
        let result = GenerationResult::with_codes(audio, 24000, codes);

        assert_eq!(result.sample_rate, 24000);
        assert!(result.codes.is_some());
        assert!(result.effective_lengths.is_none());
    }

    #[test]
    fn test_generation_result_with_effective_lengths() {
        let device = candle_core::Device::Cpu;
        let audio =
            candle_core::Tensor::zeros((2, 1000), candle_core::DType::F32, &device).unwrap();
        let lengths = vec![800, 950];
        let result = GenerationResult::with_effective_lengths(audio, 24000, lengths);

        assert_eq!(result.sample_rate, 24000);
        assert!(result.codes.is_none());
        assert_eq!(result.effective_lengths, Some(vec![800, 950]));
    }

    // =========================================================================
    // Model Type Predicate Tests
    // =========================================================================

    #[test]
    fn test_base_model_type_allows_voice_clone() {
        let model_type = TTSModelType::Base;
        assert!(
            model_type.allows_voice_clone(),
            "Base model should allow voice cloning"
        );
    }

    #[test]
    fn test_custom_voice_type_allows_custom() {
        let model_type = TTSModelType::CustomVoice;
        assert!(
            model_type.allows_custom_voice(),
            "CustomVoice model should allow custom voice API"
        );
    }

    #[test]
    fn test_voice_design_type_allows_design() {
        let model_type = TTSModelType::VoiceDesign;
        assert!(
            model_type.allows_voice_design(),
            "VoiceDesign model should allow voice design API"
        );
    }

    #[test]
    fn test_unknown_type_allows_all() {
        let model_type = TTSModelType::Unknown;
        assert!(
            model_type.allows_voice_clone(),
            "Unknown model should allow voice cloning"
        );
        assert!(
            model_type.allows_custom_voice(),
            "Unknown model should allow custom voice"
        );
        assert!(
            model_type.allows_voice_design(),
            "Unknown model should allow voice design"
        );
    }

    #[test]
    fn test_base_type_rejects_custom_voice() {
        let model_type = TTSModelType::Base;
        assert!(
            !model_type.allows_custom_voice(),
            "Base model should not allow custom voice API"
        );
        assert!(
            !model_type.allows_voice_design(),
            "Base model should not allow voice design API"
        );
    }

    #[test]
    fn test_custom_voice_type_rejects_voice_clone() {
        let model_type = TTSModelType::CustomVoice;
        assert!(
            !model_type.allows_voice_clone(),
            "CustomVoice model should not allow voice cloning API"
        );
        assert!(
            !model_type.allows_voice_design(),
            "CustomVoice model should not allow voice design API"
        );
    }

    #[test]
    fn test_voice_design_type_rejects_others() {
        let model_type = TTSModelType::VoiceDesign;
        assert!(
            !model_type.allows_voice_clone(),
            "VoiceDesign model should not allow voice cloning API"
        );
        assert!(
            !model_type.allows_custom_voice(),
            "VoiceDesign model should not allow custom voice API"
        );
    }
}
