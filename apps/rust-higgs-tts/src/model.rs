//! Higgs Audio V2 — DualFFN Llama model implementation in candle.
//!
//! Architecture: Llama 3.2 3B backbone with DualFFN audio adapter.
//! Text tokens (ID < 128000) route through the standard Llama FFN.
//! Audio tokens (ID >= 128000) route through a separate audio FFN.
//! Both share attention layers.
//!
//! Key insight: DualFFN adds only FFN parameters — attention is shared.
//! This means inference FLOPs ≈ Llama 3.2 3B (only one FFN active per token).

use anyhow::Result;
use candle_core::{DType, Device, IndexOp, Module, Tensor, D};
use candle_nn::{embedding, linear_no_bias, Embedding, Linear, VarBuilder};

use crate::config::{HiggsAudioConfig, TextConfig};

// ─── Primitives ────────────────────────────────────────────────

/// RMS normalization (pre-norm, Llama-style).
pub struct RmsNorm {
    weight: Tensor,
    eps: f64,
}

impl RmsNorm {
    pub fn load(vb: VarBuilder, size: usize, eps: f64) -> Result<Self> {
        let weight = vb.get(size, "weight")?;
        Ok(Self { weight, eps })
    }

    pub fn forward(&self, x: &Tensor) -> candle_core::Result<Tensor> {
        // Compute in f32 for numerical stability, then convert back
        let orig_dtype = x.dtype();
        let x = x.to_dtype(DType::F32)?;
        let variance = x.sqr()?.mean_keepdim(D::Minus1)?;
        let x_normed = x.broadcast_div(&(variance + self.eps)?.sqrt()?)?;
        let w = self.weight.to_dtype(DType::F32)?;
        x_normed.broadcast_mul(&w)?.to_dtype(orig_dtype)
    }
}

/// SiLU activation: x * sigmoid(x). Manual implementation for Metal compat.
fn silu(x: &Tensor) -> candle_core::Result<Tensor> {
    x.mul(&sigmoid(x)?)
}

fn sigmoid(x: &Tensor) -> candle_core::Result<Tensor> {
    let neg = x.neg()?;
    let exp_neg = neg.exp()?;
    let ones = Tensor::ones_like(&exp_neg)?;
    let denom = (&ones + &exp_neg)?;
    ones.broadcast_div(&denom)
}

// ─── Rotary Position Embeddings (Llama3 NTK) ──────────────────

pub struct RotaryEmbedding {
    cos: Tensor,
    sin: Tensor,
}

impl RotaryEmbedding {
    pub fn new(config: &TextConfig, device: &Device) -> Result<Self> {
        let head_dim = config.head_dim;
        let base = config.rope_theta;
        let max_seq = config.max_position_embeddings;

        // Compute inverse frequencies
        let mut inv_freq = Vec::with_capacity(head_dim / 2);
        for i in (0..head_dim).step_by(2) {
            inv_freq.push(1.0f32 / (base as f32).powf(i as f32 / head_dim as f32));
        }

        // Apply Llama3 NTK scaling if configured
        if let Some(ref scaling) = config.rope_scaling {
            if scaling.rope_type == "llama3" {
                let factor = scaling.factor as f32;
                let low_freq_factor = scaling.low_freq_factor as f32;
                let high_freq_factor = scaling.high_freq_factor as f32;
                let old_max = scaling.original_max_position_embeddings as f32;

                let low_freq_wavelen = old_max / low_freq_factor;
                let high_freq_wavelen = old_max / high_freq_factor;

                for freq in inv_freq.iter_mut() {
                    let wavelen = 2.0 * std::f32::consts::PI / *freq;
                    if wavelen < high_freq_wavelen {
                        // High frequency: no scaling
                    } else if wavelen > low_freq_wavelen {
                        // Low frequency: full scaling
                        *freq /= factor;
                    } else {
                        // Linear interpolation
                        let smooth = (old_max / wavelen - low_freq_factor)
                            / (high_freq_factor - low_freq_factor);
                        *freq = (1.0 - smooth) * (*freq / factor) + smooth * *freq;
                    }
                }
            }
        }

        // Pre-compute cos/sin on CPU (Metal doesn't support F64 ops),
        // then transfer to target device.
        let cache_len = max_seq.min(8192);
        let cpu = Device::Cpu;
        let inv_freq_tensor =
            Tensor::from_vec(inv_freq, (head_dim / 2,), &cpu)?;
        let positions = Tensor::arange(0u32, cache_len as u32, &cpu)?.to_dtype(DType::F32)?;

        // Outer product: (seq_len, head_dim/2)
        let freqs = positions
            .unsqueeze(1)?
            .matmul(&inv_freq_tensor.unsqueeze(0)?)?;
        // Duplicate for complex rotation: (seq_len, head_dim)
        let emb = Tensor::cat(&[&freqs, &freqs], D::Minus1)?;

        let cos = emb.cos()?.to_device(device)?;
        let sin = emb.sin()?.to_device(device)?;

        Ok(Self { cos, sin })
    }

