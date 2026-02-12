//! Model loading utilities for Qwen3-TTS.
//!
//! Provides `from_pretrained`-style loading for models from local directories
//! or HuggingFace Hub (when used with the `hf-hub` crate).
//!
//! # Example
//!
//! ```no_run
//! use qwen_tts::model::loader::{ModelLoader, LoaderConfig};
//! use candle_core::Device;
//!
//! # fn main() -> Result<(), Box<dyn std::error::Error>> {
//! let loader = ModelLoader::from_local_dir("/path/to/model")?;
//! let model = loader.load_tts_model(&Device::Cpu, &LoaderConfig::default())?;
//! # Ok(())
//! # }

use std::path::{Path, PathBuf};

use candle_core::{DType, Device};
use candle_nn::VarBuilder;

use crate::audio::tokenizer::v2::{TokenizerV2, config::TokenizerV2Config};
use crate::config::tts_config::Config;
use crate::model::{GenerateConfig, Model};
use crate::nn::generation::ConditionalGeneration;
use crate::text::processing::TextProcessor;

/// Configuration for model loading.
#[derive(Debug, Clone)]
pub struct LoaderConfig {
    /// Data type for model weights (default: F32)
    pub dtype: DType,
    /// Whether to load the audio tokenizer (default: true)
    pub load_tokenizer: bool,
    /// Whether to load the text tokenizer from tokenizer.json (default: true)
    pub load_text_tokenizer: bool,
    /// Whether to load generate_config.json (default: true)
    pub load_generate_config: bool,
    /// Whether to use flash attention (requires CUDA and flash-attn feature)
    pub use_flash_attn: bool,
}

impl Default for LoaderConfig {
    fn default() -> Self {
        Self {
            dtype: DType::F32,
            load_tokenizer: true,
            load_text_tokenizer: true,
            load_generate_config: true,
            use_flash_attn: false,
        }
    }
}

/// Errors that can occur during model loading.
#[derive(Debug)]
pub enum LoadError {
    /// Config file not found or invalid
    ConfigError(String),
    /// Model weights file not found or invalid
    WeightsError(String),
    /// Tokenizer weights file not found or invalid
    TokenizerError(String),
    /// Candle error during loading
    CandleError(candle_core::Error),
    /// IO error
    IoError(std::io::Error),
    /// JSON parsing error
    JsonError(serde_json::Error),
}

impl std::fmt::Display for LoadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ConfigError(msg) => write!(f, "Config error: {}", msg),
            Self::WeightsError(msg) => write!(f, "Weights error: {}", msg),
            Self::TokenizerError(msg) => write!(f, "Tokenizer error: {}", msg),
            Self::CandleError(e) => write!(f, "Candle error: {}", e),
            Self::IoError(e) => write!(f, "IO error: {}", e),
            Self::JsonError(e) => write!(f, "JSON error: {}", e),
        }
    }
}

impl std::error::Error for LoadError {}

impl From<candle_core::Error> for LoadError {
    fn from(e: candle_core::Error) -> Self {
        Self::CandleError(e)
    }
}

impl From<std::io::Error> for LoadError {
    fn from(e: std::io::Error) -> Self {
        Self::IoError(e)
    }
}

impl From<serde_json::Error> for LoadError {
    fn from(e: serde_json::Error) -> Self {
        Self::JsonError(e)
    }
}

/// Model loader for Qwen3-TTS.
///
/// Handles loading model config, weights, and tokenizer from a directory.
pub struct ModelLoader {
    /// Path to model directory
    model_dir: PathBuf,
    /// Model configuration
    model_config: Config,
    /// Tokenizer configuration (if available)
    tokenizer_config: Option<TokenizerV2Config>,
    /// Generation configuration
    generate_config: GenerateConfig,
}

impl ModelLoader {
    /// Create a loader from a local model directory.
    ///
    /// The directory should contain:
    /// - `config.json`: Model configuration
    /// - `model.safetensors` or `pytorch_model.bin`: Model weights
    /// - `tokenizer_config.json` (optional): Tokenizer configuration
    /// - `generate_config.json` (optional): Generation parameters
    pub fn from_local_dir(model_dir: impl AsRef<Path>) -> std::result::Result<Self, LoadError> {
        let model_dir = model_dir.as_ref().to_path_buf();

        // Load model config
        let config_path = model_dir.join("config.json");
        let config_str = std::fs::read_to_string(&config_path).map_err(|e| {
            LoadError::ConfigError(format!(
                "Failed to read config.json at {}: {}",
                config_path.display(),
                e
            ))
        })?;
        let model_config: Config = serde_json::from_str(&config_str)?;

        // Try to load tokenizer config
        let tokenizer_config = Self::try_load_tokenizer_config(&model_dir);

        // Load generate config
        let generate_config = GenerateConfig::from_model_dir(&model_dir);

        Ok(Self {
            model_dir,
            model_config,
            tokenizer_config,
            generate_config,
        })
    }

