//! Audio tokenizer commands (encode/decode).

use anyhow::{Context, Result, bail};
use std::path::PathBuf;

use crate::io::ModelArgs;

pub fn get_tokenizer_path(model_args: &ModelArgs) -> Result<PathBuf> {
    use hf_hub::{Repo, RepoType, api::sync::Api};

    if let Some(ref path) = model_args.model_path {
        if !path.exists() {
            bail!("Model path does not exist: {:?}", path);
        }
        return Ok(path.clone());
    }

    let model_id = model_args
        .model
        .as_deref()
        .unwrap_or("Qwen/Qwen3-TTS-Tokenizer-12Hz");
    tracing::info!(model_id = %model_id, "Downloading tokenizer from HuggingFace");

    let api = Api::new().context("Failed to create HuggingFace API")?;
    let repo = api.repo(Repo::new(model_id.to_string(), RepoType::Model));

    let files = ["config.json", "model.safetensors"];
    let mut model_dir: Option<PathBuf> = None;

    for filename in files {
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

    model_dir.ok_or_else(|| anyhow::anyhow!("Failed to determine model directory"))
}
