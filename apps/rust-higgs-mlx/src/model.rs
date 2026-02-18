//! Higgs Audio V2 — DualFFN Llama model on Apple MLX (Rust).
//!
//! Port of apps/mlx-higgs/model.py (MLX Python) and
//! apps/rust-higgs-pipeline/src/tts/model.rs (Candle).
//!
//! Uses mlx-rs for Metal GPU acceleration on Apple Silicon.

use mlx_rs::{
    builder::Builder,
    error::Exception,
    fast,
    macros::ModuleParameters,
    module::Module,
    nn, Array,
};

use crate::config::{HiggsAudioConfig, TextConfig};

// ─── MLP (Gate + Up + Down with SiLU) ──────────────────────────

#[derive(Debug, Clone, ModuleParameters)]
#[module(root = mlx_rs)]
pub struct Mlp {
    #[param]
    gate_proj: nn::Linear,
    #[param]
    up_proj: nn::Linear,
    #[param]
    down_proj: nn::Linear,
}

impl Mlp {
    pub fn new(hidden_size: i32, intermediate_size: i32) -> Result<Self, Exception> {
        Ok(Self {
            gate_proj: nn::LinearBuilder::new(hidden_size, intermediate_size)
                .bias(false)
                .build()?,
            up_proj: nn::LinearBuilder::new(hidden_size, intermediate_size)
                .bias(false)
                .build()?,
            down_proj: nn::LinearBuilder::new(intermediate_size, hidden_size)
                .bias(false)
                .build()?,
        })
    }
}

impl Module<&Array> for Mlp {
    type Error = Exception;
    type Output = Array;

    fn forward(&mut self, x: &Array) -> Result<Array, Exception> {
        let gate = nn::silu(self.gate_proj.forward(x)?)?;
        let up = self.up_proj.forward(x)?;
        self.down_proj.forward(&gate.multiply(&up)?)
    }

    fn training_mode(&mut self, _mode: bool) {}
}

// ─── Attention ─────────────────────────────────────────────────

#[derive(Debug, Clone, ModuleParameters)]
#[module(root = mlx_rs)]
pub struct Attention {
    #[param]
    q_proj: nn::Linear,
    #[param]
    k_proj: nn::Linear,
    #[param]
    v_proj: nn::Linear,
    #[param]
    o_proj: nn::Linear,
    #[param]
    rope: nn::Rope,

    n_heads: i32,
    n_kv_heads: i32,
    scale: f32,
}

impl Attention {
    pub fn new(config: &TextConfig) -> Result<Self, Exception> {
        let dim = config.hidden_size as i32;
        let n_heads = config.num_attention_heads as i32;
        let n_kv_heads = config.num_key_value_heads as i32;
        let head_dim = config.head_dim as i32;
        let scale = (head_dim as f32).powf(-0.5);

        Ok(Self {
            q_proj: nn::LinearBuilder::new(dim, n_heads * head_dim)
                .bias(false)
                .build()?,
            k_proj: nn::LinearBuilder::new(dim, n_kv_heads * head_dim)
                .bias(false)
                .build()?,
            v_proj: nn::LinearBuilder::new(dim, n_kv_heads * head_dim)
                .bias(false)
                .build()?,
            o_proj: nn::LinearBuilder::new(n_heads * head_dim, dim)
                .bias(false)
                .build()?,
            rope: nn::RopeBuilder::new(head_dim)
                .traditional(false)
                .base(config.rope_theta as f32)
                .build()?,
            n_heads,
            n_kv_heads,
            scale,
        })
    }