    fn try_load_tokenizer_config(model_dir: &Path) -> Option<TokenizerV2Config> {
        // Try different possible locations for tokenizer config
        let possible_paths = [
            model_dir.join("speech_tokenizer/config.json"),
            model_dir.join("tokenizer_config.json"),
            model_dir.join("tokenizer/config.json"),
            model_dir.join("audio_tokenizer_config.json"),
        ];

        for path in &possible_paths {
            if let Ok(content) = std::fs::read_to_string(path)
                && let Ok(config) = serde_json::from_str(&content)
            {
                tracing::debug!("Loaded tokenizer config from {}", path.display());
                return Some(config);
            }
        }

        tracing::debug!(
            "No tokenizer config found in {}, will skip tokenizer loading",
            model_dir.display()
        );
        None
    }

    /// Get the model directory path.
    pub fn model_dir(&self) -> &Path {
        &self.model_dir
    }

    /// Get the model configuration.
    pub fn model_config(&self) -> &Config {
        &self.model_config
    }

    /// Get the tokenizer configuration if available.
    pub fn tokenizer_config(&self) -> Option<&TokenizerV2Config> {
        self.tokenizer_config.as_ref()
    }

    /// Get the generation configuration.
    pub fn generate_config(&self) -> &GenerateConfig {
        &self.generate_config
    }

    /// Find model weights file.
    ///
    /// Looks for safetensors first, then pytorch format.
    fn find_weights_file(&self) -> Option<PathBuf> {
        let possible_files = [
            "model.safetensors",
            "pytorch_model.bin",
            "model-00001-of-00001.safetensors",
            "model.pt",
        ];

        for filename in &possible_files {
            let path = self.model_dir.join(filename);
            if path.exists() {
                return Some(path);
            }
        }

        // Check for sharded safetensors by reading directory
        if let Ok(entries) = std::fs::read_dir(&self.model_dir) {
            let mut shards: Vec<PathBuf> = entries
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| {
                    p.file_name()
                        .and_then(|n| n.to_str())
                        .is_some_and(|n| n.starts_with("model-") && n.ends_with(".safetensors"))
                })
                .collect();

            if !shards.is_empty() {
                shards.sort();
                return Some(shards[0].clone());
            }
        }

