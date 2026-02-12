//! RoPE (Rotary Position Embedding) scaling configuration.

use serde::{Deserialize, Deserializer};

/// Configuration for RoPE scaling variants.
///
/// Qwen3-TTS uses multimodal RoPE with 3D position encoding (temporal, height, width)
/// for the talker model, split across attention head dimensions.
///
/// # JSON Compatibility
///
/// This struct handles both `"type"` and `"rope_type"` field names for backwards
/// compatibility with HuggingFace model configs. If both fields are present,
/// `rope_type` takes precedence (matching Python behavior).
#[derive(Debug, Clone)]
pub struct RopeScaling {
    /// The type of RoPE scaling: "default", "linear", "dynamic", "yarn", "longrope", "llama3"
    pub rope_type: Option<String>,

    /// Scaling factor for rope types other than "default"
    pub factor: Option<f64>,

    /// Original max position embeddings (for dynamic/longrope/llama3)
    pub original_max_position_embeddings: Option<usize>,

    /// Attention scaling factor (for yarn/longrope)
    pub attention_factor: Option<f64>,

    /// Fast boundary for extrapolation (yarn only)
    pub beta_fast: Option<f64>,

    /// Slow boundary for interpolation (yarn only)
    pub beta_slow: Option<f64>,

    /// Scaling for short contexts (longrope only)
    pub short_factor: Option<Vec<f64>>,

    /// Scaling for long contexts (longrope only)
    pub long_factor: Option<Vec<f64>>,

    /// Low frequency scaling factor (llama3 only)
    pub low_freq_factor: Option<f64>,

    /// High frequency scaling factor (llama3 only)
    pub high_freq_factor: Option<f64>,

    /// Multimodal RoPE section sizes for temporal, height, width
    /// e.g., [16, 24, 24] splits head_dim=64 into 3 sections
    pub mrope_section: Vec<usize>,

    /// Whether to use interleaved multimodal RoPE
    pub interleaved: bool,
}

/// Helper struct for deserializing RopeScaling with both `type` and `rope_type` fields.
///
/// HuggingFace model configs often contain both fields for backwards compatibility.
/// This intermediate struct captures both, then we merge them in the Deserialize impl.
#[derive(Deserialize)]
struct RopeScalingHelper {
    /// The old field name (deprecated but still present in many configs)
    #[serde(rename = "type")]
    type_field: Option<String>,

    /// The new field name (preferred)
    rope_type: Option<String>,

    factor: Option<f64>,
    original_max_position_embeddings: Option<usize>,
    attention_factor: Option<f64>,
    beta_fast: Option<f64>,
    beta_slow: Option<f64>,
    short_factor: Option<Vec<f64>>,
    long_factor: Option<Vec<f64>>,
    low_freq_factor: Option<f64>,
    high_freq_factor: Option<f64>,

    #[serde(default)]
    mrope_section: Vec<usize>,

    #[serde(default)]
    interleaved: bool,
}

impl<'de> Deserialize<'de> for RopeScaling {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let helper = RopeScalingHelper::deserialize(deserializer)?;

        // Prefer rope_type over type (matching Python's BC behavior)
        let rope_type = helper.rope_type.or(helper.type_field);

        Ok(RopeScaling {
            rope_type,
            factor: helper.factor,
            original_max_position_embeddings: helper.original_max_position_embeddings,
            attention_factor: helper.attention_factor,
            beta_fast: helper.beta_fast,
            beta_slow: helper.beta_slow,
            short_factor: helper.short_factor,
            long_factor: helper.long_factor,
            low_freq_factor: helper.low_freq_factor,
            high_freq_factor: helper.high_freq_factor,
            mrope_section: helper.mrope_section,
            interleaved: helper.interleaved,
        })
    }
}

impl Default for RopeScaling {
    fn default() -> Self {
        Self {
            rope_type: Some("default".to_string()),
            factor: None,
            original_max_position_embeddings: None,
            attention_factor: None,
            beta_fast: None,
            beta_slow: None,
            short_factor: None,
            long_factor: None,
            low_freq_factor: None,
            high_freq_factor: None,
            mrope_section: vec![16, 24, 24],
            interleaved: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deserialize_with_rope_type_only() {
        let json = r#"{"rope_type": "linear", "factor": 2.0}"#;
        let config: RopeScaling = serde_json::from_str(json).unwrap();
        assert_eq!(config.rope_type, Some("linear".to_string()));
        assert_eq!(config.factor, Some(2.0));
    }

    #[test]
    fn test_deserialize_with_type_only() {
        let json = r#"{"type": "dynamic", "factor": 1.5}"#;
        let config: RopeScaling = serde_json::from_str(json).unwrap();
        assert_eq!(config.rope_type, Some("dynamic".to_string()));
        assert_eq!(config.factor, Some(1.5));
    }

    #[test]
    fn test_deserialize_with_both_type_and_rope_type() {
        // This was the failing case - JSON has both fields (HuggingFace BC pattern)
        // rope_type should take precedence over type
        let json = r#"{"type": "old_value", "rope_type": "linear", "factor": 2.0}"#;
        let config: RopeScaling = serde_json::from_str(json).unwrap();
        assert_eq!(config.rope_type, Some("linear".to_string()));
        assert_eq!(config.factor, Some(2.0));
    }

    #[test]
    fn test_deserialize_with_both_type_and_rope_type_reversed_order() {
        // Order shouldn't matter - rope_type still takes precedence
        let json = r#"{"rope_type": "yarn", "type": "ignored", "factor": 3.0}"#;
        let config: RopeScaling = serde_json::from_str(json).unwrap();
        assert_eq!(config.rope_type, Some("yarn".to_string()));
        assert_eq!(config.factor, Some(3.0));
    }

    #[test]
    fn test_deserialize_with_mrope_section() {
        let json = r#"{
            "rope_type": "mrope",
            "mrope_section": [16, 24, 24],
            "interleaved": true
        }"#;
        let config: RopeScaling = serde_json::from_str(json).unwrap();
        assert_eq!(config.rope_type, Some("mrope".to_string()));
        assert_eq!(config.mrope_section, vec![16, 24, 24]);
        assert!(config.interleaved);
    }

    #[test]
    fn test_deserialize_empty() {
        let json = r#"{}"#;
        let config: RopeScaling = serde_json::from_str(json).unwrap();
        assert_eq!(config.rope_type, None);
        assert_eq!(config.mrope_section, Vec::<usize>::new());
        assert!(!config.interleaved);
    }
}
