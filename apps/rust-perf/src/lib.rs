//! # Ferni Performance Library
//!
//! SIMD-optimized operations for Ferni voice agent.
//! Called from Node.js via NAPI-RS bindings.
//!
//! ## Features
//! - Cosine similarity (SIMD-accelerated)
//! - Text similarity (Jaccard with k-shingles)
//! - Batch similarity operations (parallel)
//! - LSH for near-duplicate detection
//! - SIMD-accelerated JSON parsing (tool-call-sanitizer)
//! - SSML pattern extraction and manipulation
//! - Aho-Corasick multi-pattern matching (O(n) for all patterns)

mod embedding_cache;
mod fft_analyzer;
mod fluency_analyzer;
mod json_parser;
mod signal_extractor;
mod ssml_processor;
mod token_counter;
mod turn_analyzer;

use napi::bindgen_prelude::*;
use napi_derive::napi;
use rayon::prelude::*;
use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use wide::f32x8;
use xxhash_rust::xxh3::xxh3_64;

// ============================================================================
// COSINE SIMILARITY (SIMD-OPTIMIZED)
// ============================================================================

/// Compute cosine similarity between two embedding vectors.
/// Uses SIMD instructions when available (AVX2/SSE/NEON).
///
/// Returns a value between -1.0 and 1.0.
#[napi]
pub fn cosine_similarity(a: Vec<f64>, b: Vec<f64>) -> Result<f64> {
    if a.len() != b.len() {
        return Err(Error::new(
            Status::InvalidArg,
            format!("Vector length mismatch: {} vs {}", a.len(), b.len()),
        ));
    }

    if a.is_empty() {
        return Ok(0.0);
    }

    // Manual SIMD-friendly loop (auto-vectorized by LLVM)
    let mut dot_product = 0.0f64;
    let mut norm_a = 0.0f64;
    let mut norm_b = 0.0f64;

    // Process in chunks for better vectorization
    let chunks = a.len() / 4;
    for i in 0..chunks {
        let base = i * 4;

        dot_product += a[base] * b[base];
        dot_product += a[base + 1] * b[base + 1];
        dot_product += a[base + 2] * b[base + 2];
        dot_product += a[base + 3] * b[base + 3];

        norm_a += a[base] * a[base];
        norm_a += a[base + 1] * a[base + 1];
        norm_a += a[base + 2] * a[base + 2];
        norm_a += a[base + 3] * a[base + 3];

        norm_b += b[base] * b[base];
        norm_b += b[base + 1] * b[base + 1];
        norm_b += b[base + 2] * b[base + 2];
        norm_b += b[base + 3] * b[base + 3];
    }

    // Handle remainder
    for i in (chunks * 4)..a.len() {
        dot_product += a[i] * b[i];
        norm_a += a[i] * a[i];
        norm_b += b[i] * b[i];
    }

    let denominator = (norm_a * norm_b).sqrt();
    if denominator == 0.0 {
        return Ok(0.0);
    }

    Ok(dot_product / denominator)
}

/// Batch cosine similarity: compare one query vector against many candidates.
/// Returns similarity scores in the same order as candidates.
/// Uses parallel processing via Rayon.
#[napi]
pub fn batch_cosine_similarity(query: Vec<f64>, candidates: Vec<Vec<f64>>) -> Result<Vec<f64>> {
    let results: Vec<f64> = candidates
        .par_iter()
        .map(|candidate| {
            cosine_similarity(query.clone(), candidate.clone()).unwrap_or(0.0)
        })
        .collect();

    Ok(results)
}

/// Compute Euclidean distance between two embedding vectors.
/// Returns the L2 distance (sqrt of sum of squared differences).
#[napi]
pub fn euclidean_distance(a: Vec<f64>, b: Vec<f64>) -> Result<f64> {
    if a.len() != b.len() {
        return Err(Error::new(
            Status::InvalidArg,
            format!("Vector length mismatch: {} vs {}", a.len(), b.len()),
        ));
    }

    if a.is_empty() {
        return Ok(0.0);
    }

    // Manual SIMD-friendly loop (auto-vectorized by LLVM)
    let mut sum = 0.0f64;

    // Process in chunks for better vectorization
    let chunks = a.len() / 4;
    for i in 0..chunks {
        let base = i * 4;

        let diff0 = a[base] - b[base];
        let diff1 = a[base + 1] - b[base + 1];
        let diff2 = a[base + 2] - b[base + 2];
        let diff3 = a[base + 3] - b[base + 3];

        sum += diff0 * diff0;
        sum += diff1 * diff1;
        sum += diff2 * diff2;
        sum += diff3 * diff3;
    }

    // Handle remainder
    for i in (chunks * 4)..a.len() {
        let diff = a[i] - b[i];
        sum += diff * diff;
    }

    Ok(sum.sqrt())
}

/// Batch euclidean distance: compare one query vector against many candidates.
/// Returns distance values in the same order as candidates.
/// Uses parallel processing via Rayon.
#[napi]
pub fn batch_euclidean_distance(query: Vec<f64>, candidates: Vec<Vec<f64>>) -> Result<Vec<f64>> {
    let results: Vec<f64> = candidates
        .par_iter()
        .map(|candidate| {
            euclidean_distance(query.clone(), candidate.clone()).unwrap_or(f64::MAX)
        })
        .collect();

    Ok(results)
}

// ============================================================================
// F32 SIMD-OPTIMIZED OPERATIONS (ZERO-COPY FROM JS)
// ============================================================================

/// SIMD-accelerated dot product for f32 slices using wide crate.
/// Processes 8 floats at a time with AVX2/SSE/NEON.
#[inline]
fn dot_product_simd_f32(a: &[f32], b: &[f32]) -> f32 {
    debug_assert_eq!(a.len(), b.len());

    let chunks = a.len() / 8;
    let mut sum = f32x8::ZERO;

    // Process 8 floats at a time
    for i in 0..chunks {
        let start = i * 8;
        let va = f32x8::from(&a[start..start + 8]);
        let vb = f32x8::from(&b[start..start + 8]);
        sum += va * vb;
    }

    // Horizontal sum of SIMD vector
    let arr: [f32; 8] = sum.into();
    let mut result: f32 = arr.iter().sum();

    // Handle remainder
    for i in (chunks * 8)..a.len() {
        result += a[i] * b[i];
    }

    result
}

/// Compute cosine similarity between two f32 embedding vectors.
/// Uses explicit SIMD via wide crate for 8-way parallelism.
#[inline]
fn cosine_similarity_f32_impl(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }

    let dot = dot_product_simd_f32(a, b);
    let norm_a = dot_product_simd_f32(a, a).sqrt();
    let norm_b = dot_product_simd_f32(b, b).sqrt();

    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }

    dot / (norm_a * norm_b)
}

/// Batch cosine similarity with F32 embeddings for maximum performance.
/// Takes flat arrays for zero-copy transfer from JavaScript.
///
/// # Arguments
/// * `query` - Query embedding (1536 floats for OpenAI embeddings)
/// * `candidates` - Flat array of candidate embeddings (n * dim floats)
/// * `candidate_count` - Number of candidates
///
/// # Returns
/// Array of similarity scores
#[napi]
pub fn batch_cosine_similarity_f32(
    query: Float32Array,
    candidates: Float32Array,
    candidate_count: u32,
) -> Float32Array {
    let dim = query.len();
    let query_slice: &[f32] = &query;
    let candidates_slice: &[f32] = &candidates;
    let count = candidate_count as usize;

    // Pre-compute query norm
    let query_norm = dot_product_simd_f32(query_slice, query_slice).sqrt();

    // Parallel computation over candidates
    let results: Vec<f32> = (0..count)
        .into_par_iter()
        .map(|i| {
            let start = i * dim;
            let candidate = &candidates_slice[start..start + dim];

            let dot = dot_product_simd_f32(query_slice, candidate);
            let candidate_norm = dot_product_simd_f32(candidate, candidate).sqrt();

            if query_norm == 0.0 || candidate_norm == 0.0 {
                0.0
            } else {
                dot / (query_norm * candidate_norm)
            }
        })
        .collect();

    Float32Array::new(results)
}

/// SIMD-accelerated squared difference sum for f32 slices.
/// Processes 8 floats at a time with AVX2/SSE/NEON.
#[inline]
fn squared_diff_sum_simd_f32(a: &[f32], b: &[f32]) -> f32 {
    debug_assert_eq!(a.len(), b.len());

    let chunks = a.len() / 8;
    let mut sum = f32x8::ZERO;

    // Process 8 floats at a time
    for i in 0..chunks {
        let start = i * 8;
        let va = f32x8::from(&a[start..start + 8]);
        let vb = f32x8::from(&b[start..start + 8]);
        let diff = va - vb;
        sum += diff * diff;
    }

    // Horizontal sum of SIMD vector
    let arr: [f32; 8] = sum.into();
    let mut result: f32 = arr.iter().sum();

    // Handle remainder
    for i in (chunks * 8)..a.len() {
        let diff = a[i] - b[i];
        result += diff * diff;
    }

    result
}

/// Compute Euclidean distance between two f32 embedding vectors.
/// Uses explicit SIMD via wide crate for 8-way parallelism.
#[inline]
fn euclidean_distance_f32_impl(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }

    squared_diff_sum_simd_f32(a, b).sqrt()
}

/// Euclidean distance with F32 embeddings for maximum performance.
/// Takes flat arrays for zero-copy transfer from JavaScript.
///
/// # Arguments
/// * `a` - First embedding (Float32Array)
/// * `b` - Second embedding (Float32Array)
///
/// # Returns
/// Euclidean distance (L2 norm of difference)
#[napi]
pub fn euclidean_distance_f32(a: Float32Array, b: Float32Array) -> f64 {
    if a.len() != b.len() {
        return f64::MAX;
    }
    euclidean_distance_f32_impl(&a, &b) as f64
}

/// Batch Euclidean distance with F32 embeddings for maximum performance.
/// Takes flat arrays for zero-copy transfer from JavaScript.
///
/// # Arguments
/// * `query` - Query embedding (dim floats)
/// * `candidates` - Flat array of candidate embeddings (n * dim floats)
/// * `candidate_count` - Number of candidates
///
/// # Returns
/// Array of distance values
#[napi]
pub fn batch_euclidean_distance_f32(
    query: Float32Array,
    candidates: Float32Array,
    candidate_count: u32,
) -> Float32Array {
    let dim = query.len();
    let query_slice: &[f32] = &query;
    let candidates_slice: &[f32] = &candidates;
    let count = candidate_count as usize;

    // Parallel computation over candidates
    let results: Vec<f32> = (0..count)
        .into_par_iter()
        .map(|i| {
            let start = i * dim;
            let candidate = &candidates_slice[start..start + dim];
            euclidean_distance_f32_impl(query_slice, candidate)
        })
        .collect();

    Float32Array::new(results)
}

/// Normalize a vector to unit length (L2 normalization).
/// Returns a new Float32Array with the normalized vector.
///
/// # Arguments
/// * `v` - Vector to normalize (Float32Array)
///
/// # Returns
/// Normalized vector with L2 norm = 1
#[napi]
pub fn normalize_vector_f32(v: Float32Array) -> Float32Array {
    let v_slice: &[f32] = &v;
    let norm = dot_product_simd_f32(v_slice, v_slice).sqrt();

    if norm == 0.0 || !norm.is_finite() {
        return Float32Array::new(v.to_vec());
    }

    let inv_norm = 1.0 / norm;
    let normalized: Vec<f32> = v_slice.iter().map(|x| x * inv_norm).collect();
    Float32Array::new(normalized)
}

/// Batch normalize multiple vectors to unit length.
/// Takes flat array of embeddings and normalizes each in-place.
///
/// # Arguments
/// * `embeddings` - Flat array of embeddings (n * dim floats)
/// * `embedding_count` - Number of embeddings
///
/// # Returns
/// Flat array of normalized embeddings
#[napi]
pub fn batch_normalize_vectors_f32(
    embeddings: Float32Array,
    embedding_count: u32,
) -> Float32Array {
    let dim = embeddings.len() / embedding_count as usize;
    let emb_slice: &[f32] = &embeddings;
    let count = embedding_count as usize;

    // Parallel normalization
    let results: Vec<f32> = (0..count)
        .into_par_iter()
        .flat_map(|i| {
            let start = i * dim;
            let v = &emb_slice[start..start + dim];
            let norm = dot_product_simd_f32(v, v).sqrt();

            if norm == 0.0 || !norm.is_finite() {
                v.to_vec()
            } else {
                let inv_norm = 1.0 / norm;
                v.iter().map(|x| x * inv_norm).collect::<Vec<f32>>()
            }
        })
        .collect();

    Float32Array::new(results)
}

/// Compute L2 norm (magnitude) of a vector.
/// Uses SIMD-accelerated dot product.
#[napi]
pub fn vector_norm_f32(v: Float32Array) -> f64 {
    let v_slice: &[f32] = &v;
    dot_product_simd_f32(v_slice, v_slice).sqrt() as f64
}

/// Compute centroid (mean vector) of multiple embeddings.
/// Useful for clustering and averaging embeddings.
///
/// # Arguments
/// * `embeddings` - Flat array of embeddings (n * dim floats)
/// * `embedding_count` - Number of embeddings
///
/// # Returns
/// Centroid vector (dim floats)
#[napi]
pub fn compute_centroid_f32(
    embeddings: Float32Array,
    embedding_count: u32,
) -> Float32Array {
    let count = embedding_count as usize;
    if count == 0 {
        return Float32Array::new(vec![]);
    }

    let dim = embeddings.len() / count;
    let emb_slice: &[f32] = &embeddings;

    // Sum all vectors
    let mut centroid = vec![0.0f32; dim];
    for i in 0..count {
        let start = i * dim;
        for j in 0..dim {
            centroid[j] += emb_slice[start + j];
        }
    }

    // Divide by count
    let inv_count = 1.0 / count as f32;
    for c in &mut centroid {
        *c *= inv_count;
    }

    Float32Array::new(centroid)
}

/// Result for similar pairs search.
#[napi(object)]
pub struct SimilarPair {
    pub first_idx: u32,
    pub second_idx: u32,
    pub similarity: f64, // NAPI uses f64, we convert from f32 internally
}