        None
    }

    /// Find tokenizer weights file.
    fn find_tokenizer_weights_file(&self) -> Option<PathBuf> {
        let possible_files = [
            "speech_tokenizer/model.safetensors",
            "tokenizer.safetensors",
            "audio_tokenizer.safetensors",
            "tokenizer/model.safetensors",
        ];

        for filename in &possible_files {
            let path = self.model_dir.join(filename);
            if path.exists() {
                return Some(path);
            }
        }

        None
    }

    /// Load the TTS model.
    ///
    /// # Arguments
    /// * `device` - Device to load model onto (CPU, CUDA, etc.)
    /// * `config` - Loader configuration
    ///
    /// # Returns
    /// The loaded `Model` ready for inference.
    pub fn load_tts_model(
        &self,
        device: &Device,
        config: &LoaderConfig,
    ) -> std::result::Result<Model, LoadError> {
        // Find weights file
        let weights_path = self.find_weights_file().ok_or_else(|| {
            LoadError::WeightsError(format!(
                "No model weights found in {}",
                self.model_dir.display()
            ))
        })?;

        tracing::info!("Loading model weights from {}", weights_path.display());

        // Create VarBuilder from weights
        let vb = if weights_path.extension().is_some_and(|e| e == "safetensors") {
            unsafe { VarBuilder::from_mmaped_safetensors(&[weights_path], config.dtype, device)? }
        } else {
            return Err(LoadError::WeightsError(
                "Only safetensors format is supported".to_string(),
            ));
        };

        // Load the model
        let model =
            ConditionalGeneration::load(self.model_config.clone(), config.use_flash_attn, vb)?;

        // Load audio tokenizer if requested
        let audio_tokenizer = if config.load_tokenizer {
            self.try_load_audio_tokenizer(device, config.dtype, config.use_flash_attn)?
        } else {
            None
        };

        // Load text tokenizer if requested
        let text_processor = if config.load_text_tokenizer {
            self.try_load_text_processor()
        } else {
            None
        };

        // Create the inference wrapper
        let generate_config = if config.load_generate_config {
            self.generate_config.clone()
        } else {
            GenerateConfig::default()
        };

        Ok(Model::with_all(
            model,
            audio_tokenizer,
            text_processor,
            generate_config,
            device.clone(),
            config.dtype,
        ))
    }

    /// Try to load the text tokenizer.
    ///
    /// Supports multiple formats:
    /// - `tokenizer.json` (HuggingFace fast tokenizer)
    /// - `vocab.json` + `merges.txt` (BPE format, used by Qwen models)
    fn try_load_text_processor(&self) -> Option<TextProcessor> {
        // Use the from_pretrained method which tries multiple strategies
        match TextProcessor::from_pretrained(&self.model_dir) {
            Ok(processor) => {
                tracing::info!("Loaded text tokenizer from {}", self.model_dir.display());
                Some(processor)
            }
            Err(e) => {
                tracing::debug!(
                    "No text tokenizer found in {}: {}",
                    self.model_dir.display(),
                    e
                );
                None
            }
        }
    }

    /// Try to load the audio tokenizer.
    fn try_load_audio_tokenizer(
        &self,
        device: &Device,
        dtype: DType,
        use_flash_attn: bool,
    ) -> std::result::Result<Option<TokenizerV2>, LoadError> {
        let tokenizer_config = match &self.tokenizer_config {
            Some(c) => c.clone(),
            None => return Ok(None),
        };

        let weights_path = match self.find_tokenizer_weights_file() {
            Some(p) => p,
            None => {
                tracing::warn!("Tokenizer config found but no weights file, skipping tokenizer");
                return Ok(None);
            }
        };

        tracing::info!("Loading tokenizer weights from {}", weights_path.display());

        let vb = unsafe { VarBuilder::from_mmaped_safetensors(&[weights_path], dtype, device)? };

        // Create tokenizer with decoder first
        let tokenizer = TokenizerV2::new(tokenizer_config.clone(), use_flash_attn, vb.clone())?;

        // Try to add encoder for ICL mode support
        let tokenizer = match tokenizer.with_encoder(vb.pp("encoder")) {
            Ok(t) => {
                tracing::debug!("Loaded audio tokenizer with encoder (ICL mode enabled)");
                t
            }
            Err(e) => {
                tracing::warn!(
                    error = %e,
                    "Failed to load encoder, ICL mode disabled. Voice cloning will use x-vector only mode."
                );
                // Return decoder-only tokenizer
                TokenizerV2::new(tokenizer_config, use_flash_attn, vb)?
            }
        };

        Ok(Some(tokenizer))
    }

    /// Load only the raw model without the inference wrapper.
    ///
    /// Useful when you need more control over the model or want to use
    /// a custom inference setup.
    pub fn load_raw_model(
        &self,
        device: &Device,
        dtype: DType,
        use_flash_attn: bool,
    ) -> std::result::Result<ConditionalGeneration, LoadError> {
        let weights_path = self.find_weights_file().ok_or_else(|| {
            LoadError::WeightsError(format!(
                "No model weights found in {}",
                self.model_dir.display()
            ))
        })?;

        let vb = if weights_path.extension().is_some_and(|e| e == "safetensors") {
            unsafe { VarBuilder::from_mmaped_safetensors(&[weights_path], dtype, device)? }
        } else {
            return Err(LoadError::WeightsError(
                "Only safetensors format is supported".to_string(),
            ));
        };

        let model = ConditionalGeneration::load(self.model_config.clone(), use_flash_attn, vb)?;
        Ok(model)
    }
}

/// Convenience function to load a model from a local directory.
///
/// This is the simplest way to load a model:
///
/// ```no_run
/// use qwen_tts::model::loader::load_from_pretrained;
/// use candle_core::Device;
///
/// # fn main() -> Result<(), Box<dyn std::error::Error>> {
/// let model = load_from_pretrained("/path/to/model", &Device::Cpu)?;
/// # Ok(())
/// # }
/// ```
pub fn load_from_pretrained(
    model_dir: impl AsRef<Path>,
    device: &Device,
) -> std::result::Result<Model, LoadError> {
    let loader = ModelLoader::from_local_dir(model_dir)?;
    loader.load_tts_model(device, &LoaderConfig::default())
}

/// Load a model with custom configuration.
pub fn load_from_pretrained_with_config(
    model_dir: impl AsRef<Path>,
    device: &Device,
    config: &LoaderConfig,
) -> std::result::Result<Model, LoadError> {
    let loader = ModelLoader::from_local_dir(model_dir)?;
    loader.load_tts_model(device, config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_loader_config_default() {
        let config = LoaderConfig::default();
        assert_eq!(config.dtype, DType::F32);
        assert!(config.load_tokenizer);
        assert!(config.load_generate_config);
    }
}
