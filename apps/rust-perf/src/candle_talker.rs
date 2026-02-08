//! Qwen3-Omni Talker in Candle.
//!
//! Port of Qwen3OmniMoeTalker: consumes Thinker hidden states from a given layer,
//! runs 20 MoE decoder layers (text decoder), then 5-layer code predictor to output
//! multi-codebook codec token logits for Code2Wav.

use crate::candle_moe::*;
use candle_core::{DType, Device, Result as CandleResult, Tensor};
use candle_nn::{embedding, linear_no_bias, Embedding, Linear, Module, VarBuilder};
use std::path::Path;

// ============================================================================
// CONFIG
// ============================================================================

/// Talker text decoder config (talker_config.text_config).
#[derive(Debug, Clone)]
pub struct TalkerTextConfig {
    pub vocab_size: usize,
    pub hidden_size: usize,
    pub num_hidden_layers: usize,
    pub num_attention_heads: usize,
    pub num_key_value_heads: usize,
    pub num_experts: usize,
    pub num_experts_per_tok: usize,
    pub moe_intermediate_size: usize,
    pub shared_expert_intermediate_size: usize,
    pub rms_norm_eps: f64,
    pub rope_theta: f64,
    pub max_position_embeddings: usize,
    pub head_dim: usize,
}

/// Talker code predictor config (talker_config.code_predictor_config).
#[derive(Debug, Clone)]
pub struct TalkerCodePredictorConfig {
    pub hidden_size: usize,
    pub num_hidden_layers: usize,
    pub num_attention_heads: usize,
    pub num_key_value_heads: usize,
    pub intermediate_size: usize,
    pub rms_norm_eps: f64,
    pub rope_theta: f64,
    pub max_position_embeddings: usize,
    pub head_dim: usize,
    pub num_code_groups: usize,
    pub vocab_size: usize,
}

/// Full Talker config.
#[derive(Debug, Clone)]
pub struct TalkerConfig {
    pub thinker_hidden_size: usize,
    pub accept_hidden_layer: usize,
    pub num_code_groups: usize,
    pub text_config: TalkerTextConfig,
    pub code_predictor_config: TalkerCodePredictorConfig,
}

impl Default for TalkerConfig {
    /// Defaults match HuggingFace Qwen3OmniMoeTalkerConfig:
    /// accept_hidden_layer=18, num_code_groups=32, num_experts_per_tok=8.
    fn default() -> Self {
        Self {
            thinker_hidden_size: 2048,
            accept_hidden_layer: 18, // HF default: layer 18 (not 24)
            num_code_groups: 32,     // HF default: 32 codebook groups
            text_config: TalkerTextConfig {
                vocab_size: 4206, // codec vocab + special tokens
                hidden_size: 1024,
                num_hidden_layers: 20,
                num_attention_heads: 16,
                num_key_value_heads: 2,
                num_experts: 128,
                num_experts_per_tok: 8, // HF default: top-8 routing
                moe_intermediate_size: 384,
                shared_expert_intermediate_size: 0, // HF Qwen3MoeConfig has no shared expert
                rms_norm_eps: 1e-6,
                rope_theta: 1_000_000.0,
                max_position_embeddings: 65536,
                head_dim: 64,
            },
            code_predictor_config: TalkerCodePredictorConfig {
                hidden_size: 1024,
                num_hidden_layers: 5,
                num_attention_heads: 16,
                num_key_value_heads: 8,
                intermediate_size: 3072,
                rms_norm_eps: 1e-6,
                rope_theta: 1_000_000.0,
                max_position_embeddings: 65536,
                head_dim: 64, // hidden_size / num_attention_heads
                num_code_groups: 32, // HF default: 32
                vocab_size: 2048,
            },
        }
    }
}

