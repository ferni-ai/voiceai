//! Transformer components for the tokenizer decoder.

use candle_core::{DType, Result, Tensor};
use candle_nn::{Linear, Module, VarBuilder, linear, linear_no_bias};

use crate::{
    audio::decoder::config::TokenizerV2DecoderConfig,
    nn::{
        attention::{create_sliding_window_mask, eager_attention_forward_with_sliding_window},
        norm::RMSNorm,
        rope::{apply_rotary_pos_emb_manual, simple::SimpleRotaryEmbedding},
    },
};

#[cfg(feature = "flash-attn")]
use crate::nn::attention::flash_attention_forward;

/// Attention layer for the tokenizer decoder.
#[derive(Debug, Clone)]
pub struct TokenizerDecoderAttention {
    q_proj: Linear,
    k_proj: Linear,
    v_proj: Linear,
    o_proj: Linear,
    num_heads: usize,
    num_kv_heads: usize,
    head_dim: usize,
    num_kv_groups: usize,
    scaling: f64,
    #[cfg(feature = "flash-attn")]
    sliding_window: Option<usize>,
    #[cfg(feature = "flash-attn")]
    use_flash_attn: bool,
}

impl TokenizerDecoderAttention {
    pub fn new(
        config: &TokenizerV2DecoderConfig,
        #[cfg_attr(not(feature = "flash-attn"), allow(unused_variables))] use_flash_attn: bool,
        vb: VarBuilder,
    ) -> Result<Self> {
        // Use explicit head_dim from config if available, otherwise calculate
        let head_dim = config
            .head_dim
            .unwrap_or(config.hidden_size / config.num_attention_heads);
        let num_heads = config.num_attention_heads;
        let num_kv_heads = config.num_key_value_heads;

        let q_proj = if config.attention_bias {
            linear(config.hidden_size, num_heads * head_dim, vb.pp("q_proj"))?
        } else {
            linear_no_bias(config.hidden_size, num_heads * head_dim, vb.pp("q_proj"))?
        };

        let k_proj = if config.attention_bias {
            linear(config.hidden_size, num_kv_heads * head_dim, vb.pp("k_proj"))?
        } else {
            linear_no_bias(config.hidden_size, num_kv_heads * head_dim, vb.pp("k_proj"))?
        };

        let v_proj = if config.attention_bias {
            linear(config.hidden_size, num_kv_heads * head_dim, vb.pp("v_proj"))?
        } else {
            linear_no_bias(config.hidden_size, num_kv_heads * head_dim, vb.pp("v_proj"))?
        };

        let o_proj = if config.attention_bias {
            linear(num_heads * head_dim, config.hidden_size, vb.pp("o_proj"))?
        } else {
            linear_no_bias(num_heads * head_dim, config.hidden_size, vb.pp("o_proj"))?
        };

        Ok(Self {
            q_proj,
            k_proj,
            v_proj,
            o_proj,
            num_heads,
            num_kv_heads,
            head_dim,
            num_kv_groups: num_heads / num_kv_heads,
            scaling: (head_dim as f64).powf(-0.5),
            #[cfg(feature = "flash-attn")]
            sliding_window: Some(config.sliding_window),
            #[cfg(feature = "flash-attn")]
            use_flash_attn,
        })
    }