    /// Apply rotary embedding to query and key tensors.
    /// q, k shape: (batch, heads, seq_len, head_dim)
    pub fn apply(
        &self,
        q: &Tensor,
        k: &Tensor,
        position_offset: usize,
    ) -> candle_core::Result<(Tensor, Tensor)> {
        let seq_len = q.dim(2)?;
        let cos = self
            .cos
            .i(position_offset..position_offset + seq_len)?
            .unsqueeze(0)?
            .unsqueeze(0)?
            .to_dtype(q.dtype())?;
        let sin = self
            .sin
            .i(position_offset..position_offset + seq_len)?
            .unsqueeze(0)?
            .unsqueeze(0)?
            .to_dtype(q.dtype())?;

        let q_rotated = rotate_half(q, &cos, &sin)?;
        let k_rotated = rotate_half(k, &cos, &sin)?;
        Ok((q_rotated, k_rotated))
    }
}

/// Apply rotation: x * cos + rotate_half(x) * sin
fn rotate_half(x: &Tensor, cos: &Tensor, sin: &Tensor) -> candle_core::Result<Tensor> {
    let half = x.dim(D::Minus1)? / 2;
    let x1 = x.narrow(D::Minus1, 0, half)?;
    let x2 = x.narrow(D::Minus1, half, half)?;
    let rotated = Tensor::cat(&[&x2.neg()?, &x1], D::Minus1)?;
    x.broadcast_mul(cos)?.broadcast_add(&rotated.broadcast_mul(sin)?)
}

// ─── KV Cache ──────────────────────────────────────────────────

pub struct KvCache {
    pub k: Option<Tensor>,
    pub v: Option<Tensor>,
    pub offset: usize,
}

impl KvCache {
    pub fn new() -> Self {
        Self {
            k: None,
            v: None,
            offset: 0,
        }
    }

    /// Append new K,V and return the full accumulated tensors.
    pub fn update(&mut self, k: Tensor, v: Tensor) -> candle_core::Result<(Tensor, Tensor)> {
        let (k_out, v_out) = match (self.k.take(), self.v.take()) {
            (None, None) => (k, v),
            (Some(prev_k), Some(prev_v)) => {
                let k_out = Tensor::cat(&[prev_k, k], 2)?; // concat on seq_len dim
                let v_out = Tensor::cat(&[prev_v, v], 2)?;
                (k_out, v_out)
            }
            _ => unreachable!(),
        };
        self.offset = k_out.dim(2)?;
        self.k = Some(k_out.clone());
        self.v = Some(v_out.clone());
        Ok((k_out, v_out))
    }
}

// ─── Grouped Query Attention ───────────────────────────────────

