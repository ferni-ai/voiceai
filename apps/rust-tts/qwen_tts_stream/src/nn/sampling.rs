//! Sampling utilities for text generation.
//!
//! Implements temperature, top-k, top-p (nucleus), and repetition penalty sampling
//! matching the Python reference defaults in qwen3_tts_model.py:287-340.

use candle_core::{DType, Result, Tensor};

/// Configuration for sampling during generation.
///
/// Supports both main talker and subtalker (code predictor) sampling parameters.
/// The subtalker generates audio codes and may use different sampling settings.
#[derive(Debug, Clone)]
pub struct SamplingConfig {
    // === Main Talker Parameters ===
    /// Temperature for scaling logits (higher = more random)
    pub temperature: f64,
    /// Number of top tokens to consider (0 = disabled)
    pub top_k: usize,
    /// Cumulative probability threshold for nucleus sampling (1.0 = disabled)
    pub top_p: f64,
    /// Whether to sample (true) or use argmax (false)
    pub do_sample: bool,
    /// Penalty for repeating tokens (1.0 = no penalty)
    pub repetition_penalty: f64,
    /// Token IDs that should be suppressed (set to -inf) during sampling
    pub suppress_tokens: Vec<usize>,
    /// Minimum number of tokens to generate before allowing EOS (default: 2)
    /// Python reference: qwen3_tts_model.py:2041 - min_new_tokens: 2
    pub min_new_tokens: usize,
    /// EOS token ID (for min_new_tokens enforcement)
    pub eos_token_id: Option<usize>,

    // === Subtalker (Code Predictor) Parameters ===
    /// Whether to sample for subtalker (code predictor)
    pub subtalker_do_sample: bool,
    /// Temperature for subtalker sampling
    pub subtalker_temperature: f64,
    /// Top-k for subtalker sampling (0 = disabled)
    pub subtalker_top_k: usize,
    /// Top-p for subtalker sampling (1.0 = disabled)
    pub subtalker_top_p: f64,
}

impl Default for SamplingConfig {
    fn default() -> Self {
        // Defaults from Python reference: qwen3_tts_model.py:319-330
        Self {
            // Main talker defaults
            temperature: 0.9,
            top_k: 50,
            top_p: 1.0,
            do_sample: true,
            repetition_penalty: 1.05,
            suppress_tokens: Vec::new(),
            min_new_tokens: 2, // Python default: qwen3_tts_model.py:2041
            eos_token_id: None,
            // Subtalker defaults (same as main by default)
            subtalker_do_sample: true,
            subtalker_temperature: 0.9,
            subtalker_top_k: 50,
            subtalker_top_p: 1.0,
        }
    }
}

impl SamplingConfig {
    /// Create a greedy (deterministic) sampling config.
    pub fn greedy() -> Self {
        Self {
            temperature: 1.0,
            top_k: 0,
            top_p: 1.0,
            do_sample: false,
            repetition_penalty: 1.0,
            suppress_tokens: Vec::new(),
            min_new_tokens: 2,
            eos_token_id: None,
            subtalker_do_sample: false,
            subtalker_temperature: 0.9,
            subtalker_top_k: 50,
            subtalker_top_p: 1.0,
        }
    }

    /// Set the EOS token ID for min_new_tokens enforcement.
    pub fn with_eos_token_id(mut self, eos_token_id: usize) -> Self {
        self.eos_token_id = Some(eos_token_id);
        self
    }

    /// Set the minimum number of tokens to generate before allowing EOS.
    pub fn with_min_new_tokens(mut self, min_new_tokens: usize) -> Self {
        self.min_new_tokens = min_new_tokens;
        self
    }

    /// Create a config with specific suppress tokens.
    ///
    /// This is commonly used to suppress all tokens except EOS in certain contexts.
    pub fn with_suppress_tokens(mut self, tokens: Vec<usize>) -> Self {
        self.suppress_tokens = tokens;
        self
    }

