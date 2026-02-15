//! Qwen3-Omni Thinker in Candle: MoE backbone with Metal GPU.
//!
//! Port of the Python MLX Thinker. Loads HF safetensors directly (no Python convert).
//! Supports autoregressive generation with KV cache.

use crate::candle_moe::*;
use candle_core::{DType, Device, IndexOp, Result as CandleResult, Tensor, D};
use candle_nn::{embedding, linear_no_bias, Embedding, Linear, Module, VarBuilder};
use std::path::Path;
use std::sync::{Arc, Mutex};
use tokenizers::Tokenizer;

// ============================================================================
// KV CACHE PERSISTENCE
// ============================================================================

/// Serializable KV cache state for persistence between conversation turns.
/// Allows exporting/importing the Thinker's internal KV cache so that
/// conversation context is preserved without re-encoding previous turns.
#[derive(Clone)]
pub struct ThinkerKvCache {
    /// KV tensors per layer: Vec<(key_tensor, value_tensor)>.
    pub layers: Vec<(Tensor, Tensor)>,
    /// Number of tokens already processed (sequence position).
    pub seq_offset: usize,
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/// Qwen3-Omni Thinker text config (from config.json thinker_config.text_config)
#[derive(Debug, Clone)]
pub struct ThinkerConfig {
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
    pub tie_word_embeddings: bool,
}

impl Default for ThinkerConfig {
    fn default() -> Self {
        Self {
            vocab_size: 152_064,
            hidden_size: 2048,
            num_hidden_layers: 48,
            num_attention_heads: 32,
            num_key_value_heads: 4,
            num_experts: 128,
            num_experts_per_tok: 8,
            moe_intermediate_size: 768,
            shared_expert_intermediate_size: 0,
            rms_norm_eps: 1e-6,
            rope_theta: 1_000_000.0,
            max_position_embeddings: 65536,
            head_dim: 64, // hidden_size / num_attention_heads
            tie_word_embeddings: false,
        }
    }
}

impl ThinkerConfig {
    /// Load from HF config.json (thinker_config.text_config) or thinker_config.json (text_config or flat)
    pub fn from_json_path(path: &Path) -> CandleResult<Self> {
        let s = std::fs::read_to_string(path)
            .map_err(|e| candle_core::Error::Msg(format!("Failed to read config: {}", e)))?;
        let v: serde_json::Value =
            serde_json::from_str(&s).map_err(|e| candle_core::Error::Msg(format!("Parse config: {}", e)))?;
        let text = v
            .get("thinker_config")
            .and_then(|t| t.get("text_config"))
            .or(v.get("text_config"))
            .or(Some(&v)); // flat thinker_config.json has keys at root
        let text = text.ok_or_else(|| candle_core::Error::Msg("Missing thinker_config.text_config or text_config".into()))?;
        let hidden = text.get("hidden_size").and_then(|v| v.as_u64()).unwrap_or(2048) as usize;
        let num_heads = text.get("num_attention_heads").and_then(|v| v.as_u64()).unwrap_or(32) as usize;
        let head_dim = text.get("head_dim").and_then(|v| v.as_u64()).map(|v| v as usize)
            .unwrap_or_else(|| hidden / num_heads);
        Ok(Self {
            vocab_size: text.get("vocab_size").and_then(|v| v.as_u64()).unwrap_or(152_064) as usize,
            hidden_size: hidden,
            num_hidden_layers: text.get("num_hidden_layers").and_then(|v| v.as_u64()).unwrap_or(48) as usize,
            num_attention_heads: num_heads,
            num_key_value_heads: text.get("num_key_value_heads").and_then(|v| v.as_u64()).unwrap_or(4) as usize,
            num_experts: text.get("num_experts").and_then(|v| v.as_u64()).unwrap_or(128) as usize,
            num_experts_per_tok: text.get("num_experts_per_tok").and_then(|v| v.as_u64()).unwrap_or(8) as usize,
            moe_intermediate_size: text.get("moe_intermediate_size").and_then(|v| v.as_u64()).unwrap_or(768) as usize,
            shared_expert_intermediate_size: text.get("shared_expert_intermediate_size").and_then(|v| v.as_u64()).unwrap_or(0) as usize,
            rms_norm_eps: text.get("rms_norm_eps").and_then(|v| v.as_f64()).unwrap_or(1e-6),
            rope_theta: text.get("rope_theta").and_then(|v| v.as_f64()).unwrap_or(1_000_000.0),
            max_position_embeddings: text.get("max_position_embeddings").and_then(|v| v.as_u64()).unwrap_or(65536) as usize,
            head_dim,
            tie_word_embeddings: text.get("tie_word_embeddings").and_then(|v| v.as_bool()).unwrap_or(false),
        })
    }
}

// ============================================================================
// LAYERS: RoPE, Attention (with optional KV cache)
// ============================================================================

struct RotaryEmbedding {
    cos: Tensor,
    sin: Tensor,
}

impl RotaryEmbedding {
    fn new(cfg: &ThinkerConfig, dtype: DType, device: &Device) -> CandleResult<Self> {
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

struct ThinkerAttention {
    q_proj: Linear,
    k_proj: Linear,
    v_proj: Linear,
    o_proj: Linear,
    qk_norm: QKNorm,
    num_heads: usize,
    num_kv_heads: usize,
    head_dim: usize,
}

impl ThinkerAttention {
    fn load(vb: VarBuilder, cfg: &ThinkerConfig) -> CandleResult<Self> {
        let hidden = cfg.hidden_size;
        let num_heads = cfg.num_attention_heads;
        let num_kv_heads = cfg.num_key_value_heads;
        let head_dim = cfg.head_dim;
        let q_proj = linear_no_bias(hidden, num_heads * head_dim, vb.pp("q_proj"))?;
        let k_proj = linear_no_bias(hidden, num_kv_heads * head_dim, vb.pp("k_proj"))?;
        let v_proj = linear_no_bias(hidden, num_kv_heads * head_dim, vb.pp("v_proj"))?;
        let o_proj = linear_no_bias(num_heads * head_dim, hidden, vb.pp("o_proj"))?;
        let qk_norm = crate::candle_moe::QKNorm::load(vb.clone(), head_dim, cfg.rms_norm_eps)?;
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
        rotary: &RotaryEmbedding,
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
// MLP (dense, for shared expert)
// ============================================================================

struct ThinkerMLP {
    gate_proj: Linear,
    up_proj: Linear,
    down_proj: Linear,
}

impl ThinkerMLP {
    fn load(vb: VarBuilder, hidden: usize, intermediate: usize) -> CandleResult<Self> {
        let gate_proj = linear_no_bias(hidden, intermediate, vb.pp("gate_proj"))?;
        let up_proj = linear_no_bias(hidden, intermediate, vb.pp("up_proj"))?;
        let down_proj = linear_no_bias(intermediate, hidden, vb.pp("down_proj"))?;
        Ok(Self {
            gate_proj,
            up_proj,
            down_proj,
        })
    }
    fn forward(&self, x: &Tensor) -> CandleResult<Tensor> {
        let gate = self.gate_proj.forward(x)?;
        let up = self.up_proj.forward(x)?;
        let gate = silu_manual(&gate)?;
        let hidden = (gate * up)?;
        self.down_proj.forward(&hidden)
    }
}

// ============================================================================
// MoE: Router + SwitchGLU (from candle_moe)
// ============================================================================

struct SparseMoeBlock {
    gate: Linear,
    switch_mlp: SwitchGLU,
    num_experts: usize,
    top_k: usize,
    shared_expert: Option<ThinkerMLP>,
    shared_expert_gate: Option<Linear>,
}

impl SparseMoeBlock {
    fn load(vb: VarBuilder, cfg: &ThinkerConfig) -> CandleResult<Self> {
        let hidden = cfg.hidden_size;
        let intermediate = cfg.moe_intermediate_size;
        let num_experts = cfg.num_experts;
        let top_k = cfg.num_experts_per_tok;
        let gate = linear_no_bias(hidden, num_experts, vb.pp("gate"))?;
        let switch_mlp = match crate::candle_moe::SwitchGLU::load(
            vb.pp("switch_mlp"),
            hidden,
            intermediate,
            num_experts,
        ) {
            Ok(sw) => sw,
            Err(_) => crate::candle_moe::SwitchGLU::load_from_experts(
                vb.clone(),
                hidden,
                intermediate,
                num_experts,
            )?,
        };
        let (shared_expert, shared_expert_gate) = if cfg.shared_expert_intermediate_size > 0 {
            let se = ThinkerMLP::load(
                vb.pp("shared_expert"),
                hidden,
                cfg.shared_expert_intermediate_size,
            )?;
            let seg = linear_no_bias(hidden, 1, vb.pp("shared_expert_gate"))?;
            (Some(se), Some(seg))
        } else {
            (None, None)
        };
        Ok(Self {
            gate,
            switch_mlp,
            num_experts,
            top_k,
            shared_expert,
            shared_expert_gate,
        })
    }

    fn forward(&self, x: &Tensor) -> CandleResult<Tensor> {
        let (b, l, hidden) = x.dims3()?;
        let gates = self.gate.forward(x)?; // (b, l, num_experts)
        let gates = softmax_manual(&gates)?;
        // Top-k: sort descending along last dim, take first k indices and gather scores
        let gates_f32 = gates.to_dtype(DType::F32)?;
        let neg = gates_f32.neg()?;
        let (_sorted_vals, sorted_idx) = neg.sort_last_dim(false)?; // descending
        let k = self.top_k.min(self.num_experts);
        let indices = sorted_idx.narrow(2, 0, k)?.contiguous()?; // (b, l, k) - contiguous for gather
        let scores = gates_f32.gather(&indices, 2)?; // (b, l, k)
        let scores = scores.to_dtype(x.dtype())?;

        // Flatten: (b, l, k) -> (b*l*k,), (b, l, hidden) -> (b*l*k, hidden)
        let x_expand = x.unsqueeze(2)?.expand((b, l, k, hidden))?;
        let x_flat = x_expand.reshape((b * l * k, hidden))?;
        let indices_flat = indices.reshape((b * l * k,))?;
        let out_flat = self.switch_mlp.forward(&x_flat, &indices_flat)?; // (b*l*k, hidden)
        let out = out_flat.reshape((b, l, k, hidden))?;
        let scores = scores.unsqueeze(3)?; // (b, l, k, 1)
        let out = out.broadcast_mul(&scores)?.sum(2)?; // (b, l, hidden)

        let out = if let (Some(se), Some(seg)) = (&self.shared_expert, &self.shared_expert_gate) {
            let shared_out = se.forward(x)?;
            let gate = seg.forward(x)?;
            let gate = sigmoid_manual(&gate)?;
            (out + (gate * shared_out)?)?
        } else {
            out
        };
        Ok(out)
    }
}

// ============================================================================
// Decoder layer: attention + MoE
// ============================================================================

struct ThinkerDecoderLayer {
    self_attn: ThinkerAttention,
    mlp: SparseMoeBlock,
    input_layernorm: RmsNorm,
    post_attention_layernorm: RmsNorm,
}

impl ThinkerDecoderLayer {
    fn load(vb: VarBuilder, cfg: &ThinkerConfig) -> CandleResult<Self> {
        let self_attn = ThinkerAttention::load(vb.pp("self_attn"), cfg)?;
        let mlp = SparseMoeBlock::load(vb.pp("mlp"), cfg)?;
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
        rotary: &RotaryEmbedding,
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
// Thinker model: embed + layers + norm
// ============================================================================

struct ThinkerModel {
    embed_tokens: Embedding,
    layers: Vec<ThinkerDecoderLayer>,
    norm: RmsNorm,
    rotary: RotaryEmbedding,
    dtype: DType,
}

impl ThinkerModel {
    fn load(vb: VarBuilder, cfg: &ThinkerConfig, dtype: DType, device: &Device) -> CandleResult<Self> {
        let embed_tokens = embedding(cfg.vocab_size, cfg.hidden_size, vb.pp("embed_tokens"))?;
        let mut layers = Vec::with_capacity(cfg.num_hidden_layers);
        let vb_layers = vb.pp("layers");
        for i in 0..cfg.num_hidden_layers {
            let layer = ThinkerDecoderLayer::load(vb_layers.pp(i), cfg)?;
            layers.push(layer);
        }
        let norm = RmsNorm::load(vb.pp("norm"), cfg.hidden_size, cfg.rms_norm_eps)?;
        let rotary = RotaryEmbedding::new(cfg, dtype, device)?;
        Ok(Self {
            embed_tokens,
            layers,
            norm,
            rotary,
            dtype,
        })
    }

    fn forward(
        &self,
        input_ids: &Tensor,
        mut cache: Option<&mut [KvCache]>,
        seqlen_offset: usize,
        attention_mask: Option<&Tensor>,
    ) -> CandleResult<Tensor> {
        let mut hidden_states = self.embed_tokens.forward(input_ids)?;
        for (i, layer) in self.layers.iter().enumerate() {
            let c = cache.as_mut().and_then(|c| c.get_mut(i));
            hidden_states = layer.forward(
                &hidden_states,
                &self.rotary,
                c,
                seqlen_offset,
                attention_mask,
            )?;
        }
        self.norm.forward(&hidden_states)
    }

    /// Forward pass returning both final logits and hidden states from `extract_layer` (0-indexed).
    /// Used by Talker to consume Thinker hidden states from a specific layer (e.g. 18).
    fn forward_with_hidden_states(
        &self,
        input_ids: &Tensor,
        mut cache: Option<&mut [KvCache]>,
        seqlen_offset: usize,
        attention_mask: Option<&Tensor>,
        extract_layer: usize,
    ) -> CandleResult<(Tensor, Tensor)> {
        if extract_layer >= self.layers.len() {
            return Err(candle_core::Error::Msg(format!(
                "extract_layer {} out of bounds (model has {} layers)",
                extract_layer,
                self.layers.len()
            )));
        }
        let mut hidden_states = self.embed_tokens.forward(input_ids)?;
        let mut extracted: Option<Tensor> = None;
        for (i, layer) in self.layers.iter().enumerate() {
            let c = cache.as_mut().and_then(|c| c.get_mut(i));
            hidden_states = layer.forward(
                &hidden_states,
                &self.rotary,
                c,
                seqlen_offset,
                attention_mask,
            )?;
            if i == extract_layer {
                extracted = Some(hidden_states.clone());
            }
        }
        let final_hidden = self.norm.forward(&hidden_states)?;
        let extracted = extracted.unwrap_or_else(|| final_hidden.clone());
        Ok((final_hidden, extracted))
    }

    /// Build sequence [audio_embeddings; embed_tokens(input_ids)] for multimodal forward.
    fn build_audio_token_sequence(
        &self,
        audio_embeddings: &Tensor,
        input_ids: &Tensor,
    ) -> CandleResult<Tensor> {
        let token_emb = self.embed_tokens.forward(input_ids)?;
        Tensor::cat(&[audio_embeddings, &token_emb], 1)
    }

    /// Forward from pre-built hidden states (e.g. [audio_emb; token_emb]). Returns (final_hidden, extracted at layer).
    /// Used for multimodal input: caller concats audio embeddings + embed_tokens(input_ids), then runs this.
    fn forward_with_hidden_states_from_embeddings(
        &self,
        hidden_states: &Tensor,
        mut cache: Option<&mut [KvCache]>,
        seqlen_offset: usize,
        attention_mask: Option<&Tensor>,
        extract_layer: usize,
    ) -> CandleResult<(Tensor, Tensor)> {
        if extract_layer >= self.layers.len() {
            return Err(candle_core::Error::Msg(format!(
                "extract_layer {} out of bounds (model has {} layers)",
                extract_layer,
                self.layers.len()
            )));
        }
        let mut hidden_states = hidden_states.clone();
        let mut extracted: Option<Tensor> = None;
        for (i, layer) in self.layers.iter().enumerate() {
            let c = cache.as_mut().and_then(|c| c.get_mut(i));
            hidden_states = layer.forward(
                &hidden_states,
                &self.rotary,
                c,
                seqlen_offset,
                attention_mask,
            )?;
            if i == extract_layer {
                extracted = Some(hidden_states.clone());
            }
        }
        let final_hidden = self.norm.forward(&hidden_states)?;
        let extracted = extracted.unwrap_or_else(|| final_hidden.clone());
        Ok((final_hidden, extracted))
    }
}

// ============================================================================
// Public API: Qwen3OmniThinker with lm_head and generate
// ============================================================================

/// Qwen3-Omni Thinker: MoE backbone + lm_head. Supports generation with KV cache.
pub struct Qwen3OmniThinker {
    model: ThinkerModel,
    lm_head: Option<Linear>,
    config: ThinkerConfig,
    device: Device,
    cache: Vec<KvCache>,
    cache_offset: usize,
}

impl Qwen3OmniThinker {
    /// Load from directory containing config.json or thinker_config.json and model.safetensors (or sharded)
    pub fn load(model_path: &str, device: &Device) -> CandleResult<Self> {
        let base = Path::new(model_path);
        let config = if base.join("thinker_config.json").exists() {
            ThinkerConfig::from_json_path(&base.join("thinker_config.json"))?
        } else if base.join("config.json").exists() {
            ThinkerConfig::from_json_path(&base.join("config.json"))?
        } else {
            ThinkerConfig::default()
        };

        let index_path = Path::new(model_path).join("model.safetensors.index.json");
        // Prefix mode: thinker.*, model.thinker.text_model.* (HF), or flat model.*
        let (files, prefix_mode): (Vec<String>, &str) = if index_path.exists() {
            let s = std::fs::read_to_string(&index_path)
                .map_err(|e| candle_core::Error::Msg(format!("Read index: {}", e)))?;
            let v: serde_json::Value =
                serde_json::from_str(&s).map_err(|e| candle_core::Error::Msg(format!("Parse index: {}", e)))?;
            let weight_map = v["weight_map"].as_object().ok_or_else(|| candle_core::Error::Msg("Missing weight_map".into()))?;
            let prefix_mode = if weight_map.keys().any(|k| k.starts_with("model.thinker.text_model.")) {
                "model.thinker"
            } else if weight_map.keys().any(|k| k.starts_with("thinker.")) {
                "thinker"
            } else {
                "flat"
            };
            let mut f: Vec<String> = weight_map
                .values()
                .filter_map(|v| v.as_str())
                .map(|s| Path::new(model_path).join(s).to_string_lossy().into_owned())
                .collect();
            f.sort();
            f.dedup();
            (f, prefix_mode)
        } else {
            let single = Path::new(model_path).join("model.safetensors");
            if single.exists() {
                (vec![single.to_string_lossy().into_owned()], "flat")
            } else {
                return Err(candle_core::Error::Msg("No model.safetensors or model.safetensors.index.json".into()));
            }
        };

        let vb = unsafe { VarBuilder::from_mmaped_safetensors(&files, DType::F32, device)? };
        let (vb_model, vb_lm): (candle_nn::VarBuilder, candle_nn::VarBuilder) = match prefix_mode {
            "model.thinker" => (vb.pp("model").pp("thinker").pp("text_model"), vb.pp("model").pp("thinker")),
            "thinker" => (vb.pp("thinker").pp("model"), vb.pp("thinker")),
            _ => (vb.pp("model"), vb.clone()),
        };
        let dtype = DType::F32;
        let model = ThinkerModel::load(vb_model, &config, dtype, device)?;
        let lm_head = if config.tie_word_embeddings {
            None
        } else {
            Some(linear_no_bias(config.hidden_size, config.vocab_size, vb_lm.pp("lm_head"))?)
        };
        let num_layers = config.num_hidden_layers;
        Ok(Self {
            model,
            lm_head,
            config,
            device: device.clone(),
            cache: (0..num_layers).map(|_| KvCache::new()).collect(),
            cache_offset: 0,
        })
    }

    /// Load from VarBuilder (e.g. VarBuilder::zeros for tests). vb must be prefixed to "thinker".
    pub fn load_with_vb(vb: VarBuilder, device: &Device) -> CandleResult<Self> {
        Self::load_with_vb_with_config(vb, ThinkerConfig::default(), device)
    }

    /// Load from VarBuilder with custom config (e.g. for tests with small max_position_embeddings).
    pub fn load_with_vb_with_config(
        vb: VarBuilder,
        config: ThinkerConfig,
        device: &Device,
    ) -> CandleResult<Self> {
        let model = ThinkerModel::load(vb.pp("model"), &config, DType::F32, device)?;
        let lm_head = if config.tie_word_embeddings {
            None
        } else {
            Some(linear_no_bias(config.hidden_size, config.vocab_size, vb.pp("lm_head"))?)
        };
        let num_layers = config.num_hidden_layers;
        Ok(Self {
            model,
            lm_head,
            config,
            device: device.clone(),
            cache: (0..num_layers).map(|_| KvCache::new()).collect(),
            cache_offset: 0,
        })
    }

    /// Forward: logits (batch, seq, vocab_size)
    pub fn forward(
        &self,
        input_ids: &Tensor,
        cache: Option<&mut [KvCache]>,
        seqlen_offset: usize,
        attention_mask: Option<&Tensor>,
    ) -> CandleResult<Tensor> {
        let hidden = self.model.forward(input_ids, cache, seqlen_offset, attention_mask)?;
        let logits = if let Some(ref lm_head) = self.lm_head {
            lm_head.forward(&hidden)?
        } else {
            // Tie: use embed_tokens weight as lm_head (vocab_size, hidden_size) -> hidden @ w.T
            let w = self.model.embed_tokens.embeddings();
            hidden.matmul(&w.t()?)?
        };
        Ok(logits)
    }

    /// Forward returning both logits and hidden states from `extract_layer` (0-indexed).
    /// Used by Talker to consume Thinker hidden states from a specific layer (e.g. 18 per HF default).
    pub fn forward_with_hidden_states(
        &self,
        input_ids: &Tensor,
        cache: Option<&mut [KvCache]>,
        seqlen_offset: usize,
        attention_mask: Option<&Tensor>,
        extract_layer: usize,
    ) -> CandleResult<(Tensor, Tensor)> {
        let (final_hidden, extracted) = self.model.forward_with_hidden_states(
            input_ids,
            cache,
            seqlen_offset,
            attention_mask,
            extract_layer,
        )?;
        let logits = if let Some(ref lm_head) = self.lm_head {
            lm_head.forward(&final_hidden)?
        } else {
            let w = self.model.embed_tokens.embeddings();
            final_hidden.matmul(&w.t()?)?
        };
        Ok((logits, extracted))
    }

    /// Multimodal forward: sequence = [audio_embeddings; embed_tokens(input_ids)]. Returns (final_hidden, extracted at layer).
    /// Audio is truncated to fit max_position_embeddings (keeps last positions + one token). Causal mask over full sequence.
    /// Used by full Omni pipeline so Thinker output is audio-conditioned.
    /// Note: This port uses sequence concat only (no separate cross-attention); HF Qwen3-Omni may differ.
    pub fn forward_with_hidden_states_from_audio(
        &self,
        audio_embeddings: &Tensor,
        input_ids: &Tensor,
        cache: Option<&mut [KvCache]>,
        seqlen_offset: usize,
        extract_layer: usize,
    ) -> CandleResult<(Tensor, Tensor)> {
        let mut hidden_states = self.model.build_audio_token_sequence(audio_embeddings, input_ids)?;
        let seq_len = hidden_states.dim(1)?;
        let max_len = self.config.max_position_embeddings;
        if seq_len > max_len {
            hidden_states = hidden_states.narrow(1, seq_len - max_len, max_len)?;
        }
        let seq_len = hidden_states.dim(1)?;
        let mask = self.causal_mask(seq_len)?;
        self.model.forward_with_hidden_states_from_embeddings(
            &hidden_states,
            cache,
            seqlen_offset,
            Some(&mask),
            extract_layer,
        )
    }

    /// Forward pass using the internal KV cache, for multi-turn conversations.
    /// Audio embeddings are injected as sequence prefix. Returns (final_hidden, extracted at layer).
    /// Updates internal cache_offset after the pass so subsequent calls append correctly.
    pub fn forward_with_hidden_states_from_audio_cached(
        &mut self,
        audio_embeddings: &Tensor,
        input_ids: &Tensor,
        extract_layer: usize,
    ) -> CandleResult<(Tensor, Tensor)> {
        let mut hidden_states =
            self.model.build_audio_token_sequence(audio_embeddings, input_ids)?;
        let max_len = self.config.max_position_embeddings;
        let seq_len = hidden_states.dim(1)?;
        if seq_len > max_len {
            hidden_states = hidden_states.narrow(1, seq_len - max_len, max_len)?;
        }
        let seq_len = hidden_states.dim(1)?;

        // Build causal mask accounting for cached tokens from previous turns.
        // New tokens can attend to all cached positions + causally to each other.
        let cache_len = self.cache_offset;
        let total_len = cache_len + seq_len;
        let mask = if total_len <= 1 {
            Tensor::zeros((1, 1, seq_len, total_len), DType::F32, &self.device)?
        } else {
            let mut mask_data = vec![0.0f32; seq_len * total_len];
            for i in 0..seq_len {
                for j in 0..total_len {
                    if j > cache_len + i {
                        mask_data[i * total_len + j] = f32::NEG_INFINITY;
                    }
                }
            }
            Tensor::from_vec(mask_data, (seq_len, total_len), &self.device)?
                .to_dtype(DType::F32)?
                .unsqueeze(0)?
                .unsqueeze(0)?
        };

        let cache_offset = self.cache_offset;
        let result = self.model.forward_with_hidden_states_from_embeddings(
            &hidden_states,
            Some(self.cache.as_mut_slice()),
            cache_offset,
            Some(&mask),
            extract_layer,
        )?;
        self.cache_offset += seq_len;
        Ok(result)
    }

    /// Create empty KV caches for all layers
    pub fn make_cache(&self) -> Vec<KvCache> {
        (0..self.config.num_hidden_layers).map(|_| KvCache::new()).collect()
    }

    /// Export the current internal KV cache state for persistence.
    /// Returns None if no cache exists (no cached forward pass has been run).
    pub fn export_kv_cache(&self) -> Option<ThinkerKvCache> {
        if self.cache_offset == 0 {
            return None;
        }
        let layers: Vec<(Tensor, Tensor)> = self
            .cache
            .iter()
            .filter_map(|c| match (&c.k, &c.v) {
                (Some(k), Some(v)) => Some((k.clone(), v.clone())),
                _ => None,
            })
            .collect();
        if layers.is_empty() {
            return None;
        }
        Some(ThinkerKvCache {
            layers,
            seq_offset: self.cache_offset,
        })
    }

    /// Import a previously exported KV cache, restoring conversation context.
    /// The next cached forward pass will continue from where the cache left off.
    pub fn import_kv_cache(&mut self, cache: ThinkerKvCache) {
        let ThinkerKvCache { layers, seq_offset } = cache;
        self.cache_offset = seq_offset;
        for (i, (k, v)) in layers.into_iter().enumerate() {
            if i < self.cache.len() {
                self.cache[i].k = Some(k);
                self.cache[i].v = Some(v);
                self.cache[i].offset = seq_offset;
            }
        }
    }

    /// Clear the internal KV cache, starting a fresh conversation.
    pub fn clear_kv_cache(&mut self) {
        self.cache_offset = 0;
        for c in &mut self.cache {
            c.k = None;
            c.v = None;
            c.offset = 0;
        }
    }

    /// Get the current cache size (number of cached token positions).
    pub fn cache_size(&self) -> usize {
        self.cache_offset
    }

    /// Generate tokens autoregressively
    pub fn generate(
        &self,
        tokenizer: &Tokenizer,
        prompt: &str,
        max_new_tokens: usize,
        temperature: f64,
        eos_token_id: Option<u32>,
    ) -> CandleResult<String> {
        let encoding = tokenizer
            .encode(prompt, true)
            .map_err(|e| candle_core::Error::Msg(format!("Tokenize: {}", e)))?;
        let mut ids: Vec<u32> = encoding.get_ids().to_vec();
        // Qwen3 EOS token ID: <|endoftext|> = 151643 in Qwen tokenizer
        const QWEN3_EOS_TOKEN_ID: u32 = 151643;
        let eos = eos_token_id
            .or_else(|| tokenizer.get_vocab(true).get("<|endoftext|>").copied())
            .or_else(|| tokenizer.get_vocab(true).get("[PAD]").copied())
            .unwrap_or(QWEN3_EOS_TOKEN_ID);

        let mut cache = self.make_cache();
        let seq_len = ids.len();
        if seq_len == 0 {
            return Ok(String::new());
        }

        // Prefill: one forward on full prompt
        let input_ids: Vec<i64> = ids.iter().map(|&x| x as i64).collect();
        let input = Tensor::new(input_ids.as_slice(), &self.device)?
            .unsqueeze(0)?;
        let causal_mask = self.causal_mask(seq_len)?;
        let logits = self.forward(&input, Some(&mut cache), 0, Some(&causal_mask))?;
        let vocab = logits.dim(2)?;
        let mut next_logits = logits.contiguous()?.i((0, seq_len - 1, ..))?;

        for _ in 0..max_new_tokens.saturating_sub(1) {
            let next_id = if temperature <= 0.0 {
                let idx = next_logits.argmax(D::Minus1)?.squeeze(0)?.to_scalar::<u32>()?;
                idx
            } else {
                let logits = (next_logits.to_dtype(DType::F32)? / temperature)?;
                let probs = softmax_manual(&logits)?;
                let probs_vec: Vec<f32> = probs.to_vec1()?;
                let r: f32 = rand::random::<f32>();
                let mut cum = 0.0f32;
                let mut chosen = vocab - 1;
                for (i, &p) in probs_vec.iter().enumerate() {
                    cum += p;
                    if r <= cum {
                        chosen = i;
                        break;
                    }
                }
                chosen as u32
            };
            ids.push(next_id);
            if next_id == eos {
                break;
            }
            let next_input = Tensor::new(&[next_id as i64], &self.device)?.unsqueeze(0)?.unsqueeze(0)?;
            let offset = ids.len() - 1;
            next_logits = self.forward(&next_input, Some(&mut cache), offset, None)?.squeeze(1)?;
        }

        tokenizer
            .decode(&ids, true)
            .map_err(|e| candle_core::Error::Msg(format!("Decode: {}", e)))
    }

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

    pub fn config(&self) -> &ThinkerConfig {
        &self.config
    }
    pub fn device(&self) -> &Device {
        &self.device
    }
}

// ============================================================================
// Tests (Thinker multimodal forward)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    /// Validates Thinker forward shapes with multimodal audio input.
    /// Slow (~60s on CPU with 36-layer zero-weight model). Run with: cargo test -- --ignored
    #[test]
    #[ignore]
    fn test_thinker_forward_with_audio_shape() {
        let device = Device::Cpu;
        let vb = VarBuilder::zeros(DType::F32, &device);
        let thinker = Qwen3OmniThinker::load_with_vb(vb.pp("thinker"), &device).unwrap();
        let audio = Tensor::zeros(&[1, 5, 2048], DType::F32, &device).unwrap();
        let input_ids = Tensor::new(&[0i64], &device).unwrap().unsqueeze(0).unwrap();
        let (_final_hidden, extracted) = thinker
            .forward_with_hidden_states_from_audio(&audio, &input_ids, None, 0, 18)
            .unwrap();
        let (b, seq, h) = extracted.dims3().unwrap();
        assert_eq!(b, 1);
        assert_eq!(seq, 6); // 5 audio + 1 token
        assert_eq!(h, 2048);
    }

    /// Validates that audio conditioning affects Thinker hidden states.
    /// NOTE: With VarBuilder::zeros all linear layers map to zero regardless of input,
    /// so this test can only verify shapes (not differentiation). True conditioning
    /// verification requires real weights or random initialization.
    /// Slow (~60s on CPU). Run with: cargo test -- --ignored
    #[test]
    #[ignore]
    fn test_thinker_forward_with_audio_conditioning() {
        let device = Device::Cpu;
        let vb = VarBuilder::zeros(DType::F32, &device);
        let thinker = Qwen3OmniThinker::load_with_vb(vb.pp("thinker"), &device).unwrap();
        let input_ids = Tensor::new(&[0i64], &device).unwrap().unsqueeze(0).unwrap();
        let audio_a = Tensor::zeros(&[1, 3, 2048], DType::F32, &device).unwrap();
        let audio_b = Tensor::ones(&[1, 3, 2048], DType::F32, &device).unwrap();
        let (_, ext_a) = thinker
            .forward_with_hidden_states_from_audio(&audio_a, &input_ids, None, 0, 18)
            .unwrap();
        let (_, ext_b) = thinker
            .forward_with_hidden_states_from_audio(&audio_b, &input_ids, None, 0, 18)
            .unwrap();
        // With zero weights, both outputs are identical (model can't distinguish inputs).
        // Verify shapes match and the pipeline doesn't crash with different inputs.
        assert_eq!(ext_a.dims(), ext_b.dims(), "outputs must have matching shapes");
        let (b, seq, h) = ext_a.dims3().unwrap();
        assert_eq!(b, 1);
        assert_eq!(seq, 4); // 3 audio + 1 token
        assert_eq!(h, 2048);
    }

    /// Validates Thinker truncation when sequence exceeds max_position_embeddings.
    /// Slow (~60s on CPU). Run with: cargo test -- --ignored
    #[test]
    #[ignore]
    fn test_thinker_forward_with_audio_truncation() {
        let device = Device::Cpu;
        let vb = VarBuilder::zeros(DType::F32, &device);
        let mut config = ThinkerConfig::default();
        config.max_position_embeddings = 10;
        let thinker =
            Qwen3OmniThinker::load_with_vb_with_config(vb.pp("thinker"), config, &device).unwrap();
        // 15 audio + 1 token = 16 > max_position_embeddings (10) -> truncate to last 10
        let audio = Tensor::zeros(&[1, 15, 2048], DType::F32, &device).unwrap();
        let input_ids = Tensor::new(&[0i64], &device).unwrap().unsqueeze(0).unwrap();
        let (_final_hidden, extracted) = thinker
            .forward_with_hidden_states_from_audio(&audio, &input_ids, None, 0, 18)
            .unwrap();
        assert_eq!(extracted.dim(1).unwrap(), 10, "truncation should yield seq_len 10");
    }
}

// ============================================================================
// NAPI: CandleThinker for Node.js (only when feature "napi" is enabled)
// ============================================================================

#[cfg(feature = "napi")]
use napi_derive::napi;

#[cfg(feature = "napi")]
#[napi(object)]
pub struct CandleThinkerConfig {
    pub model_path: String,
    pub tokenizer_path: String,
    pub max_new_tokens: Option<u32>,
    pub temperature: Option<f64>,
}

#[cfg(feature = "napi")]
#[napi]
pub struct CandleThinker {
    model: Arc<Mutex<Qwen3OmniThinker>>,
    tokenizer: Arc<Tokenizer>,
    max_new_tokens: usize,
    temperature: f64,
}

#[cfg(feature = "napi")]
#[napi]
impl CandleThinker {
    #[napi(constructor)]
    pub fn new(config: CandleThinkerConfig) -> napi::Result<Self> {
        let device = Device::new_metal(0).unwrap_or_else(|_| Device::Cpu);
        let model = Qwen3OmniThinker::load(&config.model_path, &device)
            .map_err(|e| napi::Error::from_reason(format!("Load Thinker: {}", e)))?;
        let tokenizer = Tokenizer::from_file(&config.tokenizer_path)
            .map_err(|e| napi::Error::from_reason(format!("Load tokenizer: {}", e)))?;
        Ok(Self {
            model: Arc::new(Mutex::new(model)),
            tokenizer: Arc::new(tokenizer),
            max_new_tokens: config.max_new_tokens.unwrap_or(256) as usize,
            temperature: config.temperature.unwrap_or(0.6),
        })
    }

    #[napi]
    pub fn generate(&self, prompt: String) -> napi::Result<String> {
        let model = self.model.lock().map_err(|e| napi::Error::from_reason(format!("Lock: {}", e)))?;
        model
            .generate(&self.tokenizer, &prompt, self.max_new_tokens, self.temperature, None)
            .map_err(|e| napi::Error::from_reason(format!("Generate: {}", e)))
    }
}
