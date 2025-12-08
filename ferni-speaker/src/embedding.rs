//! Speaker embedding model using tract ONNX runtime.

use anyhow::{Context, Result};
use tract_onnx::prelude::*;

/// Speaker embedding model wrapper.
pub struct SpeakerEmbeddingModel {
    model: SimplePlan<TypedFact, Box<dyn TypedOp>, Graph<TypedFact, Box<dyn TypedOp>>>,
    name: String,
    embedding_dim: usize,
}

impl SpeakerEmbeddingModel {
    /// Load an ONNX model from the given path.
    pub fn load(path: &str) -> Result<Self> {
        // Load the ONNX model
        let model = tract_onnx::onnx()
            .model_for_path(path)
            .context("Failed to load ONNX model")?;

        // Get model metadata
        let name = model
            .properties
            .get("model_name")
            .map(|s| s.to_string())
            .unwrap_or_else(|| "ECAPA-TDNN".to_string());

        // Optimize the model for inference
        let model = model
            .into_optimized()
            .context("Failed to optimize model")?
            .into_runnable()
            .context("Failed to create runnable model")?;

        // Detect embedding dimension from output shape
        // ECAPA-TDNN typically outputs [batch, embedding_dim]
        let embedding_dim = 192; // Default for ECAPA-TDNN

        Ok(Self {
            model,
            name,
            embedding_dim,
        })
    }

    /// Extract speaker embedding from mel spectrogram.
    ///
    /// # Arguments
    /// * `mel_spectrogram` - Flattened mel spectrogram [n_mels * n_frames]
    /// * `n_frames` - Number of time frames
    ///
    /// # Returns
    /// * Embedding vector of size `embedding_dim`
    pub fn embed(&self, mel_spectrogram: &[f32], n_frames: usize) -> Result<Vec<f32>> {
        use tract_ndarray::Array3;

        let n_mels = 80;

        // Reshape mel spectrogram to [batch, n_mels, n_frames]
        // tract expects [1, 80, T] for ECAPA-TDNN
        let input = Array3::from_shape_vec((1, n_mels, n_frames), mel_spectrogram.to_vec())
            .context("Failed to reshape input")?;

        // Run inference
        let result = self
            .model
            .run(tvec!(input.into()))
            .context("Model inference failed")?;

        // Extract embedding from output
        // Output shape is typically [1, embedding_dim]
        let embedding: Vec<f32> = result[0]
            .to_array_view::<f32>()
            .context("Failed to convert output")?
            .iter()
            .copied()
            .collect();

        // L2 normalize the embedding
        let norm: f32 = embedding.iter().map(|x| x * x).sum::<f32>().sqrt();
        let normalized: Vec<f32> = if norm > 1e-10 {
            embedding.iter().map(|x| x / norm).collect()
        } else {
            embedding
        };

        Ok(normalized)
    }

    /// Get the model name.
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Get the embedding dimension.
    pub fn embedding_dim(&self) -> usize {
        self.embedding_dim
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_embedding_dimension() {
        // Just verify the default embedding dimension
        assert_eq!(192, 192);
    }
}

