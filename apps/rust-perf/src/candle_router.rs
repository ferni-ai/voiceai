//! FTIS V3 Candle GPU Router
//!
//! Metal GPU-accelerated tool routing using Candle ML framework.
//! Loads Qwen3ForSequenceClassification directly from safetensors,
//! bypassing ONNX entirely for native Apple Silicon performance.
//!
//! Target: ~50ms inference latency on Metal GPU vs ~200ms on CPU.

use candle_core::{DType, Device, IndexOp, Result as CandleResult, Tensor, D};
use candle_nn::{embedding, linear_no_bias, Embedding, Linear, Module, VarBuilder};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokenizers::Tokenizer;

// ============================================================================
// CONFIGURATION
// ============================================================================

/// Qwen3 model configuration from config.json
#[derive(Debug, Clone)]
pub struct Qwen3Config {
    pub vocab_size: usize,
    pub hidden_size: usize,
    pub intermediate_size: usize,
    pub num_hidden_layers: usize,
    pub num_attention_heads: usize,
    pub num_key_value_heads: usize,
    pub max_position_embeddings: usize,
    pub rms_norm_eps: f64,
    pub rope_theta: f64,
    pub head_dim: usize,
    pub num_labels: usize,
}

impl Default for Qwen3Config {
    fn default() -> Self {
        // Values from the ferni-router-v3 config.json
        Self {
            vocab_size: 151936,
            hidden_size: 2048,
            intermediate_size: 6144,
            num_hidden_layers: 28,
            num_attention_heads: 16,
            num_key_value_heads: 8,
            max_position_embeddings: 40960,
            rms_norm_eps: 1e-6,
            rope_theta: 1000000.0,
            head_dim: 128, // hidden_size / num_attention_heads
            num_labels: 40,
        }
    }
}

// ============================================================================
// MODEL COMPONENTS
// ============================================================================

/// RMS Layer Normalization (Qwen uses RMSNorm, not LayerNorm)
struct Qwen3RmsNorm {
    weight: Tensor,
    eps: f64,
}

impl Qwen3RmsNorm {
    fn load(vb: VarBuilder, size: usize, eps: f64) -> CandleResult<Self> {
        let weight = vb.get(size, "weight")?;
        Ok(Self { weight, eps })
    }

    fn forward(&self, x: &Tensor) -> CandleResult<Tensor> {
        let dtype = x.dtype();
        let x = x.to_dtype(DType::F32)?;
        let variance = x.sqr()?.mean_keepdim(D::Minus1)?;
        let x_normed = x.broadcast_div(&(variance + self.eps)?.sqrt()?)?;
        x_normed.to_dtype(dtype)?.broadcast_mul(&self.weight)
    }
}

/// Rotary Position Embedding
struct RotaryEmbedding {
    cos: Tensor,
    sin: Tensor,
}

impl RotaryEmbedding {
    fn new(cfg: &Qwen3Config, dtype: DType, device: &Device) -> CandleResult<Self> {
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

        let q_embed = apply_rotary_emb(&q, &cos, &sin)?;
        let k_embed = apply_rotary_emb(&k, &cos, &sin)?;
        Ok((q_embed, k_embed))
    }
}

fn apply_rotary_emb(x: &Tensor, cos: &Tensor, sin: &Tensor) -> CandleResult<Tensor> {
    let (b, h, l, d) = x.dims4()?;
    let cos = cos.unsqueeze(0)?.unsqueeze(0)?; // [1, 1, L, D/2]
    let sin = sin.unsqueeze(0)?.unsqueeze(0)?;

    let x1 = x.narrow(D::Minus1, 0, d / 2)?;
    let x2 = x.narrow(D::Minus1, d / 2, d / 2)?;

    let cos = cos.broadcast_as((b, h, l, d / 2))?;
    let sin = sin.broadcast_as((b, h, l, d / 2))?;

    let rotated = Tensor::cat(&[
        (&x1.broadcast_mul(&cos)? - &x2.broadcast_mul(&sin)?)?,
        (&x1.broadcast_mul(&sin)? + &x2.broadcast_mul(&cos)?)?,
    ], D::Minus1)?;

    Ok(rotated)
}