/// Find all pairs of embeddings with similarity above threshold.
/// Optimized for O(n²) pairwise comparison in memory deduplication.
///
/// # Arguments
/// * `embeddings` - Flat array of embeddings (n * dim floats)
/// * `embedding_count` - Number of embeddings
/// * `dim` - Embedding dimension (e.g., 1536 for OpenAI)
/// * `threshold` - Minimum similarity threshold (0-1)
///
/// # Returns
/// Array of SimilarPair objects for all pairs above threshold
#[napi]
pub fn find_similar_pairs_f32(
    embeddings: Float32Array,
    embedding_count: u32,
    dim: u32,
    threshold: f64, // NAPI uses f64 for numbers
) -> Vec<SimilarPair> {
    let emb_slice: &[f32] = &embeddings;
    let count = embedding_count as usize;
    let dimension = dim as usize;
    let threshold_f32 = threshold as f32;

    // Generate all pairs and check in parallel
    let pairs: Vec<SimilarPair> = (0..count)
        .into_par_iter()
        .flat_map(|i| {
            let emb_i = &emb_slice[i * dimension..(i + 1) * dimension];

            ((i + 1)..count)
                .filter_map(|j| {
                    let emb_j = &emb_slice[j * dimension..(j + 1) * dimension];
                    let similarity = cosine_similarity_f32_impl(emb_i, emb_j);

                    if similarity >= threshold_f32 {
                        Some(SimilarPair {
                            first_idx: i as u32,
                            second_idx: j as u32,
                            similarity: similarity as f64,
                        })
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
        })
        .collect();

    pairs
}

/// Result for top-K similarity search.
#[napi(object)]
pub struct TopKResult {
    pub indices: Vec<u32>,
    pub similarities: Vec<f64>, // NAPI uses f64
}

/// Find top-K most similar embeddings to a query.
/// Uses parallel computation with local top-K per thread.
///
/// # Arguments
/// * `query` - Query embedding (dim floats)
/// * `candidates` - Flat array of candidate embeddings (n * dim floats)
/// * `candidate_count` - Number of candidates
/// * `k` - Number of top results to return
/// * `min_similarity` - Minimum similarity threshold (0-1)
///
/// # Returns
/// TopKResult with indices and similarity scores
#[napi]
pub fn top_k_similar_f32(
    query: Float32Array,
    candidates: Float32Array,
    candidate_count: u32,
    k: u32,
    min_similarity: f64, // NAPI uses f64
) -> TopKResult {
    let dim = query.len();
    let query_slice: &[f32] = &query;
    let candidates_slice: &[f32] = &candidates;
    let count = candidate_count as usize;
    let top_k = k as usize;
    let min_sim_f32 = min_similarity as f32;

    // Pre-compute query norm
    let query_norm = dot_product_simd_f32(query_slice, query_slice).sqrt();

    // Compute all similarities in parallel
    let mut scored: Vec<(usize, f32)> = (0..count)
        .into_par_iter()
        .filter_map(|i| {
            let start = i * dim;
            let candidate = &candidates_slice[start..start + dim];

            let dot = dot_product_simd_f32(query_slice, candidate);
            let candidate_norm = dot_product_simd_f32(candidate, candidate).sqrt();

            let similarity = if query_norm == 0.0 || candidate_norm == 0.0 {
                0.0
            } else {
                dot / (query_norm * candidate_norm)
            };

            if similarity >= min_sim_f32 {
                Some((i, similarity))
            } else {
                None
            }
        })
        .collect();

    // Sort by similarity descending and take top K
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(top_k);

    TopKResult {
        indices: scored.iter().map(|(i, _)| *i as u32).collect(),
        similarities: scored.iter().map(|(_, s)| *s as f64).collect(),
    }
}

// ============================================================================
// TEXT SIMILARITY (JACCARD WITH SHINGLES)
// ============================================================================

/// Generate k-shingles (character n-grams) from text.
fn get_shingles(text: &str, k: usize) -> HashSet<u64> {
    let normalized: String = text
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<&str>>()
        .join(" ");

    let chars: Vec<char> = normalized.chars().collect();
    let mut shingles = HashSet::new();

    if chars.len() >= k {
        for i in 0..=(chars.len() - k) {
            let shingle: String = chars[i..i + k].iter().collect();
            // Use xxhash for fast hashing
            shingles.insert(xxh3_64(shingle.as_bytes()));
        }
    }

    shingles
}

/// Compute Jaccard similarity between two texts using k-shingles.
/// Returns a value between 0.0 and 1.0.
#[napi]
pub fn text_similarity(text1: String, text2: String, shingle_size: Option<u32>) -> f64 {
    let k = shingle_size.unwrap_or(3) as usize;

    let shingles1 = get_shingles(&text1, k);
    let shingles2 = get_shingles(&text2, k);

    if shingles1.is_empty() && shingles2.is_empty() {
        return 1.0;
    }
    if shingles1.is_empty() || shingles2.is_empty() {
        return 0.0;
    }

    let intersection = shingles1.intersection(&shingles2).count();
    let union = shingles1.len() + shingles2.len() - intersection;

    if union == 0 {
        0.0
    } else {
        intersection as f64 / union as f64
    }
}

/// Batch text similarity: compare one query text against many candidates.
/// Returns similarity scores in the same order as candidates.
#[napi]
pub fn batch_text_similarity(
    query: String,
    candidates: Vec<String>,
    shingle_size: Option<u32>,
) -> Vec<f64> {
    let k = shingle_size.unwrap_or(3) as usize;
    let query_shingles = get_shingles(&query, k);

    candidates
        .par_iter()
        .map(|candidate| {
            let candidate_shingles = get_shingles(candidate, k);

            if query_shingles.is_empty() && candidate_shingles.is_empty() {
                return 1.0;
            }
            if query_shingles.is_empty() || candidate_shingles.is_empty() {
                return 0.0;
            }

            let intersection = query_shingles.intersection(&candidate_shingles).count();
            let union = query_shingles.len() + candidate_shingles.len() - intersection;

            if union == 0 { 0.0 } else { intersection as f64 / union as f64 }
        })
        .collect()
}

// ============================================================================
// LSH (LOCALITY-SENSITIVE HASHING)
// ============================================================================

/// MinHash signature for LSH.
#[napi(object)]
pub struct MinHashSignature {
    pub id: String,
    pub signature: Vec<u32>,
}

/// Generate MinHash signature for a text.
/// Uses xxhash for fast hashing with different seeds.
#[napi]
pub fn compute_minhash(text: String, num_hashes: u32, shingle_size: Option<u32>) -> MinHashSignature {
    let k = shingle_size.unwrap_or(3) as usize;
    let shingles = get_shingles(&text, k);

    let mut signature = vec![u32::MAX; num_hashes as usize];

    if shingles.is_empty() {
        return MinHashSignature {
            id: String::new(),
            signature: vec![0; num_hashes as usize],
        };
    }

    for shingle_hash in &shingles {
        for (i, sig) in signature.iter_mut().enumerate().take(num_hashes as usize) {
            // Create different hash by combining with seed
            let hash = xxh3_64(&[
                &(i as u64).to_le_bytes()[..],
                &shingle_hash.to_le_bytes()[..],
            ].concat()) as u32;

            if hash < *sig {
                *sig = hash;
            }
        }
    }

    MinHashSignature {
        id: String::new(),
        signature,
    }
}

/// Estimate Jaccard similarity from MinHash signatures.
/// Returns a value between 0.0 and 1.0.
#[napi]
pub fn estimate_similarity_from_minhash(sig1: Vec<u32>, sig2: Vec<u32>) -> f64 {
    if sig1.len() != sig2.len() || sig1.is_empty() {
        return 0.0;
    }

    let matches = sig1.iter().zip(sig2.iter()).filter(|(a, b)| a == b).count();
    matches as f64 / sig1.len() as f64
}

/// Find duplicate pairs from a batch of texts using LSH.
/// Returns pairs of indices with their similarity scores.
#[napi(object)]
pub struct DuplicatePair {
    pub first_idx: u32,
    pub second_idx: u32,
    pub similarity: f64,
}

#[napi]
pub fn find_duplicates_lsh(
    texts: Vec<String>,
    threshold: f64,
    num_hashes: Option<u32>,
    num_bands: Option<u32>,
) -> Vec<DuplicatePair> {
    let n_hashes = num_hashes.unwrap_or(100) as usize;
    let n_bands = num_bands.unwrap_or(20) as usize;
    let rows_per_band = n_hashes / n_bands;

    // Compute all signatures in parallel
    let signatures: Vec<Vec<u32>> = texts
        .par_iter()
        .map(|text| compute_minhash(text.clone(), n_hashes as u32, Some(3)).signature)
        .collect();

    // Build band hash tables
    let mut band_buckets: Vec<std::collections::HashMap<u64, Vec<usize>>> =
        vec![std::collections::HashMap::new(); n_bands];

    for (idx, sig) in signatures.iter().enumerate() {
        for band in 0..n_bands {
            let start = band * rows_per_band;
            let end = start + rows_per_band;
            let band_slice = &sig[start..end.min(sig.len())];

            // Hash the band
            let band_hash = xxh3_64(
                &band_slice.iter()
                    .flat_map(|x| x.to_le_bytes())
                    .collect::<Vec<u8>>()
            );

            band_buckets[band]
                .entry(band_hash)
                .or_default()
                .push(idx);
        }
    }

    // Find candidate pairs
    let mut candidates: HashSet<(usize, usize)> = HashSet::new();

    for bucket_map in &band_buckets {
        for indices in bucket_map.values() {
            if indices.len() > 1 {
                for i in 0..indices.len() {
                    for j in (i + 1)..indices.len() {
                        let pair = if indices[i] < indices[j] {
                            (indices[i], indices[j])
                        } else {
                            (indices[j], indices[i])
                        };
                        candidates.insert(pair);
                    }
                }
            }
        }
    }

    // Verify candidates and filter by threshold
    candidates
        .into_iter()
        .filter_map(|(i, j)| {
            let similarity = estimate_similarity_from_minhash(
                signatures[i].clone(),
                signatures[j].clone(),
            );

            if similarity >= threshold {
                Some(DuplicatePair {
                    first_idx: i as u32,
                    second_idx: j as u32,
                    similarity,
                })
            } else {
                None
            }
        })
        .collect()
}

// ============================================================================
// BATCH TOOL SCORING (SEMANTIC ROUTER OPTIMIZATION)
// ============================================================================

/// Input for a single tool profile to be scored
#[napi(object)]
pub struct ToolProfileInput {
    pub tool_id: String,
    /// Regex patterns as strings (will be compiled in Rust)
    pub patterns: Vec<String>,
    /// Keywords with their weights: [keyword, weight, keyword, weight, ...]
    pub keywords_flat: Vec<String>,
    pub keyword_weights_flat: Vec<f64>,
    /// Whether this tool has an embedding (index in embeddings array)
    pub has_embedding: bool,
    pub embedding_index: Option<u32>,
}

/// Output for a scored tool
#[napi(object)]
pub struct ToolScoringResult {
    pub tool_id: String,
    pub score: f64,
    pub pattern_score: f64,
    pub keyword_score: f64,
    pub embedding_score: f64,
    pub matched_pattern_count: u32,
    pub matched_keyword_count: u32,
}

/// Configuration for batch scoring
#[napi(object)]
pub struct BatchScoringConfig {
    pub pattern_weight: f64,
    pub keyword_weight: f64,
    pub embedding_weight: f64,
    pub early_termination_threshold: f64,
    pub min_score_threshold: f64,
}

impl Default for BatchScoringConfig {
    fn default() -> Self {
        BatchScoringConfig {
            pattern_weight: 0.4,
            keyword_weight: 0.3,
            embedding_weight: 0.3,
            early_termination_threshold: 0.95,
            min_score_threshold: 0.05,
        }
    }
}

/// Compiled tool profile for efficient scoring
struct CompiledToolProfile {
    tool_id: String,
    patterns: Vec<Regex>,
    keywords: HashMap<String, f64>,
    total_keyword_weight: f64,
    embedding_index: Option<usize>,
}

/// Tokenize query for keyword matching
fn tokenize_query(query: &str) -> HashSet<String> {
    query
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|s| s.len() > 2)
        .map(|s| s.to_string())
        .collect()
}

/// Score patterns for a single tool
fn score_patterns(query: &str, patterns: &[Regex]) -> (f64, u32) {
    if patterns.is_empty() {
        return (0.0, 0);
    }

    let match_count = patterns.iter().filter(|p| p.is_match(query)).count() as u32;
    let score = match_count as f64 / patterns.len() as f64;
    (score, match_count)
}

/// Score keywords for a single tool
fn score_keywords(
    query_tokens: &HashSet<String>,
    keywords: &HashMap<String, f64>,
    total_weight: f64,
) -> (f64, u32) {
    if keywords.is_empty() || query_tokens.is_empty() || total_weight == 0.0 {
        return (0.0, 0);
    }

    let mut matched_weight = 0.0;
    let mut match_count = 0u32;

    for (keyword, weight) in keywords {
        if query_tokens.contains(keyword) {
            matched_weight += weight;
            match_count += 1;
        }
    }

    (matched_weight / total_weight, match_count)
}

/// Batch score all tools against a query with parallel processing and early termination.
///
/// This is the main optimization function for the semantic router.
/// It compiles regex patterns once, scores all tools in parallel using Rayon,
/// and supports early termination when a high-confidence match is found.
///
/// # Arguments
/// * `query` - The user query to match against tools
/// * `profiles` - Array of tool profiles with patterns and keywords
/// * `query_embedding` - Optional query embedding (flat f32 array)
/// * `tool_embeddings` - Flat array of all tool embeddings (n * dim)
/// * `embedding_dim` - Dimension of embeddings (e.g., 1536 for OpenAI)
/// * `config` - Scoring configuration (weights, thresholds)
///
/// # Returns
/// Array of scoring results, sorted by score descending
#[napi]
pub fn batch_score_tools(
    query: String,
    profiles: Vec<ToolProfileInput>,
    query_embedding: Option<Float32Array>,
    tool_embeddings: Option<Float32Array>,
    embedding_dim: Option<u32>,
    config: Option<BatchScoringConfig>,
) -> Vec<ToolScoringResult> {
    let config = config.unwrap_or_default();
    let normalized_query = query.to_lowercase();
    let query_tokens = tokenize_query(&normalized_query);

    // Early termination flag shared across threads
    let found_high_confidence = Arc::new(AtomicBool::new(false));

    // Compile all tool profiles (this is the main optimization - compile once)
    let compiled_profiles: Vec<CompiledToolProfile> = profiles
        .into_iter()
        .filter_map(|p| {
            // Compile patterns, skip invalid ones
            let patterns: Vec<Regex> = p.patterns
                .iter()
                .filter_map(|pat| Regex::new(pat).ok())
                .collect();

            // Build keyword map
            let mut keywords = HashMap::new();
            let mut total_weight = 0.0;
            for i in 0..p.keywords_flat.len() {
                if i < p.keyword_weights_flat.len() {
                    let weight = p.keyword_weights_flat[i];
                    keywords.insert(p.keywords_flat[i].to_lowercase(), weight);
                    total_weight += weight;
                }
            }

            Some(CompiledToolProfile {
                tool_id: p.tool_id,
                patterns,
                keywords,
                total_keyword_weight: total_weight,
                embedding_index: if p.has_embedding { p.embedding_index.map(|i| i as usize) } else { None },
            })
        })
        .collect();

    // Pre-compute query norm for SIMD similarity
    let query_emb_slice: Option<&[f32]> = query_embedding.as_ref().map(|e| e.as_ref());
    let tool_emb_slice: Option<&[f32]> = tool_embeddings.as_ref().map(|e| e.as_ref());
    let dim = embedding_dim.unwrap_or(1536) as usize;

    let query_norm = query_emb_slice
        .map(|q| dot_product_simd_f32(q, q).sqrt())
        .unwrap_or(0.0);

    // Score all tools in parallel
    let mut results: Vec<ToolScoringResult> = compiled_profiles
        .par_iter()
        .filter_map(|profile| {
            // Check early termination
            if found_high_confidence.load(Ordering::Relaxed) {
                return None;
            }

            // Pattern scoring
            let (pattern_score, matched_patterns) = score_patterns(&normalized_query, &profile.patterns);

            // Keyword scoring
            let (keyword_score, matched_keywords) = score_keywords(
                &query_tokens,
                &profile.keywords,
                profile.total_keyword_weight,
            );

            // Embedding scoring (SIMD-accelerated)
            let embedding_score = match (query_emb_slice, tool_emb_slice, profile.embedding_index) {
                (Some(q), Some(all_emb), Some(idx)) if query_norm > 0.0 => {
                    let start = idx * dim;
                    let end = start + dim;
                    if end <= all_emb.len() {
                        let tool_emb = &all_emb[start..end];
                        let dot = dot_product_simd_f32(q, tool_emb);
                        let tool_norm = dot_product_simd_f32(tool_emb, tool_emb).sqrt();
                        if tool_norm > 0.0 {
                            (dot / (query_norm * tool_norm)) as f64
                        } else {
                            0.0
                        }
                    } else {
                        0.0
                    }
                }
                _ => 0.0,
            };

            // Combined score
            let score = config.pattern_weight * pattern_score
                + config.keyword_weight * keyword_score
                + config.embedding_weight * embedding_score;

            // Check for high-confidence match
            if score >= config.early_termination_threshold {
                found_high_confidence.store(true, Ordering::Relaxed);
            }

            // Filter low scores
            if score < config.min_score_threshold {
                return None;
            }

            Some(ToolScoringResult {
                tool_id: profile.tool_id.clone(),
                score,
                pattern_score,
                keyword_score,
                embedding_score,
                matched_pattern_count: matched_patterns,
                matched_keyword_count: matched_keywords,
            })
        })
        .collect();

    // Sort by score descending
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

    results
}

/// Pre-compiled pattern matcher for repeated scoring
/// Stores compiled regex patterns for efficient reuse across queries
#[napi]
pub struct PatternMatcher {
    patterns: HashMap<String, Vec<Regex>>,
}

#[napi]
impl PatternMatcher {
    /// Create a new pattern matcher
    #[napi(constructor)]
    pub fn new() -> Self {
        PatternMatcher {
            patterns: HashMap::new(),
        }
    }

    /// Add patterns for a tool (compiles regex once)
    #[napi]
    pub fn add_tool_patterns(&mut self, tool_id: String, patterns: Vec<String>) {
        let compiled: Vec<Regex> = patterns
            .iter()
            .filter_map(|p| Regex::new(p).ok())
            .collect();
        self.patterns.insert(tool_id, compiled);
    }

    /// Score a query against all registered tools
    /// Returns: [tool_id, score, tool_id, score, ...]
    #[napi]
    pub fn score_all_patterns(&self, query: String) -> Vec<String> {
        let normalized = query.to_lowercase();
        let mut results = Vec::new();

        for (tool_id, patterns) in &self.patterns {
            if patterns.is_empty() {
                continue;
            }
            let match_count = patterns.iter().filter(|p| p.is_match(&normalized)).count();
            let score = match_count as f64 / patterns.len() as f64;
            if score > 0.0 {
                results.push(tool_id.clone());
                results.push(score.to_string());
            }
        }

        results
    }

    /// Get the number of registered tools
    #[napi]
    pub fn tool_count(&self) -> u32 {
        self.patterns.len() as u32
    }
}

// ============================================================================
// BENCHMARKING
// ============================================================================

/// Get library version and capabilities.
#[napi(object)]
pub struct LibraryInfo {
    pub version: String,
    pub simd_available: bool,
    pub parallel_threads: u32,
}

#[napi]
pub fn get_library_info() -> LibraryInfo {
    LibraryInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        simd_available: true, // Auto-vectorized by LLVM
        parallel_threads: rayon::current_num_threads() as u32,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![1.0, 0.0, 0.0];
        assert!((cosine_similarity(a, b).unwrap() - 1.0).abs() < 0.001);

        let a = vec![1.0, 0.0, 0.0];
        let b = vec![0.0, 1.0, 0.0];
        assert!((cosine_similarity(a, b).unwrap() - 0.0).abs() < 0.001);
    }

    #[test]
    fn test_euclidean_distance() {
        // Same vector -> distance 0
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![1.0, 0.0, 0.0];
        assert!((euclidean_distance(a, b).unwrap() - 0.0).abs() < 0.001);

        // Unit vectors on different axes -> distance sqrt(2)
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![0.0, 1.0, 0.0];
        let expected = 2.0f64.sqrt();
        assert!((euclidean_distance(a, b).unwrap() - expected).abs() < 0.001);

        // Known distance: (0,0) to (3,4) = 5
        let a = vec![0.0, 0.0];
        let b = vec![3.0, 4.0];
        assert!((euclidean_distance(a, b).unwrap() - 5.0).abs() < 0.001);
    }

    #[test]
    fn test_euclidean_distance_f32_simd() {
        // Same vector -> distance 0
        let a = vec![1.0f32, 0.0, 0.0];
        let b = vec![1.0f32, 0.0, 0.0];
        assert!((euclidean_distance_f32_impl(&a, &b) - 0.0).abs() < 0.001);

        // Unit vectors on different axes -> distance sqrt(2)
        let a = vec![1.0f32, 0.0, 0.0];
        let b = vec![0.0f32, 1.0, 0.0];
        let expected = 2.0f32.sqrt();
        assert!((euclidean_distance_f32_impl(&a, &b) - expected).abs() < 0.001);

        // Test with 1536-dim vectors (OpenAI embedding size)
        let dim = 1536;
        let a: Vec<f32> = (0..dim).map(|i| i as f32 / dim as f32).collect();
        let b: Vec<f32> = (0..dim).map(|i| i as f32 / dim as f32 + 0.1).collect();
        let distance = euclidean_distance_f32_impl(&a, &b);
        // Distance should be about sqrt(1536 * 0.1^2) = sqrt(15.36) ≈ 3.92
        assert!(distance > 3.0 && distance < 5.0, "Expected ~3.92, got {}", distance);
    }

    #[test]
    fn test_text_similarity() {
        let a = "hello world".to_string();
        let b = "hello world".to_string();
        assert!((text_similarity(a, b, None) - 1.0).abs() < 0.001);

        let a = "hello world".to_string();
        let b = "goodbye world".to_string();
        let sim = text_similarity(a, b, None);
        assert!(sim > 0.0 && sim < 1.0);
    }

    #[test]
    fn test_minhash() {
        let text = "the quick brown fox".to_string();
        let sig = compute_minhash(text, 100, Some(3));
        assert_eq!(sig.signature.len(), 100);
    }

    #[test]
    fn test_lsh_duplicates() {
        let texts = vec![
            "the quick brown fox jumps".to_string(),
            "the quick brown fox jumps over".to_string(), // Similar
            "hello world goodbye".to_string(), // Different
        ];

        let duplicates = find_duplicates_lsh(texts, 0.5, Some(100), Some(20));
        assert!(!duplicates.is_empty());
        assert_eq!(duplicates[0].first_idx, 0);
        assert_eq!(duplicates[0].second_idx, 1);
    }

    // ========================================================================
    // F32 SIMD TESTS
    // ========================================================================

    #[test]
    fn test_simd_dot_product() {
        // Test with 16 elements (2 SIMD iterations)
        let a: Vec<f32> = (0..16).map(|i| i as f32).collect();
        let b: Vec<f32> = (0..16).map(|i| i as f32).collect();

        let result = dot_product_simd_f32(&a, &b);
        let expected: f32 = (0..16).map(|i| (i * i) as f32).sum();

        assert!((result - expected).abs() < 0.001, "Expected {}, got {}", expected, result);
    }

    #[test]
    fn test_simd_dot_product_remainder() {
        // Test with non-multiple of 8 (10 elements)
        let a: Vec<f32> = (0..10).map(|i| i as f32).collect();
        let b: Vec<f32> = (0..10).map(|i| i as f32).collect();

        let result = dot_product_simd_f32(&a, &b);
        let expected: f32 = (0..10).map(|i| (i * i) as f32).sum();

        assert!((result - expected).abs() < 0.001, "Expected {}, got {}", expected, result);
    }

    #[test]
    fn test_cosine_similarity_f32() {
        // Identical vectors -> 1.0
        let a = vec![1.0f32, 0.0, 0.0];
        let b = vec![1.0f32, 0.0, 0.0];
        assert!((cosine_similarity_f32_impl(&a, &b) - 1.0).abs() < 0.001);

        // Orthogonal vectors -> 0.0
        let a = vec![1.0f32, 0.0, 0.0];
        let b = vec![0.0f32, 1.0, 0.0];
        assert!((cosine_similarity_f32_impl(&a, &b) - 0.0).abs() < 0.001);

        // 45-degree angle -> ~0.707
        let a = vec![1.0f32, 0.0];
        let b = vec![1.0f32, 1.0];
        let expected = 1.0 / 2.0f32.sqrt(); // cos(45°)
        assert!((cosine_similarity_f32_impl(&a, &b) - expected).abs() < 0.01);
    }

    #[test]
    fn test_cosine_similarity_f32_large_vectors() {
        // Test with 1536-dim vectors (OpenAI embedding size)
        let dim = 1536;
        let a: Vec<f32> = (0..dim).map(|i| i as f32 / dim as f32).collect();
        let b: Vec<f32> = (0..dim).map(|i| i as f32 / dim as f32).collect();

        let similarity = cosine_similarity_f32_impl(&a, &b);
        assert!((similarity - 1.0).abs() < 0.001, "Same vectors should have similarity 1.0, got {}", similarity);
    }

    #[test]
    fn test_find_similar_pairs() {
        // Create 4 embeddings of dimension 8
        // First two are identical, third is similar, fourth is different
        let _dim = 8;
        let embeddings: Vec<f32> = vec![
            1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,  // 0: unit vector along x
            1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,  // 1: identical to 0
            0.9, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,  // 2: similar to 0
            0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,  // 3: orthogonal to 0
        ];

        // Test internal similarity function (doesn't need NAPI types)
        let emb_0 = &embeddings[0..8];
        let emb_1 = &embeddings[8..16];
        let emb_2 = &embeddings[16..24];
        let emb_3 = &embeddings[24..32];

        // (0,1) should be identical -> 1.0
        let sim_01 = cosine_similarity_f32_impl(emb_0, emb_1);
        assert!((sim_01 - 1.0).abs() < 0.001, "0 and 1 should be identical");

        // (0,2) should be similar -> high
        let sim_02 = cosine_similarity_f32_impl(emb_0, emb_2);
        assert!(sim_02 > 0.9, "0 and 2 should be similar");

        // (0,3) should be orthogonal -> 0
        let sim_03 = cosine_similarity_f32_impl(emb_0, emb_3);
        assert!(sim_03.abs() < 0.001, "0 and 3 should be orthogonal");
    }

    #[test]
    fn test_top_k_internal() {
        // Test internal similarity function with different vectors
        let query = vec![1.0f32, 0.0, 0.0, 0.0];
        let candidate_identical = vec![1.0f32, 0.0, 0.0, 0.0];
        let candidate_similar = vec![0.9f32, 0.1, 0.0, 0.0];
        let candidate_orthogonal = vec![0.0f32, 1.0, 0.0, 0.0];

        let sim_identical = cosine_similarity_f32_impl(&query, &candidate_identical);
        let sim_similar = cosine_similarity_f32_impl(&query, &candidate_similar);
        let sim_orthogonal = cosine_similarity_f32_impl(&query, &candidate_orthogonal);

        assert!((sim_identical - 1.0).abs() < 0.01, "Identical should be ~1.0");
        assert!(sim_similar > 0.9, "Similar should be high");
        assert!(sim_orthogonal.abs() < 0.01, "Orthogonal should be ~0.0");
    }

    // ========================================================================
    // BATCH TOOL SCORING TESTS
    // ========================================================================

    #[test]
    fn test_tokenize_query() {
        let tokens = tokenize_query("hello world! how are you?");
        assert!(tokens.contains("hello"));
        assert!(tokens.contains("world"));
        assert!(tokens.contains("how"));
        assert!(tokens.contains("are"));
        assert!(tokens.contains("you"));
        // Short words filtered
        assert!(!tokens.contains("a"));
    }

    #[test]
    fn test_score_patterns() {
        let patterns = vec![
            Regex::new(r"play.*music").unwrap(),
            Regex::new(r"listen to").unwrap(),
        ];

        let (score, count) = score_patterns("play some music please", &patterns);
        assert_eq!(count, 1);
        assert!((score - 0.5).abs() < 0.01);

        let (score, count) = score_patterns("listen to jazz music", &patterns);
        assert_eq!(count, 1);
        assert!((score - 0.5).abs() < 0.01);

        let (score, count) = score_patterns("something else", &patterns);
        assert_eq!(count, 0);
        assert!((score - 0.0).abs() < 0.01);
    }

    #[test]
    fn test_score_keywords() {
        let mut keywords = HashMap::new();
        keywords.insert("music".to_string(), 1.0);
        keywords.insert("jazz".to_string(), 0.5);
        keywords.insert("play".to_string(), 0.5);

        let mut tokens = HashSet::new();
        tokens.insert("play".to_string());
        tokens.insert("jazz".to_string());

        let (score, count) = score_keywords(&tokens, &keywords, 2.0);
        assert_eq!(count, 2);
        assert!((score - 0.5).abs() < 0.01); // (0.5 + 0.5) / 2.0
    }

    #[test]
    fn test_batch_score_tools_basic() {
        // Create two tool profiles
        let profiles = vec![
            ToolProfileInput {
                tool_id: "playMusic".to_string(),
                patterns: vec![r"play.*music".to_string(), r"listen to".to_string()],
                keywords_flat: vec!["music".to_string(), "play".to_string(), "song".to_string()],
                keyword_weights_flat: vec![1.0, 0.8, 0.6],
                has_embedding: false,
                embedding_index: None,
            },
            ToolProfileInput {
                tool_id: "setReminder".to_string(),
                patterns: vec![r"remind me".to_string(), r"set.*reminder".to_string()],
                keywords_flat: vec!["remind".to_string(), "reminder".to_string(), "alarm".to_string()],
                keyword_weights_flat: vec![1.0, 0.9, 0.5],
                has_embedding: false,
                embedding_index: None,
            },
        ];

        let results = batch_score_tools(
            "play some music".to_string(),
            profiles,
            None,
            None,
            None,
            None,
        );

        assert!(!results.is_empty());
        assert_eq!(results[0].tool_id, "playMusic");
        assert!(results[0].score > results.get(1).map(|r| r.score).unwrap_or(0.0));
    }

    #[test]
    fn test_pattern_matcher() {
        let mut matcher = PatternMatcher::new();
        matcher.add_tool_patterns("playMusic".to_string(), vec![
            r"play.*music".to_string(),
            r"listen to".to_string(),
        ]);
        matcher.add_tool_patterns("setReminder".to_string(), vec![
            r"remind me".to_string(),
        ]);

        assert_eq!(matcher.tool_count(), 2);

        let results = matcher.score_all_patterns("play some music".to_string());
        // Results are [tool_id, score, ...]
        assert!(!results.is_empty());
        let score_idx = results.iter().position(|s| s == "playMusic");
        assert!(score_idx.is_some());
    }
}

// ============================================================================
// JSON PARSER (SIMD-ACCELERATED)
// ============================================================================

/// Parsed function call from TTS stream
#[napi(object)]
pub struct NativeFunctionCall {
    /// Tool name
    pub fn_name: String,
    /// Arguments as JSON string
    pub args_json: String,
    /// Start position in original text
    pub start_pos: u32,
    /// End position in original text
    pub end_pos: u32,
}

/// Result of scanning text for function calls
#[napi(object)]
pub struct NativeScanResult {
    /// All detected function calls
    pub calls: Vec<NativeFunctionCall>,
    /// Text with function calls removed
    pub clean_text: String,
    /// Whether any function calls were found
    pub has_calls: bool,
}

/// Fast check if text likely contains a JSON function call
///
/// Uses SIMD-accelerated byte searching before regex
#[napi]
pub fn likely_contains_function_call(text: String) -> bool {
    json_parser::likely_contains_function_call(&text)
}

/// Extract function calls from TTS text using SIMD-accelerated parsing
///
/// Returns all function calls and the cleaned text
#[napi]
pub fn extract_function_calls(text: String) -> NativeScanResult {
    let result = json_parser::extract_function_calls(&text);

    NativeScanResult {
        calls: result.calls.into_iter().map(|c| NativeFunctionCall {
            fn_name: c.fn_name,
            args_json: c.args_json,
            start_pos: c.start_pos as u32,
            end_pos: c.end_pos as u32,
        }).collect(),
        clean_text: result.clean_text,
        has_calls: result.has_calls,
    }
}

/// Parse a single JSON function call string
///
/// Expected format: {"fn":"toolName","args":{...}}
#[napi]
pub fn parse_function_call(json_str: String) -> Option<NativeFunctionCall> {
    json_parser::parse_function_call(&json_str).map(|c| NativeFunctionCall {
        fn_name: c.fn_name,
        args_json: c.args_json,
        start_pos: c.start_pos as u32,
        end_pos: c.end_pos as u32,
    })
}

/// Register known tool names for faster detection
#[napi]
pub fn register_tool_names(names: Vec<String>) {
    json_parser::register_tool_names(&names);
}

/// Clear all registered tool names
#[napi]
pub fn clear_tool_names() {
    json_parser::clear_tool_names();
}

/// Check if a tool name is registered
#[napi]
pub fn is_known_tool(name: String) -> bool {
    json_parser::is_known_tool(&name)
}

/// Validate JSON string quickly using SIMD
#[napi]
pub fn is_valid_json(json_str: String) -> bool {
    json_parser::is_valid_json(&json_str)
}

/// Get count of registered tools
#[napi]
pub fn get_tool_count() -> u32 {
    json_parser::get_tool_count() as u32
}

/// Parse JSON to a value (returns JSON string of parsed result)
/// Uses SIMD-accelerated simd-json for 2-5x faster parsing
#[napi]
pub fn parse_json_fast(json_str: String) -> Option<String> {
    // Use serde_json::to_string instead of Display trait (.to_string())
    // because Display doesn't produce valid JSON for all types
    json_parser::parse_json_value(&json_str).and_then(|v| serde_json::to_string(&v).ok())
}

// ============================================================================
// SSML PROCESSOR (OPTIMIZED REGEX)
// ============================================================================

/// Extracted SSML tag
#[napi(object)]
pub struct NativeSsmlTag {
    /// Tag type (break, emotion, speed, etc.)
    pub tag_type: String,
    /// Full match text
    pub full_match: String,
    /// Start position
    pub start_pos: u32,
    /// End position
    pub end_pos: u32,
}

/// SSML analysis result
#[napi(object)]
pub struct NativeSsmlAnalysis {
    /// Number of tags found
    pub tag_count: u32,
    /// Plain text with SSML removed
    pub plain_text: String,
    /// Total break time in milliseconds
    pub total_break_ms: u32,
    /// Detected emotions
    pub emotions: Vec<String>,
    /// Speed modifiers found
    pub speeds: Vec<f64>,
    /// Has any SSML tags
    pub has_ssml: bool,
}

/// Fast check if text contains any SSML tags
#[napi]
pub fn contains_ssml(text: String) -> bool {
    ssml_processor::contains_ssml(&text)
}

/// Strip all SSML tags from text
#[napi]
pub fn strip_ssml(text: String) -> String {
    ssml_processor::strip_ssml(&text)
}

/// Analyze SSML in text and extract all tags
#[napi]
pub fn analyze_ssml(text: String) -> NativeSsmlAnalysis {
    let result = ssml_processor::analyze_ssml(&text);

    NativeSsmlAnalysis {
        tag_count: result.tags.len() as u32,
        plain_text: result.plain_text,
        total_break_ms: result.total_break_ms,
        emotions: result.emotions,
        speeds: result.speeds.into_iter().map(|s| s as f64).collect(),
        has_ssml: result.has_ssml,
    }
}

/// Batch analyze multiple texts in parallel
#[napi]
pub fn batch_analyze_ssml(texts: Vec<String>) -> Vec<NativeSsmlAnalysis> {
    ssml_processor::batch_analyze_ssml(texts)
        .into_iter()
        .map(|result| NativeSsmlAnalysis {
            tag_count: result.tags.len() as u32,
            plain_text: result.plain_text,
            total_break_ms: result.total_break_ms,
            emotions: result.emotions,
            speeds: result.speeds.into_iter().map(|s| s as f64).collect(),
            has_ssml: result.has_ssml,
        })
        .collect()
}

/// Extract break tags and their durations
#[napi]
pub fn extract_breaks(text: String) -> Vec<u32> {
    ssml_processor::extract_breaks(&text)
        .into_iter()
        .map(|(duration, _, _)| duration)
        .collect()
}

/// Extract emotion tags
#[napi]
pub fn extract_emotions(text: String) -> Vec<String> {
    ssml_processor::extract_emotions(&text)
        .into_iter()
        .map(|(emotion, _, _)| emotion)
        .collect()
}

/// Insert break tag at specified position
#[napi]
pub fn insert_break(text: String, position: u32, duration_ms: u32) -> String {
    ssml_processor::insert_break(&text, position as usize, duration_ms)
}

/// Insert emotion tag at specified position
#[napi]
pub fn insert_emotion(text: String, position: u32, emotion: String) -> String {
    ssml_processor::insert_emotion(&text, position as usize, &emotion)
}

/// Wrap text with speed modifier
#[napi]
pub fn wrap_with_speed(text: String, speed_ratio: f64) -> String {
    ssml_processor::wrap_with_speed(&text, speed_ratio as f32)
}

/// Register custom regex pattern for matching
#[napi]
pub fn register_custom_pattern(name: String, pattern: String) -> bool {
    ssml_processor::register_custom_pattern(&name, &pattern)
}

/// Match custom pattern and return matches
#[napi]
pub fn match_custom_pattern(name: String, text: String) -> Vec<String> {
    ssml_processor::match_custom_pattern(&name, &text)
        .into_iter()
        .map(|(match_text, _, _)| match_text)
        .collect()
}

/// Clear all custom patterns
#[napi]
pub fn clear_custom_patterns() {
    ssml_processor::clear_custom_patterns();
}

// ============================================================================
// TIME-SERIES FORECASTING (SIMD-ACCELERATED)
// ============================================================================
//
// SIMD-optimized statistical functions for time-series analysis.
// Used by src/intelligence/predictive/time-series-forecaster.ts
//
// Functions:
// - calculate_statistics_f32: Mean, variance, min, max in single pass (SIMD)
// - calculate_linear_trend_f32: Linear regression slope (SIMD)
// - exponential_smoothing_f32: Holt's double exponential (SIMD)
// - calculate_seasonality_f32: Seasonal decomposition (SIMD)

/// Statistics result for time-series data
#[napi(object)]
pub struct TimeSeriesStats {
    pub mean: f64,
    pub variance: f64,
    pub std_dev: f64,
    pub min: f64,
    pub max: f64,
    pub count: u32,
}

/// Internal implementation of statistics calculation (no NAPI types)
fn calculate_statistics_f32_impl(data: &[f32]) -> TimeSeriesStats {
    let n = data.len();

    if n == 0 {
        return TimeSeriesStats {
            mean: 0.0, variance: 0.0, std_dev: 0.0,
            min: 0.0, max: 0.0, count: 0,
        };
    }

    let chunks = n / 8;

    // SIMD sum for mean
    let mut sum_vec = f32x8::ZERO;
    let mut min_vec = f32x8::splat(f32::MAX);
    let mut max_vec = f32x8::splat(f32::MIN);

    for i in 0..chunks {
        let start = i * 8;
        let v = f32x8::from(&data[start..start + 8]);
        sum_vec += v;
        min_vec = min_vec.min(v);
        max_vec = max_vec.max(v);
    }

    // Reduce SIMD vectors to scalars
    let sum_arr: [f32; 8] = sum_vec.into();
    let min_arr: [f32; 8] = min_vec.into();
    let max_arr: [f32; 8] = max_vec.into();

    let mut sum: f32 = sum_arr.iter().sum();
    let mut min_val: f32 = min_arr.iter().copied().fold(f32::MAX, f32::min);
    let mut max_val: f32 = max_arr.iter().copied().fold(f32::MIN, f32::max);

    // Handle remainder
    for i in (chunks * 8)..n {
        sum += data[i];
        min_val = min_val.min(data[i]);
        max_val = max_val.max(data[i]);
    }

    let mean = sum / n as f32;

    // Second pass for variance (SIMD)
    let mean_vec = f32x8::splat(mean);
    let mut var_sum_vec = f32x8::ZERO;

    for i in 0..chunks {
        let start = i * 8;
        let v = f32x8::from(&data[start..start + 8]);
        let diff = v - mean_vec;
        var_sum_vec += diff * diff;
    }

    let var_arr: [f32; 8] = var_sum_vec.into();
    let mut var_sum: f32 = var_arr.iter().sum();

    for i in (chunks * 8)..n {
        let diff = data[i] - mean;
        var_sum += diff * diff;
    }

    let variance = var_sum / n as f32;
    let std_dev = variance.sqrt();

    TimeSeriesStats {
        mean: mean as f64,
        variance: variance as f64,
        std_dev: std_dev as f64,
        min: min_val as f64,
        max: max_val as f64,
        count: n as u32,
    }
}

/// SIMD-accelerated single-pass statistics calculation.
/// Computes mean, variance, min, max in one pass through the data.
#[napi]
pub fn calculate_statistics_f32(values: Float32Array) -> TimeSeriesStats {
    let data: &[f32] = &values;
    calculate_statistics_f32_impl(data)
}

/// SIMD-accelerated linear regression (least squares).
/// Returns the slope of the best-fit line.
#[napi]
pub fn calculate_linear_trend_f32(values: Float32Array) -> f64 {
    let data: &[f32] = &values;
    let n = data.len();

    if n < 2 {
        return 0.0;
    }

    // Linear regression: y = mx + b
    // m = (n*Σxy - Σx*Σy) / (n*Σx² - (Σx)²)
    // For x = 0,1,2,...,n-1: Σx = n(n-1)/2, Σx² = n(n-1)(2n-1)/6

    let n_f = n as f32;
    let sum_x = n_f * (n_f - 1.0) / 2.0;
    let sum_x2 = n_f * (n_f - 1.0) * (2.0 * n_f - 1.0) / 6.0;

    // SIMD for Σy and Σxy
    let chunks = n / 8;
    let mut sum_y_vec = f32x8::ZERO;
    let mut sum_xy_vec = f32x8::ZERO;

    for i in 0..chunks {
        let start = i * 8;
        let y_vec = f32x8::from(&data[start..start + 8]);
        let x_vec = f32x8::from([
            start as f32, (start + 1) as f32, (start + 2) as f32, (start + 3) as f32,
            (start + 4) as f32, (start + 5) as f32, (start + 6) as f32, (start + 7) as f32,
        ]);

        sum_y_vec += y_vec;
        sum_xy_vec += x_vec * y_vec;
    }

    let sum_y_arr: [f32; 8] = sum_y_vec.into();
    let sum_xy_arr: [f32; 8] = sum_xy_vec.into();

    let mut sum_y: f32 = sum_y_arr.iter().sum();
    let mut sum_xy: f32 = sum_xy_arr.iter().sum();

    // Handle remainder
    for i in (chunks * 8)..n {
        sum_y += data[i];
        sum_xy += i as f32 * data[i];
    }

    let denominator = n_f * sum_x2 - sum_x * sum_x;
    if denominator == 0.0 {
        return 0.0;
    }

    let slope = (n_f * sum_xy - sum_x * sum_y) / denominator;

    if slope.is_nan() { 0.0 } else { slope as f64 }
}

/// Holt's double exponential smoothing result
#[napi(object)]
pub struct ExponentialSmoothingResult {
    /// Smoothed level
    pub level: f64,
    /// Trend component
    pub trend: f64,
    /// Forecast (level + trend)
    pub forecast: f64,
}

/// SIMD-accelerated Holt's double exponential smoothing.
/// Returns the final smoothed values for forecasting.
#[napi]
pub fn exponential_smoothing_f32(
    values: Float32Array,
    alpha: f64,
    beta: f64,
) -> ExponentialSmoothingResult {
    let data: &[f32] = &values;
    let alpha_f = alpha as f32;
    let beta_f = beta as f32;

    if data.is_empty() {
        return ExponentialSmoothingResult {
            level: 0.0, trend: 0.0, forecast: 0.0,
        };
    }

    if data.len() == 1 {
        return ExponentialSmoothingResult {
            level: data[0] as f64,
            trend: 0.0,
            forecast: data[0] as f64,
        };
    }

    // Initialize
    let mut level = data[0];
    let mut trend = data[1] - data[0];

    // Process in SIMD chunks where possible
    // Note: Exponential smoothing has sequential dependency,
    // but we can still use SIMD for the arithmetic within each step
    for i in 1..data.len() {
        let prev_level = level;
        level = alpha_f * data[i] + (1.0 - alpha_f) * (prev_level + trend);
        trend = beta_f * (level - prev_level) + (1.0 - beta_f) * trend;
    }

    ExponentialSmoothingResult {
        level: level as f64,
        trend: trend as f64,
        forecast: (level + trend) as f64,
    }
}

/// Seasonality analysis result
#[napi(object)]
pub struct SeasonalityResult {
    /// Detected seasonality strength (0-1)
    pub strength: f64,
    /// Detected period (if any)
    pub period: u32,
    /// Seasonal indices for each period position
    pub indices: Vec<f64>,
}

/// SIMD-accelerated seasonality detection.
/// Analyzes data for periodic patterns.
#[napi]
pub fn calculate_seasonality_f32(
    values: Float32Array,
    max_period: u32,
) -> SeasonalityResult {
    let data: &[f32] = &values;
    let n = data.len();

    if n < 4 || max_period < 2 {
        return SeasonalityResult {
            strength: 0.0, period: 0, indices: vec![],
        };
    }

    // Calculate overall mean using SIMD (use internal impl, no NAPI types)
    let stats = calculate_statistics_f32_impl(data);
    let mean = stats.mean as f32;

    let mut best_strength = 0.0f32;
    let mut best_period = 0u32;

    // Try each period from 2 to max_period
    for period in 2..=max_period.min(n as u32 / 2) {
        let p = period as usize;

        // Calculate seasonal averages
        let mut seasonal_sums = vec![0.0f32; p];
        let mut seasonal_counts = vec![0u32; p];

        for (i, &val) in data.iter().enumerate() {
            seasonal_sums[i % p] += val;
            seasonal_counts[i % p] += 1;
        }

        let seasonal_means: Vec<f32> = seasonal_sums.iter()
            .zip(seasonal_counts.iter())
            .map(|(&sum, &count)| if count > 0 { sum / count as f32 } else { mean })
            .collect();

        // Calculate variance explained by seasonality
        let mut ss_seasonal = 0.0f32;
        for (i, &sm) in seasonal_means.iter().enumerate() {
            let count = seasonal_counts[i] as f32;
            ss_seasonal += count * (sm - mean).powi(2);
        }

        let strength = (ss_seasonal / (stats.variance as f32 * n as f32 + 1e-10)).sqrt().min(1.0);

        if strength > best_strength {
            best_strength = strength;
            best_period = period;
        }
    }

    // Calculate seasonal indices for best period
    let indices = if best_period > 0 {
        let p = best_period as usize;
        let mut seasonal_sums = vec![0.0f32; p];
        let mut seasonal_counts = vec![0u32; p];

        for (i, &val) in data.iter().enumerate() {
            seasonal_sums[i % p] += val;
            seasonal_counts[i % p] += 1;
        }

        seasonal_sums.iter()
            .zip(seasonal_counts.iter())
            .map(|(&sum, &count)| {
                if count > 0 { (sum / count as f32 / mean) as f64 } else { 1.0 }
            })
            .collect()
    } else {
        vec![]
    };

    SeasonalityResult {
        strength: best_strength as f64,
        period: best_period,
        indices,
    }
}

/// Batch statistics for multiple time series in parallel
#[napi]
pub fn batch_calculate_statistics_f32(
    series_flat: Float32Array,
    series_lengths: Vec<u32>,
) -> Vec<TimeSeriesStats> {
    let data: &[f32] = &series_flat;

    // Calculate offsets
    let mut offsets = Vec::with_capacity(series_lengths.len());
    let mut current_offset = 0usize;
    for &len in &series_lengths {
        offsets.push(current_offset);
        current_offset += len as usize;
    }

    // Process in parallel using internal impl (no NAPI types)
    offsets.par_iter()
        .zip(series_lengths.par_iter())
        .map(|(&offset, &len)| {
            let end = (offset + len as usize).min(data.len());
            let slice = &data[offset..end];
            calculate_statistics_f32_impl(slice)
        })
        .collect()
}

// ============================================================================
// GUIDANCE BLOCK STRIPPING (AHO-CORASICK)
// ============================================================================
//
// Fast guidance block detection and removal using Aho-Corasick.
// Used by src/agents/shared/sanitizer/streams/transform-stream.ts
//
// Replaces 7 regex patterns with O(n) multi-pattern matching.

lazy_static::lazy_static! {
    /// Pre-compiled automaton for guidance block markers
    static ref GUIDANCE_AUTOMATON: RwLock<Option<AhoCorasick>> = RwLock::new(None);

    /// Guidance block patterns (open/close pairs)
    /// Note: Markdown patterns include common spacing variations since Aho-Corasick is literal
    static ref GUIDANCE_PATTERNS: Vec<(&'static str, &'static str)> = vec![
        // XML-style patterns
        ("<guidance>", "</guidance>"),
        ("<internal>", "</internal>"),
        ("<system>", "</system>"),
        // Bracket-style patterns
        ("[guidance]", "[/guidance]"),
        ("[internal]", "[/internal]"),
        ("[system]", "[/system]"),
        // Markdown-style patterns (common spacing variations)
        ("---guidance---", "---end guidance---"),
        ("--- guidance ---", "--- end guidance ---"),
        ("---guidance ---", "---end guidance ---"),
        ("--- guidance---", "--- end guidance---"),
    ];
}

/// Build the guidance block automaton (call once at startup)
#[napi]
pub fn build_guidance_automaton() -> bool {
    // Collect all open and close markers
    let mut patterns = Vec::new();
    for (open, close) in GUIDANCE_PATTERNS.iter() {
        patterns.push(open.to_string());
        patterns.push(close.to_string());
    }

    let result = AhoCorasick::builder()
        .ascii_case_insensitive(true)
        .build(&patterns);

    match result {
        Ok(ac) => {
            let mut automaton = GUIDANCE_AUTOMATON.write().unwrap();
            *automaton = Some(ac);
            true
        }
        Err(_) => false,
    }
}

/// Strip guidance blocks from text using pre-built automaton.
/// Returns cleaned text with all guidance blocks removed.
#[napi]
pub fn strip_guidance_blocks(text: String) -> String {
    let automaton = GUIDANCE_AUTOMATON.read().unwrap();

    if automaton.is_none() {
        // Fallback: simple substring removal
        return strip_guidance_blocks_simple(&text);
    }

    let ac = automaton.as_ref().unwrap();
    let mut result = String::with_capacity(text.len());
    let mut last_end = 0usize;
    let mut in_block = false;
    let mut block_close: Option<&str> = None;

    for mat in ac.find_iter(&text) {
        let pattern_idx = mat.pattern().as_u32() as usize;
        let is_open = pattern_idx % 2 == 0;
        let pair_idx = pattern_idx / 2;

        if is_open && !in_block {
            // Start of guidance block - copy text before it
            result.push_str(&text[last_end..mat.start()]);
            in_block = true;
            block_close = Some(GUIDANCE_PATTERNS[pair_idx].1);
        } else if !is_open && in_block {
            // End of guidance block
            if let Some(expected_close) = block_close {
                let matched_text = &text[mat.start()..mat.end()];
                if matched_text.eq_ignore_ascii_case(expected_close) {
                    in_block = false;
                    block_close = None;
                    last_end = mat.end();
                }
            }
        }
    }

    // Append remaining text if not in block
    if !in_block {
        result.push_str(&text[last_end..]);
    }

    result.trim().to_string()
}

/// Simple fallback for guidance stripping (no automaton)
fn strip_guidance_blocks_simple(text: &str) -> String {
    let mut result = text.to_string();

    // Process each pattern pair
    for (open, close) in GUIDANCE_PATTERNS.iter() {
        loop {
            let open_lower = open.to_lowercase();
            let close_lower = close.to_lowercase();
            let text_lower = result.to_lowercase();

            if let Some(start) = text_lower.find(&open_lower) {
                if let Some(end_rel) = text_lower[start..].find(&close_lower) {
                    let end = start + end_rel + close.len();
                    result = format!("{}{}", &result[..start], &result[end..]);
                    continue;
                }
            }
            break;
        }
    }

    result.trim().to_string()
}

/// Check if text contains any guidance blocks (fast check)
#[napi]
pub fn contains_guidance_blocks(text: String) -> bool {
    let automaton = GUIDANCE_AUTOMATON.read().unwrap();

    if let Some(ref ac) = *automaton {
        ac.find(&text).is_some()
    } else {
        // Fallback check
        let lower = text.to_lowercase();
        GUIDANCE_PATTERNS.iter().any(|(open, _)| lower.contains(&open.to_lowercase()))
    }
}

/// Clear the guidance automaton
#[napi]
pub fn clear_guidance_automaton() {
    let mut automaton = GUIDANCE_AUTOMATON.write().unwrap();
    *automaton = None;
}

// ============================================================================
// INJECTION DEDUPLICATION (SEMANTIC SIMILARITY)
// ============================================================================

/// Common English stopwords to filter from keyword extraction
const STOPWORDS: &[&str] = &[
    "a", "an", "the", "and", "or", "but", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "this", "that", "these", "those", "i", "you",
    "he", "she", "it", "we", "they", "what", "which", "who", "whom", "this", "that",
    "am", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
    "having", "do", "does", "did", "doing", "a", "an", "the", "and", "but", "if",
    "or", "because", "as", "until", "while", "of", "at", "by", "for", "with",
    "about", "against", "between", "into", "through", "during", "before", "after",
    "above", "below", "to", "from", "up", "down", "in", "out", "on", "off", "over",
    "under", "again", "further", "then", "once", "here", "there", "when", "where",
    "why", "how", "all", "each", "few", "more", "most", "other", "some", "such",
    "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "just",
    "now", "also", "well", "even", "still", "already", "really", "like", "just",
];

/// Semantic clusters - words that are related and shouldn't be marked as duplicates
/// when they appear in different injections
const SEMANTIC_CLUSTERS: &[&[&str]] = &[
    &["user", "person", "human", "individual", "they", "them"],
    &["feel", "feeling", "emotion", "emotional", "mood", "sentiment"],
    &["remember", "memory", "recall", "recollect"],
    &["think", "thought", "believe", "consider"],
    &["say", "said", "speak", "tell", "told", "mention"],
    &["want", "need", "desire", "wish", "hope"],
    &["good", "great", "nice", "positive", "well"],
    &["bad", "negative", "poor", "difficult"],
    &["help", "support", "assist", "aid"],
    &["time", "moment", "period", "duration"],
    &["talk", "conversation", "discuss", "chat"],
    &["life", "living", "existence"],
    &["work", "job", "career", "profession"],
    &["family", "relative", "relation"],
    &["friend", "friendship", "companion"],
];

lazy_static::lazy_static! {
    static ref STOPWORD_SET: HashSet<&'static str> = STOPWORDS.iter().copied().collect();

    static ref CLUSTER_MAP: HashMap<&'static str, usize> = {
        let mut map = HashMap::new();
        for (idx, cluster) in SEMANTIC_CLUSTERS.iter().enumerate() {
            for word in *cluster {
                map.insert(*word, idx);
            }
        }
        map
    };
}