    /// Create a config for the subtalker (code predictor) based on this config.
    ///
    /// Returns a new SamplingConfig using the subtalker_* parameters.
    /// Python reference: qwen3_tts_model.py:325-328
    pub fn for_subtalker(&self) -> Self {
        Self {
            temperature: self.subtalker_temperature,
            top_k: self.subtalker_top_k,
            top_p: self.subtalker_top_p,
            do_sample: self.subtalker_do_sample,
            repetition_penalty: 1.0, // No repetition penalty for subtalker
            suppress_tokens: Vec::new(), // Suppress tokens handled separately
            min_new_tokens: 0,       // No min_new_tokens constraint for subtalker
            eos_token_id: None,
            // Subtalker params preserved for any nested calls
            subtalker_do_sample: self.subtalker_do_sample,
            subtalker_temperature: self.subtalker_temperature,
            subtalker_top_k: self.subtalker_top_k,
            subtalker_top_p: self.subtalker_top_p,
        }
    }

    /// Set subtalker sampling parameters.
    pub fn with_subtalker_params(
        mut self,
        do_sample: bool,
        temperature: f64,
        top_k: usize,
        top_p: f64,
    ) -> Self {
        self.subtalker_do_sample = do_sample;
        self.subtalker_temperature = temperature;
        self.subtalker_top_k = top_k;
        self.subtalker_top_p = top_p;
        self
    }
}

/// Apply token suppression to logits.
///
/// Sets the logits of specified tokens to negative infinity, effectively
/// preventing them from being sampled.
///
/// Reference: HuggingFace SuppressTokensLogitsProcessor
pub fn apply_suppress_tokens(logits: &Tensor, suppress_tokens: &[usize]) -> Result<Tensor> {
    if suppress_tokens.is_empty() {
        return Ok(logits.clone());
    }

    let mut logits_vec = logits.to_vec1::<f32>()?;
    let vocab_size = logits_vec.len();

    for &token_id in suppress_tokens {
        if token_id < vocab_size {
            logits_vec[token_id] = f32::NEG_INFINITY;
        }
    }

    Tensor::from_vec(logits_vec, logits.shape(), logits.device())
}

/// Apply repetition penalty to logits based on previously generated tokens.
///
/// For tokens that appear in `generated_tokens`, their logits are modified:
/// - If logit > 0: logit = logit / penalty
/// - If logit < 0: logit = logit * penalty
///
/// Reference: transformers RepetitionPenaltyLogitsProcessor
pub fn apply_repetition_penalty(
    logits: &Tensor,
    generated_tokens: &[i64],
    penalty: f64,
) -> Result<Tensor> {
    if penalty == 1.0 || generated_tokens.is_empty() {
        return Ok(logits.clone());
    }

    let mut logits_vec = logits.to_vec1::<f32>()?;

    for &token_id in generated_tokens {
        if (token_id as usize) < logits_vec.len() {
            let idx = token_id as usize;
            if logits_vec[idx] > 0.0 {
                logits_vec[idx] /= penalty as f32;
            } else {
                logits_vec[idx] *= penalty as f32;
            }
        }
    }

    Tensor::from_vec(logits_vec, logits.shape(), logits.device())
}

/// Apply temperature scaling to logits.
pub fn apply_temperature(logits: &Tensor, temperature: f64) -> Result<Tensor> {
    if temperature == 1.0 {
        return Ok(logits.clone());
    }
    logits.affine(1.0 / temperature, 0.0)
}

/// Apply top-k filtering to logits.
///
/// Sets all logits outside the top-k to negative infinity.
pub fn apply_top_k(logits: &Tensor, k: usize) -> Result<Tensor> {
    if k == 0 || k >= logits.dim(0)? {
        return Ok(logits.clone());
    }

    let mut logits_vec = logits.to_vec1::<f32>()?;

    // Find the k-th largest value
    let mut sorted = logits_vec.clone();
    sorted.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));
    let threshold = sorted[k - 1];

    // Set values below threshold to negative infinity
    for logit in &mut logits_vec {
        if *logit < threshold {
            *logit = f32::NEG_INFINITY;
        }
    }

    Tensor::from_vec(logits_vec, logits.shape(), logits.device())
}