impl TalkerConfig {
    pub fn from_json_path(path: &Path) -> CandleResult<Self> {
        let s = std::fs::read_to_string(path)
            .map_err(|e| candle_core::Error::Msg(format!("Failed to read config: {}", e)))?;
        let v: serde_json::Value =
            serde_json::from_str(&s).map_err(|e| candle_core::Error::Msg(format!("Parse config: {}", e)))?;
        let talker = v
            .get("talker_config")
            .or(v.get("talker_config"))
            .or(Some(&v));
        let talker = talker.ok_or_else(|| candle_core::Error::Msg("Missing talker_config".into()))?;
        let text = talker.get("text_config").unwrap_or(talker);
        let code = talker.get("code_predictor_config").unwrap_or(talker);
        let hidden = text.get("hidden_size").and_then(|x| x.as_u64()).unwrap_or(1024) as usize;
        let num_heads = text.get("num_attention_heads").and_then(|x| x.as_u64()).unwrap_or(16) as usize;
        let head_dim = text.get("head_dim").and_then(|x| x.as_u64()).map(|x| x as usize)
            .unwrap_or_else(|| hidden / num_heads);
        Ok(Self {
            thinker_hidden_size: talker.get("thinker_hidden_size").and_then(|x| x.as_u64()).unwrap_or(2048) as usize,
            accept_hidden_layer: talker.get("accept_hidden_layer").and_then(|x| x.as_u64()).unwrap_or(18) as usize,
            num_code_groups: talker.get("num_code_groups").and_then(|x| x.as_u64()).unwrap_or(32) as usize,
            text_config: TalkerTextConfig {
                vocab_size: text.get("vocab_size").and_then(|x| x.as_u64()).unwrap_or(4206) as usize,
                hidden_size: hidden,
                num_hidden_layers: text.get("num_hidden_layers").and_then(|x| x.as_u64()).unwrap_or(20) as usize,
                num_attention_heads: num_heads,
                num_key_value_heads: text.get("num_key_value_heads").and_then(|x| x.as_u64()).unwrap_or(2) as usize,
                num_experts: text.get("num_experts").and_then(|x| x.as_u64()).unwrap_or(128) as usize,
                num_experts_per_tok: text.get("num_experts_per_tok").and_then(|x| x.as_u64()).unwrap_or(8) as usize,
                moe_intermediate_size: text.get("moe_intermediate_size").and_then(|x| x.as_u64()).unwrap_or(384) as usize,
                shared_expert_intermediate_size: text.get("shared_expert_intermediate_size").and_then(|x| x.as_u64()).unwrap_or(0) as usize,
                rms_norm_eps: text.get("rms_norm_eps").and_then(|x| x.as_f64()).unwrap_or(1e-6),
                rope_theta: text.get("rope_theta").and_then(|x| x.as_f64()).unwrap_or(1_000_000.0),
                max_position_embeddings: text.get("max_position_embeddings").and_then(|x| x.as_u64()).unwrap_or(65536) as usize,
                head_dim,
            },
            code_predictor_config: {
                let cp_hidden = code.get("hidden_size").and_then(|x| x.as_u64()).unwrap_or(1024) as usize;
                let cp_heads = code.get("num_attention_heads").and_then(|x| x.as_u64()).unwrap_or(16) as usize;
                let cp_head_dim = code.get("head_dim").and_then(|x| x.as_u64()).map(|x| x as usize)
                    .unwrap_or_else(|| cp_hidden / cp_heads);
                TalkerCodePredictorConfig {
                    hidden_size: cp_hidden,
                    num_hidden_layers: code.get("num_hidden_layers").and_then(|x| x.as_u64()).unwrap_or(5) as usize,
                    num_attention_heads: cp_heads,
                    num_key_value_heads: code.get("num_key_value_heads").and_then(|x| x.as_u64()).unwrap_or(8) as usize,
                    intermediate_size: code.get("intermediate_size").and_then(|x| x.as_u64()).unwrap_or(3072) as usize,
                    rms_norm_eps: code.get("rms_norm_eps").and_then(|x| x.as_f64()).unwrap_or(1e-6),
                    rope_theta: code.get("rope_theta").and_then(|x| x.as_f64()).unwrap_or(1_000_000.0),
                    max_position_embeddings: code.get("max_position_embeddings").and_then(|x| x.as_u64()).unwrap_or(65536) as usize,
                    head_dim: cp_head_dim,
                    num_code_groups: code.get("num_code_groups").and_then(|x| x.as_u64()).unwrap_or(32) as usize,
                    vocab_size: code.get("vocab_size").and_then(|x| x.as_u64()).unwrap_or(2048) as usize,
                }
            },
        })
    }
}

// ============================================================================
// Talker Rotary Embedding (RoPE for text decoder)
// ============================================================================

struct TalkerRotaryEmbedding {
    cos: Tensor,
    sin: Tensor,
}

impl TalkerRotaryEmbedding {
    fn new(cfg: &TalkerTextConfig, dtype: DType, device: &Device) -> CandleResult<Self> {
        let dim = cfg.head_dim;
        let max_seq_len = cfg.max_position_embeddings;
        let theta = cfg.rope_theta;
        let inv_freq: Vec<f32> = (0..dim)
            .step_by(2)
            .map(|i| 1.0 / (theta as f32).powf(i as f32 / dim as f32))
            .collect();
        let inv_freq = Tensor::new(inv_freq.as_slice(), device)?.to_dtype(dtype)?;
        let t: Vec<f32> = (0..max_seq_len).map(|i| i as f32).collect();
        let t = Tensor::new(t.as_slice(), device)?.to_dtype(dtype)?.unsqueeze(1)?;
        let inv_freq = inv_freq.unsqueeze(0)?;
        let freqs = t.matmul(&inv_freq)?;
        let cos = freqs.cos()?;
        let sin = freqs.sin()?;
        Ok(Self { cos, sin })
    }
    fn apply(&self, q: &Tensor, k: &Tensor, seqlen_offset: usize) -> CandleResult<(Tensor, Tensor)> {
        let (_, _, seq_len, _) = q.dims4()?;
        let cos = self.cos.narrow(0, seqlen_offset, seq_len)?.to_dtype(q.dtype())?;
        let sin = self.sin.narrow(0, seqlen_offset, seq_len)?.to_dtype(q.dtype())?;
        let q_embed = apply_rotary_emb(q, &cos, &sin)?;
        let k_embed = apply_rotary_emb(k, &cos, &sin)?;
        Ok((q_embed, k_embed))
    }
}

// ============================================================================
// Talker Attention (GQA 16 heads, 2 KV heads, RoPE, QK norm, KV cache)
// ============================================================================

struct TalkerAttention {
    q_proj: Linear,
    k_proj: Linear,
    v_proj: Linear,
    o_proj: Linear,
    qk_norm: QKNorm,
    num_heads: usize,
    num_kv_heads: usize,
    head_dim: usize,
}

impl TalkerAttention {
    fn load(vb: VarBuilder, cfg: &TalkerTextConfig) -> CandleResult<Self> {
        let hidden = cfg.hidden_size;
        let num_heads = cfg.num_attention_heads;
        let num_kv_heads = cfg.num_key_value_heads;
        let head_dim = cfg.head_dim;
        let q_proj = linear_no_bias(hidden, num_heads * head_dim, vb.pp("q_proj"))?;
        let k_proj = linear_no_bias(hidden, num_kv_heads * head_dim, vb.pp("k_proj"))?;
        let v_proj = linear_no_bias(hidden, num_kv_heads * head_dim, vb.pp("v_proj"))?;
        let o_proj = linear_no_bias(num_heads * head_dim, hidden, vb.pp("o_proj"))?;
        let qk_norm = QKNorm::load(vb.clone(), head_dim, cfg.rms_norm_eps)?;
        Ok(Self {
            q_proj,
            k_proj,
            v_proj,
            o_proj,
            qk_norm,
            num_heads,
            num_kv_heads,
            head_dim,
        })
    }