/// Extract keywords from text, filtering stopwords
fn extract_keywords(text: &str) -> HashSet<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|word| word.len() > 2 && !STOPWORD_SET.contains(word))
        .map(|s| s.to_string())
        .collect()
}

/// Compute Jaccard similarity between two keyword sets
fn jaccard_similarity_sets(a: &HashSet<String>, b: &HashSet<String>) -> f64 {
    if a.is_empty() && b.is_empty() {
        return 1.0;
    }
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }

    let intersection = a.intersection(b).count();
    let union = a.len() + b.len() - intersection;

    if union == 0 { 0.0 } else { intersection as f64 / union as f64 }
}

/// Check if two words are in the same semantic cluster
fn are_semantically_related(word1: &str, word2: &str) -> bool {
    if let (Some(cluster1), Some(cluster2)) = (CLUSTER_MAP.get(word1), CLUSTER_MAP.get(word2)) {
        cluster1 == cluster2
    } else {
        false
    }
}

/// Enhanced similarity that accounts for semantic clusters
fn semantic_similarity(keywords1: &HashSet<String>, keywords2: &HashSet<String>) -> f64 {
    if keywords1.is_empty() && keywords2.is_empty() {
        return 1.0;
    }
    if keywords1.is_empty() || keywords2.is_empty() {
        return 0.0;
    }

    // Count exact matches
    let exact_matches = keywords1.intersection(keywords2).count();

    // Count semantic matches (words in same cluster but not exact)
    let mut semantic_matches = 0;
    for w1 in keywords1 {
        if !keywords2.contains(w1) {
            for w2 in keywords2 {
                if are_semantically_related(w1, w2) {
                    semantic_matches += 1;
                    break;
                }
            }
        }
    }

    let total_matches = exact_matches + semantic_matches / 2; // Semantic matches count half
    let union = keywords1.len() + keywords2.len() - exact_matches;

    if union == 0 { 0.0 } else { total_matches as f64 / union as f64 }
}

