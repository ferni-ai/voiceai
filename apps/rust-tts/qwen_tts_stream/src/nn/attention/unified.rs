//! Unified attention implementation.
//!
//! This module provides a single attention implementation that handles both
//! standard and multimodal RoPE through the `RopeStrategy` abstraction.

use candle_core::{Result, Tensor};
use candle_nn::{Linear, Module, VarBuilder, linear, linear_no_bias};

use crate::nn::attention::config::AttentionConfig;
use crate::nn::attention::rope_strategy::RopeStrategy;
use crate::nn::attention::{eager_attention_forward_with_sliding_window, flash_attention_forward};
use crate::nn::kv_cache::KVCache;
use crate::nn::norm::RMSNorm;

/// Unified attention with configurable RoPE strategy.
///
/// This struct implements attention with per-head Q/K normalization and
/// supports both standard and multimodal RoPE through the `RopeStrategy` enum.
#[derive(Debug, Clone)]
pub struct UnifiedAttention {
    q_proj: Linear,
    k_proj: Linear,
    v_proj: Linear,
    o_proj: Linear,
    q_norm: RMSNorm,
    k_norm: RMSNorm,
    num_heads: usize,
    num_kv_heads: usize,
    head_dim: usize,
    num_kv_groups: usize,
    scaling: f64,
    rope_strategy: RopeStrategy,
    sliding_window: Option<usize>,
    layer_idx: usize,
    use_flash_attn: bool,
}

impl UnifiedAttention {
    /// Create a new unified attention layer.
    pub fn new<C: AttentionConfig>(
        config: &C,
        rope_strategy: RopeStrategy,
        layer_idx: usize,
        use_flash_attn: bool,
        vb: VarBuilder,
    ) -> Result<Self> {
        let head_dim = config.head_dim();
        let num_heads = config.num_attention_heads();
        let num_kv_heads = config.num_key_value_heads();
        let hidden_size = config.hidden_size();

        let q_proj = if config.attention_bias() {
            linear(hidden_size, num_heads * head_dim, vb.pp("q_proj"))?
        } else {
            linear_no_bias(hidden_size, num_heads * head_dim, vb.pp("q_proj"))?
        };

        let k_proj = if config.attention_bias() {
            linear(hidden_size, num_kv_heads * head_dim, vb.pp("k_proj"))?
        } else {
            linear_no_bias(hidden_size, num_kv_heads * head_dim, vb.pp("k_proj"))?
        };

        let v_proj = if config.attention_bias() {
            linear(hidden_size, num_kv_heads * head_dim, vb.pp("v_proj"))?
        } else {
            linear_no_bias(hidden_size, num_kv_heads * head_dim, vb.pp("v_proj"))?
        };

        let o_proj = if config.attention_bias() {
            linear(num_heads * head_dim, hidden_size, vb.pp("o_proj"))?
        } else {
            linear_no_bias(num_heads * head_dim, hidden_size, vb.pp("o_proj"))?
        };

        let q_norm = RMSNorm::new(head_dim, config.rms_norm_eps(), vb.pp("q_norm"))?;
        let k_norm = RMSNorm::new(head_dim, config.rms_norm_eps(), vb.pp("k_norm"))?;

        let num_kv_groups = num_heads / num_kv_heads;
        let scaling = (head_dim as f64).powf(-0.5);

        Ok(Self {
            q_proj,
            k_proj,
            v_proj,
            o_proj,
            q_norm,
            k_norm,
            num_heads,
            num_kv_heads,
            head_dim,
            num_kv_groups,
            scaling,
            rope_strategy,
            sliding_window: config.sliding_window(),
            layer_idx,
            use_flash_attn,
        })
    }

    /// Get layer index.
    pub fn layer_idx(&self) -> usize {
        self.layer_idx
    }

    /// Get the sliding window size if configured.
    pub fn sliding_window(&self) -> Option<usize> {
        self.sliding_window
    }

