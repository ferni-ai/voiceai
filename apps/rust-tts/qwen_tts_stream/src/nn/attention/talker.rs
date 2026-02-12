//! Multimodal attention for the talker model.

use candle_core::{Result, Tensor};
use candle_nn::VarBuilder;

use crate::{config::talker_config::TalkerConfig, nn::kv_cache::KVCache};

use crate::nn::attention::rope_strategy::RopeStrategy;
use crate::nn::attention::unified::UnifiedAttention;

/// Multimodal attention with 3D RoPE.
///
/// Used in the talker model for processing combined text and audio sequences.
/// This is a wrapper around `UnifiedAttention` with multimodal RoPE strategy.
#[derive(Debug, Clone)]
pub struct TalkerAttention {
    inner: UnifiedAttention,
}

impl TalkerAttention {
    pub fn new(
        config: &TalkerConfig,
        layer_idx: usize,
        use_flash_attn: bool,
        vb: VarBuilder,
    ) -> Result<Self> {
        // Get multimodal RoPE section from config
        let (mrope_section, interleaved) = if let Some(ref rope_scaling) = config.rope_scaling {
            (rope_scaling.mrope_section.clone(), rope_scaling.interleaved)
        } else {
            (vec![16, 24, 24], false) // default
        };

        let inner = UnifiedAttention::new(
            config,
            RopeStrategy::multimodal(mrope_section, interleaved),
            layer_idx,
            use_flash_attn,
            vb,
        )?;

        Ok(Self { inner })
    }

    pub fn load(
        config: &TalkerConfig,
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

    /// Get the sliding window size if configured.
    pub fn get_sliding_window(&self) -> Option<usize> {
        self.inner.sliding_window()
    }

    /// Forward pass with multimodal RoPE.
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