    fn forward(
        &self,
        hidden_states: &Tensor,
        rotary: &TalkerRotaryEmbedding,
        cache: Option<&mut KvCache>,
        seqlen_offset: usize,
        attention_mask: Option<&Tensor>,
    ) -> CandleResult<Tensor> {
        let (b, l, _) = hidden_states.dims3()?;
        let q = self.q_proj.forward(hidden_states)?;
        let k = self.k_proj.forward(hidden_states)?;
        let v = self.v_proj.forward(hidden_states)?;
        let q = q.reshape((b, l, self.num_heads, self.head_dim))?;
        let k = k.reshape((b, l, self.num_kv_heads, self.head_dim))?;
        let v = v.reshape((b, l, self.num_kv_heads, self.head_dim))?;
        let q = self.qk_norm.q_norm.forward(&q)?;
        let k = self.qk_norm.k_norm.forward(&k)?;
        let q = q.transpose(1, 2)?;
        let k = k.transpose(1, 2)?;
        let v = v.transpose(1, 2)?;
        let (q, k) = rotary.apply(&q, &k, seqlen_offset)?;
        let (k, v) = if let Some(c) = cache {
            c.update(k, v)?
        } else {
            (k, v)
        };
        let n_rep = self.num_heads / self.num_kv_heads;
        let k = repeat_kv(k, n_rep)?;
        let v = repeat_kv(v, n_rep)?;
        let scale = 1.0 / (self.head_dim as f64).sqrt();
        let mut attn_weights = (q.matmul(&k.transpose(2, 3)?)? * scale)?;
        if let Some(mask) = attention_mask {
            attn_weights = attn_weights.broadcast_add(mask)?;
        }
        let attn_weights = softmax_manual(&attn_weights)?;
        let attn_output = attn_weights.matmul(&v)?;
        let attn_output = attn_output.transpose(1, 2)?.reshape((b, l, ()))?;
        self.o_proj.forward(&attn_output)
    }
}

// ============================================================================
// Talker Sparse MoE Block (128 experts, top-8, moe_intermediate=384)
// ============================================================================

struct TalkerSparseMoeBlock {
    gate: Linear,
    switch_mlp: SwitchGLU,
    num_experts: usize,
    top_k: usize,
}

impl TalkerSparseMoeBlock {
    fn load(vb: VarBuilder, cfg: &TalkerTextConfig) -> CandleResult<Self> {
        let hidden = cfg.hidden_size;
        let intermediate = cfg.moe_intermediate_size;
        let num_experts = cfg.num_experts;
        let top_k = cfg.num_experts_per_tok;
        let gate = linear_no_bias(hidden, num_experts, vb.pp("gate"))?;
        let switch_mlp = SwitchGLU::load(vb.pp("switch_mlp"), hidden, intermediate, num_experts)?;
        Ok(Self {
            gate,
            switch_mlp,
            num_experts,
            top_k,
        })
    }

    fn forward(&self, x: &Tensor) -> CandleResult<Tensor> {
        let (b, l, hidden) = x.dims3()?;
        let gates = self.gate.forward(x)?; // (b, l, num_experts)
        let gates = softmax_manual(&gates)?;
        let gates_f32 = gates.to_dtype(DType::F32)?;
        let neg = gates_f32.neg()?;
        let (_sorted_vals, sorted_idx) = neg.sort_last_dim(false)?;
        let k = self.top_k.min(self.num_experts);
        let indices = sorted_idx.narrow(2, 0, k)?.contiguous()?; // (b, l, k) - contiguous for gather
        let scores = gates_f32.gather(&indices, 2)?; // (b, l, k)
        let scores = scores.to_dtype(x.dtype())?;

        let x_expand = x.unsqueeze(2)?.expand((b, l, k, hidden))?;
        let x_flat = x_expand.reshape((b * l * k, hidden))?;
        let indices_flat = indices.reshape((b * l * k,))?;
        let out_flat = self.switch_mlp.forward(&x_flat, &indices_flat)?;
        let out = out_flat.reshape((b, l, k, hidden))?;
        let scores = scores.unsqueeze(3)?; // (b, l, k, 1)
        out.broadcast_mul(&scores)?.sum(2)
    }
}

// ============================================================================
// Talker Decoder Layer (pre-norm attention + MoE + residuals)
// ============================================================================

struct TalkerDecoderLayer {
    self_attn: TalkerAttention,
    mlp: TalkerSparseMoeBlock,
    input_layernorm: RmsNorm,
    post_attention_layernorm: RmsNorm,
}

impl TalkerDecoderLayer {
    fn load(vb: VarBuilder, cfg: &TalkerTextConfig) -> CandleResult<Self> {
        let self_attn = TalkerAttention::load(vb.pp("self_attn"), cfg)?;
        let mlp = TalkerSparseMoeBlock::load(vb.pp("mlp"), cfg)?;
        let input_layernorm =
            RmsNorm::load(vb.pp("input_layernorm"), cfg.hidden_size, cfg.rms_norm_eps)?;
        let post_attention_layernorm = RmsNorm::load(
            vb.pp("post_attention_layernorm"),
            cfg.hidden_size,
            cfg.rms_norm_eps,
        )?;
        Ok(Self {
            self_attn,
            mlp,
            input_layernorm,
            post_attention_layernorm,
        })
    }

