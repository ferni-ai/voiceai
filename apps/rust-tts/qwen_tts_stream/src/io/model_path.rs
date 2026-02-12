use anyhow::{Context, Result, bail};
use hf_hub::api::sync::Api;
use hf_hub::{Repo, RepoType};
use std::path::PathBuf;

use crate::io::ModelArgs;
use crate::synthesis::detect_mode::DetectedMode;

/// Get the model path, downloading from HuggingFace if needed.
pub fn get_model_path(model_args: &ModelArgs, mode: &DetectedMode) -> Result<PathBuf> {
    // If local path is specified, use it directly
    if let Some(ref path) = model_args.model_path {
        if !path.exists() {
            bail!("Model path does not exist: {:?}", path);
        }
        return Ok(path.clone());
    }

    // Determine which HuggingFace model to use
    let model_id = if let Some(ref model) = model_args.model {
        model.clone()
    } else {
        // Choose default based on synthesis mode
        match mode {
            DetectedMode::CustomVoice { .. } => "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice".to_string(),
            DetectedMode::VoiceDesign { .. } => "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign".to_string(),
            DetectedMode::VoiceClone { .. } => "Qwen/Qwen3-TTS-12Hz-0.6B-Base".to_string(),
        }
    };

    tracing::info!(model_id = %model_id, "Downloading model from HuggingFace");

    // Download model files from HuggingFace
    let api = Api::new().context("Failed to create HuggingFace API")?;
    let repo = api.repo(Repo::new(model_id.clone(), RepoType::Model));

    let mut model_dir: Option<PathBuf> = None;

    // Download required model files
    tracing::debug!("Downloading core model files...");
    for filename in &["config.json", "model.safetensors"] {
        match repo.get(filename) {
            Ok(path) => {
                tracing::debug!(file = %filename, "Downloaded");
                if model_dir.is_none() {
                    model_dir = path.parent().map(|p| p.to_path_buf());
                }
            }
            Err(e) => {
                bail!("Failed to download {}: {}", filename, e);
            }
        }
    }

    // Download text tokenizer files
    // tokenizer.json is preferred; vocab.json + merges.txt is fallback
    tracing::debug!("Downloading text tokenizer files...");
    let mut has_tokenizer_json = false;
    for filename in &[
        "tokenizer.json",
        "vocab.json",
        "merges.txt",
        "tokenizer_config.json",
    ] {
        match repo.get(filename) {
            Ok(_) => {
                tracing::debug!(file = %filename, "Downloaded");
                if *filename == "tokenizer.json" {
                    has_tokenizer_json = true;
                }
            }
            Err(e) => {
                // tokenizer.json is optional if we have vocab.json + merges.txt
                // vocab.json and merges.txt are optional if we have tokenizer.json
                if *filename == "tokenizer.json"
                    || *filename == "merges.txt"
                    || (has_tokenizer_json && *filename == "vocab.json")
                    || *filename == "tokenizer_config.json"
                {
                    tracing::debug!(file = %filename, "Optional, skipped");
                } else {
                    bail!("Failed to download {}: {}", filename, e);
                }
            }
        }
    }

    // Download speech tokenizer files
    tracing::debug!("Downloading speech tokenizer files...");
    for filename in &[
        "speech_tokenizer/config.json",
        "speech_tokenizer/model.safetensors",
    ] {
        match repo.get(filename) {
            Ok(_) => tracing::debug!(file = %filename, "Downloaded"),
            Err(e) => {
                tracing::debug!(file = %filename, error = %e, "Failed (non-fatal)");
                // Not fatal - speech tokenizer might be optional or structured differently
            }
        }
    }

    // Download optional files
    tracing::debug!("Downloading optional files...");
    for filename in &["generation_config.json", "preprocessor_config.json"] {
        match repo.get(filename) {
            Ok(_) => tracing::debug!(file = %filename, "Downloaded"),
            Err(_) => tracing::debug!(file = %filename, "Not found"),
        }
    }

    model_dir.ok_or_else(|| anyhow::anyhow!("Failed to determine model directory"))
}