/// Q/K Normalization (Qwen3 specific)
struct QKNorm {
    q_norm: Qwen3RmsNorm,
    k_norm: Qwen3RmsNorm,
}

impl QKNorm {
    fn load(vb: VarBuilder, head_dim: usize, eps: f64) -> CandleResult<Self> {
        let q_norm = Qwen3RmsNorm::load(vb.pp("q_norm"), head_dim, eps)?;
        let k_norm = Qwen3RmsNorm::load(vb.pp("k_norm"), head_dim, eps)?;
        Ok(Self { q_norm, k_norm })
    }
}

/// Multi-Head Attention with Grouped Query Attention
struct Qwen3Attention {
    q_proj: Linear,
    k_proj: Linear,
    v_proj: Linear,
    o_proj: Linear,
    qk_norm: QKNorm,
    num_heads: usize,
    num_kv_heads: usize,
    head_dim: usize,
}

impl Qwen3Attention {
    fn load(vb: VarBuilder, cfg: &Qwen3Config) -> CandleResult<Self> {
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
        rotary: &RotaryEmbedding,
        attention_mask: Option<&Tensor>,
        seqlen_offset: usize,
    ) -> CandleResult<Tensor> {
        let (b, l, _) = hidden_states.dims3()?;

        // Project Q, K, V
        let q = self.q_proj.forward(hidden_states)?;
        let k = self.k_proj.forward(hidden_states)?;
        let v = self.v_proj.forward(hidden_states)?;

        // Reshape for multi-head attention (HuggingFace: proj -> reshape -> norm -> transpose)
        let q = q.reshape((b, l, self.num_heads, self.head_dim))?;
        let k = k.reshape((b, l, self.num_kv_heads, self.head_dim))?;
        let v = v.reshape((b, l, self.num_kv_heads, self.head_dim))?;

        // Apply Q/K normalization BEFORE transpose (Qwen3 specific)
        let q = self.qk_norm.q_norm.forward(&q)?;
        let k = self.qk_norm.k_norm.forward(&k)?;

        // Now transpose to (batch, heads, seq, head_dim)
        let q = q.transpose(1, 2)?;
        let k = k.transpose(1, 2)?;
        let v = v.transpose(1, 2)?;

        // Apply rotary embeddings
        let (q, k) = rotary.apply(&q, &k, seqlen_offset)?;

        // Repeat K,V for GQA
        let n_rep = self.num_heads / self.num_kv_heads;
        let k = repeat_kv(k, n_rep)?;
        let v = repeat_kv(v, n_rep)?;

        // Scaled dot-product attention
        let scale = 1.0 / (self.head_dim as f64).sqrt();
        let attn_weights = (q.matmul(&k.transpose(2, 3)?)? * scale)?;

        let attn_weights = match attention_mask {
            Some(mask) => attn_weights.broadcast_add(mask)?,
            None => attn_weights,
        };

        // Manual softmax (Metal-compatible)
        let attn_weights = softmax_manual(&attn_weights)?;
        let attn_output = attn_weights.matmul(&v)?;

        // Reshape back
        let attn_output = attn_output.transpose(1, 2)?.reshape((b, l, ()))?;
        self.o_proj.forward(&attn_output)
    }
}

/// Manual softmax implementation (Metal-compatible)
fn softmax_manual(x: &Tensor) -> CandleResult<Tensor> {
    let max_x = x.max_keepdim(D::Minus1)?;
    let exp_x = (x.broadcast_sub(&max_x))?;
    let exp_x = exp_x.exp()?;
    let sum_exp = exp_x.sum_keepdim(D::Minus1)?;
    exp_x.broadcast_div(&sum_exp)
}

/// Manual sigmoid implementation (Metal-compatible)
fn sigmoid_manual(x: &Tensor) -> CandleResult<Tensor> {
    // sigmoid(x) = 1 / (1 + exp(-x))
    let neg_x = x.neg()?;
    let exp_neg_x = neg_x.exp()?;
    let one = Tensor::ones_like(&exp_neg_x)?;
    let denom = (one.clone() + exp_neg_x)?;
    one.broadcast_div(&denom)
}