    fn forward(
        &self,
        x: &Tensor,
        rotary: &TalkerRotaryEmbedding,
        cache: Option<&mut KvCache>,
        seqlen_offset: usize,
        attention_mask: Option<&Tensor>,
    ) -> CandleResult<Tensor> {
        let residual = x;
        let x = self.input_layernorm.forward(x)?;
        let x = self.self_attn.forward(&x, rotary, cache, seqlen_offset, attention_mask)?;
        let x = (residual + x)?;
        let residual = &x;
        let x = self.post_attention_layernorm.forward(&x)?;
        let x = self.mlp.forward(&x)?;
        Ok((residual + x)?)
    }
}

// ============================================================================
// Talker Text Decoder (embed_tokens + 20 layers + final RMSNorm + RotaryEmbedding)
// ============================================================================

struct TalkerTextDecoder {
    embed_tokens: Embedding,
    layers: Vec<TalkerDecoderLayer>,
    norm: RmsNorm,
    rotary: TalkerRotaryEmbedding,
}

impl TalkerTextDecoder {
    fn load(
        vb: VarBuilder,
        cfg: &TalkerTextConfig,
        dtype: DType,
        device: &Device,
    ) -> CandleResult<Self> {
        let embed_tokens = embedding(cfg.vocab_size, cfg.hidden_size, vb.pp("embed_tokens"))?;
        let mut layers = Vec::with_capacity(cfg.num_hidden_layers);
        let vb_layers = vb.pp("layers");
        for i in 0..cfg.num_hidden_layers {
            let layer = TalkerDecoderLayer::load(vb_layers.pp(i), cfg)?;
            layers.push(layer);
        }
        let norm = RmsNorm::load(vb.pp("norm"), cfg.hidden_size, cfg.rms_norm_eps)?;
        let rotary = TalkerRotaryEmbedding::new(cfg, dtype, device)?;
        Ok(Self {
            embed_tokens,
            layers,
            norm,
            rotary,
        })
    }

    fn forward(
        &self,
        hidden_states: &Tensor,
        mut cache: Option<&mut [KvCache]>,
        seqlen_offset: usize,
        attention_mask: Option<&Tensor>,
    ) -> CandleResult<Tensor> {
        let mut x = hidden_states.clone();
        for (i, layer) in self.layers.iter().enumerate() {
            let c = cache.as_mut().and_then(|c| c.get_mut(i));
            x = layer.forward(&x, &self.rotary, c, seqlen_offset, attention_mask)?;
        }
        self.norm.forward(&x)
    }
}

// ============================================================================
// Code Predictor: Rotary Embedding
// ============================================================================

struct CodePredictorRotaryEmbedding {
    cos: Tensor,
    sin: Tensor,
}

impl CodePredictorRotaryEmbedding {
    fn new(cfg: &TalkerCodePredictorConfig, dtype: DType, device: &Device) -> CandleResult<Self> {
        let dim = cfg.head_dim;
        let max_seq_len = cfg.max_position_embeddings;
        let theta = cfg.rope_theta;
        let inv_freq: Vec<f32> = (0..dim)
            .step_by(2)
            .map(|i| 1.0 / (theta as f32).powf(i as f32 / dim as f32))
            .collect();
        let inv_freq = Tensor::new(inv_freq.as_slice(), device)?.to_dtype(dtype)?;
        let t: Vec<f32> = (0..max_seq_len).map(|i| i as f32).collect();
        let t = Tensor::new(t.as_slice(), device)?.to_dtype(dtype)?.unsqueeze(1)?;
        let inv_freq = inv_freq.unsqueeze(0)?;
        let freqs = t.matmul(&inv_freq)?;
        let cos = freqs.cos()?;
        let sin = freqs.sin()?;
        Ok(Self { cos, sin })
    }

    fn apply(&self, q: &Tensor, k: &Tensor, seqlen_offset: usize) -> CandleResult<(Tensor, Tensor)> {
        let (_, _, seq_len, _) = q.dims4()?;
        let cos = self.cos.narrow(0, seqlen_offset, seq_len)?.to_dtype(q.dtype())?;
        let sin = self.sin.narrow(0, seqlen_offset, seq_len)?.to_dtype(q.dtype())?;
        let q_embed = apply_rotary_emb(q, &cos, &sin)?;
        let k_embed = apply_rotary_emb(k, &cos, &sin)?;
        Ok((q_embed, k_embed))
    }
}

// ============================================================================
// Code Predictor: Attention (GQA 16 heads, 8 KV heads, dense)
// ============================================================================

struct CodePredictorAttention {
    q_proj: Linear,
    k_proj: Linear,
    v_proj: Linear,
    o_proj: Linear,
    qk_norm: QKNorm,
    num_heads: usize,
    num_kv_heads: usize,
    head_dim: usize,
}

impl CodePredictorAttention {
    fn load(vb: VarBuilder, cfg: &TalkerCodePredictorConfig) -> CandleResult<Self> {
        let hidden = cfg.hidden_size;
        let num_heads = cfg.num_attention_heads;
        let num_kv_heads = cfg.num_key_value_heads;
        let head_dim = cfg.head_dim;
        let q_proj = linear_no_bias(hidden, num_heads * head_dim, vb.pp("q_proj"))?;
        let k_proj = linear_no_bias(hidden, num_kv_heads * head_dim, vb.pp("k_proj"))?;
        let v_proj = linear_no_bias(hidden, num_kv_heads * head_dim, vb.pp("v_proj"))?;
        let o_proj = linear_no_bias(num_heads * head_dim, hidden, vb.pp("o_proj"))?;
        let qk_norm = QKNorm::load(vb.clone(), head_dim, cfg.rms_norm_eps)?;
        Ok(Self {
            q_proj, k_proj, v_proj, o_proj, qk_norm,
            num_heads, num_kv_heads, head_dim,
        })
    }