pub struct Attention {
    q_proj: Linear,
    k_proj: Linear,
    v_proj: Linear,
    o_proj: Linear,
    num_heads: usize,
    num_kv_heads: usize,
    head_dim: usize,
}

impl Attention {
    pub fn load(vb: VarBuilder, config: &TextConfig) -> Result<Self> {
        let h = config.hidden_size;
        let hd = config.head_dim;
        let nh = config.num_attention_heads;
        let nkv = config.num_key_value_heads;

        Ok(Self {
            q_proj: linear_no_bias(h, nh * hd, vb.pp("q_proj"))?,
            k_proj: linear_no_bias(h, nkv * hd, vb.pp("k_proj"))?,
            v_proj: linear_no_bias(h, nkv * hd, vb.pp("v_proj"))?,
            o_proj: linear_no_bias(nh * hd, h, vb.pp("o_proj"))?,
            num_heads: nh,
            num_kv_heads: nkv,
            head_dim: hd,
        })
    }

    pub fn forward(
        &self,
        x: &Tensor,
        rotary: &RotaryEmbedding,
        cache: &mut KvCache,
        causal_mask: Option<&Tensor>,
    ) -> candle_core::Result<Tensor> {
        let (batch, seq_len, _) = x.dims3()?;

        // Project Q, K, V
        let q = self.q_proj.forward(x)?;
        let k = self.k_proj.forward(x)?;
        let v = self.v_proj.forward(x)?;

        // Reshape to (batch, heads, seq, head_dim)
        let q = q
            .reshape((batch, seq_len, self.num_heads, self.head_dim))?
            .transpose(1, 2)?;
        let k = k
            .reshape((batch, seq_len, self.num_kv_heads, self.head_dim))?
            .transpose(1, 2)?;
        let v = v
            .reshape((batch, seq_len, self.num_kv_heads, self.head_dim))?
            .transpose(1, 2)?;

        // Apply rotary embeddings
        let pos_offset = cache.offset;
        let (q, k) = rotary.apply(&q, &k, pos_offset)?;

        // Update KV cache
        let (k, v) = cache.update(k, v)?;

        // Expand KV heads for GQA: repeat each KV head for its group of Q heads
        let repeats = self.num_heads / self.num_kv_heads;
        let k = if repeats > 1 {
            repeat_kv(&k, repeats)?
        } else {
            k
        };
        let v = if repeats > 1 {
            repeat_kv(&v, repeats)?
        } else {
            v
        };

        // Scaled dot-product attention
        let scale = (self.head_dim as f64).sqrt();
        let attn_weights = q.matmul(&k.transpose(2, 3)?)?.affine(1.0 / scale, 0.0)?;

        // Apply causal mask
        let attn_weights = if let Some(mask) = causal_mask {
            attn_weights.broadcast_add(mask)?
        } else {
            attn_weights
        };

        let attn_weights = softmax(&attn_weights)?;
        let attn_out = attn_weights.matmul(&v)?;

        // Reshape back: (batch, heads, seq, head_dim) → (batch, seq, hidden)
        let attn_out = attn_out
            .transpose(1, 2)?
            .reshape((batch, seq_len, self.num_heads * self.head_dim))?;

        self.o_proj.forward(&attn_out)
    }
}

/// Repeat KV heads for Grouped Query Attention.
fn repeat_kv(x: &Tensor, repeats: usize) -> candle_core::Result<Tensor> {
    if repeats == 1 {
        return Ok(x.clone());
    }
    let (b, h, s, d) = x.dims4()?;
    x.unsqueeze(2)?
        .expand((b, h, repeats, s, d))?
        .reshape((b, h * repeats, s, d))
}

/// Softmax on last dimension, computed in f32 for stability.
fn softmax(x: &Tensor) -> candle_core::Result<Tensor> {
    let dtype = x.dtype();
    let x = x.to_dtype(DType::F32)?;
    let max_x = x.max_keepdim(D::Minus1)?;
    let exp_x = (x.broadcast_sub(&max_x))?.exp()?;
    let sum_exp = exp_x.sum_keepdim(D::Minus1)?;
    exp_x.broadcast_div(&sum_exp)?.to_dtype(dtype)
}

