//! Similarity metrics for speaker embeddings.

/// Compute cosine similarity between two vectors.
///
/// Returns a value between -1 and 1, where:
/// - 1 means identical direction
/// - 0 means orthogonal
/// - -1 means opposite direction
///
/// For normalized speaker embeddings, this is equivalent to dot product.
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f64 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }

    let mut dot = 0.0f64;
    let mut norm_a = 0.0f64;
    let mut norm_b = 0.0f64;

    for i in 0..a.len() {
        let ai = a[i] as f64;
        let bi = b[i] as f64;
        dot += ai * bi;
        norm_a += ai * ai;
        norm_b += bi * bi;
    }

    let norm_product = (norm_a * norm_b).sqrt();
    if norm_product < 1e-10 {
        return 0.0;
    }

    // Clamp to [-1, 1] to handle floating point errors
    (dot / norm_product).clamp(-1.0, 1.0)
}

/// Compute Euclidean distance between two vectors.
pub fn euclidean_distance(a: &[f32], b: &[f32]) -> f64 {
    if a.len() != b.len() {
        return f64::MAX;
    }

    let sum_sq: f64 = a
        .iter()
        .zip(b.iter())
        .map(|(ai, bi)| {
            let diff = *ai as f64 - *bi as f64;
            diff * diff
        })
        .sum();

    sum_sq.sqrt()
}

/// Convert cosine similarity to a probability-like score.
///
/// Maps [-1, 1] to [0, 1] using a calibrated transformation.
/// Useful for threshold-based decisions.
pub fn similarity_to_score(similarity: f64) -> f64 {
    // Simple linear mapping from [-1, 1] to [0, 1]
    (similarity + 1.0) / 2.0
}

/// Determine if two embeddings likely belong to the same speaker.
///
/// # Arguments
/// * `similarity` - Cosine similarity between embeddings
/// * `threshold` - Decision threshold (default ~0.5)
///
/// # Returns
/// * true if same speaker, false otherwise
pub fn is_same_speaker(similarity: f64, threshold: f64) -> bool {
    similarity >= threshold
}

/// Compute PLDA-like scoring (simplified).
///
/// This is a simplified version that doesn't require training.
/// Real PLDA would learn within-class and between-class covariances.
pub fn plda_score(a: &[f32], b: &[f32]) -> f64 {
    // For now, just use cosine similarity
    // A proper implementation would use trained PLDA parameters
    cosine_similarity(a, b)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity_identical() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![1.0, 0.0, 0.0];
        let sim = cosine_similarity(&a, &b);
        assert!((sim - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_cosine_similarity_orthogonal() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![0.0, 1.0, 0.0];
        let sim = cosine_similarity(&a, &b);
        assert!(sim.abs() < 0.001);
    }

    #[test]
    fn test_cosine_similarity_opposite() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![-1.0, 0.0, 0.0];
        let sim = cosine_similarity(&a, &b);
        assert!((sim + 1.0).abs() < 0.001);
    }

    #[test]
    fn test_euclidean_distance() {
        let a = vec![0.0, 0.0, 0.0];
        let b = vec![3.0, 4.0, 0.0];
        let dist = euclidean_distance(&a, &b);
        assert!((dist - 5.0).abs() < 0.001);
    }

    #[test]
    fn test_similarity_to_score() {
        assert!((similarity_to_score(1.0) - 1.0).abs() < 0.001);
        assert!((similarity_to_score(0.0) - 0.5).abs() < 0.001);
        assert!((similarity_to_score(-1.0) - 0.0).abs() < 0.001);
    }
}