    pub fn forward_attn(
        &mut self,
        x: &Array,
        mask: Option<&Array>,
    ) -> Result<Array, Exception> {
        let shape = x.shape();
        let (b, l) = (shape[0], shape[1]);

        let queries = self
            .q_proj
            .forward(x)?
            .reshape(&[b, l, self.n_heads, -1])?
            .transpose_axes(&[0, 2, 1, 3])?;
        let keys = self
            .k_proj
            .forward(x)?
            .reshape(&[b, l, self.n_kv_heads, -1])?
            .transpose_axes(&[0, 2, 1, 3])?;
        let values = self
            .v_proj
            .forward(x)?
            .reshape(&[b, l, self.n_kv_heads, -1])?
            .transpose_axes(&[0, 2, 1, 3])?;

        let queries = self.rope.forward(&queries)?;
        let keys = self.rope.forward(&keys)?;

        // MLX fast SDPA handles GQA repeat and flash attention internally
        let sdpa_mask: Option<fast::ScaledDotProductAttentionMask> =
            mask.map(fast::ScaledDotProductAttentionMask::from);
        let output = fast::scaled_dot_product_attention(
            &queries, &keys, &values, self.scale, sdpa_mask,
        )?;

        let output = output
            .transpose_axes(&[0, 2, 1, 3])?
            .reshape(&[b, l, -1])?;
        self.o_proj.forward(&output)
    }
}

// ─── DualFFN Decoder Layer ─────────────────────────────────────

/// Transformer layer with DualFFN: text and audio tokens share
/// attention but route through separate FFN paths.
#[derive(Debug, Clone, ModuleParameters)]
#[module(root = mlx_rs)]
pub struct DualFFNDecoderLayer {
    #[param]
    input_layernorm: nn::RmsNorm,
    #[param]
    self_attn: Attention,

    // Text FFN
    #[param]
    post_attention_layernorm: nn::RmsNorm,
    #[param]
    mlp: Mlp,

    // Audio FFN
    #[param]
    audio_input_layernorm: nn::RmsNorm,
    #[param]
    audio_post_attention_layernorm: nn::RmsNorm,
    #[param]
    audio_mlp: Mlp,

    fast_forward: bool,
}

impl DualFFNDecoderLayer {
    pub fn new(config: &HiggsAudioConfig, fast_forward: bool) -> Result<Self, Exception> {
        let tc = &config.text_config;
        let eps = tc.rms_norm_eps as f32;
        let h = tc.hidden_size as i32;
        let audio_h = config.audio_ffn_hidden_size as i32;
        let audio_inter = config.audio_ffn_intermediate_size as i32;

        Ok(Self {
            input_layernorm: nn::RmsNormBuilder::new(h).eps(eps).build()?,
            self_attn: Attention::new(tc)?,
            post_attention_layernorm: nn::RmsNormBuilder::new(h).eps(eps).build()?,
            mlp: Mlp::new(h, tc.intermediate_size as i32)?,
            audio_input_layernorm: nn::RmsNormBuilder::new(audio_h).eps(eps).build()?,
            audio_post_attention_layernorm: nn::RmsNormBuilder::new(audio_h)
                .eps(eps)
                .build()?,
            audio_mlp: Mlp::new(audio_h, audio_inter)?,
            fast_forward,
        })
    }

    pub fn forward_layer(
        &mut self,
        x: &Array,
        causal_mask: Option<&Array>,
        is_all_audio: bool,
    ) -> Result<Array, Exception> {
        let residual = x.clone();

        // Pre-attention norm
        let normed = if self.fast_forward || !is_all_audio {
            self.input_layernorm.forward(x)?
        } else {
            self.audio_input_layernorm.forward(x)?
        };

        let attn_out = self.self_attn.forward_attn(&normed, causal_mask)?;
        let hidden = residual.add(&attn_out)?;

        // FFN routing
        let residual = hidden.clone();
        if is_all_audio {
            let normed = self.audio_post_attention_layernorm.forward(&hidden)?;
            let mlp_out = self.audio_mlp.forward(&normed)?;
            residual.add(&mlp_out)
        } else {
            let normed = self.post_attention_layernorm.forward(&hidden)?;
            let mlp_out = self.mlp.forward(&normed)?;
            residual.add(&mlp_out)
        }
    }
}