/// Input injection for deduplication
#[napi(object)]
pub struct InjectionInput {
    pub id: String,
    pub content: String,
    pub priority: f64,
    pub source: String,
}

/// Result of deduplication - which injections to keep
#[napi(object)]
pub struct DeduplicationResult {
    /// IDs of injections to keep (in order)
    pub keep_ids: Vec<String>,
    /// IDs of duplicates that were removed
    pub removed_ids: Vec<String>,
    /// Number of comparisons made
    pub comparisons: u32,
}

/// Deduplicate injections based on semantic similarity.
/// Returns IDs of injections to keep and those removed.
///
/// # Arguments
/// * `injections` - Array of injection inputs
/// * `similarity_threshold` - Threshold for considering duplicates (0-1), default 0.7
///
/// # Algorithm
/// 1. Extract keywords from each injection
/// 2. For each pair, compute semantic similarity
/// 3. When duplicates found, keep the one with higher priority (or first if equal)
#[napi]
pub fn deduplicate_injections(
    injections: Vec<InjectionInput>,
    similarity_threshold: Option<f64>,
) -> DeduplicationResult {
    let threshold = similarity_threshold.unwrap_or(0.7);

    if injections.is_empty() {
        return DeduplicationResult {
            keep_ids: vec![],
            removed_ids: vec![],
            comparisons: 0,
        };
    }

    // Pre-compute keywords for all injections
    let keywords: Vec<HashSet<String>> = injections
        .iter()
        .map(|inj| extract_keywords(&inj.content))
        .collect();

    let mut removed: HashSet<usize> = HashSet::new();
    let mut comparisons = 0u32;

    // Compare each pair
    for i in 0..injections.len() {
        if removed.contains(&i) {
            continue;
        }

        for j in (i + 1)..injections.len() {
            if removed.contains(&j) {
                continue;
            }

            comparisons += 1;
            let similarity = semantic_similarity(&keywords[i], &keywords[j]);

            if similarity >= threshold {
                // Keep the one with higher priority, or first if equal
                if injections[j].priority > injections[i].priority {
                    removed.insert(i);
                    break; // i is removed, no need to compare further
                } else {
                    removed.insert(j);
                }
            }
        }
    }

    let keep_ids: Vec<String> = injections
        .iter()
        .enumerate()
        .filter(|(idx, _)| !removed.contains(idx))
        .map(|(_, inj)| inj.id.clone())
        .collect();

    let removed_ids: Vec<String> = injections
        .iter()
        .enumerate()
        .filter(|(idx, _)| removed.contains(idx))
        .map(|(_, inj)| inj.id.clone())
        .collect();

    DeduplicationResult {
        keep_ids,
        removed_ids,
        comparisons,
    }
}

