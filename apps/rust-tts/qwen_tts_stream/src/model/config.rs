use crate::nn::sampling::SamplingConfig;

/// Default generation configuration.
///
/// These defaults are loaded from `generate_config.json` in the model directory,
/// and can be overridden per-call.
#[derive(Debug, Clone)]
pub struct GenerateConfig {
    /// Whether to use sampling (vs greedy decoding).
    pub do_sample: bool,
    /// Top-k sampling parameter.
    pub top_k: usize,
    /// Top-p (nucleus) sampling parameter.
    pub top_p: f64,
    /// Sampling temperature.
    pub temperature: f64,
    /// Repetition penalty.
    pub repetition_penalty: f64,
    /// Subtalker (code predictor) sampling switch.
    pub subtalker_do_sample: bool,
    /// Subtalker top-k.
    pub subtalker_top_k: usize,
    /// Subtalker top-p.
    pub subtalker_top_p: f64,
    /// Subtalker temperature.
    pub subtalker_temperature: f64,
    /// Maximum new tokens to generate.
    pub max_new_tokens: usize,
}

impl Default for GenerateConfig {
    fn default() -> Self {
        // Hard defaults matching Python: qwen3_tts_model.py:319-330
        Self {
            do_sample: true,
            top_k: 50,
            top_p: 1.0,
            temperature: 0.9,
            repetition_penalty: 1.05,
            subtalker_do_sample: true,
            subtalker_top_k: 50,
            subtalker_top_p: 1.0,
            subtalker_temperature: 0.9,
            max_new_tokens: 2048,
        }
    }
}

impl GenerateConfig {
    /// Load configuration from JSON.
    pub fn from_json(json: &str) -> std::result::Result<Self, serde_json::Error> {
        #[derive(serde::Deserialize)]
        struct RawConfig {
            do_sample: Option<bool>,
            top_k: Option<usize>,
            top_p: Option<f64>,
            temperature: Option<f64>,
            repetition_penalty: Option<f64>,
            subtalker_dosample: Option<bool>,
            subtalker_top_k: Option<usize>,
            subtalker_top_p: Option<f64>,
            subtalker_temperature: Option<f64>,
            max_new_tokens: Option<usize>,
        }

        let raw: RawConfig = serde_json::from_str(json)?;
        let defaults = Self::default();

        Ok(Self {
            do_sample: raw.do_sample.unwrap_or(defaults.do_sample),
            top_k: raw.top_k.unwrap_or(defaults.top_k),
            top_p: raw.top_p.unwrap_or(defaults.top_p),
            temperature: raw.temperature.unwrap_or(defaults.temperature),
            repetition_penalty: raw
                .repetition_penalty
                .unwrap_or(defaults.repetition_penalty),
            subtalker_do_sample: raw
                .subtalker_dosample
                .unwrap_or(defaults.subtalker_do_sample),
            subtalker_top_k: raw.subtalker_top_k.unwrap_or(defaults.subtalker_top_k),
            subtalker_top_p: raw.subtalker_top_p.unwrap_or(defaults.subtalker_top_p),
            subtalker_temperature: raw
                .subtalker_temperature
                .unwrap_or(defaults.subtalker_temperature),
            max_new_tokens: raw.max_new_tokens.unwrap_or(defaults.max_new_tokens),
        })
    }

    /// Load configuration from a file path.
    ///
    /// Typically used to load `generate_config.json` from a model directory.
    /// Falls back to defaults if the file doesn't exist or can't be parsed.
    pub fn from_file(path: impl AsRef<std::path::Path>) -> Self {
        let path = path.as_ref();
        match std::fs::read_to_string(path) {
            Ok(content) => Self::from_json(&content).unwrap_or_else(|e| {
                tracing::warn!(
                    "Failed to parse generate_config.json at {}: {}, using defaults",
                    path.display(),
                    e
                );
                Self::default()
            }),
            Err(e) => {
                tracing::debug!(
                    "No generate_config.json at {}: {}, using defaults",
                    path.display(),
                    e
                );
                Self::default()
            }
        }
    }

    /// Load configuration from a model directory.
    ///
    /// Looks for `generate_config.json` in the given directory.
    /// Falls back to defaults if not found.
    pub fn from_model_dir(model_dir: impl AsRef<std::path::Path>) -> Self {
        let config_path = model_dir.as_ref().join("generate_config.json");
        Self::from_file(config_path)
    }