    fn forward(
        &self,
        hidden_states: &Tensor,
        rotary: &CodePredictorRotaryEmbedding,
        cache: Option<&mut KvCache>,
        seqlen_offset: usize,
        attention_mask: Option<&Tensor>,
    ) -> CandleResult<Tensor> {
        let (b, l, _) = hidden_states.dims3()?;
        let q = self.q_proj.forward(hidden_states)?;
        let k = self.k_proj.forward(hidden_states)?;
        let v = self.v_proj.forward(hidden_states)?;
        let q = q.reshape((b, l, self.num_heads, self.head_dim))?;
        let k = k.reshape((b, l, self.num_kv_heads, self.head_dim))?;
        let v = v.reshape((b, l, self.num_kv_heads, self.head_dim))?;
        let q = self.qk_norm.q_norm.forward(&q)?;
        let k = self.qk_norm.k_norm.forward(&k)?;
        let q = q.transpose(1, 2)?;
        let k = k.transpose(1, 2)?;
        let v = v.transpose(1, 2)?;
        let (q, k) = rotary.apply(&q, &k, seqlen_offset)?;
        let (k, v) = if let Some(c) = cache {
            c.update(k, v)?
        } else {
            (k, v)
        };
        let n_rep = self.num_heads / self.num_kv_heads;
        let k = repeat_kv(k, n_rep)?;
        let v = repeat_kv(v, n_rep)?;
        let scale = 1.0 / (self.head_dim as f64).sqrt();
        let mut attn_weights = (q.matmul(&k.transpose(2, 3)?)? * scale)?;
        if let Some(mask) = attention_mask {
            attn_weights = attn_weights.broadcast_add(mask)?;
        }
        let attn_weights = softmax_manual(&attn_weights)?;
        let attn_output = attn_weights.matmul(&v)?;
        let attn_output = attn_output.transpose(1, 2)?.reshape((b, l, ()))?;
        self.o_proj.forward(&attn_output)
    }
}

// ============================================================================
// Code Predictor: Dense MLP (SiLU-gated, intermediate=3072)
// ============================================================================

struct CodePredictorMLP {
    gate_proj: Linear,
    up_proj: Linear,
    down_proj: Linear,
}

impl CodePredictorMLP {
    fn load(vb: VarBuilder, hidden: usize, intermediate: usize) -> CandleResult<Self> {
        let gate_proj = linear_no_bias(hidden, intermediate, vb.pp("gate_proj"))?;
        let up_proj = linear_no_bias(hidden, intermediate, vb.pp("up_proj"))?;
        let down_proj = linear_no_bias(intermediate, hidden, vb.pp("down_proj"))?;
        Ok(Self { gate_proj, up_proj, down_proj })
    }

    fn forward(&self, x: &Tensor) -> CandleResult<Tensor> {
        let gate = silu_manual(&self.gate_proj.forward(x)?)?;
        let up = self.up_proj.forward(x)?;
        self.down_proj.forward(&(gate * up)?)
    }
}

// ============================================================================
// Code Predictor: Decoder Layer (pre-norm attention + dense MLP + residuals)
// ============================================================================

struct CodePredictorLayer {
    self_attn: CodePredictorAttention,
    mlp: CodePredictorMLP,
    input_layernorm: RmsNorm,
    post_attention_layernorm: RmsNorm,
}

impl CodePredictorLayer {
    fn load(vb: VarBuilder, cfg: &TalkerCodePredictorConfig) -> CandleResult<Self> {
        let self_attn = CodePredictorAttention::load(vb.pp("self_attn"), cfg)?;
        let mlp = CodePredictorMLP::load(vb.pp("mlp"), cfg.hidden_size, cfg.intermediate_size)?;
        let input_layernorm =
            RmsNorm::load(vb.pp("input_layernorm"), cfg.hidden_size, cfg.rms_norm_eps)?;
        let post_attention_layernorm =
            RmsNorm::load(vb.pp("post_attention_layernorm"), cfg.hidden_size, cfg.rms_norm_eps)?;
        Ok(Self { self_attn, mlp, input_layernorm, post_attention_layernorm })
    }

    fn forward(
        &self,
        x: &Tensor,
        rotary: &CodePredictorRotaryEmbedding,
        cache: Option<&mut KvCache>,
        seqlen_offset: usize,
        attention_mask: Option<&Tensor>,
    ) -> CandleResult<Tensor> {
        let residual = x;
        let x = self.input_layernorm.forward(x)?;
        let x = self.self_attn.forward(&x, rotary, cache, seqlen_offset, attention_mask)?;
        let x = (residual + x)?;
        let residual = &x;
        let x = self.post_attention_layernorm.forward(&x)?;
        let x = self.mlp.forward(&x)?;
        Ok((residual + x)?)
    }
}

// ============================================================================
// Code Predictor (5 dense decoder layers + norm + lm_head)
// ============================================================================

struct CodePredictor {
    layers: Vec<CodePredictorLayer>,
    norm: RmsNorm,
    rotary: CodePredictorRotaryEmbedding,
    lm_head: Linear,
    num_code_groups: usize,
    vocab_size: usize,
}

impl CodePredictor {
    fn load(
        vb: VarBuilder,
        cfg: &TalkerCodePredictorConfig,
        dtype: DType,
        device: &Device,
    ) -> CandleResult<Self> {
        let mut layers = Vec::with_capacity(cfg.num_hidden_layers);
        let vb_layers = vb.pp("layers");
        for i in 0..cfg.num_hidden_layers {
            layers.push(CodePredictorLayer::load(vb_layers.pp(i), cfg)?);
        }
        let norm = RmsNorm::load(vb.pp("norm"), cfg.hidden_size, cfg.rms_norm_eps)?;
        let rotary = CodePredictorRotaryEmbedding::new(cfg, dtype, device)?;
        let lm_head = linear_no_bias(
            cfg.hidden_size,
            cfg.num_code_groups * cfg.vocab_size,
            vb.pp("lm_head"),
        )?;
        Ok(Self {
            layers, norm, rotary, lm_head,
            num_code_groups: cfg.num_code_groups,
            vocab_size: cfg.vocab_size,
        })
    }

