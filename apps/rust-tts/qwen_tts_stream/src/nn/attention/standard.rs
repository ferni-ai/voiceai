//! Standard attention for the code predictor.

use candle_core::{Result, Tensor};
use candle_nn::VarBuilder;

use crate::{config::code_predictor_config::CodePredictorConfig, nn::kv_cache::KVCache};

use crate::nn::attention::rope_strategy::RopeStrategy;
use crate::nn::attention::unified::UnifiedAttention;

/// Standard attention with per-head Q/K normalization.
///
/// Used in the code predictor and other standard transformer layers.
/// This is a wrapper around `UnifiedAttention` with standard RoPE strategy.
#[derive(Debug, Clone)]
pub struct Attention {
    inner: UnifiedAttention,
    effective_sliding_window: Option<usize>,
}

impl Attention {
    pub fn new(
        config: &CodePredictorConfig,
        layer_idx: usize,
        use_flash_attn: bool,
        vb: VarBuilder,
    ) -> Result<Self> {
        // Determine if this layer uses sliding window
        let layer_types = config.get_layer_types();
        let use_sliding_window = layer_types
            .get(layer_idx)
            .map(|t| t == "sliding_attention")
            .unwrap_or(false);

        let effective_sliding_window = if use_sliding_window {
            config.sliding_window
        } else {
            None
        };

        // Create a config adapter that respects the per-layer sliding window setting
        let sliding_config = SlidingWindowConfigAdapter {
            config,
            effective_sliding_window,
        };

        let inner = UnifiedAttention::new(
            &sliding_config,
            RopeStrategy::standard(),
            layer_idx,
            use_flash_attn,
            vb,
        )?;

        Ok(Self {
            inner,
            effective_sliding_window,
        })
    }

    pub fn load(
        config: &CodePredictorConfig,
        layer_idx: usize,
        use_flash_attn: bool,
        vb: VarBuilder,
    ) -> Result<Self> {
        Self::new(config, layer_idx, use_flash_attn, vb)
    }

    /// Get layer index.
    pub fn layer_idx(&self) -> usize {
        self.inner.layer_idx()
    }

    /// Get the effective sliding window for this layer.
    pub fn effective_sliding_window(&self) -> Option<usize> {
        self.effective_sliding_window
    }

    /// Forward pass with RoPE.
    pub fn forward(
        &self,
        hidden_states: &Tensor,
        position_embeddings: (&Tensor, &Tensor),
        attention_mask: Option<&Tensor>,
    ) -> Result<Tensor> {
        self.inner
            .forward(hidden_states, position_embeddings, attention_mask)
    }

    /// Forward pass with KV-cache for efficient autoregressive generation.
    pub fn forward_with_cache(
        &self,
        hidden_states: &Tensor,
        position_embeddings: (&Tensor, &Tensor),
        attention_mask: Option<&Tensor>,
        cache: &mut KVCache,
    ) -> Result<Tensor> {
        self.inner
            .forward_with_cache(hidden_states, position_embeddings, attention_mask, cache)
    }
}

/// Adapter to provide per-layer sliding window configuration.
struct SlidingWindowConfigAdapter<'a> {
    config: &'a CodePredictorConfig,
    effective_sliding_window: Option<usize>,
}

impl crate::nn::attention::config::AttentionConfig for SlidingWindowConfigAdapter<'_> {
    fn hidden_size(&self) -> usize {
        self.config.hidden_size
    }

    fn num_attention_heads(&self) -> usize {
        self.config.num_attention_heads
    }

    fn num_key_value_heads(&self) -> usize {
        self.config.num_key_value_heads
    }

    fn head_dim(&self) -> usize {
        self.config.head_dim
    }

    fn attention_bias(&self) -> bool {
        self.config.attention_bias
    }

    fn rms_norm_eps(&self) -> f64 {
        self.config.rms_norm_eps
    }

    fn sliding_window(&self) -> Option<usize> {
        self.effective_sliding_window
    }
}