// ─── MLP (Gate + Up + Down with SiLU) ──────────────────────────

pub struct Mlp {
    gate_proj: Linear,
    up_proj: Linear,
    down_proj: Linear,
}

impl Mlp {
    pub fn load(vb: VarBuilder, hidden: usize, intermediate: usize) -> Result<Self> {
        Ok(Self {
            gate_proj: linear_no_bias(hidden, intermediate, vb.pp("gate_proj"))?,
            up_proj: linear_no_bias(hidden, intermediate, vb.pp("up_proj"))?,
            down_proj: linear_no_bias(intermediate, hidden, vb.pp("down_proj"))?,
        })
    }

    pub fn forward(&self, x: &Tensor) -> candle_core::Result<Tensor> {
        let gate = silu(&self.gate_proj.forward(x)?)?;
        let up = self.up_proj.forward(x)?;
        self.down_proj.forward(&(gate * up)?)
    }
}

// ─── DualFFN Decoder Layer ─────────────────────────────────────

/// A single transformer layer with DualFFN: text and audio tokens
/// share attention but route through separate FFN paths.
pub struct DualFFNDecoderLayer {
    input_layernorm: RmsNorm,
    self_attn: Attention,

    // Text FFN path
    post_attention_layernorm: RmsNorm,
    text_mlp: Mlp,

    // Audio path uses a separate pre-attention norm and post-attention FFN
    audio_input_layernorm: RmsNorm,
    audio_post_attention_layernorm: RmsNorm,
    audio_mlp: Mlp,

    // Whether to use fast-forward (audio tokens skip text FFN entirely)
    fast_forward: bool,
}

impl DualFFNDecoderLayer {
    pub fn load(
        vb: VarBuilder,
        config: &HiggsAudioConfig,
        fast_forward: bool,
    ) -> Result<Self> {
        let tc = &config.text_config;
        let eps = tc.rms_norm_eps;
        let h = tc.hidden_size;

        Ok(Self {
            input_layernorm: RmsNorm::load(vb.pp("input_layernorm"), h, eps)?,
            self_attn: Attention::load(vb.pp("self_attn"), tc)?,
            post_attention_layernorm: RmsNorm::load(
                vb.pp("post_attention_layernorm"),
                h,
                eps,
            )?,
            text_mlp: Mlp::load(vb.pp("mlp"), h, tc.intermediate_size)?,
            audio_input_layernorm: RmsNorm::load(
                vb.pp("audio_input_layernorm"),
                config.audio_ffn_hidden_size,
                eps,
            )?,
            audio_post_attention_layernorm: RmsNorm::load(
                vb.pp("audio_post_attention_layernorm"),
                config.audio_ffn_hidden_size,
                eps,
            )?,
            audio_mlp: Mlp::load(
                vb.pp("audio_mlp"),
                config.audio_ffn_hidden_size,
                config.audio_ffn_intermediate_size,
            )?,
            fast_forward,
        })
    }