    /// Forward: hidden (batch, seq, 1024) -> logits (batch, seq, num_code_groups, vocab_size).
    fn forward(
        &self,
        hidden_states: &Tensor,
        mut cache: Option<&mut [KvCache]>,
        seqlen_offset: usize,
        attention_mask: Option<&Tensor>,
    ) -> CandleResult<Tensor> {
        let mut x = hidden_states.clone();
        for (i, layer) in self.layers.iter().enumerate() {
            let c = cache.as_mut().and_then(|c| c.get_mut(i));
            x = layer.forward(&x, &self.rotary, c, seqlen_offset, attention_mask)?;
        }
        let x = self.norm.forward(&x)?;
        let logits = self.lm_head.forward(&x)?; // (batch, seq, num_groups * vocab)
        let (batch, seq, _) = logits.dims3()?;
        logits.reshape((batch, seq, self.num_code_groups, self.vocab_size))
    }
}

// ============================================================================
// Full Talker model (load + forward)
// ============================================================================

/// KV cache for the full Talker: text decoder (20 layers) + code predictor (5 layers).
pub struct TalkerKvCache {
    pub text_decoder: Vec<KvCache>,
    pub code_predictor: Vec<KvCache>,
}

/// Qwen3-Omni Talker: projects Thinker hidden states, runs text decoder (20 MoE layers),
/// then code predictor (5 dense layers). Returns codec logits (batch, seq, num_code_groups, vocab_size) for Code2Wav.
pub struct Qwen3OmniTalker {
    input_proj: Linear,
    text_decoder: TalkerTextDecoder,
    code_predictor: CodePredictor,
    config: TalkerConfig,
    device: Device,
}

impl Qwen3OmniTalker {
    /// Load from model directory. Expects talker.* weights when loading from full checkpoint.
    pub fn load(model_path: &str, device: &Device) -> CandleResult<Self> {
        let base = Path::new(model_path);
        let config_path = base.join("config.json");
        let config = if config_path.exists() {
            TalkerConfig::from_json_path(&config_path)?
        } else {
            TalkerConfig::default()
        };

        let index_path = base.join("model.safetensors.index.json");
        // Track: (files, code_predictor_prefix, has_hf_model_prefix)
        let (files, code_predictor_prefix, has_hf_prefix): (Vec<String>, String, bool) = if index_path.exists() {
            let s = std::fs::read_to_string(&index_path)
                .map_err(|e| candle_core::Error::Msg(format!("Read index: {}", e)))?;
            let v: serde_json::Value =
                serde_json::from_str(&s).map_err(|e| candle_core::Error::Msg(format!("Parse index: {}", e)))?;
            let weight_map = v["weight_map"].as_object().ok_or_else(|| candle_core::Error::Msg("Missing weight_map".into()))?;
            // HF uses model.talker.*, direct uses talker.*
            let hf_prefix = weight_map.keys().any(|k| k.starts_with("model.talker."));
            let use_model_prefix = weight_map.keys().any(|k| k.contains("talker.model.code_predictor"));
            let prefix = if use_model_prefix {
                "model.code_predictor".to_string()
            } else {
                "code_predictor".to_string()
            };
            let mut f: Vec<String> = weight_map
                .values()
                .filter_map(|v| v.as_str())
                .map(|s| base.join(s).to_string_lossy().into_owned())
                .collect();
            f.sort();
            f.dedup();
            (f, prefix, hf_prefix)
        } else {
            let single = base.join("model.safetensors");
            if single.exists() {
                (vec![single.to_string_lossy().into_owned()], "code_predictor".to_string(), false)
            } else {
                return Err(candle_core::Error::Msg("No model.safetensors or index".into()));
            }
        };

        let vb = unsafe { VarBuilder::from_mmaped_safetensors(&files, DType::F32, device)? };
        // Support HF key layout (model.talker.*) and direct (talker.*)
        let vb_talker = if has_hf_prefix {
            vb.pp("model").pp("talker")
        } else {
            vb.pp("talker")
        };

        let input_proj = linear_no_bias(
            config.thinker_hidden_size,
            config.text_config.hidden_size,
            vb_talker.pp("input_proj"),
        )?;

        let text_decoder = TalkerTextDecoder::load(
            vb_talker.pp("model"),
            &config.text_config,
            DType::F32,
            device,
        )?;

        let code_predictor = CodePredictor::load(
            vb_talker.pp(&code_predictor_prefix),
            &config.code_predictor_config,
            DType::F32,
            device,
        ).or_else(|e| {
            let alt = if code_predictor_prefix == "model.code_predictor" {
                "code_predictor"
            } else {
                "model.code_predictor"
            };
            CodePredictor::load(vb_talker.pp(alt), &config.code_predictor_config, DType::F32, device)
                .map_err(|_| candle_core::Error::Msg(format!(
                    "Could not load code_predictor under talker.{} or talker.{}: {}",
                    code_predictor_prefix, alt, e
                )))
        })?;

        Ok(Self {
            input_proj,
            text_decoder,
            code_predictor,
            config,
            device: device.clone(),
        })
    }