    pub fn forward(
        &self,
        hidden_states: &Tensor,
        position_embeddings: (&Tensor, &Tensor),
        attention_mask: Option<&Tensor>,
    ) -> Result<Tensor> {
        let (batch, seq_len, _) = hidden_states.dims3()?;

        let query = self.q_proj.forward(hidden_states)?;
        let key = self.k_proj.forward(hidden_states)?;
        let value = self.v_proj.forward(hidden_states)?;

        let query = query
            .reshape((batch, seq_len, self.num_heads, self.head_dim))?
            .transpose(1, 2)?;
        let key = key
            .reshape((batch, seq_len, self.num_kv_heads, self.head_dim))?
            .transpose(1, 2)?;
        let value = value
            .reshape((batch, seq_len, self.num_kv_heads, self.head_dim))?
            .transpose(1, 2)?;

        let (cos, sin) = position_embeddings;
        let (query, key) = apply_rotary_pos_emb_manual(&query, &key, cos, sin)?;

        // Use flash attention if enabled and available (CUDA only)
        // Note: For eager attention, the sliding window mask is already provided via attention_mask
        // parameter from the transformer. Flash attention handles sliding window internally.
        #[cfg(feature = "flash-attn")]
        let attn_output = if self.use_flash_attn {
            // Flash attention returns (batch, seq_len, heads, head_dim)
            let out =
                flash_attention_forward(&query, &key, &value, self.scaling, self.sliding_window)?;
            // Reshape directly to (batch, seq_len, hidden)
            out.reshape((batch, seq_len, self.num_heads * self.head_dim))?
        } else {
            // Use pre-computed mask, don't pass sliding_window to avoid double masking
            let out = eager_attention_forward_with_sliding_window(
                &query,
                &key,
                &value,
                attention_mask,
                self.num_kv_groups,
                self.scaling,
                None, // Mask already applied via attention_mask
            )?;
            out.reshape((batch, seq_len, self.num_heads * self.head_dim))?
        };

        #[cfg(not(feature = "flash-attn"))]
        let attn_output = {
            // Use pre-computed mask, don't pass sliding_window to avoid double masking
            let out = eager_attention_forward_with_sliding_window(
                &query,
                &key,
                &value,
                attention_mask,
                self.num_kv_groups,
                self.scaling,
                None, // Mask already applied via attention_mask
            )?;
            out.reshape((batch, seq_len, self.num_heads * self.head_dim))?
        };

        self.o_proj.forward(&attn_output)
    }
}

/// MLP for the tokenizer decoder.
#[derive(Debug, Clone)]
pub struct TokenizerDecoderMLP {
    gate_proj: Linear,
    up_proj: Linear,
    down_proj: Linear,
}

impl TokenizerDecoderMLP {
    pub fn new(config: &TokenizerV2DecoderConfig, vb: VarBuilder) -> Result<Self> {
        let gate_proj = linear_no_bias(
            config.hidden_size,
            config.intermediate_size,
            vb.pp("gate_proj"),
        )?;
        let up_proj = linear_no_bias(
            config.hidden_size,
            config.intermediate_size,
            vb.pp("up_proj"),
        )?;
        let down_proj = linear_no_bias(
            config.intermediate_size,
            config.hidden_size,
            vb.pp("down_proj"),
        )?;

        Ok(Self {
            gate_proj,
            up_proj,
            down_proj,
        })
    }
}

impl Module for TokenizerDecoderMLP {
    fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        let original_dtype = xs.dtype();
        let gate_proj = self.gate_proj.forward(xs)?;
        let up = self.up_proj.forward(xs)?;

        // Apply SiLU activation in F32 for precision (matching talker MLP optimization)
        // SiLU = x * sigmoid(x) can lose precision in BF16 for extreme values
        let gate_f32 = gate_proj.to_dtype(DType::F32)?;
        let gate = candle_nn::ops::silu(&gate_f32)?;
        let up_f32 = up.to_dtype(DType::F32)?;
        let hidden = (gate * up_f32)?;
        let hidden = hidden.to_dtype(original_dtype)?;

        self.down_proj.forward(&hidden)
    }
}

/// Layer scale for the tokenizer decoder.
#[derive(Debug, Clone)]
pub struct LayerScale {
    scale: Tensor,
}

impl LayerScale {
    pub fn new(channels: usize, initial_scale: f64, vb: VarBuilder) -> Result<Self> {
        let scale = vb.get_with_hints(channels, "scale", candle_nn::Init::Const(initial_scale))?;
        Ok(Self { scale })
    }
}

impl Module for LayerScale {
    fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        xs.broadcast_mul(&self.scale)
    }
}

/// Transformer layer for the tokenizer decoder.
#[derive(Debug, Clone)]
pub struct TokenizerV2DecoderTransformerLayer {
    self_attn: TokenizerDecoderAttention,
    mlp: TokenizerDecoderMLP,
    input_layernorm: RMSNorm,
    post_attention_layernorm: RMSNorm,
    self_attn_layer_scale: LayerScale,
    mlp_layer_scale: LayerScale,
}

impl TokenizerV2DecoderTransformerLayer {
    pub fn new(
        config: &TokenizerV2DecoderConfig,
        use_flash_attn: bool,
        vb: VarBuilder,
    ) -> Result<Self> {
        let self_attn = TokenizerDecoderAttention::new(config, use_flash_attn, vb.pp("self_attn"))?;
        let mlp = TokenizerDecoderMLP::new(config, vb.pp("mlp"))?;
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
        let self_attn_layer_scale = LayerScale::new(
            config.hidden_size,
            config.layer_scale_initial_scale,
            vb.pp("self_attn_layer_scale"),
        )?;
        let mlp_layer_scale = LayerScale::new(
            config.hidden_size,
            config.layer_scale_initial_scale,
            vb.pp("mlp_layer_scale"),
        )?;

        Ok(Self {
            self_attn,
            mlp,
            input_layernorm,
            post_attention_layernorm,
            self_attn_layer_scale,
            mlp_layer_scale,
        })
    }