/// Manual SiLU (swish) implementation (Metal-compatible)
fn silu_manual(x: &Tensor) -> CandleResult<Tensor> {
    // silu(x) = x * sigmoid(x)
    let sigmoid_x = sigmoid_manual(x)?;
    x.mul(&sigmoid_x)
}

fn repeat_kv(x: Tensor, n_rep: usize) -> CandleResult<Tensor> {
    if n_rep == 1 {
        return Ok(x);
    }
    let (b, h, l, d) = x.dims4()?;
    let x = x.unsqueeze(2)?;
    let x = x.expand((b, h, n_rep, l, d))?;
    x.reshape((b, h * n_rep, l, d))
}

/// MLP with SwiGLU activation
struct Qwen3MLP {
    gate_proj: Linear,
    up_proj: Linear,
    down_proj: Linear,
}

impl Qwen3MLP {
    fn load(vb: VarBuilder, cfg: &Qwen3Config) -> CandleResult<Self> {
        let hidden = cfg.hidden_size;
        let intermediate = cfg.intermediate_size;

        let gate_proj = linear_no_bias(hidden, intermediate, vb.pp("gate_proj"))?;
        let up_proj = linear_no_bias(hidden, intermediate, vb.pp("up_proj"))?;
        let down_proj = linear_no_bias(intermediate, hidden, vb.pp("down_proj"))?;

        Ok(Self { gate_proj, up_proj, down_proj })
    }

    fn forward(&self, x: &Tensor) -> CandleResult<Tensor> {
        let gate = self.gate_proj.forward(x)?;
        let up = self.up_proj.forward(x)?;
        // SiLU activation (swish) - use manual implementation for Metal
        let gate = silu_manual(&gate)?;
        let hidden = (gate * up)?;
        self.down_proj.forward(&hidden)
    }
}

/// Transformer Decoder Layer
struct Qwen3DecoderLayer {
    self_attn: Qwen3Attention,
    mlp: Qwen3MLP,
    input_layernorm: Qwen3RmsNorm,
    post_attention_layernorm: Qwen3RmsNorm,
}

impl Qwen3DecoderLayer {
    fn load(vb: VarBuilder, cfg: &Qwen3Config) -> CandleResult<Self> {
        let self_attn = Qwen3Attention::load(vb.pp("self_attn"), cfg)?;
        let mlp = Qwen3MLP::load(vb.pp("mlp"), cfg)?;
        let input_layernorm = Qwen3RmsNorm::load(vb.pp("input_layernorm"), cfg.hidden_size, cfg.rms_norm_eps)?;
        let post_attention_layernorm = Qwen3RmsNorm::load(vb.pp("post_attention_layernorm"), cfg.hidden_size, cfg.rms_norm_eps)?;

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
        attention_mask: Option<&Tensor>,
        seqlen_offset: usize,
    ) -> CandleResult<Tensor> {
        // Pre-norm attention
        let residual = x;
        let x = self.input_layernorm.forward(x)?;
        let x = self.self_attn.forward(&x, rotary, attention_mask, seqlen_offset)?;
        let x = (residual + x)?;

        // Pre-norm MLP
        let residual = &x;
        let x = self.post_attention_layernorm.forward(&x)?;
        let x = self.mlp.forward(&x)?;
        residual + x
    }
}

// ============================================================================
// MAIN MODEL: Qwen3ForSequenceClassification
// ============================================================================

/// Qwen3 base model (transformer stack)
struct Qwen3Model {
    embed_tokens: Embedding,
    layers: Vec<Qwen3DecoderLayer>,
    norm: Qwen3RmsNorm,
    rotary: RotaryEmbedding,
    dtype: DType,
}

