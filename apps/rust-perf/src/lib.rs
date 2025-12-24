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

use napi::bindgen_prelude::*;
use napi_derive::napi;
use rayon::prelude::*;
use std::collections::HashSet;
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
}