/// Compute Jaccard similarity between two texts using keywords
#[napi]
pub fn keyword_jaccard_similarity(text1: String, text2: String) -> f64 {
    let keywords1 = extract_keywords(&text1);
    let keywords2 = extract_keywords(&text2);
    jaccard_similarity_sets(&keywords1, &keywords2)
}

/// Compute semantic similarity between two texts (accounts for related words)
#[napi]
pub fn text_semantic_similarity(text1: String, text2: String) -> f64 {
    let keywords1 = extract_keywords(&text1);
    let keywords2 = extract_keywords(&text2);
    semantic_similarity(&keywords1, &keywords2)
}

// ============================================================================
// MESSAGE ANALYSIS (NLP)
// ============================================================================

// Pre-compiled patterns for wrap-up detection
lazy_static::lazy_static! {
    static ref WRAP_UP_PATTERNS: Vec<Regex> = vec![
        Regex::new(r"(?i)\b(bye|goodbye|see you|talk later|gotta go|have to go|need to go)\b").unwrap(),
        Regex::new(r"(?i)\b(that's all|that's it|nothing else|all set|all done)\b").unwrap(),
        Regex::new(r"(?i)\b(thanks?|thank you|appreciate)\s*(for|you|!|\.|\s*$)").unwrap(),
        Regex::new(r"(?i)\b(good\s*(night|bye)|take care|catch you later)\b").unwrap(),
        Regex::new(r"(?i)\b(heading out|logging off|signing off|gotta run)\b").unwrap(),
    ];

    static ref QUESTION_PATTERN: Regex = Regex::new(r"\?\s*$").unwrap();

    static ref GREETING_PATTERNS: Vec<Regex> = vec![
        Regex::new(r"(?i)^(hey|hi|hello|good\s*(morning|afternoon|evening)|howdy|yo)\b").unwrap(),
        Regex::new(r"(?i)^(what's up|sup|how are you|how's it going)\b").unwrap(),
    ];
}