// ─── Full Model ───────────────────────────────────────────────

#[derive(Debug, Clone, ModuleParameters)]
#[module(root = mlx_rs)]
pub struct HiggsAudioModelMlx {
    #[param]
    pub embed_tokens: nn::Embedding,
    #[param]
    pub layers: Vec<DualFFNDecoderLayer>,
    #[param]
    pub norm: nn::RmsNorm,
    #[param]
    pub text_lm_head: nn::Linear,
    #[param]
    pub audio_lm_head: nn::Linear,
    #[param]
    pub audio_codebook_embeddings: nn::Embedding,
}

impl HiggsAudioModelMlx {
    pub fn new(config: &HiggsAudioConfig) -> Result<Self, Exception> {
        let tc = &config.text_config;
        let eps = tc.rms_norm_eps as f32;
        let h = tc.hidden_size as i32;

        let mut layers = Vec::with_capacity(tc.num_hidden_layers);
        for i in 0..tc.num_hidden_layers {
            let fast_forward = !config.has_dual_ffn(i);
            layers.push(DualFFNDecoderLayer::new(config, fast_forward)?);
        }

        let cb_vocab = config.audio_num_codebooks * config.audio_vocab_per_codebook();

        Ok(Self {
            embed_tokens: nn::Embedding::new(tc.vocab_size as i32, h)?,
            layers,
            norm: nn::RmsNormBuilder::new(h).eps(eps).build()?,
            text_lm_head: nn::LinearBuilder::new(h, tc.vocab_size as i32)
                .bias(false)
                .build()?,
            audio_lm_head: nn::LinearBuilder::new(h, config.audio_lm_head_size() as i32)
                .bias(false)
                .build()?,
            audio_codebook_embeddings: nn::Embedding::new(cb_vocab as i32, h)?,
        })
    }

    pub fn forward_model(
        &mut self,
        input_embeds: &Array,
        is_all_audio: bool,
    ) -> Result<Array, Exception> {
        let seq_len = input_embeds.shape()[1];

        let mask = if seq_len > 1 {
            Some(nn::MultiHeadAttention::create_additive_causal_mask::<f32>(
                seq_len as i32,
            )?)
        } else {
            None
        };

        let mut hidden = input_embeds.clone();
        for layer in &mut self.layers {
            hidden = layer.forward_layer(&hidden, mask.as_ref(), is_all_audio)?;
        }

        self.norm.forward(&hidden)
    }

    pub fn embed_text(&mut self, input_ids: &Array) -> Result<Array, Exception> {
        self.embed_tokens.forward(input_ids)
    }

    pub fn embed_audio_codes(
        &mut self,
        codes: &[u32],
        vocab_per_cb: usize,
    ) -> Result<Array, Exception> {
        let shifted: Vec<i32> = codes
            .iter()
            .enumerate()
            .map(|(cb, &code)| (code as i32) + (cb as i32) * (vocab_per_cb as i32))
            .collect();

        let ids = Array::from_slice(&shifted, &[1, codes.len() as i32]);
        let embeds = self.audio_codebook_embeddings.forward(&ids)?;
        // Sum across codebooks: (1, 8, hidden) -> (1, 1, hidden)
        embeds.sum_axes(&[1], true)
    }

    pub fn text_logits(&mut self, hidden: &Array) -> Result<Array, Exception> {
        self.text_lm_head.forward(hidden)
    }

    pub fn audio_logits(
        &mut self,
        hidden: &Array,
        num_codebooks: usize,
        vocab_per_cb: usize,
    ) -> Result<Array, Exception> {
        let raw = self.audio_lm_head.forward(hidden)?;
        let shape = raw.shape();
        let (b, s) = (shape[0], shape[1]);
        raw.reshape(&[b, s, num_codebooks as i32, vocab_per_cb as i32])
    }
}