/// Apply top-p (nucleus) filtering to logits.
///
/// Keeps the smallest set of tokens whose cumulative probability exceeds p.
pub fn apply_top_p(logits: &Tensor, p: f64) -> Result<Tensor> {
    if p >= 1.0 {
        return Ok(logits.clone());
    }

    let logits_vec = logits.to_vec1::<f32>()?;
    let vocab_size = logits_vec.len();

    // Compute softmax probabilities
    let max_logit = logits_vec.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
    let exp_logits: Vec<f32> = logits_vec.iter().map(|&x| (x - max_logit).exp()).collect();
    let sum_exp: f32 = exp_logits.iter().sum();
    let probs: Vec<f32> = exp_logits.iter().map(|&x| x / sum_exp).collect();

    // Sort by probability (descending) and get indices
    let mut indices: Vec<usize> = (0..vocab_size).collect();
    indices.sort_by(|&a, &b| {
        probs[b]
            .partial_cmp(&probs[a])
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    // Find cumulative probability threshold
    let mut cumsum = 0.0;
    let mut cutoff_idx = vocab_size;
    for (i, &idx) in indices.iter().enumerate() {
        cumsum += probs[idx];
        if cumsum > p as f32 {
            cutoff_idx = i + 1;
            break;
        }
    }

    // Set logits outside the nucleus to negative infinity
    let mut filtered_logits = vec![f32::NEG_INFINITY; vocab_size];
    for &idx in indices.iter().take(cutoff_idx) {
        filtered_logits[idx] = logits_vec[idx];
    }

    Tensor::from_vec(filtered_logits, logits.shape(), logits.device())
}

/// Sample a token from logits using the configured sampling strategy.
///
/// This function automatically enforces min_new_tokens by using
/// generated_tokens.len() as the current step.
///
/// Args:
///   logits: Unnormalized logits of shape (vocab_size,)
///   config: Sampling configuration
///   generated_tokens: Previously generated tokens for repetition penalty
///
/// Returns:
///   The sampled token ID
pub fn sample_token(
    logits: &Tensor,
    config: &SamplingConfig,
    generated_tokens: &[i64],
) -> Result<i64> {
    // Use generated_tokens.len() as the current step for min_new_tokens enforcement
    sample_token_with_step(logits, config, generated_tokens, generated_tokens.len())
}

/// Sample a token with min_new_tokens enforcement.
///
/// If current_step < config.min_new_tokens, the EOS token is suppressed
/// to prevent early termination.
///
/// Args:
///   logits: Unnormalized logits of shape (vocab_size,)
///   config: Sampling configuration
///   generated_tokens: Previously generated tokens for repetition penalty
///   current_step: Current generation step (0-indexed)
///
/// Returns:
///   The sampled token ID
pub fn sample_token_with_step(
    logits: &Tensor,
    config: &SamplingConfig,
    generated_tokens: &[i64],
    current_step: usize,
) -> Result<i64> {
    // Cast to F32 for sampling (standard pattern, see candle-transformers LogitsProcessor)
    let logits = logits.to_dtype(DType::F32)?;

    // Build suppress tokens list, adding EOS if below min_new_tokens
    let mut suppress_tokens = config.suppress_tokens.clone();
    if current_step < config.min_new_tokens
        && let Some(eos_id) = config.eos_token_id
        && !suppress_tokens.contains(&eos_id)
    {
        suppress_tokens.push(eos_id);
    }

    // Apply in PyTorch order (see transformers/generation/utils.py:1145-1366):
    // 1. Repetition penalty (line 1196)
    // 2. Min new tokens / Suppress tokens (lines 1237, 1280)
    // 3. Temperature (line 1321)
    // 4. Top-k (line 1325)
    // 5. Top-p (line 1329)

    // Apply repetition penalty FIRST (PyTorch order)
    let logits = apply_repetition_penalty(&logits, generated_tokens, config.repetition_penalty)?;

    // Apply suppress tokens (including EOS if below min_new_tokens)
    let logits = apply_suppress_tokens(&logits, &suppress_tokens)?;

    // Apply temperature
    let logits = apply_temperature(&logits, config.temperature)?;

    // Apply top-k
    let logits = apply_top_k(&logits, config.top_k)?;

    // Apply top-p
    let logits = apply_top_p(&logits, config.top_p)?;

    if !config.do_sample {
        // Greedy: return argmax
        let token_id = logits.argmax(0)?.to_scalar::<u32>()? as i64;
        return Ok(token_id);
    }

    // Sample from the distribution
    let probs = candle_nn::ops::softmax(&logits, 0)?;
    sample_from_probs(&probs)
}

/// Sample from a probability distribution.
fn sample_from_probs(probs: &Tensor) -> Result<i64> {
    let probs_vec = probs.to_vec1::<f32>()?;

    // Renormalize probabilities to ensure they sum to 1.0
    // This handles floating point precision issues after softmax/top-k/top-p
    let sum: f32 = probs_vec.iter().sum();
    if sum <= 0.0 || !sum.is_finite() {
        // All probabilities are zero or invalid - return argmax of original
        return Ok(probs_vec
            .iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(i, _)| i)
            .unwrap_or(0) as i64);
    }

    // Use PyTorch-compatible MT19937 RNG for reproducibility
    let random: f32 = super::mt_rng::global_uniform();
    let mut cumsum = 0.0;
    let inv_sum = 1.0 / sum;

    for (idx, &prob) in probs_vec.iter().enumerate() {
        cumsum += prob * inv_sum;
        if random < cumsum {
            return Ok(idx as i64);
        }
    }

    // Fallback: return highest probability token (more robust than last token)
    Ok(probs_vec
        .iter()
        .enumerate()
        .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
        .map(|(i, _)| i)
        .unwrap_or(0) as i64)
}

/// Sample token for batched logits.
///
/// Args:
///   logits: Logits of shape (batch, vocab_size)
///   config: Sampling configuration
///   generated_tokens: Previously generated tokens per batch item
///
/// Returns:
///   Tensor of sampled token IDs of shape (batch,)
pub fn sample_token_batch(
    logits: &Tensor,
    config: &SamplingConfig,
    generated_tokens: &[Vec<i64>],
) -> Result<Tensor> {
    let batch_size = logits.dim(0)?;
    let mut tokens = Vec::with_capacity(batch_size);

    for b in 0..batch_size {
        let batch_logits = logits.get(b)?;
        let batch_generated = if b < generated_tokens.len() {
            &generated_tokens[b]
        } else {
            &Vec::new()
        };
        let token = sample_token(&batch_logits, config, batch_generated)?;
        tokens.push(token);
    }

    Tensor::from_vec(tokens, batch_size, logits.device())
}

#[cfg(test)]
mod tests {
    use super::*;
    use candle_core::Device;

    #[test]
    fn test_temperature() -> Result<()> {
        let device = Device::Cpu;
        let logits = Tensor::from_vec(vec![1.0f32, 2.0, 3.0], 3, &device)?;

        // Temperature 1.0 should not change logits
        let scaled = apply_temperature(&logits, 1.0)?;
        assert_eq!(scaled.to_vec1::<f32>()?, vec![1.0, 2.0, 3.0]);

        // Temperature 0.5 should double the logits
        let scaled = apply_temperature(&logits, 0.5)?;
        assert_eq!(scaled.to_vec1::<f32>()?, vec![2.0, 4.0, 6.0]);

        Ok(())
    }

    #[test]
    fn test_top_k() -> Result<()> {
        let device = Device::Cpu;
        let logits = Tensor::from_vec(vec![1.0f32, 5.0, 3.0, 4.0, 2.0], 5, &device)?;

        let filtered = apply_top_k(&logits, 2)?;
        let filtered_vec = filtered.to_vec1::<f32>()?;

        // Only top 2 (5.0 and 4.0) should be kept
        assert!(filtered_vec[0].is_infinite() && filtered_vec[0].is_sign_negative());
        assert_eq!(filtered_vec[1], 5.0);
        assert!(filtered_vec[2].is_infinite() && filtered_vec[2].is_sign_negative());
        assert_eq!(filtered_vec[3], 4.0);
        assert!(filtered_vec[4].is_infinite() && filtered_vec[4].is_sign_negative());

        Ok(())
    }

    #[test]
    fn test_repetition_penalty() -> Result<()> {
        let device = Device::Cpu;
        let logits = Tensor::from_vec(vec![2.0f32, -1.0, 3.0], 3, &device)?;

        // Apply penalty of 2.0 to token 0 (positive) and token 1 (negative)
        let penalized = apply_repetition_penalty(&logits, &[0, 1], 2.0)?;
        let penalized_vec = penalized.to_vec1::<f32>()?;

        // Positive logits are divided, negative are multiplied
        assert_eq!(penalized_vec[0], 1.0); // 2.0 / 2.0
        assert_eq!(penalized_vec[1], -2.0); // -1.0 * 2.0
        assert_eq!(penalized_vec[2], 3.0); // unchanged

        Ok(())
    }

    #[test]
    fn test_greedy_sampling() -> Result<()> {
        let device = Device::Cpu;
        let logits = Tensor::from_vec(vec![1.0f32, 5.0, 3.0], 3, &device)?;

        let config = SamplingConfig::greedy();
        let token = sample_token(&logits, &config, &[])?;

        // Should return argmax (index 1)
        assert_eq!(token, 1);

        Ok(())
    }

    #[test]
    fn test_sampling_with_temperature() -> Result<()> {
        let device = Device::Cpu;
        let logits = Tensor::from_vec(vec![1.0f32, 5.0, 3.0], 3, &device)?;

        // High temperature should still allow sampling
        let config = SamplingConfig {
            temperature: 1.0,
            do_sample: false, // Use greedy to be deterministic in test
            ..Default::default()
        };
        let token = sample_token(&logits, &config, &[])?;

        // Should still return argmax when do_sample=false
        assert_eq!(token, 1);

        Ok(())
    }

    #[test]
    fn test_suppress_tokens() -> Result<()> {
        let device = Device::Cpu;
        let logits = Tensor::from_vec(vec![1.0f32, 5.0, 3.0, 4.0], 4, &device)?;

        // Suppress token 1 (which has highest logit)
        let suppressed = apply_suppress_tokens(&logits, &[1])?;
        let suppressed_vec = suppressed.to_vec1::<f32>()?;

        assert_eq!(suppressed_vec[0], 1.0);
        assert!(suppressed_vec[1].is_infinite() && suppressed_vec[1].is_sign_negative());
        assert_eq!(suppressed_vec[2], 3.0);
        assert_eq!(suppressed_vec[3], 4.0);

        Ok(())
    }

    #[test]
    fn test_suppress_tokens_in_sampling() -> Result<()> {
        let device = Device::Cpu;
        let logits = Tensor::from_vec(vec![1.0f32, 5.0, 3.0], 3, &device)?;

        // Suppress token 1 (highest logit), so greedy should pick token 2 (next highest)
        let config = SamplingConfig::greedy().with_suppress_tokens(vec![1]);
        let token = sample_token(&logits, &config, &[])?;

        // Should return token 2 (index 2 has logit 3.0, highest after suppressing index 1)
        assert_eq!(token, 2);

        Ok(())
    }

    #[test]
    fn test_min_new_tokens() -> Result<()> {
        let device = Device::Cpu;
        // EOS token (index 1) has highest logit, but should be suppressed below min_new_tokens
        let logits = Tensor::from_vec(vec![1.0f32, 5.0, 3.0], 3, &device)?;

        let config = SamplingConfig::greedy()
            .with_eos_token_id(1)
            .with_min_new_tokens(2);

        // Step 0: below min_new_tokens, EOS should be suppressed
        let token = sample_token_with_step(&logits, &config, &[], 0)?;
        // Should pick token 2 (next highest after suppressing EOS at index 1)
        assert_eq!(token, 2);

        // Step 1: still below min_new_tokens, EOS should be suppressed
        let token = sample_token_with_step(&logits, &config, &[2], 1)?;
        assert_eq!(token, 2);

        // Step 2: at min_new_tokens, EOS should NOT be suppressed
        let token = sample_token_with_step(&logits, &config, &[2, 2], 2)?;
        // Should pick token 1 (EOS) as it has highest logit
        assert_eq!(token, 1);

        Ok(())
    }

    #[test]
    fn test_min_new_tokens_with_sample_token() -> Result<()> {
        let device = Device::Cpu;
        let logits = Tensor::from_vec(vec![1.0f32, 5.0, 3.0], 3, &device)?;

        let config = SamplingConfig::greedy()
            .with_eos_token_id(1)
            .with_min_new_tokens(2);

        // sample_token uses generated_tokens.len() as the step
        // Empty generated_tokens = step 0, EOS should be suppressed
        let token = sample_token(&logits, &config, &[])?;
        assert_eq!(token, 2); // Not EOS

        // One generated token = step 1, EOS should still be suppressed
        let token = sample_token(&logits, &config, &[2])?;
        assert_eq!(token, 2); // Not EOS

        // Two generated tokens = step 2, EOS should be allowed
        let token = sample_token(&logits, &config, &[2, 2])?;
        assert_eq!(token, 1); // EOS allowed

        Ok(())
    }
}