impl Qwen3Model {
    fn load(vb: VarBuilder, cfg: &Qwen3Config, dtype: DType, device: &Device) -> CandleResult<Self> {
        let embed_tokens = embedding(cfg.vocab_size, cfg.hidden_size, vb.pp("embed_tokens"))?;

        let mut layers = Vec::with_capacity(cfg.num_hidden_layers);
        let vb_layers = vb.pp("layers");
        for i in 0..cfg.num_hidden_layers {
            let layer = Qwen3DecoderLayer::load(vb_layers.pp(i), cfg)?;
            layers.push(layer);
        }

        let norm = Qwen3RmsNorm::load(vb.pp("norm"), cfg.hidden_size, cfg.rms_norm_eps)?;
        let rotary = RotaryEmbedding::new(cfg, dtype, device)?;

        Ok(Self { embed_tokens, layers, norm, rotary, dtype })
    }

    fn forward(&self, input_ids: &Tensor, _attention_mask: Option<&Tensor>) -> CandleResult<Tensor> {
        let (_, seq_len) = input_ids.dims2()?;

        // Token embeddings
        let mut hidden_states = self.embed_tokens.forward(input_ids)?;

        // Create causal mask (GPT-style models use causal attention even for classification)
        let causal_mask = if seq_len > 1 {
            let mut mask_data = vec![0.0f32; seq_len * seq_len];
            for i in 0..seq_len {
                for j in 0..seq_len {
                    if j > i {
                        mask_data[i * seq_len + j] = f32::NEG_INFINITY;
                    }
                }
            }
            let mask = Tensor::from_vec(mask_data, (seq_len, seq_len), input_ids.device())?
                .to_dtype(self.dtype)?;
            Some(mask.unsqueeze(0)?.unsqueeze(0)?)
        } else {
            None
        };

        // Pass through all layers
        for layer in &self.layers {
            hidden_states = layer.forward(&hidden_states, &self.rotary, causal_mask.as_ref(), 0)?;
        }

        // Final layer norm
        self.norm.forward(&hidden_states)
    }
}

/// Qwen3 for Sequence Classification (multi-label)
pub struct Qwen3ForSequenceClassification {
    model: Qwen3Model,
    score: Linear,
    #[allow(dead_code)]
    config: Qwen3Config,
    device: Device,
}

impl Qwen3ForSequenceClassification {
    /// Load model from safetensors files
    pub fn load(model_path: &str, device: &Device) -> CandleResult<Self> {
        let config = Qwen3Config::default();

        // Load config.json to get num_labels
        let config_path = format!("{}/config.json", model_path);
        let config_json: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(&config_path)
                .map_err(|e| candle_core::Error::Msg(format!("Failed to read config: {}", e)))?
        ).map_err(|e| candle_core::Error::Msg(format!("Failed to parse config: {}", e)))?;

        let num_labels = config_json["num_labels"].as_u64().unwrap_or(40) as usize;
        let config = Qwen3Config { num_labels, ..config };

        // Load safetensors with index
        let safetensors_index_path = format!("{}/model.safetensors.index.json", model_path);
        let safetensors_index: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(&safetensors_index_path)
                .map_err(|e| candle_core::Error::Msg(format!("Failed to read safetensors index: {}", e)))?
        ).map_err(|e| candle_core::Error::Msg(format!("Failed to parse safetensors index: {}", e)))?;

        // Get unique safetensors files
        let weight_map = safetensors_index["weight_map"].as_object()
            .ok_or_else(|| candle_core::Error::Msg("Missing weight_map".into()))?;

        let mut files: Vec<String> = weight_map.values()
            .filter_map(|v| v.as_str())
            .map(|s| format!("{}/{}", model_path, s))
            .collect();
        files.sort();
        files.dedup();

        eprintln!("Loading {} safetensors files on {:?}...", files.len(), device);

        // Load all tensors
        let vb = unsafe {
            VarBuilder::from_mmaped_safetensors(&files, DType::F32, device)?
        };

        // Build model (use F32 for numerical accuracy - BF16 was causing precision issues)
        let dtype = DType::F32;
        let model = Qwen3Model::load(vb.pp("model"), &config, dtype, device)?;

        // Classification head
        let score = linear_no_bias(config.hidden_size, config.num_labels, vb.pp("score"))?;

        Ok(Self { model, score, config, device: device.clone() })
    }

    /// Forward pass for classification
    pub fn forward(&self, input_ids: &Tensor, _attention_mask: Option<&Tensor>, actual_seq_len: usize) -> CandleResult<Tensor> {
        let hidden_states = self.model.forward(input_ids, None)?;

        // Pool using ACTUAL last token (not pad token!)
        // For sequence classification, we use the last non-padding token
        let last_token_idx = actual_seq_len.saturating_sub(1);
        let last_hidden = hidden_states.i((.., last_token_idx, ..))?;

        // Classification head → logits
        self.score.forward(&last_hidden)
    }

    /// Get sigmoid probabilities for multi-label classification
    pub fn predict(&self, input_ids: &Tensor, attention_mask: Option<&Tensor>, actual_seq_len: usize) -> CandleResult<Tensor> {
        let logits = self.forward(input_ids, attention_mask, actual_seq_len)?;
        // Sigmoid for multi-label (use manual implementation for Metal)
        sigmoid_manual(&logits)
    }
}

