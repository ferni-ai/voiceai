//! Qwen3-Omni Talker: Thinker hidden states (layer 18) → codec logits (B, L, 32, 2048).
//!
//! Port of `apps/mlx-qwen3-omni/src/mlx_qwen3_omni/talker/model.py`.
//!
//! Architecture: input_proj → 20 MoE decoder layers → 5 dense code predictor layers → lm_head.

use mlx_rs::{
    builder::Builder,
    error::Exception,
    macros::ModuleParameters,
    module::Module,
    nn, Array,
};

use crate::config::{TalkerCodePredictorConfig, TalkerConfig, TalkerTextConfig, ThinkerTextConfig};
use crate::thinker::{create_causal_mask, Attention, DecoderLayer, Mlp};

// ─── CodePredictorLayer ───────────────────────────────────

/// Single code predictor layer: pre-norm attention + pre-norm SiLU MLP + residuals (dense, no MoE).
#[derive(Debug, Clone, ModuleParameters)]
#[module(root = mlx_rs)]
pub struct CodePredictorLayer {
    #[param]
    pub self_attn: Attention,
    #[param]
    pub mlp: Mlp,
    #[param]
    pub input_layernorm: nn::RmsNorm,
    #[param]
    pub post_attention_layernorm: nn::RmsNorm,
}

impl CodePredictorLayer {
    pub fn new(config: &TalkerCodePredictorConfig) -> Result<Self, Exception> {
        let args = ThinkerTextConfig {
            model_type: "qwen3_omni_code_predictor".to_string(),
            hidden_size: config.hidden_size,
            num_hidden_layers: config.num_hidden_layers,
            num_attention_heads: config.num_attention_heads,
            num_key_value_heads: config.num_key_value_heads,
            num_experts: 1,
            num_experts_per_tok: 1,
            moe_intermediate_size: config.intermediate_size,
            shared_expert_intermediate_size: 0,
            rms_norm_eps: config.rms_norm_eps,
            vocab_size: config.vocab_size,
            rope_theta: config.rope_theta,
            attention_bias: false,
            use_qk_norm: true,
            head_dim: Some(config.head_dim),
            max_position_embeddings: Some(config.max_position_embeddings),
            tie_word_embeddings: false,
        };

        Ok(Self {
            self_attn: Attention::new(&args)?,
            mlp: Mlp::new(config.hidden_size as i32, config.intermediate_size as i32)?,
            input_layernorm: nn::RmsNormBuilder::new(config.hidden_size as i32)
                .eps(config.rms_norm_eps)
                .build()?,
            post_attention_layernorm: nn::RmsNormBuilder::new(config.hidden_size as i32)
                .eps(config.rms_norm_eps)
                .build()?,
        })
    }

    pub fn forward(&mut self, x: &Array, mask: Option<&Array>) -> Result<Array, Exception> {
        let normed = self.input_layernorm.forward(x)?;
        let r = self.self_attn.forward_attn(&normed, mask)?;
        let h = x.add(&r)?;
        let normed2 = self.post_attention_layernorm.forward(&h)?;
        let r2 = self.mlp.forward(&normed2)?;
        h.add(&r2)
    }
}

// ─── TalkerTextDecoder ────────────────────────────────────

/// 20 MoE decoder layers + final RMSNorm.
#[derive(Debug, Clone, ModuleParameters)]
#[module(root = mlx_rs)]
pub struct TalkerTextDecoder {
    #[param]
    pub layers: Vec<DecoderLayer>,
    #[param]
    pub norm: nn::RmsNorm,
}

impl TalkerTextDecoder {
    pub fn new(config: &TalkerTextConfig) -> Result<Self, Exception> {
        let args = ThinkerTextConfig {
            model_type: "qwen3_omni_moe_talker".to_string(),
            hidden_size: config.hidden_size,
            num_hidden_layers: config.num_hidden_layers,
            num_attention_heads: config.num_attention_heads,
            num_key_value_heads: config.num_key_value_heads,
            num_experts: config.num_experts,
            num_experts_per_tok: config.num_experts_per_tok,
            moe_intermediate_size: config.moe_intermediate_size,
            shared_expert_intermediate_size: config.shared_expert_intermediate_size,
            rms_norm_eps: config.rms_norm_eps,
            vocab_size: config.vocab_size,
            rope_theta: config.rope_theta,
            attention_bias: false,
            use_qk_norm: true,
            head_dim: Some(config.head_dim),
            max_position_embeddings: Some(config.max_position_embeddings),
            tie_word_embeddings: false,
        };

        let layers = (0..config.num_hidden_layers)
            .map(|_| DecoderLayer::new(&args))
            .collect::<Result<Vec<_>, _>>()?;

        Ok(Self {
            layers,
            norm: nn::RmsNormBuilder::new(config.hidden_size as i32)
                .eps(config.rms_norm_eps)
                .build()?,
        })
    }