    /// Load from VarBuilder (e.g. VarBuilder::zeros for tests). vb must be prefixed to "talker".
    pub fn load_with_vb(vb: VarBuilder, device: &Device) -> CandleResult<Self> {
        let config = TalkerConfig::default();
        let input_proj = linear_no_bias(
            config.thinker_hidden_size,
            config.text_config.hidden_size,
            vb.pp("input_proj"),
        )?;
        let text_decoder = TalkerTextDecoder::load(
            vb.pp("model"),
            &config.text_config,
            DType::F32,
            device,
        )?;
        let code_predictor = CodePredictor::load(
            vb.pp("code_predictor"),
            &config.code_predictor_config,
            DType::F32,
            device,
        )?;
        Ok(Self {
            input_proj,
            text_decoder,
            code_predictor,
            config,
            device: device.clone(),
        })
    }

    /// Causal attention mask (1, 1, seq_len, seq_len): 0 for j <= i, NEG_INFINITY for j > i.
    fn causal_mask(&self, seq_len: usize) -> CandleResult<Tensor> {
        if seq_len <= 1 {
            let m = Tensor::zeros((1, 1, seq_len, seq_len), DType::F32, &self.device)?;
            return Ok(m);
        }
        let mut mask_data = vec![0.0f32; seq_len * seq_len];
        for i in 0..seq_len {
            for j in 0..seq_len {
                if j > i {
                    mask_data[i * seq_len + j] = f32::NEG_INFINITY;
                }
            }
        }
        let mask = Tensor::from_vec(mask_data, (seq_len, seq_len), &self.device)?
            .to_dtype(DType::F32)?
            .unsqueeze(0)?
            .unsqueeze(0)?;
        Ok(mask)
    }

    /// Create empty KV caches for text decoder (20 layers) and code predictor (5 layers).
    pub fn make_cache(&self) -> TalkerKvCache {
        TalkerKvCache {
            text_decoder: (0..self.config.text_config.num_hidden_layers).map(|_| KvCache::new()).collect(),
            code_predictor: (0..self.config.code_predictor_config.num_hidden_layers).map(|_| KvCache::new()).collect(),
        }
    }

    /// Forward: thinker_hidden_states (batch, seq, 2048) -> codec logits (batch, seq, num_code_groups, vocab_size).
    /// Runs input_proj → text_decoder (with causal mask when seq > 1) → code_predictor.
    pub fn forward(&self, thinker_hidden_states: &Tensor) -> CandleResult<Tensor> {
        self.forward_with_cache(thinker_hidden_states, None, 0)
    }

    /// Forward with optional KV cache and seqlen offset (for autoregressive decoding).
    pub fn forward_with_cache(
        &self,
        thinker_hidden_states: &Tensor,
        mut cache: Option<&mut TalkerKvCache>,
        seqlen_offset: usize,
    ) -> CandleResult<Tensor> {
        let projected = self.input_proj.forward(thinker_hidden_states)?; // (batch, seq, 1024)
        let seq_len = projected.dim(1)?;
        let attention_mask = if seq_len > 1 {
            Some(self.causal_mask(seq_len)?)
        } else {
            None
        };
        let text_cache = cache.as_mut().map(|c| c.text_decoder.as_mut_slice());
        let hidden = self.text_decoder.forward(
            &projected,
            text_cache,
            seqlen_offset,
            attention_mask.as_ref(),
        )?; // (batch, seq, 1024)
        let code_cache = cache.as_mut().map(|c| c.code_predictor.as_mut_slice());
        self.code_predictor.forward(&hidden, code_cache, seqlen_offset, attention_mask.as_ref())
    }

    pub fn config(&self) -> &TalkerConfig {
        &self.config
    }