    /// Forward pass with RoPE.
    ///
    /// Args:
    ///   hidden_states: Input tensor (batch, seq_len, hidden_size)
    ///   position_embeddings: (cos, sin) from RoPE
    ///   attention_mask: Optional causal mask
    pub fn forward(
        &self,
        hidden_states: &Tensor,
        position_embeddings: (&Tensor, &Tensor),
        attention_mask: Option<&Tensor>,
    ) -> Result<Tensor> {
        let (batch, seq_len, _) = hidden_states.dims3()?;

        // Project Q, K, V
        let query_states = self.q_proj.forward(hidden_states)?;
        let key_states = self.k_proj.forward(hidden_states)?;
        let value_states = self.v_proj.forward(hidden_states)?;

        // Reshape to (batch, seq_len, num_heads, head_dim)
        let query_states = query_states.reshape((batch, seq_len, self.num_heads, self.head_dim))?;
        let key_states = key_states.reshape((batch, seq_len, self.num_kv_heads, self.head_dim))?;
        let value_states =
            value_states.reshape((batch, seq_len, self.num_kv_heads, self.head_dim))?;

        // Apply per-head normalization
        let query_states = self.q_norm.forward(&query_states)?;
        let key_states = self.k_norm.forward(&key_states)?;

        // Transpose to (batch, heads, seq_len, head_dim)
        let query_states = query_states.transpose(1, 2)?;
        let key_states = key_states.transpose(1, 2)?;
        let value_states = value_states.transpose(1, 2)?;

        // Apply RoPE using the configured strategy
        let (cos, sin) = position_embeddings;
        let (query_states, key_states) =
            self.rope_strategy
                .apply(&query_states, &key_states, cos, sin)?;

        // Compute attention - use flash attention if enabled and on CUDA
        let use_flash = self.use_flash_attn && query_states.device().is_cuda();
        let attn_output = if use_flash {
            flash_attention_forward(
                &query_states,
                &key_states,
                &value_states,
                self.scaling,
                self.sliding_window,
            )?
        } else {
            eager_attention_forward_with_sliding_window(
                &query_states,
                &key_states,
                &value_states,
                attention_mask,
                self.num_kv_groups,
                self.scaling,
                self.sliding_window,
            )?
        };

        // Reshape and project output
        let attn_output = attn_output.reshape((batch, seq_len, self.num_heads * self.head_dim))?;
        self.o_proj.forward(&attn_output)
    }

    /// Forward pass with KV-cache for efficient autoregressive generation.
    pub fn forward_with_cache(
        &self,
        hidden_states: &Tensor,
        position_embeddings: (&Tensor, &Tensor),
        attention_mask: Option<&Tensor>,
        cache: &mut KVCache,
    ) -> Result<Tensor> {
        let (batch, seq_len, _) = hidden_states.dims3()?;

        // Project Q, K, V
        let query_states = self.q_proj.forward(hidden_states)?;
        let key_states = self.k_proj.forward(hidden_states)?;
        let value_states = self.v_proj.forward(hidden_states)?;

        // Reshape to (batch, seq_len, num_heads, head_dim)
        let query_states = query_states.reshape((batch, seq_len, self.num_heads, self.head_dim))?;
        let key_states = key_states.reshape((batch, seq_len, self.num_kv_heads, self.head_dim))?;
        let value_states =
            value_states.reshape((batch, seq_len, self.num_kv_heads, self.head_dim))?;

        // Apply per-head normalization
        let query_states = self.q_norm.forward(&query_states)?;
        let key_states = self.k_norm.forward(&key_states)?;

        // Transpose to (batch, heads, seq_len, head_dim)
        let query_states = query_states.transpose(1, 2)?;
        let key_states = key_states.transpose(1, 2)?;
        let value_states = value_states.transpose(1, 2)?;

        // Apply RoPE using the configured strategy
        let (cos, sin) = position_embeddings;
        let (query_states, key_states) =
            self.rope_strategy
                .apply(&query_states, &key_states, cos, sin)?;

        // Update KV-cache and get full key/value tensors
        let (key_states, value_states) =
            cache.update(self.layer_idx, &key_states, &value_states)?;

        // Compute attention - use flash attention if enabled and on CUDA
        let use_flash = self.use_flash_attn && query_states.device().is_cuda();
        let attn_output = if use_flash {
            flash_attention_forward(
                &query_states,
                &key_states,
                &value_states,
                self.scaling,
                self.sliding_window,
            )?
        } else {
            eager_attention_forward_with_sliding_window(
                &query_states,
                &key_states,
                &value_states,
                attention_mask,
                self.num_kv_groups,
                self.scaling,
                self.sliding_window,
            )?
        };

        // Reshape and project output
        let attn_output = attn_output.reshape((batch, seq_len, self.num_heads * self.head_dim))?;
        self.o_proj.forward(&attn_output)
    }
}