    pub fn forward(&mut self, hidden: &Array, mask: Option<&Array>) -> Result<Array, Exception> {
        let mut h = hidden.clone();
        for layer in self.layers.iter_mut() {
            h = layer.forward_layer(&h, mask)?;
        }
        self.norm.forward(&h)
    }
}

// ─── CodePredictor ────────────────────────────────────────

/// 5 dense decoder layers + norm + lm_head → (B, L, num_code_groups, vocab_size).
#[derive(Debug, Clone, ModuleParameters)]
#[module(root = mlx_rs)]
pub struct CodePredictor {
    #[param]
    pub layers: Vec<CodePredictorLayer>,
    #[param]
    pub norm: nn::RmsNorm,
    #[param]
    pub lm_head: nn::Linear,

    pub num_code_groups: usize,
    pub vocab_size: usize,
}

impl CodePredictor {
    pub fn new(config: &TalkerCodePredictorConfig) -> Result<Self, Exception> {
        let layers = (0..config.num_hidden_layers)
            .map(|_| CodePredictorLayer::new(config))
            .collect::<Result<Vec<_>, _>>()?;

        Ok(Self {
            layers,
            norm: nn::RmsNormBuilder::new(config.hidden_size as i32)
                .eps(config.rms_norm_eps)
                .build()?,
            lm_head: nn::LinearBuilder::new(
                config.hidden_size as i32,
                (config.num_code_groups * config.vocab_size) as i32,
            )
            .bias(false)
            .build()?,
            num_code_groups: config.num_code_groups,
            vocab_size: config.vocab_size,
        })
    }

    pub fn forward(&mut self, hidden: &Array, mask: Option<&Array>) -> Result<Array, Exception> {
        let mut h = hidden.clone();
        for layer in self.layers.iter_mut() {
            h = layer.forward(&h, mask)?;
        }
        h = self.norm.forward(&h)?;
        let logits = self.lm_head.forward(&h)?;
        let shape = logits.shape();
        let (b, l) = (shape[0], shape[1]);
        logits.reshape(&[b, l, self.num_code_groups as i32, self.vocab_size as i32])
    }
}

// ─── Qwen3OmniTalker ─────────────────────────────────────

/// Full Talker: Thinker hidden (B, L, 2048) → codec logits (B, L, 32, 2048).
#[derive(Debug, Clone, ModuleParameters)]
#[module(root = mlx_rs)]
pub struct Qwen3OmniTalker {
    #[param]
    pub input_proj: nn::Linear,
    #[param]
    pub text_decoder: TalkerTextDecoder,
    #[param]
    pub code_predictor: CodePredictor,
}

impl Qwen3OmniTalker {
    pub fn new(config: &TalkerConfig) -> Result<Self, Exception> {
        let tc = config.text();
        let cp = config.code_predictor();

        Ok(Self {
            input_proj: nn::LinearBuilder::new(
                config.thinker_hidden_size as i32,
                tc.hidden_size as i32,
            )
            .bias(false)
            .build()?,
            text_decoder: TalkerTextDecoder::new(&tc)?,
            code_predictor: CodePredictor::new(&cp)?,
        })
    }

    /// Forward: thinker_hidden (B, L, 2048) → codec logits (B, L, 32, 2048).
    pub fn forward(&mut self, thinker_hidden: &Array) -> Result<Array, Exception> {
        let projected = self.input_proj.forward(thinker_hidden)?;
        let l = projected.shape()[1];

        let mask = if l > 1 {
            Some(create_causal_mask(l)?)
        } else {
            None
        };

        let hidden = self.text_decoder.forward(&projected, mask.as_ref())?;
        self.code_predictor.forward(&hidden, mask.as_ref())
    }
}
