//! Qwen3-Omni Thinker: MoE backbone → text logits.
//!
//! Port of `apps/mlx-qwen3-omni/src/mlx_qwen3_omni/thinker/layers.py` + `model.py`.

use mlx_rs::{
    builder::Builder,
    error::Exception,
    fast,
    macros::ModuleParameters,
    module::{Module, Param},
    nn,
    ops,
    ops::indexing,
    Array,
};

use crate::config::ThinkerTextConfig;

// ─── SwitchLinear ─────────────────────────────────────────

/// Per-expert linear. Weight: (num_experts, output_dims, input_dims).
#[derive(Debug, Clone, ModuleParameters)]
#[module(root = mlx_rs)]
pub struct SwitchLinear {
    #[param]
    pub weight: Param<Array>,
}

impl SwitchLinear {
    pub fn new(input_dims: i32, output_dims: i32, num_experts: i32) -> Result<Self, Exception> {
        let scale = (1.0 / input_dims as f32).sqrt();
        let weight = mlx_rs::random::uniform::<f32, f32>(
            -scale,
            scale,
            &[num_experts, output_dims, input_dims],
            None,
        )?;
        Ok(Self {
            weight: Param::new(weight),
        })
    }

    pub fn forward(&mut self, x: &Array, indices: &Array) -> Result<Array, Exception> {
        // Workaround: x[:, None, :] @ w^T → squeeze
        let x_unsqueeze = x.expand_dims(1)?;
        let w_t = self.weight.take_axis(indices, 0)?.swap_axes(-1, -2)?;
        let mm = x_unsqueeze.matmul(&w_t)?;
        mm.squeeze_axes(&[1])
    }
}

// ─── SwitchGLU ────────────────────────────────────────────

/// SwitchGLU: gate_proj, up_proj, down_proj with SiLU(gate)*up.
#[derive(Debug, Clone, ModuleParameters)]
#[module(root = mlx_rs)]
pub struct SwitchGLU {
    #[param]
    gate_proj: SwitchLinear,
    #[param]
    up_proj: SwitchLinear,
    #[param]
    down_proj: SwitchLinear,
}

impl SwitchGLU {
    pub fn new(input_dims: i32, hidden_dims: i32, num_experts: i32) -> Result<Self, Exception> {
        Ok(Self {
            gate_proj: SwitchLinear::new(input_dims, hidden_dims, num_experts)?,
            up_proj: SwitchLinear::new(input_dims, hidden_dims, num_experts)?,
            down_proj: SwitchLinear::new(hidden_dims, input_dims, num_experts)?,
        })
    }

    pub fn forward(&mut self, x: &Array, indices: &Array) -> Result<Array, Exception> {
        let shape = x.shape();
        let (b, l, d) = (shape[0], shape[1], shape[2]);
        let idx_shape = indices.shape();
        let k = idx_shape[2];

        let x_expanded = x.expand_dims(2)?;
        let x_broadcast = ops::broadcast_to(&x_expanded, &[b, l, k, d])?;
        let x_flat = x_broadcast.reshape(&[-1, d])?;
        let idx_flat = indices.reshape(&[-1])?;
        let idx_flat = mlx_rs::stop_gradient(&idx_flat)?;

        let up = self.up_proj.forward(&x_flat, &idx_flat)?;
        let gate = self.gate_proj.forward(&x_flat, &idx_flat)?;
        let activated = nn::silu(gate)?.multiply(&up)?;
        let y = self.down_proj.forward(&activated, &idx_flat)?;

        y.reshape(&[b, l, k, d])
    }
}

// ─── MLP (single expert, for shared expert) ──────────────

/// Dense MLP: gate/up/down with SwiGLU.
#[derive(Debug, Clone, ModuleParameters)]
#[module(root = mlx_rs)]
pub struct Mlp {
    #[param]
    pub gate_proj: nn::Linear,
    #[param]
    pub up_proj: nn::Linear,
    #[param]
    pub down_proj: nn::Linear,
}