    /// Forward pass with DualFFN routing.
    ///
    /// `audio_mask`: boolean tensor (batch, seq_len) where true = audio token.
    /// When no audio tokens are present, this degrades to standard Llama.
    pub fn forward(
        &self,
        x: &Tensor,
        rotary: &RotaryEmbedding,
        cache: &mut KvCache,
        causal_mask: Option<&Tensor>,
        audio_mask: Option<&Tensor>,
    ) -> candle_core::Result<Tensor> {
        let residual = x.clone();

        // 1. Pre-attention norm.
        // Python reference: text tokens → input_layernorm, audio tokens → audio_input_layernorm
        // When fast_forward=true (non-DualFFN layers): always use input_layernorm.
        // When fast_forward=false (DualFFN layers, all 28 for Higgs V2): conditional norm.
        let normed = if self.fast_forward {
            self.input_layernorm.forward(x)?
        } else {
            match audio_mask {
                Some(mask) if has_all_true(mask)? => {
                    // All audio tokens: use audio pre-attention norm
                    self.audio_input_layernorm.forward(x)?
                }
                Some(mask) if has_any_true(mask)? => {
                    // Mixed: ideally per-token torch.where, but for single-token
                    // decode this case is rare. Use input_layernorm as fallback.
                    self.input_layernorm.forward(x)?
                }
                _ => {
                    // All text tokens: standard Llama norm
                    self.input_layernorm.forward(x)?
                }
            }
        };
        let attn_out = self.self_attn.forward(&normed, rotary, cache, causal_mask)?;
        let hidden = (residual + attn_out)?;

        // 2. Route through text or audio FFN based on mask
        let residual = hidden.clone();

        match audio_mask {
            Some(mask) if has_all_true(mask)? => {
                // All audio: fast path — skip text FFN entirely
                let normed = self.audio_post_attention_layernorm.forward(&hidden)?;
                let mlp_out = self.audio_mlp.forward(&normed)?;
                &residual + mlp_out
            }
            Some(mask) if has_any_true(mask)? => {
                // Mixed text+audio: route tokens to appropriate FFN
                self.forward_dual_ffn(&hidden, &residual, mask)
            }
            _ => {
                // All text: standard Llama path
                let normed = self.post_attention_layernorm.forward(&hidden)?;
                let mlp_out = self.text_mlp.forward(&normed)?;
                &residual + mlp_out
            }
        }
    }

    /// Route tokens through text or audio FFN based on mask.
    fn forward_dual_ffn(
        &self,
        hidden: &Tensor,
        residual: &Tensor,
        audio_mask: &Tensor,
    ) -> candle_core::Result<Tensor> {
        let (batch, seq_len, hidden_size) = hidden.dims3()?;

        // Flatten to (batch*seq, hidden) for gathering
        let flat_hidden = hidden.reshape((batch * seq_len, hidden_size))?;
        let flat_residual = residual.reshape((batch * seq_len, hidden_size))?;
        let flat_mask = audio_mask.reshape(batch * seq_len)?;

        // Get indices for text and audio tokens by reading mask values
        let mask_vals: Vec<u8> = flat_mask.to_vec1()?;
        let text_idx: Vec<u32> = mask_vals
            .iter()
            .enumerate()
            .filter(|(_, &v)| v == 0)
            .map(|(i, _)| i as u32)
            .collect();
        let audio_idx: Vec<u32> = mask_vals
            .iter()
            .enumerate()
            .filter(|(_, &v)| v != 0)
            .map(|(i, _)| i as u32)
            .collect();

        let mut output = flat_residual.clone();
        let device = hidden.device();

        // Process text tokens through text FFN
        if !text_idx.is_empty() && !self.fast_forward {
            let text_indices =
                Tensor::from_vec(text_idx.clone(), (text_idx.len(),), device)?;
            let text_hidden = flat_hidden.index_select(&text_indices, 0)?;
            let text_normed = self.post_attention_layernorm.forward(&text_hidden)?;
            let text_out = self.text_mlp.forward(&text_normed)?;
            output = scatter_add(&output, &text_indices, &text_out)?;
        }

        // Process audio tokens through audio FFN
        if !audio_idx.is_empty() {
            let audio_indices =
                Tensor::from_vec(audio_idx.clone(), (audio_idx.len(),), device)?;
            let audio_hidden = flat_hidden.index_select(&audio_indices, 0)?;
            let audio_normed = self.audio_post_attention_layernorm.forward(&audio_hidden)?;
            let audio_out = self.audio_mlp.forward(&audio_normed)?;
            output = scatter_add(&output, &audio_indices, &audio_out)?;
        }

        output.reshape((batch, seq_len, hidden_size))
    }
}

