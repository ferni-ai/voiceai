//! Attention configuration trait.
//!
//! This trait abstracts the configuration differences between code predictor
//! and talker attention, allowing unified attention implementation.

/// Configuration trait for attention modules.
///
/// Implemented by `CodePredictorConfig` and `TalkerConfig` to provide
/// common configuration values needed by the unified attention implementation.
pub trait AttentionConfig {
    /// Hidden dimension of the model.
    fn hidden_size(&self) -> usize;

    /// Number of attention heads.
    fn num_attention_heads(&self) -> usize;

    /// Number of key-value heads for grouped-query attention.
    fn num_key_value_heads(&self) -> usize;

    /// Dimension of each attention head.
    fn head_dim(&self) -> usize;

    /// Whether to use bias in attention projections.
    fn attention_bias(&self) -> bool;

    /// RMS norm epsilon for Q/K normalization.
    fn rms_norm_eps(&self) -> f64;

    /// Optional sliding window size for this layer.
    /// Returns Some(window_size) if sliding window should be used, None otherwise.
    fn sliding_window(&self) -> Option<usize>;
}