/// Positive emotion keywords
const POSITIVE_EMOTIONS: &[&str] = &[
    "happy", "excited", "glad", "thrilled", "joyful", "grateful", "thankful",
    "optimistic", "hopeful", "content", "peaceful", "calm", "relaxed",
    "proud", "confident", "energized", "motivated", "inspired", "amazing",
    "wonderful", "fantastic", "great", "awesome", "love", "loving"
];

/// Negative emotion keywords
const NEGATIVE_EMOTIONS: &[&str] = &[
    "sad", "upset", "angry", "frustrated", "anxious", "worried", "stressed",
    "overwhelmed", "tired", "exhausted", "depressed", "lonely", "hurt",
    "disappointed", "confused", "scared", "afraid", "nervous", "uncomfortable",
    "annoyed", "irritated", "miserable", "hopeless", "terrible", "awful"
];

/// Neutral/processing keywords
const NEUTRAL_EMOTIONS: &[&str] = &[
    "okay", "fine", "alright", "thinking", "considering", "wondering",
    "curious", "interested", "uncertain", "unsure", "hmm", "meh"
];

/// Result of message analysis
#[napi(object)]
pub struct MessageAnalysisResult {
    /// Whether the message is a wrap-up signal
    pub is_wrap_up: bool,
    /// Confidence in wrap-up detection (0-1)
    pub wrap_up_confidence: f64,
    /// Whether the message is a question
    pub is_question: bool,
    /// Whether the message is a greeting
    pub is_greeting: bool,
    /// Detected sentiment (-1 to 1)
    pub sentiment: f64,
    /// Dominant emotion category
    pub emotion_category: String,
    /// Word count
    pub word_count: u32,
    /// Character count
    pub char_count: u32,
    /// Keywords extracted
    pub keywords: Vec<String>,
}

/// Analyze a user message for various signals.
///
/// Detects:
/// - Wrap-up signals (goodbye, thanks, etc.)
/// - Questions
/// - Greetings
/// - Sentiment/emotion
/// - Basic statistics
#[napi]
pub fn analyze_message(text: String) -> MessageAnalysisResult {
    let lowercase = text.to_lowercase();

    // Wrap-up detection
    let mut wrap_up_matches = 0;
    for pattern in WRAP_UP_PATTERNS.iter() {
        if pattern.is_match(&lowercase) {
            wrap_up_matches += 1;
        }
    }
    let is_wrap_up = wrap_up_matches > 0;
    let wrap_up_confidence = (wrap_up_matches as f64 / WRAP_UP_PATTERNS.len() as f64).min(1.0);

    // Question detection
    let is_question = QUESTION_PATTERN.is_match(&text);

    // Greeting detection
    let is_greeting = GREETING_PATTERNS.iter().any(|p| p.is_match(&lowercase));

    // Sentiment/emotion analysis
    let words: Vec<&str> = lowercase
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .collect();

    let word_count = words.len() as u32;
    let char_count = text.chars().count() as u32;

    let mut positive_count = 0;
    let mut negative_count = 0;
    let mut neutral_count = 0;

    for word in &words {
        if POSITIVE_EMOTIONS.contains(word) {
            positive_count += 1;
        } else if NEGATIVE_EMOTIONS.contains(word) {
            negative_count += 1;
        } else if NEUTRAL_EMOTIONS.contains(word) {
            neutral_count += 1;
        }
    }

    // Calculate sentiment (-1 to 1)
    let total_emotional = positive_count + negative_count + neutral_count;
    let sentiment = if total_emotional > 0 {
        (positive_count as f64 - negative_count as f64) / total_emotional as f64
    } else {
        0.0
    };

    // Determine emotion category
    let emotion_category = if positive_count > negative_count && positive_count > neutral_count {
        "positive".to_string()
    } else if negative_count > positive_count && negative_count > neutral_count {
        "negative".to_string()
    } else if neutral_count > 0 {
        "neutral".to_string()
    } else {
        "unknown".to_string()
    };

    // Extract keywords
    let keywords = extract_keywords(&text).into_iter().collect();

    MessageAnalysisResult {
        is_wrap_up,
        wrap_up_confidence,
        is_question,
        is_greeting,
        sentiment,
        emotion_category,
        word_count,
        char_count,
        keywords,
    }
}

/// Batch analyze multiple messages in parallel
#[napi]
pub fn batch_analyze_messages(messages: Vec<String>) -> Vec<MessageAnalysisResult> {
    messages
        .par_iter()
        .map(|msg| analyze_message(msg.clone()))
        .collect()
}

// ============================================================================
// EMOTIONAL STATE DETECTION
// ============================================================================

/// Voice emotional indicators
#[napi(object)]
pub struct VoiceEmotionInput {
    /// Speech rate relative to normal (1.0 = normal)
    pub speech_rate: f64,
    /// Volume level relative to normal (1.0 = normal)
    pub volume: f64,
    /// Pitch variation (0-1, higher = more variation)
    pub pitch_variation: f64,
    /// Pause frequency (pauses per 100 words)
    pub pause_frequency: f64,
}

/// Emotional state result
#[napi(object)]
pub struct EmotionalStateResult {
    /// Primary detected emotion
    pub primary_emotion: String,
    /// Confidence in primary emotion (0-1)
    pub confidence: f64,
    /// Emotional intensity (0-1)
    pub intensity: f64,
    /// Whether there's a voice-text mismatch
    pub has_mismatch: bool,
    /// Description of mismatch if present
    pub mismatch_description: String,
    /// Suggested response tone
    pub suggested_tone: String,
}

/// Detect emotional state from text and optional voice indicators.
///
/// Combines text sentiment with voice prosody to detect:
/// - Primary emotion
/// - Emotional intensity
/// - Voice-text mismatches (e.g., saying "I'm fine" with stressed voice)
#[napi]
pub fn detect_emotional_state(
    text: String,
    voice: Option<VoiceEmotionInput>,
) -> EmotionalStateResult {
    // Analyze text first
    let text_analysis = analyze_message(text.clone());

    // Determine text-based emotion
    let text_emotion = &text_analysis.emotion_category;
    let text_sentiment = text_analysis.sentiment;

    // Default intensity from text
    let mut intensity = text_sentiment.abs();

    // Voice analysis if provided
    let voice_emotion: Option<String>;
    let mut has_mismatch = false;
    let mut mismatch_description = String::new();

    if let Some(v) = &voice {
        // Detect voice emotion from prosody
        let is_stressed = v.speech_rate > 1.3 || v.volume > 1.3 || v.pitch_variation > 0.6;
        let is_low_energy = v.speech_rate < 0.7 || v.volume < 0.6;
        let is_hesitant = v.pause_frequency > 5.0;

        voice_emotion = Some(if is_stressed {
            "stressed".to_string()
        } else if is_low_energy {
            "low_energy".to_string()
        } else if is_hesitant {
            "uncertain".to_string()
        } else {
            "neutral".to_string()
        });

        // Check for mismatch
        let ve = voice_emotion.as_ref().unwrap();
        if text_emotion == "positive" && (ve == "stressed" || ve == "low_energy") {
            has_mismatch = true;
            mismatch_description = format!(
                "Text sounds positive but voice indicates {} - may be masking",
                ve
            );
            intensity = 0.8; // Higher intensity for mismatch
        } else if text_emotion == "neutral" && ve == "stressed" {
            has_mismatch = true;
            mismatch_description = "Neutral words but stressed voice - possible unexpressed concern".to_string();
            intensity = 0.7;
        }

        // Adjust intensity based on voice
        if is_stressed {
            intensity = intensity.max(0.7);
        }
    } else {
        voice_emotion = None;
    }

    // Determine primary emotion
    let primary_emotion = if has_mismatch {
        voice_emotion.unwrap_or_else(|| text_emotion.clone())
    } else {
        text_emotion.clone()
    };

    // Determine confidence
    let confidence = if has_mismatch {
        0.6 // Lower confidence when there's a mismatch
    } else if voice.is_some() {
        0.85 // Higher confidence with voice data
    } else {
        0.7 // Moderate confidence with text only
    };

    // Suggest response tone
    let suggested_tone = match primary_emotion.as_str() {
        "positive" => "warm and encouraging".to_string(),
        "negative" | "stressed" => "gentle and supportive".to_string(),
        "low_energy" => "calm and understanding".to_string(),
        "uncertain" => "reassuring and patient".to_string(),
        _ => "balanced and attentive".to_string(),
    };

    EmotionalStateResult {
        primary_emotion,
        confidence,
        intensity,
        has_mismatch,
        mismatch_description,
        suggested_tone,
    }
}

// ============================================================================
// CONVERSATION DYNAMICS
// ============================================================================

/// Input for tracking conversation dynamics
#[napi(object)]
pub struct ConversationTurnInput {
    /// Turn number (0-indexed)
    pub turn_number: u32,
    /// Speaker: "user" or "agent"
    pub speaker: String,
    /// Word count of this turn
    pub word_count: u32,
    /// Duration in seconds (if available)
    pub duration_secs: Option<f64>,
    /// Sentiment of this turn (-1 to 1)
    pub sentiment: f64,
    /// Whether this turn had a question
    pub has_question: bool,
}

/// Conversation dynamics analysis result
#[napi(object)]
pub struct ConversationDynamicsResult {
    /// Average words per turn (user)
    pub avg_user_words: f64,
    /// Average words per turn (agent)
    pub avg_agent_words: f64,
    /// Turn-taking ratio (user turns / total)
    pub turn_ratio: f64,
    /// Engagement score (0-1)
    pub engagement_score: f64,
    /// Conversation arc phase
    pub conversation_phase: String,
    /// Sentiment trajectory (rising, falling, stable)
    pub sentiment_trend: String,
    /// Question density (questions per turn)
    pub question_density: f64,
    /// Suggested pacing (faster, slower, maintain)
    pub suggested_pacing: String,
}

/// Analyze conversation dynamics from turn history.
///
/// Tracks:
/// - Engagement patterns
/// - Sentiment trajectory
/// - Turn-taking balance
/// - Conversation phase (opening, exploring, deepening, closing)
#[napi]
pub fn analyze_conversation_dynamics(
    turns: Vec<ConversationTurnInput>,
) -> ConversationDynamicsResult {
    if turns.is_empty() {
        return ConversationDynamicsResult {
            avg_user_words: 0.0,
            avg_agent_words: 0.0,
            turn_ratio: 0.5,
            engagement_score: 0.5,
            conversation_phase: "opening".to_string(),
            sentiment_trend: "stable".to_string(),
            question_density: 0.0,
            suggested_pacing: "maintain".to_string(),
        };
    }

    // Separate user and agent turns
    let user_turns: Vec<&ConversationTurnInput> = turns.iter()
        .filter(|t| t.speaker == "user")
        .collect();
    let agent_turns: Vec<&ConversationTurnInput> = turns.iter()
        .filter(|t| t.speaker == "agent")
        .collect();

    // Calculate averages
    let avg_user_words = if !user_turns.is_empty() {
        user_turns.iter().map(|t| t.word_count as f64).sum::<f64>() / user_turns.len() as f64
    } else {
        0.0
    };

    let avg_agent_words = if !agent_turns.is_empty() {
        agent_turns.iter().map(|t| t.word_count as f64).sum::<f64>() / agent_turns.len() as f64
    } else {
        0.0
    };

    // Turn ratio
    let turn_ratio = if !turns.is_empty() {
        user_turns.len() as f64 / turns.len() as f64
    } else {
        0.5
    };

    // Engagement score based on response lengths and questions
    let questions = turns.iter().filter(|t| t.has_question).count();
    let question_density = questions as f64 / turns.len() as f64;

    // Engagement: balance of turn-taking, questions, and consistent participation
    let engagement_score = {
        let balance_score = 1.0 - (turn_ratio - 0.5).abs() * 2.0; // Best at 0.5
        let question_score = (question_density * 2.0).min(1.0); // Questions indicate engagement
        let length_score = if avg_user_words > 10.0 { 0.8 } else { avg_user_words / 12.5 };
        (balance_score * 0.3 + question_score * 0.3 + length_score * 0.4).min(1.0)
    };

    // Determine conversation phase
    let total_turns = turns.len();
    let conversation_phase = if total_turns <= 2 {
        "opening"
    } else if total_turns <= 6 {
        "exploring"
    } else if total_turns <= 12 {
        "deepening"
    } else {
        "established"
    }.to_string();

    // Sentiment trajectory (look at recent vs earlier)
    let sentiment_trend = if turns.len() >= 3 {
        let early: f64 = turns.iter().take(turns.len() / 2).map(|t| t.sentiment).sum::<f64>()
            / (turns.len() / 2) as f64;
        let late: f64 = turns.iter().skip(turns.len() / 2).map(|t| t.sentiment).sum::<f64>()
            / (turns.len() - turns.len() / 2) as f64;

        if late > early + 0.2 {
            "rising"
        } else if late < early - 0.2 {
            "falling"
        } else {
            "stable"
        }
    } else {
        "stable"
    }.to_string();

    // Suggested pacing
    let suggested_pacing = if avg_user_words < 5.0 {
        "slower" // User giving short responses, slow down
    } else if avg_user_words > 50.0 {
        "maintain" // User is engaged, keep pace
    } else if engagement_score < 0.3 {
        "slower" // Low engagement, slow down
    } else {
        "maintain"
    }.to_string();

    ConversationDynamicsResult {
        avg_user_words,
        avg_agent_words,
        turn_ratio,
        engagement_score,
        conversation_phase,
        sentiment_trend,
        question_density,
        suggested_pacing,
    }
}