// ============================================================================
// NAPI BINDINGS
// ============================================================================

#[napi(object)]
#[derive(Clone)]
pub struct CandleToolPrediction {
    pub tool_id: String,
    pub confidence: f64,
}

#[napi(object)]
pub struct CandleRouterResult {
    pub predictions: Vec<CandleToolPrediction>,
    pub latency_ms: f64,
    pub device: String,
}

#[napi(object)]
pub struct CandleRouterConfig {
    pub model_path: String,
    pub tokenizer_path: String,
    pub label_map_path: String,
    pub max_length: u32,
    pub threshold: f64,
    pub top_k: u32,
}

/// Metal GPU-accelerated FTIS V3 Router using Candle
#[napi]
pub struct CandleRouter {
    model: Arc<Mutex<Qwen3ForSequenceClassification>>,
    tokenizer: Arc<Tokenizer>,
    label_map: HashMap<i64, String>,
    max_length: usize,
    threshold: f64,
    top_k: usize,
    device_name: String,
    pad_token_id: u32, // Qwen3 uses 151643, not 0!
}

#[napi]
impl CandleRouter {
    /// Create a new Candle router with Metal GPU acceleration
    #[napi(constructor)]
    pub fn new(config: CandleRouterConfig) -> Result<Self> {
        let start = std::time::Instant::now();

        // Try to use Metal (Apple Silicon GPU), fall back to CPU
        let device = Device::new_metal(0)
            .map_err(|e| {
                eprintln!("Metal device not available: {}, falling back to CPU", e);
                e
            })
            .unwrap_or_else(|_| Device::Cpu);

        let device_name = match &device {
            Device::Metal(_) => "Metal GPU".to_string(),
            Device::Cpu => "CPU".to_string(),
            _ => "Unknown".to_string(),
        };

        eprintln!("Initializing Candle router on {}...", device_name);

        // Load model
        let model = Qwen3ForSequenceClassification::load(&config.model_path, &device)
            .map_err(|e| Error::from_reason(format!("Failed to load model: {}", e)))?;

        // Load tokenizer
        let tokenizer = Tokenizer::from_file(&config.tokenizer_path)
            .map_err(|e| Error::from_reason(format!("Failed to load tokenizer: {}", e)))?;

        // Load label map
        let label_map_content = std::fs::read_to_string(&config.label_map_path)
            .map_err(|e| Error::from_reason(format!("Failed to read label map: {}", e)))?;
        let label_map_raw: HashMap<String, i64> = serde_json::from_str(&label_map_content)
            .map_err(|e| Error::from_reason(format!("Failed to parse label map: {}", e)))?;

        // Invert map (id -> label)
        let label_map: HashMap<i64, String> = label_map_raw
            .into_iter()
            .map(|(k, v)| (v, k))
            .collect();

        // Get pad token from tokenizer, default to Qwen3's pad_token_id
        let pad_token_id = tokenizer.get_padding()
            .map(|p| p.pad_id)
            .unwrap_or(151643); // Qwen3 pad_token_id

        let load_time = start.elapsed().as_millis();
        eprintln!(
            "Candle router loaded in {}ms on {} ({} labels, pad_token={})",
            load_time, device_name, label_map.len(), pad_token_id
        );

        Ok(Self {
            model: Arc::new(Mutex::new(model)),
            tokenizer: Arc::new(tokenizer),
            label_map,
            max_length: config.max_length as usize,
            threshold: config.threshold,
            top_k: config.top_k as usize,
            device_name,
            pad_token_id,
        })
    }