    pub fn forward(
        &self,
        hidden_states: &Tensor,
        position_embeddings: (&Tensor, &Tensor),
        attention_mask: Option<&Tensor>,
    ) -> Result<Tensor> {
        // Pre-norm attention with layer scale
        let residual = hidden_states;
        let hidden_states = self.input_layernorm.forward(hidden_states)?;
        let hidden_states =
            self.self_attn
                .forward(&hidden_states, position_embeddings, attention_mask)?;
        let hidden_states = self.self_attn_layer_scale.forward(&hidden_states)?;
        let hidden_states = (residual + hidden_states)?;

        // Pre-norm MLP with layer scale
        let residual = &hidden_states;
        let hidden_states = self.post_attention_layernorm.forward(&hidden_states)?;
        let hidden_states = self.mlp.forward(&hidden_states)?;
        let hidden_states = self.mlp_layer_scale.forward(&hidden_states)?;
        residual + hidden_states
    }
}

/// Transformer model for the tokenizer decoder.
#[derive(Debug, Clone)]
pub struct TokenizerV2DecoderTransformer {
    layers: Vec<TokenizerV2DecoderTransformerLayer>,
    norm: RMSNorm,
    rotary_emb: SimpleRotaryEmbedding,
    input_proj: Linear,
    output_proj: Linear,
    sliding_window: usize,
}

impl TokenizerV2DecoderTransformer {
    pub fn new(
        config: &TokenizerV2DecoderConfig,
        use_flash_attn: bool,
        vb: VarBuilder,
    ) -> Result<Self> {
        let layers = (0..config.num_hidden_layers)
            .map(|i| {
                TokenizerV2DecoderTransformerLayer::new(
                    config,
                    use_flash_attn,
                    vb.pp(format!("layers.{}", i)),
                )
            })
            .collect::<Result<Vec<_>>>()?;

        let norm = RMSNorm::new(config.hidden_size, config.rms_norm_eps, vb.pp("norm"))?;

        let head_dim = config
            .head_dim
            .unwrap_or(config.hidden_size / config.num_attention_heads);
        // Use 32768 as max_seq_len - matches max_position_embeddings
        let rotary_emb = SimpleRotaryEmbedding::new(
            head_dim,
            32768,
            config.rope_theta,
            vb.device(),
            DType::F32,
        )?;

        let input_proj = linear(config.latent_dim, config.hidden_size, vb.pp("input_proj"))?;
        let output_proj = linear(config.hidden_size, config.latent_dim, vb.pp("output_proj"))?;

        Ok(Self {
            layers,
            norm,
            rotary_emb,
            input_proj,
            output_proj,
            sliding_window: config.sliding_window,
        })
    }

    pub fn forward(&self, inputs_embeds: &Tensor) -> Result<Tensor> {
        let (batch_size, seq_len, _) = inputs_embeds.dims3()?;

        // Project input
        let hidden_states = self.input_proj.forward(inputs_embeds)?;

        // Get precomputed RoPE cos/sin for this sequence length
        let (cos, sin) = self.rotary_emb.forward(seq_len)?;
        // Expand to batch size
        let cos = cos.broadcast_as((batch_size, seq_len, cos.dim(2)?))?;
        let sin = sin.broadcast_as((batch_size, seq_len, sin.dim(2)?))?;

        // Create sliding window causal mask (matching Python's behavior)
        // Each position can only attend to positions within the sliding window AND not future positions
        let attention_mask = create_sliding_window_mask(
            seq_len,
            seq_len,
            self.sliding_window,
            hidden_states.dtype(),
            hidden_states.device(),
        )?;

        // Pass through layers
        let mut hidden_states = hidden_states;
        for layer in &self.layers {
            hidden_states = layer.forward(&hidden_states, (&cos, &sin), Some(&attention_mask))?;
        }

        // Final norm and projection
        let hidden_states = self.norm.forward(&hidden_states)?;
        self.output_proj.forward(&hidden_states)
    }
}