/// Scatter-add: output[indices[i]] += src[i]
/// Uses a CPU-side loop for Metal compatibility (Metal scatter_add requires contiguous tensors).
fn scatter_add(
    target: &Tensor,
    indices: &Tensor,
    src: &Tensor,
) -> candle_core::Result<Tensor> {
    let n = indices.dim(0)?;
    if n == 0 {
        return Ok(target.clone());
    }

    // Read indices to CPU for the loop
    let idx_vec: Vec<u32> = indices.to_vec1()?;
    let mut result = target.clone();

    for (i, &idx) in idx_vec.iter().enumerate() {
        let src_row = src.i(i)?;
        let tgt_row = result.i(idx as usize)?;
        let updated = (&tgt_row + &src_row)?;
        result = result.slice_assign(&[idx as usize..idx as usize + 1], &updated.unsqueeze(0)?)?;
    }

    Ok(result)
}

/// Check if a boolean mask has any true values.
/// Reads directly to CPU to avoid expensive dtype conversion + GPU sync.
fn has_any_true(mask: &Tensor) -> candle_core::Result<bool> {
    let vals: Vec<u8> = mask.flatten_all()?.to_vec1()?;
    Ok(vals.iter().any(|&v| v != 0))
}

/// Check if a boolean mask has ALL true values.
/// Reads directly to CPU to avoid expensive dtype conversion + GPU sync.
fn has_all_true(mask: &Tensor) -> candle_core::Result<bool> {
    let vals: Vec<u8> = mask.flatten_all()?.to_vec1()?;
    Ok(vals.iter().all(|&v| v != 0))
}

// ─── Full Higgs Audio Model ────────────────────────────────────

pub struct HiggsAudioModel {
    pub embed_tokens: Embedding,
    pub layers: Vec<DualFFNDecoderLayer>,
    pub norm: RmsNorm,
    pub rotary: RotaryEmbedding,

    // Output heads
    pub text_lm_head: Linear,
    pub audio_lm_head: Linear,

    // Audio input embedding (for feeding back generated audio tokens)
    pub audio_codebook_embeddings: Embedding,

    pub config: HiggsAudioConfig,
    pub device: Device,
    pub dtype: DType,

    // KV caches (one per layer)
    pub caches: Vec<KvCache>,
}

impl HiggsAudioModel {
    pub fn load(
        config: HiggsAudioConfig,
        vb: VarBuilder,
        device: &Device,
    ) -> Result<Self> {
        let tc = &config.text_config;
        let dtype = DType::BF16; // BF16 = model's native format, halves memory bandwidth

        let embed_tokens = embedding(
            tc.vocab_size,
            tc.hidden_size,
            vb.pp("embed_tokens"),
        )?;

        let mut layers = Vec::with_capacity(tc.num_hidden_layers);
        for i in 0..tc.num_hidden_layers {
            let layer_vb = vb.pp(format!("layers.{i}"));
            // Python reference: layers IN audio_dual_ffn_layers → fast_forward=false
            // (they have DualFFN and process audio tokens through attention + audio FFN).
            // Layers NOT in the list → fast_forward=true (skip entirely for audio tokens).
            // For Higgs V2, ALL 28 layers are in audio_dual_ffn_layers → all false.
            let fast_forward = !config.has_dual_ffn(i);
            layers.push(DualFFNDecoderLayer::load(layer_vb, &config, fast_forward)?);
        }

        let norm = RmsNorm::load(
            vb.pp("norm"),
            tc.hidden_size,
            tc.rms_norm_eps,
        )?;

        let rotary = RotaryEmbedding::new(tc, device)?;

        // Text output head — use explicit weight from audio_decoder_proj
        // (safetensors has audio_decoder_proj.text_lm_head.weight even when
        // tie_word_embeddings=true in the text config)
        let text_lm_head =
            linear_no_bias(tc.hidden_size, tc.vocab_size, vb.pp("audio_decoder_proj.text_lm_head"))?;

        // Audio output head: hidden_size → num_codebooks * (codebook_size + 2)
        let audio_lm_head = linear_no_bias(
            tc.hidden_size,
            config.audio_lm_head_size(),
            vb.pp("audio_decoder_proj.audio_lm_head"),
        )?;

        // Audio codebook embeddings for feeding back generated tokens
        let cb_vocab = config.audio_num_codebooks * config.audio_vocab_per_codebook();
        let audio_codebook_embeddings = embedding(
            cb_vocab,
            tc.hidden_size,
            vb.pp("audio_codebook_embeddings"),
        )?;

        let caches = (0..tc.num_hidden_layers).map(|_| KvCache::new()).collect();

        Ok(Self {
            embed_tokens,
            layers,
            norm,
            rotary,
            text_lm_head,
            audio_lm_head,
            audio_codebook_embeddings,
            config,
            device: device.clone(),
            dtype,
            caches,
        })
    }