    /// Merge user-provided parameters with these defaults.
    ///
    /// User values take precedence over stored defaults.
    #[allow(clippy::too_many_arguments)]
    pub fn merge(
        &self,
        do_sample: Option<bool>,
        top_k: Option<usize>,
        top_p: Option<f64>,
        temperature: Option<f64>,
        repetition_penalty: Option<f64>,
        subtalker_do_sample: Option<bool>,
        subtalker_top_k: Option<usize>,
        subtalker_top_p: Option<f64>,
        subtalker_temperature: Option<f64>,
    ) -> SamplingConfig {
        SamplingConfig {
            do_sample: do_sample.unwrap_or(self.do_sample),
            top_k: top_k.unwrap_or(self.top_k),
            top_p: top_p.unwrap_or(self.top_p),
            temperature: temperature.unwrap_or(self.temperature),
            repetition_penalty: repetition_penalty.unwrap_or(self.repetition_penalty),
            subtalker_do_sample: subtalker_do_sample.unwrap_or(self.subtalker_do_sample),
            subtalker_top_k: subtalker_top_k.unwrap_or(self.subtalker_top_k),
            subtalker_top_p: subtalker_top_p.unwrap_or(self.subtalker_top_p),
            subtalker_temperature: subtalker_temperature.unwrap_or(self.subtalker_temperature),
            ..Default::default()
        }
    }

    /// Get the effective max_new_tokens value.
    pub fn effective_max_tokens(&self, user_max: Option<usize>) -> usize {
        user_max.unwrap_or(self.max_new_tokens)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_config_default() {
        let config = GenerateConfig::default();
        assert!(config.do_sample);
        assert_eq!(config.top_k, 50);
        assert_eq!(config.top_p, 1.0);
        assert_eq!(config.temperature, 0.9);
        assert_eq!(config.repetition_penalty, 1.05);
        assert!(config.subtalker_do_sample);
        assert_eq!(config.max_new_tokens, 2048);
    }

    #[test]
    fn test_generate_config_from_json_full() {
        let json = r#"{
            "do_sample": false,
            "top_k": 100,
            "top_p": 0.95,
            "temperature": 0.7,
            "repetition_penalty": 1.2,
            "subtalker_dosample": false,
            "subtalker_top_k": 30,
            "subtalker_top_p": 0.8,
            "subtalker_temperature": 0.5,
            "max_new_tokens": 4096
        }"#;

        let config = GenerateConfig::from_json(json).unwrap();
        assert!(!config.do_sample);
        assert_eq!(config.top_k, 100);
        assert_eq!(config.top_p, 0.95);
        assert_eq!(config.temperature, 0.7);
        assert_eq!(config.repetition_penalty, 1.2);
        assert!(!config.subtalker_do_sample);
        assert_eq!(config.subtalker_top_k, 30);
        assert_eq!(config.subtalker_top_p, 0.8);
        assert_eq!(config.subtalker_temperature, 0.5);
        assert_eq!(config.max_new_tokens, 4096);
    }

    #[test]
    fn test_generate_config_from_json_partial() {
        // Only override some fields, others should use defaults
        let json = r#"{
            "temperature": 0.5,
            "top_k": 25
        }"#;

        let config = GenerateConfig::from_json(json).unwrap();
        assert!(config.do_sample); // default
        assert_eq!(config.top_k, 25); // overridden
        assert_eq!(config.top_p, 1.0); // default
        assert_eq!(config.temperature, 0.5); // overridden
        assert_eq!(config.max_new_tokens, 2048); // default
    }

    #[test]
    fn test_generate_config_from_json_empty() {
        let json = "{}";
        let config = GenerateConfig::from_json(json).unwrap();
        // Should equal defaults
        let defaults = GenerateConfig::default();
        assert_eq!(config.do_sample, defaults.do_sample);
        assert_eq!(config.top_k, defaults.top_k);
        assert_eq!(config.temperature, defaults.temperature);
    }

    #[test]
    fn test_generate_config_merge_all_none() {
        let config = GenerateConfig::default();
        let merged = config.merge(None, None, None, None, None, None, None, None, None);

        // Should use config's values
        assert_eq!(merged.do_sample, config.do_sample);
        assert_eq!(merged.top_k, config.top_k);
        assert_eq!(merged.temperature, config.temperature);
    }

    #[test]
    fn test_generate_config_merge_with_overrides() {
        let config = GenerateConfig::default();
        let merged = config.merge(
            Some(false), // do_sample
            Some(100),   // top_k
            Some(0.8),   // top_p
            Some(0.5),   // temperature
            Some(1.5),   // repetition_penalty
            Some(false), // subtalker_do_sample
            Some(25),    // subtalker_top_k
            Some(0.9),   // subtalker_top_p
            Some(0.3),   // subtalker_temperature
        );

        assert!(!merged.do_sample);
        assert_eq!(merged.top_k, 100);
        assert_eq!(merged.top_p, 0.8);
        assert_eq!(merged.temperature, 0.5);
        assert_eq!(merged.repetition_penalty, 1.5);
        assert!(!merged.subtalker_do_sample);
        assert_eq!(merged.subtalker_top_k, 25);
        assert_eq!(merged.subtalker_top_p, 0.9);
        assert_eq!(merged.subtalker_temperature, 0.3);
    }

    #[test]
    fn test_effective_max_tokens() {
        let config = GenerateConfig::default();

        // User override takes precedence
        assert_eq!(config.effective_max_tokens(Some(1000)), 1000);

        // None uses config default
        assert_eq!(config.effective_max_tokens(None), 2048);
    }
}