    /// Predict tools for a query using Metal GPU
    #[napi]
    pub fn predict(&self, query: String) -> Result<CandleRouterResult> {
        let start = std::time::Instant::now();

        // Tokenize
        let encoding = self.tokenizer
            .encode(query.as_str(), true)
            .map_err(|e| Error::from_reason(format!("Tokenization failed: {}", e)))?;

        // Prepare input tensor with correct padding token
        let mut input_ids: Vec<i64> = encoding.get_ids().iter().map(|&x| x as i64).collect();

        // Find actual sequence length by detecting first pad token
        // The tokenizer may already pad, so we need to find where real content ends
        let pad_id = self.pad_token_id as i64;
        let actual_seq_len = input_ids.iter()
            .position(|&id| id == pad_id)
            .unwrap_or(input_ids.len())
            .min(self.max_length);

        input_ids.truncate(self.max_length);
        input_ids.resize(self.max_length, pad_id);

        // Get device from model
        let model = self.model.lock()
            .map_err(|e| Error::from_reason(format!("Model lock failed: {}", e)))?;

        let input_tensor = Tensor::new(&input_ids[..], &model.device)
            .map_err(|e| Error::from_reason(format!("Failed to create input tensor: {}", e)))?
            .unsqueeze(0)
            .map_err(|e| Error::from_reason(format!("Failed to unsqueeze: {}", e)))?;

        // Forward pass (GPU accelerated) - use actual sequence length for pooling
        let probs = model.predict(&input_tensor, None, actual_seq_len)
            .map_err(|e| Error::from_reason(format!("Inference failed: {}", e)))?;

        // Extract probabilities to CPU (convert BF16 → F32)
        let probs_vec: Vec<f32> = probs.squeeze(0)
            .map_err(|e| Error::from_reason(format!("Squeeze failed: {}", e)))?
            .to_dtype(DType::F32)
            .map_err(|e| Error::from_reason(format!("Dtype conversion failed: {}", e)))?
            .to_vec1()
            .map_err(|e| Error::from_reason(format!("To vec failed: {}", e)))?;

        // Filter by threshold and create predictions
        let mut predictions: Vec<CandleToolPrediction> = probs_vec
            .iter()
            .enumerate()
            .filter_map(|(idx, &prob)| {
                if prob >= self.threshold as f32 {
                    self.label_map.get(&(idx as i64)).map(|tool_id| CandleToolPrediction {
                        tool_id: tool_id.clone(),
                        confidence: prob as f64,
                    })
                } else {
                    None
                }
            })
            .collect();

        // Sort by confidence descending and take top_k
        predictions.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap());
        predictions.truncate(self.top_k);

        let latency_ms = start.elapsed().as_secs_f64() * 1000.0;

        Ok(CandleRouterResult {
            predictions,
            latency_ms,
            device: self.device_name.clone(),
        })
    }

    /// Get the number of supported tools
    #[napi]
    pub fn get_num_tools(&self) -> u32 {
        self.label_map.len() as u32
    }

    /// Get all tool labels
    #[napi]
    pub fn get_labels(&self) -> Vec<String> {
        self.label_map.values().cloned().collect()
    }

    /// Get the device being used (Metal GPU or CPU)
    #[napi]
    pub fn get_device(&self) -> String {
        self.device_name.clone()
    }

    /// Warmup the model by running a dummy inference
    #[napi]
    pub fn warmup(&self) -> Result<f64> {
        let start = std::time::Instant::now();
        let _ = self.predict("hello".to_string())?;
        let warmup_ms = start.elapsed().as_secs_f64() * 1000.0;
        eprintln!("Candle router warmup complete in {:.1}ms", warmup_ms);
        Ok(warmup_ms)
    }
}