// ============================================================================
// AHO-CORASICK MULTI-PATTERN MATCHER
// ============================================================================
//
// Efficient multi-pattern matching using the Aho-Corasick algorithm.
// This is ideal for tool-call-sanitizer.ts which needs to detect many
// tool names (30+) in streaming TTS text.
//
// Performance: O(n + m + z) where:
// - n = text length
// - m = total pattern length
// - z = number of matches
//
// Compared to running 30 separate regex patterns (O(n * p)), this is
// significantly faster for detecting tool names in real-time.

use aho_corasick::{AhoCorasick, MatchKind};
use std::sync::RwLock;

/// Result of a pattern match
#[napi(object)]
pub struct AhoCorasickMatch {
    /// Index of the matched pattern
    pub pattern_idx: u32,
    /// Start position in text
    pub start: u32,
    /// End position in text
    pub end: u32,
    /// The matched text
    pub matched_text: String,
}

/// Result of scanning text for patterns
#[napi(object)]
pub struct AhoCorasickScanResult {
    /// All matches found
    pub matches: Vec<AhoCorasickMatch>,
    /// Whether any patterns matched
    pub has_matches: bool,
    /// Number of matches
    pub match_count: u32,
}

lazy_static::lazy_static! {
    /// Global Aho-Corasick automaton for tool name detection
    static ref TOOL_NAME_AUTOMATON: RwLock<Option<AhoCorasick>> = RwLock::new(None);
    /// Stored tool names for pattern index lookup
    static ref TOOL_NAME_PATTERNS: RwLock<Vec<String>> = RwLock::new(Vec::new());
}

/// Build an Aho-Corasick automaton from a list of patterns.
///
/// This compiles the patterns into a single automaton that can match
/// all patterns simultaneously in O(n) time.
///
/// # Arguments
/// * `patterns` - List of patterns to match (usually tool names)
///
/// # Returns
/// True if automaton was built successfully
#[napi]
pub fn build_tool_name_automaton(patterns: Vec<String>) -> bool {
    // Build automaton with leftmost-first semantics
    let result = AhoCorasick::builder()
        .match_kind(MatchKind::LeftmostFirst)
        .ascii_case_insensitive(true)
        .build(&patterns);

    match result {
        Ok(ac) => {
            let mut automaton = TOOL_NAME_AUTOMATON.write().unwrap();
            let mut stored_patterns = TOOL_NAME_PATTERNS.write().unwrap();

            *automaton = Some(ac);
            *stored_patterns = patterns;
            true
        }
        Err(_) => false,
    }
}

/// Scan text for tool names using the pre-built automaton.
///
/// This is the main function for tool-call-sanitizer.ts to use.
/// It scans text in O(n) time for all registered tool names.
///
/// # Arguments
/// * `text` - Text to scan for tool names
///
/// # Returns
/// Scan result with all matches
#[napi]
pub fn scan_for_tool_names(text: String) -> AhoCorasickScanResult {
    let automaton = TOOL_NAME_AUTOMATON.read().unwrap();

    if let Some(ref ac) = *automaton {
        let matches: Vec<AhoCorasickMatch> = ac
            .find_iter(&text)
            .map(|m| AhoCorasickMatch {
                pattern_idx: m.pattern().as_u32(),
                start: m.start() as u32,
                end: m.end() as u32,
                matched_text: text[m.start()..m.end()].to_string(),
            })
            .collect();

        let match_count = matches.len() as u32;
        let has_matches = !matches.is_empty();

        AhoCorasickScanResult {
            matches,
            has_matches,
            match_count,
        }
    } else {
        AhoCorasickScanResult {
            matches: vec![],
            has_matches: false,
            match_count: 0,
        }
    }
}

/// Check if text contains any registered tool name.
///
/// Fast early-exit check - stops at first match.
#[napi]
pub fn contains_any_tool_name(text: String) -> bool {
    let automaton = TOOL_NAME_AUTOMATON.read().unwrap();

    if let Some(ref ac) = *automaton {
        ac.find(&text).is_some()
    } else {
        false
    }
}

/// Get the tool name for a pattern index.
#[napi]
pub fn get_tool_name_by_index(index: u32) -> Option<String> {
    let patterns = TOOL_NAME_PATTERNS.read().unwrap();
    patterns.get(index as usize).cloned()
}

/// Get the number of registered tool name patterns.
#[napi]
pub fn get_tool_name_pattern_count() -> u32 {
    let patterns = TOOL_NAME_PATTERNS.read().unwrap();
    patterns.len() as u32
}

/// Clear the tool name automaton.
#[napi]
pub fn clear_tool_name_automaton() {
    let mut automaton = TOOL_NAME_AUTOMATON.write().unwrap();
    let mut patterns = TOOL_NAME_PATTERNS.write().unwrap();

    *automaton = None;
    patterns.clear();
}

/// Create an Aho-Corasick automaton without global state.
///
/// Returns an opaque handle that can be used for matching.
/// This is useful when you need multiple independent matchers.
#[napi]
pub struct AhoCorasickMatcher {
    automaton: AhoCorasick,
    patterns: Vec<String>,
}

#[napi]
impl AhoCorasickMatcher {
    /// Create a new matcher from patterns.
    #[napi(constructor)]
    pub fn new(patterns: Vec<String>) -> napi::Result<Self> {
        let automaton = AhoCorasick::builder()
            .match_kind(MatchKind::LeftmostFirst)
            .ascii_case_insensitive(true)
            .build(&patterns)
            .map_err(|e| napi::Error::from_reason(format!("Failed to build automaton: {}", e)))?;

        Ok(AhoCorasickMatcher { automaton, patterns })
    }

    /// Scan text for matches.
    #[napi]
    pub fn scan(&self, text: String) -> AhoCorasickScanResult {
        let matches: Vec<AhoCorasickMatch> = self
            .automaton
            .find_iter(&text)
            .map(|m| AhoCorasickMatch {
                pattern_idx: m.pattern().as_u32(),
                start: m.start() as u32,
                end: m.end() as u32,
                matched_text: text[m.start()..m.end()].to_string(),
            })
            .collect();

        let match_count = matches.len() as u32;
        let has_matches = !matches.is_empty();

        AhoCorasickScanResult {
            matches,
            has_matches,
            match_count,
        }
    }

    /// Check if text contains any pattern (fast early-exit).
    #[napi]
    pub fn contains_any(&self, text: String) -> bool {
        self.automaton.find(&text).is_some()
    }

    /// Get the pattern at an index.
    #[napi]
    pub fn get_pattern(&self, index: u32) -> Option<String> {
        self.patterns.get(index as usize).cloned()
    }

    /// Get the number of patterns.
    #[napi]
    pub fn pattern_count(&self) -> u32 {
        self.patterns.len() as u32
    }

    /// Replace all matches with a replacement function result.
    /// The replacement is indexed by pattern index.
    #[napi]
    pub fn replace_all(&self, text: String, replacements: Vec<String>) -> String {
        self.automaton.replace_all(&text, &replacements)
    }
}

// ============================================================================
// FLUENCY ANALYSIS (NAPI EXPORTS)
// ============================================================================

/// NAPI-compatible disfluency counts
#[napi(object)]
pub struct NapiDisfluencyCounts {
    pub repetitions: u32,
    pub prolongations: u32,
    pub interjections: u32,
    pub revisions: u32,
    pub restarts: u32,
    pub trailing: u32,
    pub pause_fillers: u32,
    pub hesitations: u32,
}

/// NAPI-compatible fluency analysis result
#[napi(object)]
pub struct NapiFluencyAnalysisResult {
    pub counts: NapiDisfluencyCounts,
    pub word_count: u32,
    pub fluency_score: f64,
    pub detected_interjections: Vec<String>,
    pub detected_prolongations: Vec<String>,
    pub has_significant_disfluencies: bool,
}

/// Analyze text for speech disfluencies (repetitions, interjections, etc.)
#[napi]
pub fn analyze_fluency(text: String) -> NapiFluencyAnalysisResult {
    let result = fluency_analyzer::analyze_fluency(&text);
    NapiFluencyAnalysisResult {
        counts: NapiDisfluencyCounts {
            repetitions: result.counts.repetitions,
            prolongations: result.counts.prolongations,
            interjections: result.counts.interjections,
            revisions: result.counts.revisions,
            restarts: result.counts.restarts,
            trailing: result.counts.trailing,
            pause_fillers: result.counts.pause_fillers,
            hesitations: result.counts.hesitations,
        },
        word_count: result.word_count,
        fluency_score: result.fluency_score as f64,
        detected_interjections: result.detected_interjections,
        detected_prolongations: result.detected_prolongations,
        has_significant_disfluencies: result.has_significant_disfluencies,
    }
}

/// Batch analyze multiple texts for fluency
#[napi]
pub fn batch_analyze_fluency(texts: Vec<String>) -> Vec<NapiFluencyAnalysisResult> {
    let text_refs: Vec<&str> = texts.iter().map(|s| s.as_str()).collect();
    fluency_analyzer::batch_analyze_fluency(&text_refs)
        .into_iter()
        .map(|r| NapiFluencyAnalysisResult {
            counts: NapiDisfluencyCounts {
                repetitions: r.counts.repetitions,
                prolongations: r.counts.prolongations,
                interjections: r.counts.interjections,
                revisions: r.counts.revisions,
                restarts: r.counts.restarts,
                trailing: r.counts.trailing,
                pause_fillers: r.counts.pause_fillers,
                hesitations: r.counts.hesitations,
            },
            word_count: r.word_count,
            fluency_score: r.fluency_score as f64,
            detected_interjections: r.detected_interjections,
            detected_prolongations: r.detected_prolongations,
            has_significant_disfluencies: r.has_significant_disfluencies,
        })
        .collect()
}

/// Quick check if text likely contains disfluencies
#[napi]
pub fn likely_has_disfluencies(text: String) -> bool {
    fluency_analyzer::likely_has_disfluencies(&text)
}

/// Extract only interjections from text
#[napi(object)]
pub struct NapiInterjectionMatch {
    pub text: String,
    pub start: u32,
    pub end: u32,
}

#[napi]
pub fn extract_interjections(text: String) -> Vec<NapiInterjectionMatch> {
    fluency_analyzer::extract_interjections(&text)
        .into_iter()
        .map(|(t, s, e)| NapiInterjectionMatch {
            text: t,
            start: s as u32,
            end: e as u32,
        })
        .collect()
}

/// Count interjections in text (fast path returning count only)
#[napi]
pub fn count_interjections(text: String) -> u32 {
    fluency_analyzer::count_interjections(&text)
}

// ============================================================================
// TURN ANALYSIS (NAPI EXPORTS)
// ============================================================================

/// NAPI-compatible phrase match
#[napi(object)]
pub struct NapiTurnPhraseMatch {
    pub phrase: String,
    pub phrase_type: String,
    pub start: u32,
    pub end: u32,
}

/// NAPI-compatible turn analysis result
#[napi(object)]
pub struct NapiTurnAnalysisResult {
    pub matches: Vec<NapiTurnPhraseMatch>,
    pub turn_final_count: u32,
    pub continuation_count: u32,
    pub likely_turn_complete: bool,
    pub likely_continuing: bool,
}

/// Analyze text for turn boundary indicators
#[napi]
pub fn analyze_turn(text: String) -> NapiTurnAnalysisResult {
    let result = turn_analyzer::analyze_turn(&text);
    NapiTurnAnalysisResult {
        matches: result
            .matches
            .into_iter()
            .map(|m| NapiTurnPhraseMatch {
                phrase: m.phrase,
                phrase_type: match m.phrase_type {
                    turn_analyzer::PhraseType::TurnFinal => "turn_final".to_string(),
                    turn_analyzer::PhraseType::Continuation => "continuation".to_string(),
                },
                start: m.start as u32,
                end: m.end as u32,
            })
            .collect(),
        turn_final_count: result.turn_final_count,
        continuation_count: result.continuation_count,
        likely_turn_complete: result.likely_turn_complete,
        likely_continuing: result.likely_continuing,
    }
}

/// Check if text contains turn-final phrases
#[napi]
pub fn has_turn_final(text: String) -> bool {
    turn_analyzer::has_turn_final(&text)
}

/// Check if text contains continuation phrases
#[napi]
pub fn has_continuation(text: String) -> bool {
    turn_analyzer::has_continuation(&text)
}

/// Get probability that turn is complete (0.0 to 1.0)
#[napi]
pub fn turn_complete_probability(text: String) -> f64 {
    turn_analyzer::turn_complete_probability(&text) as f64
}

/// Batch analyze multiple texts for turn boundaries
#[napi]
pub fn batch_analyze_turn(texts: Vec<String>) -> Vec<NapiTurnAnalysisResult> {
    let text_refs: Vec<&str> = texts.iter().map(|s| s.as_str()).collect();
    turn_analyzer::batch_analyze_turn(&text_refs)
        .into_iter()
        .map(|r| NapiTurnAnalysisResult {
            matches: r
                .matches
                .into_iter()
                .map(|m| NapiTurnPhraseMatch {
                    phrase: m.phrase,
                    phrase_type: match m.phrase_type {
                        turn_analyzer::PhraseType::TurnFinal => "turn_final".to_string(),
                        turn_analyzer::PhraseType::Continuation => "continuation".to_string(),
                    },
                    start: m.start as u32,
                    end: m.end as u32,
                })
                .collect(),
            turn_final_count: r.turn_final_count,
            continuation_count: r.continuation_count,
            likely_turn_complete: r.likely_turn_complete,
            likely_continuing: r.likely_continuing,
        })
        .collect()
}

// ============================================================================
// SIGNAL EXTRACTION (NAPI EXPORTS)
// ============================================================================

/// NAPI-compatible extracted signal
#[napi(object)]
pub struct NapiExtractedSignal {
    pub signal_type: String,
    pub value: String,
    pub context: String,
    pub start: u32,
    pub end: u32,
    pub confidence: f64,
}

/// NAPI-compatible signal extraction result
#[napi(object)]
pub struct NapiSignalExtractionResult {
    pub signals: Vec<NapiExtractedSignal>,
    pub has_signals: bool,
    pub high_value_count: u32,
}

/// Extract human signals from text (dates, values, fears, etc.)
#[napi]
pub fn extract_signals(text: String) -> NapiSignalExtractionResult {
    let result = signal_extractor::extract_signals(&text);
    NapiSignalExtractionResult {
        signals: result
            .signals
            .into_iter()
            .map(|s| NapiExtractedSignal {
                signal_type: s.signal_type.as_str().to_string(),
                value: s.value,
                context: s.context,
                start: s.start as u32,
                end: s.end as u32,
                confidence: s.confidence as f64,
            })
            .collect(),
        has_signals: result.has_signals,
        high_value_count: result.high_value_count,
    }
}

