//! Transformer decoder layer implementations.

use candle_core::{Result, Tensor};
use candle_nn::{Module, VarBuilder};

use crate::{
    config::{code_predictor_config::CodePredictorConfig, talker_config::TalkerConfig},
    nn::{
        attention::{AttentionLayer, standard::Attention, talker::TalkerAttention},
        kv_cache::KVCache,
        mlp::TalkerMLP,
        norm::RMSNorm,
    },
};

/// Generic decoder layer parameterized by attention type.
///
/// This struct provides a single implementation for both code predictor
/// and talker decoder layers, using the `AttentionLayer` trait for polymorphism.
#[derive(Debug, Clone)]
pub struct GenericDecoderLayer<A: AttentionLayer> {
    self_attn: A,
    mlp: TalkerMLP,
    input_layernorm: RMSNorm,
    post_attention_layernorm: RMSNorm,
}

impl<A: AttentionLayer> GenericDecoderLayer<A> {
    /// Forward pass.
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
        // Pre-norm attention
        let residual = hidden_states;
        let hidden_states = self.input_layernorm.forward(hidden_states)?;
        let hidden_states =
            self.self_attn
                .forward(&hidden_states, position_embeddings, attention_mask)?;
        let hidden_states = (residual + hidden_states)?;

        // Pre-norm FFN
        let residual = &hidden_states;
        let hidden_states = self.post_attention_layernorm.forward(&hidden_states)?;
        let hidden_states = self.mlp.forward(&hidden_states)?;
        residual + &hidden_states
    }

    /// Forward pass with KV-cache for efficient autoregressive generation.
    ///
    /// Args:
    ///   hidden_states: Input tensor (batch, seq_len, hidden_size)
    ///   position_embeddings: (cos, sin) from RoPE
    ///   attention_mask: Optional causal mask
    ///   cache: Mutable reference to the KV cache
    pub fn forward_with_cache(
        &self,
        hidden_states: &Tensor,
        position_embeddings: (&Tensor, &Tensor),
        attention_mask: Option<&Tensor>,
        cache: &mut KVCache,
    ) -> Result<Tensor> {
        // Pre-norm attention with cache
        let residual = hidden_states;
        let hidden_states = self.input_layernorm.forward(hidden_states)?;
        let hidden_states = self.self_attn.forward_with_cache(
            &hidden_states,
            position_embeddings,
            attention_mask,
            cache,
        )?;
        let hidden_states = (residual + hidden_states)?;

        // Pre-norm FFN (no cache needed for MLP)
        let residual = &hidden_states;
        let hidden_states = self.post_attention_layernorm.forward(&hidden_states)?;
        let hidden_states = self.mlp.forward(&hidden_states)?;
        residual + &hidden_states
    }
}

/// Decoder layer for the code predictor.
///
/// Standard transformer decoder layer with:
/// - Pre-norm architecture (norm before attention and FFN)
/// - Per-head Q/K normalization
/// - Gated MLP
pub type DecoderLayer = GenericDecoderLayer<Attention>;

impl DecoderLayer {
    pub fn new(
        config: &CodePredictorConfig,
        layer_idx: usize,
        use_flash_attn: bool,
        vb: VarBuilder,
    ) -> Result<Self> {
        let self_attn = Attention::new(config, layer_idx, use_flash_attn, vb.pp("self_attn"))?;
        let mlp = TalkerMLP::new(
            config.hidden_size,
            config.intermediate_size,
            &config.hidden_act,
            vb.pp("mlp"),
        )?;
        let input_layernorm = RMSNorm::new(
            config.hidden_size,
            config.rms_norm_eps,
            vb.pp("input_layernorm"),
        )?;
        let post_attention_layernorm = RMSNorm::new(
            config.hidden_size,
            config.rms_norm_eps,
            vb.pp("post_attention_layernorm"),
        )?;

        Ok(Self {
            self_attn,
            mlp,
            input_layernorm,
            post_attention_layernorm,
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
}

/// Decoder layer for the talker model.
///
/// Uses multimodal attention with 3D RoPE for combined text and audio processing.
pub type TalkerDecoderLayer = GenericDecoderLayer<TalkerAttention>;

impl TalkerDecoderLayer {
    pub fn new(
        config: &TalkerConfig,
        layer_idx: usize,
        use_flash_attn: bool,
        vb: VarBuilder,
    ) -> Result<Self> {
        let self_attn =
            TalkerAttention::new(config, layer_idx, use_flash_attn, vb.pp("self_attn"))?;
        let mlp = TalkerMLP::new(
            config.hidden_size,
            config.intermediate_size,
            &config.hidden_act,
            vb.pp("mlp"),
        )?;
        let input_layernorm = RMSNorm::new(
            config.hidden_size,
            config.rms_norm_eps,
            vb.pp("input_layernorm"),
        )?;
        let post_attention_layernorm = RMSNorm::new(
            config.hidden_size,
            config.rms_norm_eps,
            vb.pp("post_attention_layernorm"),
        )?;

        Ok(Self {
            self_attn,
            mlp,
            input_layernorm,
            post_attention_layernorm,
        })
    }

    pub fn load(
        config: &TalkerConfig,
        layer_idx: usize,
        use_flash_attn: bool,
        vb: VarBuilder,
    ) -> Result<Self> {
        Self::new(config, layer_idx, use_flash_attn, vb)
    }

    /// Forward pass with KV-cache (compatibility wrapper with layer_idx parameter).
    ///
    /// Note: layer_idx parameter is unused - attention stores its own layer_idx.
    #[allow(clippy::too_many_arguments)]
    pub fn forward_with_cache_compat(
        &self,
        hidden_states: &Tensor,
        position_embeddings: (&Tensor, &Tensor),
        attention_mask: Option<&Tensor>,
        cache: &mut KVCache,
        _layer_idx: usize,
    ) -> Result<Tensor> {
        self.forward_with_cache(hidden_states, position_embeddings, attention_mask, cache)
    }
}