impl Mlp {
    pub fn new(dim: i32, hidden_dim: i32) -> Result<Self, Exception> {
        Ok(Self {
            gate_proj: nn::LinearBuilder::new(dim, hidden_dim).bias(false).build()?,
            up_proj: nn::LinearBuilder::new(dim, hidden_dim).bias(false).build()?,
            down_proj: nn::LinearBuilder::new(hidden_dim, dim).bias(false).build()?,
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

// ─── Attention ────────────────────────────────────────────

/// GQA attention + RoPE + optional QK-norm.
#[derive(Debug, Clone, ModuleParameters)]
#[module(root = mlx_rs)]
pub struct Attention {
    #[param]
    pub q_proj: nn::Linear,
    #[param]
    pub k_proj: nn::Linear,
    #[param]
    pub v_proj: nn::Linear,
    #[param]
    pub o_proj: nn::Linear,
    /// Optional QK-norm (not #[param] — Option not in param list; handled in forward).
    pub q_norm: Option<nn::RmsNorm>,
    /// Optional K-norm (not #[param]; handled in forward).
    pub k_norm: Option<nn::RmsNorm>,
    #[param]
    pub rope: nn::Rope,

    n_heads: i32,
    n_kv_heads: i32,
    scale: f32,
}

impl Attention {
    pub fn new(args: &ThinkerTextConfig) -> Result<Self, Exception> {
        let dim = args.hidden_size as i32;
        let n_heads = args.num_attention_heads as i32;
        let n_kv_heads = args.num_key_value_heads as i32;
        let head_dim = args.head_dim() as i32;
        let scale = (head_dim as f32).powf(-0.5);

        let (q_norm, k_norm) = if args.use_qk_norm {
            (
                Some(nn::RmsNormBuilder::new(head_dim).eps(args.rms_norm_eps).build()?),
                Some(nn::RmsNormBuilder::new(head_dim).eps(args.rms_norm_eps).build()?),
            )
        } else {
            (None, None)
        };

        Ok(Self {
            q_proj: nn::LinearBuilder::new(dim, n_heads * head_dim)
                .bias(args.attention_bias)
                .build()?,
            k_proj: nn::LinearBuilder::new(dim, n_kv_heads * head_dim)
                .bias(args.attention_bias)
                .build()?,
            v_proj: nn::LinearBuilder::new(dim, n_kv_heads * head_dim)
                .bias(args.attention_bias)
                .build()?,
            o_proj: nn::LinearBuilder::new(n_heads * head_dim, dim)
                .bias(false)
                .build()?,
            q_norm,
            k_norm,
            rope: nn::RopeBuilder::new(head_dim)
                .traditional(false)
                .base(args.rope_theta as f32)
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

        let mut queries = self.q_proj.forward(x)?
            .reshape(&[b, l, self.n_heads, -1])?
            .transpose_axes(&[0, 2, 1, 3])?;
        let mut keys = self.k_proj.forward(x)?
            .reshape(&[b, l, self.n_kv_heads, -1])?
            .transpose_axes(&[0, 2, 1, 3])?;
        let values = self.v_proj.forward(x)?
            .reshape(&[b, l, self.n_kv_heads, -1])?
            .transpose_axes(&[0, 2, 1, 3])?;

        // QK norm
        if let (Some(qn), Some(kn)) = (&mut self.q_norm, &mut self.k_norm) {
            queries = qn.forward(&queries)?;
            keys = kn.forward(&keys)?;
        }

        // RoPE
        queries = self.rope.forward(&queries)?;
        keys = self.rope.forward(&keys)?;

        // Scaled dot-product attention (mask: Option<ScaledDotProductAttentionMask>)
        let sdpa_mask: Option<fast::ScaledDotProductAttentionMask> =
            mask.map(fast::ScaledDotProductAttentionMask::from);
        let output = fast::scaled_dot_product_attention(
            &queries,
            &keys,
            &values,
            self.scale,
            sdpa_mask,
        )?;

        let output = output
            .transpose_axes(&[0, 2, 1, 3])?
            .reshape(&[b, l, -1])?;
        self.o_proj.forward(&output)
    }
}

// ─── SparseMoeBlock ───────────────────────────────────────

/// MoE block: router → top-k → SwitchGLU + optional shared expert.
#[derive(Debug, Clone, ModuleParameters)]
#[module(root = mlx_rs)]
pub struct SparseMoeBlock {
    #[param]
    gate: nn::Linear,
    #[param]
    switch_mlp: SwitchGLU,
    /// Optional shared expert (not #[param]; handled in forward).
    shared_expert: Option<Mlp>,
    /// Optional shared gate (not #[param]; handled in forward).
    shared_expert_gate: Option<nn::Linear>,

    num_experts: i32,
    top_k: i32,
}

impl SparseMoeBlock {
    pub fn new(args: &ThinkerTextConfig) -> Result<Self, Exception> {
        let dim = args.hidden_size as i32;
        let intermediate = args.moe_intermediate_size as i32;
        let shared_size = args.shared_expert_intermediate_size as i32;
        let num_experts = args.num_experts as i32;

        let (shared_expert, shared_expert_gate) = if shared_size > 0 {
            (
                Some(Mlp::new(dim, shared_size)?),
                Some(nn::LinearBuilder::new(dim, 1).bias(false).build()?),
            )
        } else {
            (None, None)
        };

        Ok(Self {
            gate: nn::LinearBuilder::new(dim, num_experts).bias(false).build()?,
            switch_mlp: SwitchGLU::new(dim, intermediate, num_experts)?,
            shared_expert,
            shared_expert_gate,
            num_experts,
            top_k: args.num_experts_per_tok as i32,
        })
    }

    pub fn forward_moe(&mut self, x: &Array) -> Result<Array, Exception> {
        let gates = self.gate.forward(x)?;
        let k = self.top_k;

        // Top-k selection
        let neg_gates = gates.negative()?;
        let inds = ops::argpartition_axis(&neg_gates, k - 1, -1)?;
        let arange_k = Array::from_slice(&(0..k).map(|i| i).collect::<Vec<i32>>(), &[k]);
        let inds = inds.take_axis(&arange_k, -1)?;
        let inds = mlx_rs::stop_gradient(&inds)?;

        let topk_gates = indexing::take_along_axis(&gates, &inds, -1)?;
        let scores = ops::softmax_axis(&topk_gates, -1, None)?;

        // SwitchGLU
        let y = self.switch_mlp.forward(x, &inds)?;

        // Weighted sum
        let scores_expanded = scores.expand_dims(-1)?;
        let y_weighted = y.multiply(&scores_expanded)?;
        let mut output = y_weighted.sum_axis(-2, false)?;

        // Optional shared expert
        if let (Some(shared), Some(shared_gate)) = (&mut self.shared_expert, &mut self.shared_expert_gate) {
            let shared_out = shared.forward(x)?;
            let gate_val = nn::sigmoid(&shared_gate.forward(x)?)?;
            output = output.add(&gate_val.multiply(&shared_out)?)?;
        }

        Ok(output)
    }
}

// ─── DecoderLayer ─────────────────────────────────────────

/// Pre-norm attention + pre-norm MoE + residuals.
#[derive(Debug, Clone, ModuleParameters)]
#[module(root = mlx_rs)]
pub struct DecoderLayer {
    #[param]
    pub self_attn: Attention,
    #[param]
    pub mlp: SparseMoeBlock,
    #[param]
    pub input_layernorm: nn::RmsNorm,
    #[param]
    pub post_attention_layernorm: nn::RmsNorm,
}

impl DecoderLayer {
    pub fn new(args: &ThinkerTextConfig) -> Result<Self, Exception> {
        Ok(Self {
            self_attn: Attention::new(args)?,
            mlp: SparseMoeBlock::new(args)?,
            input_layernorm: nn::RmsNormBuilder::new(args.hidden_size as i32)
                .eps(args.rms_norm_eps)
                .build()?,
            post_attention_layernorm: nn::RmsNormBuilder::new(args.hidden_size as i32)
                .eps(args.rms_norm_eps)
                .build()?,
        })
    }

    pub fn forward_layer(&mut self, x: &Array, mask: Option<&Array>) -> Result<Array, Exception> {
        let normed = self.input_layernorm.forward(x)?;
        let r = self.self_attn.forward_attn(&normed, mask)?;
        let h = x.add(&r)?;
        let normed2 = self.post_attention_layernorm.forward(&h)?;
        let r2 = self.mlp.forward_moe(&normed2)?;
        h.add(&r2)
    }
}

// ─── ThinkerModel ─────────────────────────────────────────

/// Thinker backbone: embed → layers → norm (no lm_head).
#[derive(Debug, Clone, ModuleParameters)]
#[module(root = mlx_rs)]
pub struct ThinkerModel {
    #[param]
    pub embed_tokens: nn::Embedding,
    #[param]
    pub layers: Vec<DecoderLayer>,
    #[param]
    pub norm: nn::RmsNorm,
}

impl ThinkerModel {
    pub fn new(args: &ThinkerTextConfig) -> Result<Self, Exception> {
        let layers = (0..args.num_hidden_layers)
            .map(|_| DecoderLayer::new(args))
            .collect::<Result<Vec<_>, _>>()?;

        Ok(Self {
            embed_tokens: nn::Embedding::new(args.vocab_size as i32, args.hidden_size as i32)?,
            layers,
            norm: nn::RmsNormBuilder::new(args.hidden_size as i32)
                .eps(args.rms_norm_eps)
                .build()?,
        })
    }

    /// Forward with optional extraction at a specific layer (for Talker input).
    pub fn forward_with_extract(
        &mut self,
        inputs: &Array,
        audio_features: Option<&Array>,
        extract_layer: Option<usize>,
    ) -> Result<(Array, Option<Array>), Exception> {
        let mut h = if let Some(audio) = audio_features {
            let text_emb = self.embed_tokens.forward(inputs)?;
            ops::concatenate_axis(&[audio, &text_emb], 1)?
        } else {
            self.embed_tokens.forward(inputs)?
        };

        // Create causal mask
        let seq_len = h.shape()[1];
        let mask = if seq_len > 1 {
            Some(nn::MultiHeadAttention::create_additive_causal_mask::<f32>(seq_len)?)
        } else {
            None
        };

        let mut extracted = None;
        for (i, layer) in self.layers.iter_mut().enumerate() {
            h = layer.forward_layer(&h, mask.as_ref())?;
            if extract_layer == Some(i) {
                extracted = Some(h.clone());
            }
        }

        let final_out = self.norm.forward(&h)?;
        if extracted.is_none() {
            extracted = Some(final_out.clone());
        }
        Ok((final_out, extracted))
    }
}

// ─── Qwen3OmniThinker ────────────────────────────────────

/// Full Thinker: MoE backbone → text logits.
#[derive(Debug, Clone, ModuleParameters)]
#[module(root = mlx_rs)]
pub struct Qwen3OmniThinker {
    #[param]
    pub model: ThinkerModel,
    /// Optional lm_head when not tied (not #[param]; handled in forward).
    pub lm_head: Option<nn::Linear>,

    tie_word_embeddings: bool,
}

impl Qwen3OmniThinker {
    pub fn new(config: &ThinkerTextConfig) -> Result<Self, Exception> {
        let lm_head = if config.tie_word_embeddings {
            None
        } else {
            Some(
                nn::LinearBuilder::new(config.hidden_size as i32, config.vocab_size as i32)
                    .bias(false)
                    .build()?,
            )
        };

        Ok(Self {
            model: ThinkerModel::new(config)?,
            lm_head,
            tie_word_embeddings: config.tie_word_embeddings,
        })
    }

    /// Forward: input_ids → logits.
    pub fn forward_thinker(
        &mut self,
        input_ids: &Array,
        audio_features: Option<&Array>,
    ) -> Result<Array, Exception> {
        let (out, _) = self.model.forward_with_extract(input_ids, audio_features, None)?;
        self.apply_lm_head(&out)
    }

    /// Forward with hidden state extraction (for Talker).
    pub fn forward_with_hidden_states(
        &mut self,
        input_ids: &Array,
        audio_features: Option<&Array>,
        extract_layer: usize,
    ) -> Result<(Array, Array), Exception> {
        let (final_hidden, extracted) =
            self.model
                .forward_with_extract(input_ids, audio_features, Some(extract_layer))?;
        let logits = self.apply_lm_head(&final_hidden)?;
        Ok((logits, extracted.expect("extracted should be Some")))
    }

    fn apply_lm_head(&mut self, hidden: &Array) -> Result<Array, Exception> {
        if let Some(ref mut lm_head) = self.lm_head {
            lm_head.forward(hidden)
        } else {
            // Tied embeddings: use Embedding.as_linear
            self.model.embed_tokens.as_linear(hidden)
        }
    }
}

/// Create an additive causal mask for attention.
pub fn create_causal_mask(n: i32) -> Result<Array, Exception> {
    nn::MultiHeadAttention::create_additive_causal_mask::<f32>(n)
}