    pub fn device(&self) -> &Device {
        &self.device
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use candle_core::Device;

    #[test]
    fn test_talker_config_default() {
        let cfg = TalkerConfig::default();
        assert_eq!(cfg.thinker_hidden_size, 2048);
        assert_eq!(cfg.accept_hidden_layer, 18); // HF default
        assert_eq!(cfg.num_code_groups, 32); // HF default
        assert_eq!(cfg.text_config.hidden_size, 1024);
        assert_eq!(cfg.text_config.num_experts_per_tok, 8); // HF default
        assert_eq!(cfg.text_config.shared_expert_intermediate_size, 0); // HF: no shared expert
        assert_eq!(cfg.code_predictor_config.num_code_groups, 32); // HF default
        assert_eq!(cfg.code_predictor_config.vocab_size, 2048);
    }

    #[test]
    fn test_talker_text_decoder_forward_shape() {
        let device = Device::Cpu;
        let vb = VarBuilder::zeros(DType::F32, &device);
        let cfg = TalkerConfig::default().text_config;
        let decoder = TalkerTextDecoder::load(vb.pp("model"), &cfg, DType::F32, &device).unwrap();
        let seq = 5usize;
        let x = Tensor::zeros(&[1, seq, 1024], DType::F32, &device).unwrap();
        let out = decoder.forward(&x, None, 0, None).unwrap();
        let (b, s, h) = out.dims3().unwrap();
        assert_eq!(b, 1);
        assert_eq!(s, seq);
        assert_eq!(h, 1024);
    }

    #[test]
    fn test_talker_full_forward_shape() {
        let device = Device::Cpu;
        let vb = VarBuilder::zeros(DType::F32, &device);
        let talker = Qwen3OmniTalker::load_with_vb(vb.pp("talker"), &device).unwrap();
        let thinker_hidden = Tensor::zeros(&[1, 4, 2048], DType::F32, &device).unwrap();
        let out = talker.forward(&thinker_hidden).unwrap();
        let (b, s, g, v) = out.dims4().unwrap();
        assert_eq!(b, 1);
        assert_eq!(s, 4);
        assert_eq!(g, 32);
        assert_eq!(v, 2048);
    }

    #[test]
    fn test_talker_kv_cache() {
        let device = Device::Cpu;
        let vb = VarBuilder::zeros(DType::F32, &device);
        let cfg = TalkerConfig::default().text_config;
        let decoder = TalkerTextDecoder::load(vb.pp("model"), &cfg, DType::F32, &device).unwrap();
        let num_layers = cfg.num_hidden_layers;
        let mut caches: Vec<KvCache> = (0..num_layers).map(|_| KvCache::new()).collect();
        let x1 = Tensor::zeros(&[1, 4, 1024], DType::F32, &device).unwrap();
        let _ = decoder.forward(&x1, Some(&mut caches), 0, None).unwrap();
        let x2 = Tensor::zeros(&[1, 1, 1024], DType::F32, &device).unwrap();
        let out = decoder.forward(&x2, Some(&mut caches), 4, None).unwrap();
        let (b, s, h) = out.dims3().unwrap();
        assert_eq!(b, 1);
        assert_eq!(s, 1);
        assert_eq!(h, 1024);
        assert_eq!(caches[0].offset, 5);
    }

    #[test]
    fn test_code_predictor_forward_shape() {
        let device = Device::Cpu;
        let vb = VarBuilder::zeros(DType::F32, &device);
        let cfg = TalkerConfig::default().code_predictor_config;
        let predictor = CodePredictor::load(
            vb.pp("code_predictor"), &cfg, DType::F32, &device,
        ).unwrap();
        let seq = 6usize;
        let x = Tensor::zeros(&[1, seq, cfg.hidden_size], DType::F32, &device).unwrap();
        let out = predictor.forward(&x, None, 0, None).unwrap();
        let (b, s, g, v) = out.dims4().unwrap();
        assert_eq!(b, 1);
        assert_eq!(s, seq);
        assert_eq!(g, cfg.num_code_groups); // 32
        assert_eq!(v, cfg.vocab_size);      // 2048
    }

    #[test]
    fn test_code_predictor_kv_cache() {
        let device = Device::Cpu;
        let vb = VarBuilder::zeros(DType::F32, &device);
        let cfg = TalkerConfig::default().code_predictor_config;
        let predictor = CodePredictor::load(
            vb.pp("code_predictor"), &cfg, DType::F32, &device,
        ).unwrap();
        let num_layers = cfg.num_hidden_layers;
        let mut caches: Vec<KvCache> = (0..num_layers).map(|_| KvCache::new()).collect();
        // Prefill with 4 tokens
        let x1 = Tensor::zeros(&[1, 4, cfg.hidden_size], DType::F32, &device).unwrap();
        let out1 = predictor.forward(&x1, Some(&mut caches), 0, None).unwrap();
        let (b, s, g, _v) = out1.dims4().unwrap();
        assert_eq!(b, 1);
        assert_eq!(s, 4);
        assert_eq!(g, cfg.num_code_groups);
        // Decode 1 more token
        let x2 = Tensor::zeros(&[1, 1, cfg.hidden_size], DType::F32, &device).unwrap();
        let out2 = predictor.forward(&x2, Some(&mut caches), 4, None).unwrap();
        let (b2, s2, g2, _v2) = out2.dims4().unwrap();
        assert_eq!(b2, 1);
        assert_eq!(s2, 1);
        assert_eq!(g2, cfg.num_code_groups);
        assert_eq!(caches[0].offset, 5);
    }

    #[test]
    fn test_talker_e2e_with_code_predictor() {
        // Full forward: Thinker hidden → input_proj → text_decoder → code_predictor → codec logits.
        let device = Device::Cpu;
        let vb = VarBuilder::zeros(DType::F32, &device);
        let talker = Qwen3OmniTalker::load_with_vb(vb.pp("talker"), &device).unwrap();
        let thinker_hidden = Tensor::zeros(&[1, 3, 2048], DType::F32, &device).unwrap();
        let out = talker.forward(&thinker_hidden).unwrap();
        let (b, s, g, v) = out.dims4().unwrap();
        assert_eq!(b, 1);
        assert_eq!(s, 3);
        assert_eq!(g, 32);
        assert_eq!(v, 2048);
        let cfg = talker.config();
        assert_eq!(cfg.code_predictor_config.num_hidden_layers, 5);
    }

    #[test]
    fn test_talker_causal_mask_shape() {
        let device = Device::Cpu;
        let vb = VarBuilder::zeros(DType::F32, &device);
        let talker = Qwen3OmniTalker::load_with_vb(vb.pp("talker"), &device).unwrap();
        // Use reflection / internal helper: we test via forward with seq_len > 1; mask is applied internally.
        // Alternatively expose causal_mask for testing. Here we assert forward(seq=5) returns 4D and runs.
        let x = Tensor::zeros(&[1, 5, 2048], DType::F32, &device).unwrap();
        let out = talker.forward(&x).unwrap();
        let (a, b, c, d) = out.dims4().unwrap();
        assert_eq!((a, b, c, d), (1, 5, 32, 2048));
    }

    #[test]
    fn test_talker_kv_cache_forward() {
        let device = Device::Cpu;
        let vb = VarBuilder::zeros(DType::F32, &device);
        let talker = Qwen3OmniTalker::load_with_vb(vb.pp("talker"), &device).unwrap();
        let mut cache = talker.make_cache();
        let x1 = Tensor::zeros(&[1, 4, 2048], DType::F32, &device).unwrap();
        let _ = talker.forward_with_cache(&x1, Some(&mut cache), 0).unwrap();
        let x2 = Tensor::zeros(&[1, 1, 2048], DType::F32, &device).unwrap();
        let out = talker.forward_with_cache(&x2, Some(&mut cache), 4).unwrap();
        let (b, s, g, v) = out.dims4().unwrap();
        assert_eq!(b, 1);
        assert_eq!(s, 1);
        assert_eq!(g, 32);
        assert_eq!(v, 2048);
        assert_eq!(cache.text_decoder[0].offset, 5);
        assert_eq!(cache.code_predictor[0].offset, 5);
    }
}
