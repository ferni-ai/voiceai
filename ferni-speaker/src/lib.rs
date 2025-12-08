//! # ferni-speaker
//!
//! High-performance speaker embedding extraction using ECAPA-TDNN.
//!
//! This crate provides NAPI bindings for Node.js to extract speaker embeddings
//! from audio samples using a pre-trained ECAPA-TDNN model.
//!
//! ## Features
//!
//! - Extract 192-dimensional speaker embeddings from audio
//! - Compare embeddings using cosine similarity
//! - Batch processing with parallel execution
//! - Find best match from candidate embeddings
//!
//! ## Usage
//!
//! ```javascript
//! const speaker = require('ferni-speaker');
//!
//! // Initialize with model path
//! speaker.initialize('./models/ecapa_tdnn.onnx');
//!
//! // Extract embedding from audio (16kHz mono Float32Array)
//! const embedding = speaker.extractEmbedding(audioSamples);
//!
//! // Compare two embeddings
//! const similarity = speaker.compareEmbeddings(emb1, emb2);
//! ```

#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::OnceLock;

mod audio;
mod embedding;
mod mel;
mod similarity;

use embedding::SpeakerEmbeddingModel;

// Singleton model instance - loaded once, used for all requests
static MODEL: OnceLock<SpeakerEmbeddingModel> = OnceLock::new();

/// Initialize the speaker embedding model.
///
/// Must be called before any other functions. The model is loaded once
/// and reused for all subsequent calls.
///
/// @param modelPath - Path to the ONNX model file
#[napi]
pub fn initialize(model_path: String) -> Result<()> {
    if MODEL.get().is_some() {
        return Ok(()); // Already initialized
    }

    let model = SpeakerEmbeddingModel::load(&model_path)
        .map_err(|e| Error::from_reason(format!("Failed to load model: {}", e)))?;

    MODEL
        .set(model)
        .map_err(|_| Error::from_reason("Model already initialized"))?;

    Ok(())
}

/// Check if the model is initialized.
#[napi]
pub fn is_initialized() -> bool {
    MODEL.get().is_some()
}

/// Extract a speaker embedding from audio samples.
///
/// @param samples - Float32Array of audio samples (16kHz mono)
/// @returns 192-dimensional embedding vector as Float32Array
#[napi]
pub fn extract_embedding(samples: Float32Array) -> Result<Float32Array> {
    let model = MODEL
        .get()
        .ok_or_else(|| Error::from_reason("Model not initialized. Call initialize() first."))?;

    let audio: Vec<f32> = samples.to_vec();

    // Validate audio length (need at least 0.5 seconds)
    if audio.len() < 8000 {
        return Err(Error::from_reason(
            "Audio too short. Need at least 0.5 seconds (8000 samples at 16kHz).",
        ));
    }

    // Preprocess audio
    let processed = audio::preprocess(&audio);

    // Extract mel spectrogram
    let (mel, n_frames) = mel::compute_mel_spectrogram(&processed, 16000, 80)
        .map_err(|e| Error::from_reason(format!("Mel spectrogram failed: {}", e)))?;

    // Run inference
    let embedding = model
        .embed(&mel, n_frames)
        .map_err(|e| Error::from_reason(format!("Embedding extraction failed: {}", e)))?;

    Ok(Float32Array::from(embedding))
}

/// Compare two embeddings using cosine similarity.
///
/// @param emb1 - First embedding vector
/// @param emb2 - Second embedding vector
/// @returns Similarity score between 0 and 1
#[napi]
pub fn compare_embeddings(emb1: Float32Array, emb2: Float32Array) -> Result<f64> {
    let e1: Vec<f32> = emb1.to_vec();
    let e2: Vec<f32> = emb2.to_vec();

    if e1.len() != e2.len() {
        return Err(Error::from_reason(format!(
            "Embedding dimensions don't match: {} vs {}",
            e1.len(),
            e2.len()
        )));
    }

    Ok(similarity::cosine_similarity(&e1, &e2))
}

/// Batch extract embeddings from multiple audio samples.
///
/// Uses parallel processing for efficiency.
///
/// @param samplesList - Array of Float32Array audio samples
/// @returns Array of embedding vectors
#[napi]
pub fn extract_embeddings_batch(samples_list: Vec<Float32Array>) -> Result<Vec<Float32Array>> {
    let model = MODEL
        .get()
        .ok_or_else(|| Error::from_reason("Model not initialized"))?;

    use rayon::prelude::*;

    let results: Vec<Result<Float32Array>> = samples_list
        .par_iter()
        .map(|samples| {
            let audio: Vec<f32> = samples.to_vec();

            if audio.len() < 8000 {
                return Err(Error::from_reason("Audio too short"));
            }

            let processed = audio::preprocess(&audio);
            let (mel, n_frames) = mel::compute_mel_spectrogram(&processed, 16000, 80)
                .map_err(|e| Error::from_reason(format!("Mel failed: {}", e)))?;
            let embedding = model
                .embed(&mel, n_frames)
                .map_err(|e| Error::from_reason(format!("Embed failed: {}", e)))?;

            Ok(Float32Array::from(embedding))
        })
        .collect();

    results.into_iter().collect()
}