    /// Forward pass through the full model.
    ///
    /// Returns the hidden states after the final norm (before output heads).
    /// Caller applies text_lm_head or audio_lm_head depending on generation mode.
    ///
    /// Architecture: ALL tokens go through ALL layers. For `dual_ffn_fast_forward`,
    /// the `fast_forward` flag is per-layer (set during construction). Layers with
    /// DualFFN adapters (all 28 for Higgs V2) have fast_forward=false, meaning
    /// audio tokens go through shared attention + audio FFN at every layer.
    /// Text conditioning flows to audio through the shared attention's KV cache.
    pub fn forward(
        &mut self,
        input_embeds: &Tensor,
        audio_mask: Option<&Tensor>,
    ) -> candle_core::Result<Tensor> {
        let (_batch, seq_len, _) = input_embeds.dims3()?;

        // Build causal mask (lower triangular)
        let causal_mask = if seq_len > 1 {
            let mask = build_causal_mask(seq_len, &self.device)?;
            Some(mask)
        } else {
            // Single token decoding: no mask needed (KV cache handles causality)
            None
        };

        let mut hidden = input_embeds.clone();

        for (i, layer) in self.layers.iter().enumerate() {
            hidden = layer.forward(
                &hidden,
                &self.rotary,
                &mut self.caches[i],
                causal_mask.as_ref(),
                audio_mask,
            )?;
        }

        self.norm.forward(&hidden)
    }

    /// Embed text token IDs → (batch, seq_len, hidden_size).
    pub fn embed_text(&self, input_ids: &Tensor) -> candle_core::Result<Tensor> {
        self.embed_tokens.forward(input_ids)
    }

    /// Embed audio codebook tokens → (batch, 1, hidden_size).
    ///
    /// Takes 8 codebook IDs, shifts each by codebook_idx * codebook_size (1024),
    /// looks up embeddings, and sums across codebooks.
    ///
    /// The shift uses `audio_vocab_per_codebook` (1026) to match the audio_lm_head layout.
    /// audio_lm_head outputs 8208 logits reshaped to [8, 1026], so each codebook occupies
    /// 1026 consecutive slots: 0..1023 = real codes, 1024 = BOS, 1025 = EOS.
    /// The embedding table (8208 rows) uses the same stride for consistency.
    pub fn embed_audio_codes(&self, codes: &[u32]) -> candle_core::Result<Tensor> {
        assert_eq!(codes.len(), self.config.audio_num_codebooks);
        let vocab_per_cb = self.config.audio_vocab_per_codebook() as u32;

        let mut sum_embed: Option<Tensor> = None;
        for (cb_idx, &code) in codes.iter().enumerate() {
            let shifted_id = code + (cb_idx as u32) * vocab_per_cb;
            let id_tensor = Tensor::from_vec(
                vec![shifted_id],
                (1, 1),
                &self.device,
            )?;
            let embed = self.audio_codebook_embeddings.forward(&id_tensor)?;

            sum_embed = Some(match sum_embed {
                None => embed,
                Some(prev) => (&prev + &embed)?,
            });
        }

        Ok(sum_embed.unwrap())
    }