/// Batch extract signals from multiple texts
#[napi]
pub fn batch_extract_signals(texts: Vec<String>) -> Vec<NapiSignalExtractionResult> {
    let text_refs: Vec<&str> = texts.iter().map(|s| s.as_str()).collect();
    signal_extractor::batch_extract_signals(&text_refs)
        .into_iter()
        .map(|r| NapiSignalExtractionResult {
            signals: r
                .signals
                .into_iter()
                .map(|s| NapiExtractedSignal {
                    signal_type: s.signal_type.as_str().to_string(),
                    value: s.value,
                    context: s.context,
                    start: s.start as u32,
                    end: s.end as u32,
                    confidence: s.confidence as f64,
                })
                .collect(),
            has_signals: r.has_signals,
            high_value_count: r.high_value_count,
        })
        .collect()
}

/// Quick check if text likely contains signals
#[napi]
pub fn likely_has_signals(text: String) -> bool {
    signal_extractor::likely_has_signals(&text)
}

/// Extract only date signals (optimized)
#[napi]
pub fn extract_date_signals(text: String) -> Vec<NapiExtractedSignal> {
    signal_extractor::extract_date_signals(&text)
        .into_iter()
        .map(|s| NapiExtractedSignal {
            signal_type: s.signal_type.as_str().to_string(),
            value: s.value,
            context: s.context,
            start: s.start as u32,
            end: s.end as u32,
            confidence: s.confidence as f64,
        })
        .collect()
}

/// Extract only high-value signals (birthdays, anniversaries, relationships)
#[napi]
pub fn extract_high_value_signals(text: String) -> Vec<NapiExtractedSignal> {
    signal_extractor::extract_high_value_signals(&text)
        .into_iter()
        .map(|s| NapiExtractedSignal {
            signal_type: s.signal_type.as_str().to_string(),
            value: s.value,
            context: s.context,
            start: s.start as u32,
            end: s.end as u32,
            confidence: s.confidence as f64,
        })
        .collect()
}

/// Quick check if text has memorable signals (alias for likely_has_signals)
#[napi]
pub fn has_memorable_signals(text: String) -> bool {
    signal_extractor::likely_has_signals(&text)
}

// ============================================================================
// TOKEN COUNTING (NAPI EXPORTS)
// ============================================================================

/// NAPI-compatible text statistics
#[napi(object)]
pub struct NapiTextStats {
    pub words: u32,
    pub tokens_approx: u32,
    pub chars: u32,
    pub bytes: u32,
    pub sentences: u32,
    pub lines: u32,
    pub avg_word_length: f64,
}

/// Count words in text
#[napi]
pub fn count_words(text: String) -> u32 {
    token_counter::count_words(&text)
}

/// Count approximate tokens (OpenAI-style)
#[napi]
pub fn count_tokens_approx(text: String) -> u32 {
    token_counter::count_tokens_approx(&text)
}

/// Count characters
#[napi]
pub fn count_chars(text: String) -> u32 {
    token_counter::count_chars(&text)
}

/// Count sentences
#[napi]
pub fn count_sentences(text: String) -> u32 {
    token_counter::count_sentences(&text)
}

/// Count bytes
#[napi]
pub fn count_bytes(text: String) -> u32 {
    token_counter::count_bytes(&text)
}

/// Count lines
#[napi]
pub fn count_lines(text: String) -> u32 {
    token_counter::count_lines(&text)
}

/// Get comprehensive text statistics
#[napi]
pub fn get_text_stats(text: String) -> NapiTextStats {
    let stats = token_counter::get_text_stats(&text);
    NapiTextStats {
        words: stats.words,
        tokens_approx: stats.tokens_approx,
        chars: stats.chars,
        bytes: stats.bytes,
        sentences: stats.sentences,
        lines: stats.lines,
        avg_word_length: stats.avg_word_length as f64,
    }
}

/// Batch count words for multiple texts
#[napi]
pub fn batch_count_words(texts: Vec<String>) -> Vec<u32> {
    let text_refs: Vec<&str> = texts.iter().map(|s| s.as_str()).collect();
    token_counter::batch_count_words(&text_refs)
}

/// Batch count tokens for multiple texts
#[napi]
pub fn batch_count_tokens(texts: Vec<String>) -> Vec<u32> {
    let text_refs: Vec<&str> = texts.iter().map(|s| s.as_str()).collect();
    token_counter::batch_count_tokens(&text_refs)
}

/// Batch get text statistics for multiple texts
#[napi]
pub fn batch_get_stats(texts: Vec<String>) -> Vec<NapiTextStats> {
    let text_refs: Vec<&str> = texts.iter().map(|s| s.as_str()).collect();
    token_counter::batch_get_stats(&text_refs)
        .into_iter()
        .map(|s| NapiTextStats {
            words: s.words,
            tokens_approx: s.tokens_approx,
            chars: s.chars,
            bytes: s.bytes,
            sentences: s.sentences,
            lines: s.lines,
            avg_word_length: s.avg_word_length as f64,
        })
        .collect()
}

/// Check if text exceeds token limit
#[napi]
pub fn exceeds_token_limit(text: String, limit: u32) -> bool {
    token_counter::exceeds_token_limit(&text, limit)
}

/// Truncate text to approximate token limit
#[napi]
pub fn truncate_to_tokens(text: String, max_tokens: u32) -> String {
    token_counter::truncate_to_tokens(&text, max_tokens).to_string()
}

// ============================================================================
// FFT AUDIO ANALYSIS (SIMD-ACCELERATED)
// ============================================================================

/// Audio features extracted from FFT analysis
#[napi(object)]
pub struct NapiAudioFeatures {
    pub rms_energy: f64,
    pub zero_crossing_rate: f64,
    pub spectral_centroid: f64,
    pub spectral_flux: f64,
    pub spectral_rolloff: u32,
    pub dominant_bin: u32,
    pub dominant_magnitude: f64,
}

/// FFT processor instance for session-scoped audio analysis
#[napi]
pub struct NapiFftProcessor {
    processor: fft_analyzer::FftProcessor,
}

#[napi]
impl NapiFftProcessor {
    /// Create a new FFT processor with specified size (typically 1024 or 2048)
    #[napi(constructor)]
    pub fn new(fft_size: u32) -> Self {
        Self {
            processor: fft_analyzer::FftProcessor::new(fft_size as usize),
        }
    }

    /// Process audio frame and return magnitude spectrum
    #[napi]
    pub fn process_frame(&mut self, samples: Vec<f64>) -> Vec<f64> {
        // Convert f64 to f32 for internal processing
        let samples_f32: Vec<f32> = samples.iter().map(|&s| s as f32).collect();
        let magnitudes = self.processor.process_frame(&samples_f32);
        magnitudes.iter().map(|&m| m as f64).collect()
    }

    /// Compute spectral flux (change from previous frame) - higher = onset/transient
    #[napi]
    pub fn compute_spectral_flux(&mut self, samples: Vec<f64>) -> f64 {
        let samples_f32: Vec<f32> = samples.iter().map(|&s| s as f32).collect();
        self.processor.compute_spectral_flux(&samples_f32) as f64
    }

    /// Get spectral centroid (brightness measure)
    #[napi]
    pub fn get_spectral_centroid(&self, sample_rate: f64) -> f64 {
        self.processor.get_spectral_centroid(sample_rate as f32) as f64
    }

    /// Get spectral rolloff (frequency bin containing threshold% of energy)
    #[napi]
    pub fn get_spectral_rolloff(&self, threshold: f64) -> u32 {
        self.processor.get_spectral_rolloff(threshold as f32) as u32
    }

    /// Extract all audio features from a frame
    #[napi]
    pub fn extract_features(&mut self, samples: Vec<f64>, sample_rate: f64) -> NapiAudioFeatures {
        let samples_f32: Vec<f32> = samples.iter().map(|&s| s as f32).collect();
        let features = self.processor.extract_features(&samples_f32, sample_rate as f32);
        NapiAudioFeatures {
            rms_energy: features.rms_energy as f64,
            zero_crossing_rate: features.zero_crossing_rate as f64,
            spectral_centroid: features.spectral_centroid as f64,
            spectral_flux: features.spectral_flux as f64,
            spectral_rolloff: features.spectral_rolloff as u32,
            dominant_bin: features.dominant_bin as u32,
            dominant_magnitude: features.dominant_magnitude as f64,
        }
    }

    /// Get FFT size
    #[napi]
    pub fn fft_size(&self) -> u32 {
        self.processor.fft_size() as u32
    }

    /// Get number of frequency bins
    #[napi]
    pub fn num_bins(&self) -> u32 {
        self.processor.num_bins() as u32
    }

    /// Reset processor (clear previous frame data)
    #[napi]
    pub fn reset(&mut self) {
        self.processor.reset();
    }
}

/// Get RMS energy of audio samples (SIMD-accelerated)
#[napi]
pub fn get_rms_energy(samples: Vec<f64>) -> f64 {
    let samples_f32: Vec<f32> = samples.iter().map(|&s| s as f32).collect();
    fft_analyzer::FftProcessor::get_rms_energy(&samples_f32) as f64
}

/// Get zero crossing rate of audio samples
#[napi]
pub fn get_zero_crossing_rate(samples: Vec<f64>) -> f64 {
    let samples_f32: Vec<f32> = samples.iter().map(|&s| s as f32).collect();
    fft_analyzer::FftProcessor::get_zero_crossing_rate(&samples_f32) as f64
}

// ============================================================================
// EMBEDDING CACHE (SHA256 + LRU)
// ============================================================================

/// Cache statistics
#[napi(object)]
pub struct NapiCacheStats {
    pub size: u32,
    pub capacity: u32,
    pub utilization: f64,
}

/// Thread-safe embedding cache with SHA256 keys and LRU eviction
#[napi]
pub struct NapiEmbeddingCache {
    cache: embedding_cache::EmbeddingCache,
}

#[napi]
impl NapiEmbeddingCache {
    /// Create a new embedding cache with specified capacity and TTL (ms)
    #[napi(constructor)]
    pub fn new(max_size: u32, default_ttl_ms: u32) -> Self {
        Self {
            cache: embedding_cache::EmbeddingCache::new(max_size as usize, default_ttl_ms as u64),
        }
    }

    /// Get an embedding from the cache (returns null if not found or expired)
    #[napi]
    pub fn get(&self, text: String, current_time_ms: u32) -> Option<Vec<f64>> {
        self.cache
            .get(&text, current_time_ms as u64)
            .map(|v| v.iter().map(|&x| x as f64).collect())
    }

    /// Put an embedding in the cache
    #[napi]
    pub fn put(&self, text: String, embedding: Vec<f64>, current_time_ms: u32) {
        let embedding_f32: Vec<f32> = embedding.iter().map(|&x| x as f32).collect();
        self.cache.put(&text, embedding_f32, current_time_ms as u64);
    }

    /// Put an embedding with custom TTL
    #[napi]
    pub fn put_with_ttl(&self, text: String, embedding: Vec<f64>, current_time_ms: u32, ttl_ms: u32) {
        let embedding_f32: Vec<f32> = embedding.iter().map(|&x| x as f32).collect();
        self.cache.put_with_ttl(&text, embedding_f32, current_time_ms as u64, ttl_ms as u64);
    }

    /// Remove an entry from the cache
    #[napi]
    pub fn remove(&self, text: String) -> bool {
        self.cache.remove(&text)
    }

    /// Clear all entries from the cache
    #[napi]
    pub fn clear(&self) {
        self.cache.clear();
    }

    /// Get the current number of entries
    #[napi]
    pub fn len(&self) -> u32 {
        self.cache.len() as u32
    }

    /// Check if the cache is empty
    #[napi]
    pub fn is_empty(&self) -> bool {
        self.cache.is_empty()
    }

    /// Get cache capacity
    #[napi]
    pub fn capacity(&self) -> u32 {
        self.cache.capacity() as u32
    }

    /// Prune expired entries, returns count of entries removed
    #[napi]
    pub fn prune_expired(&self, current_time_ms: u32) -> u32 {
        self.cache.prune_expired(current_time_ms as u64) as u32
    }

    /// Get cache statistics
    #[napi]
    pub fn stats(&self) -> NapiCacheStats {
        let stats = self.cache.stats();
        NapiCacheStats {
            size: stats.size as u32,
            capacity: stats.capacity as u32,
            utilization: stats.utilization,
        }
    }
}

/// Compute SHA256 hash of text (returns hex string)
#[napi]
pub fn hash_text_sha256(text: String) -> String {
    embedding_cache::EmbeddingCache::hash_text_hex(&text)
}

/// Batch compute SHA256 hashes for multiple texts
#[napi]
pub fn batch_hash_texts_sha256(texts: Vec<String>) -> Vec<String> {
    embedding_cache::batch_hash_texts_hex(&texts)
}

#[cfg(test)]
mod aho_corasick_tests {
    use super::*;

    #[test]
    fn test_matcher_basic() {
        let matcher = AhoCorasickMatcher::new(vec![
            "play_music".to_string(),
            "get_weather".to_string(),
            "set_reminder".to_string(),
        ])
        .unwrap();

        let result = matcher.scan("I want to play_music and check get_weather".to_string());
        assert!(result.has_matches);
        assert_eq!(result.match_count, 2);

        // Check first match
        assert_eq!(result.matches[0].matched_text, "play_music");
        assert_eq!(result.matches[0].pattern_idx, 0);

        // Check second match
        assert_eq!(result.matches[1].matched_text, "get_weather");
        assert_eq!(result.matches[1].pattern_idx, 1);
    }

    #[test]
    fn test_matcher_case_insensitive() {
        let matcher = AhoCorasickMatcher::new(vec!["Play_Music".to_string()]).unwrap();

        assert!(matcher.contains_any("I want to PLAY_MUSIC".to_string()));
        assert!(matcher.contains_any("I want to play_music".to_string()));
    }

    #[test]
    fn test_matcher_no_matches() {
        let matcher = AhoCorasickMatcher::new(vec!["play_music".to_string()]).unwrap();

        let result = matcher.scan("Hello world".to_string());
        assert!(!result.has_matches);
        assert_eq!(result.match_count, 0);
    }

    #[test]
    fn test_global_automaton() {
        // Build global automaton
        assert!(build_tool_name_automaton(vec![
            "handoff".to_string(),
            "play_music".to_string(),
        ]));

        // Check pattern count
        assert_eq!(get_tool_name_pattern_count(), 2);

        // Scan text
        let result = scan_for_tool_names("Let me handoff this call".to_string());
        assert!(result.has_matches);
        assert_eq!(result.match_count, 1);
        assert_eq!(result.matches[0].matched_text, "handoff");

        // Get pattern by index
        assert_eq!(get_tool_name_by_index(0), Some("handoff".to_string()));

        // Clear
        clear_tool_name_automaton();
        assert_eq!(get_tool_name_pattern_count(), 0);
    }
}