/// Result of finding a match among candidates.
#[napi(object)]
pub struct MatchResult {
    /// Index of the best matching candidate
    pub index: u32,
    /// Similarity score (0-1)
    pub similarity: f64,
}

/// Find the best matching embedding from a list of candidates.
///
/// @param query - The query embedding to match
/// @param candidates - Array of candidate embeddings to search
/// @param threshold - Minimum similarity threshold (default 0.5)
/// @returns Best match result, or null if no match above threshold
#[napi]
pub fn find_best_match(
    query: Float32Array,
    candidates: Vec<Float32Array>,
    threshold: Option<f64>,
) -> Result<Option<MatchResult>> {
    let q: Vec<f32> = query.to_vec();
    let min_threshold = threshold.unwrap_or(0.5);

    let mut best_idx: Option<usize> = None;
    let mut best_score = min_threshold;

    for (idx, candidate) in candidates.iter().enumerate() {
        let c: Vec<f32> = candidate.to_vec();

        if c.len() != q.len() {
            continue; // Skip mismatched dimensions
        }

        let score = similarity::cosine_similarity(&q, &c);

        if score > best_score {
            best_score = score;
            best_idx = Some(idx);
        }
    }

    Ok(best_idx.map(|idx| MatchResult {
        index: idx as u32,
        similarity: best_score,
    }))
}

/// Find all matches above a threshold.
///
/// @param query - The query embedding to match
/// @param candidates - Array of candidate embeddings to search
/// @param threshold - Minimum similarity threshold
/// @returns Array of matches sorted by similarity (descending)
#[napi]
pub fn find_all_matches(
    query: Float32Array,
    candidates: Vec<Float32Array>,
    threshold: f64,
) -> Result<Vec<MatchResult>> {
    let q: Vec<f32> = query.to_vec();

    let mut matches: Vec<MatchResult> = candidates
        .iter()
        .enumerate()
        .filter_map(|(idx, candidate)| {
            let c: Vec<f32> = candidate.to_vec();

            if c.len() != q.len() {
                return None;
            }

            let score = similarity::cosine_similarity(&q, &c);

            if score >= threshold {
                Some(MatchResult {
                    index: idx as u32,
                    similarity: score,
                })
            } else {
                None
            }
        })
        .collect();

    // Sort by similarity descending
    matches.sort_by(|a, b| b.similarity.partial_cmp(&a.similarity).unwrap());

    Ok(matches)
}

/// Information about the loaded model.
#[napi(object)]
pub struct ModelInfo {
    /// Model name/type
    pub name: String,
    /// Embedding dimension (typically 192)
    pub embedding_dim: u32,
    /// Expected sample rate (16000)
    pub sample_rate: u32,
    /// Minimum audio length in samples
    pub min_samples: u32,
}

/// Get information about the loaded model.
#[napi]
pub fn get_model_info() -> Result<ModelInfo> {
    let model = MODEL
        .get()
        .ok_or_else(|| Error::from_reason("Model not initialized"))?;

    Ok(ModelInfo {
        name: model.name().to_string(),
        embedding_dim: model.embedding_dim() as u32,
        sample_rate: 16000,
        min_samples: 8000, // 0.5 seconds
    })
}

/// Compute similarity matrix between two sets of embeddings.
///
/// Useful for clustering or finding similar speakers.
///
/// @param embeddings1 - First set of embeddings
/// @param embeddings2 - Second set of embeddings
/// @returns 2D similarity matrix as flattened Float32Array
#[napi]
pub fn compute_similarity_matrix(
    embeddings1: Vec<Float32Array>,
    embeddings2: Vec<Float32Array>,
) -> Result<Float32Array> {
    let n1 = embeddings1.len();
    let n2 = embeddings2.len();

    let mut matrix = vec![0.0f32; n1 * n2];

    for (i, e1) in embeddings1.iter().enumerate() {
        let v1: Vec<f32> = e1.to_vec();
        for (j, e2) in embeddings2.iter().enumerate() {
            let v2: Vec<f32> = e2.to_vec();
            matrix[i * n2 + j] = similarity::cosine_similarity(&v1, &v2) as f32;
        }
    }

    Ok(Float32Array::from(matrix))
}