    /// Project hidden states to text logits.
    pub fn text_logits(&self, hidden: &Tensor) -> candle_core::Result<Tensor> {
        self.text_lm_head.forward(hidden)
    }

    /// Project hidden states to audio codebook logits.
    /// Returns (batch, seq_len, num_codebooks, vocab_per_codebook).
    pub fn audio_logits(&self, hidden: &Tensor) -> candle_core::Result<Tensor> {
        let raw = self.audio_lm_head.forward(hidden)?;
        let (b, s, _) = raw.dims3()?;
        raw.reshape((
            b,
            s,
            self.config.audio_num_codebooks,
            self.config.audio_vocab_per_codebook(),
        ))
    }

    /// Reset all KV caches (for new generation).
    pub fn reset_caches(&mut self) {
        for cache in &mut self.caches {
            cache.k = None;
            cache.v = None;
            cache.offset = 0;
        }
    }

    /// Pre-allocate KV cache tensors for a known max sequence length.
    ///
    /// **Phase 1 limitation:** `reset_caches()` is called at the start of every
    /// generation (generation.rs line 82), which drops these pre-allocated tensors
    /// and replaces them with `None`. As a result, this pre-allocation currently
    /// has **no effect** on inference performance — the cache is immediately
    /// discarded before use.
    ///
    /// **Phase 2:** Implement a slice-assignment strategy where `reset_caches()`
    /// resets the offset to 0 but preserves the allocated buffer. The KV cache
    /// `update()` method would then write into the pre-allocated tensor via
    /// slice assignment instead of concatenating new tensors each step.
    pub fn preallocate_caches(&mut self, max_seq_len: usize) -> candle_core::Result<()> {
        let tc = &self.config.text_config;
        let num_kv_heads = tc.num_key_value_heads;
        let head_dim = tc.hidden_size / tc.num_attention_heads;

        for cache in &mut self.caches {
            // Shape: (batch=1, num_kv_heads, max_seq_len, head_dim)
            let k = Tensor::zeros(
                (1, num_kv_heads, max_seq_len, head_dim),
                self.dtype,
                &self.device,
            )?;
            let v = Tensor::zeros(
                (1, num_kv_heads, max_seq_len, head_dim),
                self.dtype,
                &self.device,
            )?;
            cache.k = Some(k);
            cache.v = Some(v);
            cache.offset = 0;
        }

        Ok(())
    }
}

/// Build a causal attention mask: 0 for allowed positions, -inf for masked.
/// Built in F32 then cast to BF16 to match model dtype (BF16 supports NEG_INFINITY).
fn build_causal_mask(seq_len: usize, device: &Device) -> candle_core::Result<Tensor> {
    // Build lower-triangular mask manually (candle 0.8 doesn't have tril)
    let mut mask_data = vec![0.0f32; seq_len * seq_len];
    for i in 0..seq_len {
        for j in 0..seq_len {
            if j > i {
                mask_data[i * seq_len + j] = f32::NEG_INFINITY;
            }
        }
    }
    Tensor::from_vec(mask_data, (seq_len, seq_len), device)?
        .to_dtype(DType::BF16)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn causal_mask_shape() {
        let device = Device::Cpu;
        let mask = build_causal_mask(4, &device).unwrap();
        assert_eq!(mask.dims(), &[4, 4]);
    }

    #[test]
    fn silu_zero() {
        let device = Device::Cpu;
        let x = Tensor::zeros((2, 3), DType::F32, &device).unwrap();
        let out = silu(&x).unwrap();
        let data: Vec<f32> = out.flatten_all().unwrap().to_vec1().unwrap();
        assert!(data.iter().all(|&v| v.abs() < 1e-6));
    }
}
