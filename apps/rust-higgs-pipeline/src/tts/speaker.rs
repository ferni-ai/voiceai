//! Speaker Embedding Bank
//!
//! Loads and caches speaker embeddings for persona-specific voice synthesis.
//! Uses ECAPA-TDNN (ONNX) for extracting embeddings from reference audio.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use candle_core::{Device, DType, Tensor};
use safetensors::SafeTensors;
use tracing::{info, warn};

/// Pads or truncates a speaker embedding to the model's hidden size for conditioning.
/// Returns a tensor of shape [1, hidden_size] on the given device.
pub fn pad_embedding_to_hidden(
    embed: &Tensor,
    hidden_size: usize,
    device: &Device,
) -> Result<Tensor> {
    let flat = embed.flatten_all()?;
    let vals: Vec<f32> = flat.to_vec1()?;
    let n = vals.len().min(hidden_size);
    let mut padded = vec![0f32; hidden_size];
    padded[..n].copy_from_slice(&vals[..n]);
    let t = Tensor::from_vec(padded, (1, hidden_size), device)
        .map_err(|e| anyhow::anyhow!("pad_embedding_to_hidden: {}", e))?;
    t.to_dtype(DType::F32).map_err(|e| anyhow::anyhow!("pad_embedding_to_hidden: {}", e))
}

/// Speaker embedding dimension (ECAPA-TDNN output).
pub const SPEAKER_EMBED_DIM: usize = 192;

/// Bank of pre-computed speaker embeddings, one per persona.
pub struct SpeakerEmbeddingBank {
    embeddings: HashMap<String, Tensor>,
    device: Device,
    embeddings_dir: PathBuf,
}

impl SpeakerEmbeddingBank {
    /// Create a new bank, loading embeddings from the given directory.
    /// Each persona should have a `{persona_id}.safetensors` file.
    pub fn new(embeddings_dir: &Path, device: &Device) -> Result<Self> {
        let mut bank = Self {
            embeddings: HashMap::new(),
            device: device.clone(),
            embeddings_dir: embeddings_dir.to_path_buf(),
        };
        bank.load_all()?;
        Ok(bank)
    }

    /// Load all .safetensors files from the embeddings directory.
    fn load_all(&mut self) -> Result<()> {
        if !self.embeddings_dir.exists() {
            warn!(
                dir = %self.embeddings_dir.display(),
                "Speaker embeddings directory not found, using defaults"
            );
            return Ok(());
        }

        let entries = std::fs::read_dir(&self.embeddings_dir)
            .context("Failed to read speaker embeddings directory")?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |e| e == "safetensors") {
                let persona_id = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("unknown")
                    .to_string();

                match self.load_embedding(&path) {
                    Ok(tensor) => {
                        info!(
                            persona = %persona_id,
                            shape = ?tensor.shape(),
                            "Loaded speaker embedding"
                        );
                        self.embeddings.insert(persona_id, tensor);
                    }
                    Err(e) => {
                        warn!(
                            persona = %persona_id,
                            error = %e,
                            "Failed to load speaker embedding"
                        );
                    }
                }
            }
        }

        info!(
            count = self.embeddings.len(),
            "Speaker embedding bank initialized"
        );
        Ok(())
    }

    /// Load a single embedding from a safetensors file.
    fn load_embedding(&self, path: &Path) -> Result<Tensor> {
        let data = std::fs::read(path)?;
        let tensors = SafeTensors::deserialize(&data)?;

        // Look for 'embedding' or 'speaker_embedding' key
        let tensor_data = tensors
            .tensor("embedding")
            .or_else(|_| tensors.tensor("speaker_embedding"))
            .context("No 'embedding' or 'speaker_embedding' tensor found")?;

        let shape = tensor_data.shape();
        let flat_len: usize = shape.iter().product();

        // Convert to f32 tensor on target device
        let raw_bytes = tensor_data.data();
        let f32_data: Vec<f32> = raw_bytes
            .chunks_exact(4)
            .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
            .collect();

        let tensor = Tensor::from_vec(f32_data, &[1, 1, flat_len], &self.device)?
            .to_dtype(DType::F32)?;

        Ok(tensor)
    }

    /// Get the speaker embedding for a persona. Returns None if not found.
    pub fn get(&self, persona_id: &str) -> Option<&Tensor> {
        self.embeddings.get(persona_id)
    }

    /// Generate a default embedding (zero vector) for personas without a trained embedding.
    pub fn default_embedding(&self) -> Result<Tensor> {
        Tensor::zeros(&[1, 1, SPEAKER_EMBED_DIM], DType::F32, &self.device)
            .context("Failed to create default speaker embedding")
    }

    /// List all loaded persona IDs.
    pub fn loaded_personas(&self) -> Vec<String> {
        self.embeddings.keys().cloned().collect()
    }
}
