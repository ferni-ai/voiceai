//! Qwen3-Omni Audio Encoder (AuT) in Candle.
//!
//! Port of Qwen3OmniMoeAudioEncoder: Conv2d stem + sinusoidal pos embed + 32 transformer
//! encoder layers (LayerNorm, MHA with bias, FFN GELU) + projection to Thinker hidden_size.

use candle_core::{DType, Device, Result as CandleResult, Tensor, D};
use candle_nn::{
    conv2d_no_bias, linear, linear_no_bias, Conv2d, Conv2dConfig, LayerNorm, Linear, Module, VarBuilder,
};
use std::path::Path;

// ============================================================================
// CONFIG
// ============================================================================

/// Audio encoder config (from config.json thinker_config.audio_config).
#[derive(Debug, Clone)]
pub struct AudioEncoderConfig {
    pub num_mel_bins: usize,
    pub d_model: usize,
    pub encoder_layers: usize,
    pub encoder_attention_heads: usize,
    pub encoder_ffn_dim: usize,
    pub output_dim: usize,
    pub max_source_positions: usize,
    pub downsample_hidden_size: usize,
    pub scale_embedding: bool,
}

impl Default for AudioEncoderConfig {
    fn default() -> Self {
        Self {
            num_mel_bins: 128,
            d_model: 1280,
            encoder_layers: 32,
            encoder_attention_heads: 20,
            encoder_ffn_dim: 5120,
            output_dim: 2048,
            max_source_positions: 1500,
            downsample_hidden_size: 480,
            scale_embedding: false,
        }
    }
}

impl AudioEncoderConfig {
    /// Flattened mel dimension after 3× Conv2d (kernel=3, stride=2, padding=1): out = (in - 1)/2 + 1.
    /// 128 → 64 → 32 → 16.
    pub fn conv_output_mel_dim(&self) -> usize {
        let mut d = self.num_mel_bins;
        for _ in 0..3 {
            d = (d.saturating_sub(1)) / 2 + 1;
        }
        d
    }

    pub fn conv_out_input_dim(&self) -> usize {
        self.downsample_hidden_size * self.conv_output_mel_dim()
    }

    pub fn from_json_path(path: &Path) -> CandleResult<Self> {
        let s = std::fs::read_to_string(path)
            .map_err(|e| candle_core::Error::Msg(format!("Failed to read config: {}", e)))?;
        let v: serde_json::Value =
            serde_json::from_str(&s).map_err(|e| candle_core::Error::Msg(format!("Parse config: {}", e)))?;
        let audio = v
            .get("thinker_config")
            .and_then(|t| t.get("audio_config"))
            .or(v.get("audio_config"))
            .or(Some(&v));
        let audio = audio.ok_or_else(|| candle_core::Error::Msg("Missing audio_config".into()))?;
        Ok(Self {
            num_mel_bins: audio.get("num_mel_bins").and_then(|x| x.as_u64()).unwrap_or(128) as usize,
            d_model: audio.get("d_model").and_then(|x| x.as_u64()).unwrap_or(1280) as usize,
            encoder_layers: audio.get("encoder_layers").and_then(|x| x.as_u64()).unwrap_or(32) as usize,
            encoder_attention_heads: audio.get("encoder_attention_heads").and_then(|x| x.as_u64()).unwrap_or(20) as usize,
            encoder_ffn_dim: audio.get("encoder_ffn_dim").and_then(|x| x.as_u64()).unwrap_or(5120) as usize,
            output_dim: audio.get("output_dim").and_then(|x| x.as_u64()).unwrap_or(2048) as usize,
            max_source_positions: audio.get("max_source_positions").and_then(|x| x.as_u64()).unwrap_or(1500) as usize,
            downsample_hidden_size: audio.get("downsample_hidden_size").and_then(|x| x.as_u64()).unwrap_or(480) as usize,
            scale_embedding: audio.get("scale_embedding").and_then(|x| x.as_bool()).unwrap_or(false),
        })
    }
}

// ============================================================================
// HELPERS: GELU, softmax
// ============================================================================

fn gelu(x: &Tensor) -> CandleResult<Tensor> {
    // GELU(x) ≈ 0.5 * x * (1 + tanh(sqrt(2/π) * (x + 0.044715 * x^3)))
    let half = 0.5f64;
    let sqrt_2_over_pi = (2.0_f64 / std::f64::consts::PI).sqrt();
    let x_f64 = x.to_dtype(DType::F64)?;
    let x3 = x_f64.powf(3.0)?;
    let inner = (x_f64.clone() + x3.affine(0.044715, 0.0)?)?.affine(sqrt_2_over_pi, 0.0)?;
    let tanh_inner = inner.tanh()?;
    let one = Tensor::ones_like(&tanh_inner)?;
    let plus_one = (one + tanh_inner)?;
    let mul = x_f64.broadcast_mul(&plus_one)?;
    let out = mul.affine(half, 0.0)?;
    out.to_dtype(x.dtype())
}

fn softmax_manual(x: &Tensor) -> CandleResult<Tensor> {
    let max_x = x.max_keepdim(D::Minus1)?;
    let exp_x = (x.broadcast_sub(&max_x))?.exp()?;
    let sum_exp = exp_x.sum_keepdim(D::Minus1)?;
    exp_x.broadcast_div(&sum_exp)
}

// ============================================================================
// Sinusoidal positional embedding
// ============================================================================

struct SinusoidsPositionEmbedding {
    embedding: Tensor,
    max_timescale: f64,
}

impl SinusoidsPositionEmbedding {
    fn new(length: usize, channels: usize, dtype: DType, device: &Device) -> CandleResult<Self> {
        let half = channels / 2;
        let log_inc = (10000.0f64).ln() / (half - 1) as f64;
        let inv_timescales: Vec<f32> = (0..half)
            .map(|i| (log_inc * i as f64).exp() as f32)
            .collect();
        let inv = Tensor::new(inv_timescales.as_slice(), device)?.to_dtype(dtype)?;
        let t: Vec<f32> = (0..length).map(|i| i as f32).collect();
        let t = Tensor::new(t.as_slice(), device)?.to_dtype(dtype)?.unsqueeze(1)?;
        let inv = inv.unsqueeze(0)?;
        let scaled = t.matmul(&inv)?;
        let sin = scaled.sin()?;
        let cos = scaled.cos()?;
        let embedding = Tensor::cat(&[sin, cos], D::Minus1)?;
        Ok(Self {
            embedding,
            max_timescale: 10000.0,
        })
    }

    fn apply(&self, seq_len: usize) -> CandleResult<Tensor> {
        self.embedding.narrow(0, 0, seq_len)
    }
}

// ============================================================================
// Encoder layer: pre-LayerNorm, MHA (with bias), pre-LayerNorm, FFN GELU
// ============================================================================

struct AudioEncoderLayer {
    self_attn_layer_norm: LayerNorm,
    q_proj: Linear,
    k_proj: Linear,
    v_proj: Linear,
    out_proj: Linear,
    final_layer_norm: LayerNorm,
    fc1: Linear,
    fc2: Linear,
    embed_dim: usize,
    num_heads: usize,
    head_dim: usize,
}

impl AudioEncoderLayer {
    fn load(vb: VarBuilder, cfg: &AudioEncoderConfig) -> CandleResult<Self> {
        let embed_dim = cfg.d_model;
        let num_heads = cfg.encoder_attention_heads;
        let head_dim = embed_dim / num_heads;
        let self_attn_layer_norm = candle_nn::layer_norm(embed_dim, 1e-5, vb.pp("self_attn_layer_norm"))?;
        let q_proj = linear(embed_dim, embed_dim, vb.pp("self_attn").pp("q_proj"))?;
        let k_proj = linear(embed_dim, embed_dim, vb.pp("self_attn").pp("k_proj"))?;
        let v_proj = linear(embed_dim, embed_dim, vb.pp("self_attn").pp("v_proj"))?;
        let out_proj = linear(embed_dim, embed_dim, vb.pp("self_attn").pp("out_proj"))?;
        let final_layer_norm = candle_nn::layer_norm(embed_dim, 1e-5, vb.pp("final_layer_norm"))?;
        let fc1 = linear(embed_dim, cfg.encoder_ffn_dim, vb.pp("fc1"))?;
        let fc2 = linear(cfg.encoder_ffn_dim, embed_dim, vb.pp("fc2"))?;
        Ok(Self {
            self_attn_layer_norm,
            q_proj,
            k_proj,
            v_proj,
            out_proj,
            final_layer_norm,
            fc1,
            fc2,
            embed_dim,
            num_heads,
            head_dim,
        })
    }

    fn forward(&self, x: &Tensor, attention_mask: Option<&Tensor>) -> CandleResult<Tensor> {
        let residual = x;
        let x = self.self_attn_layer_norm.forward(x)?;
        let (b, seq_len, _) = x.dims3()?;
        let q = self.q_proj.forward(&x)?;
        let k = self.k_proj.forward(&x)?;
        let v = self.v_proj.forward(&x)?;
        let q = q.reshape((b, seq_len, self.num_heads, self.head_dim))?.transpose(1, 2)?;
        let k = k.reshape((b, seq_len, self.num_heads, self.head_dim))?.transpose(1, 2)?;
        let v = v.reshape((b, seq_len, self.num_heads, self.head_dim))?.transpose(1, 2)?;
        let scale = 1.0 / (self.head_dim as f64).sqrt();
        let mut attn = (q.matmul(&k.transpose(2, 3)?)? * scale)?;
        if let Some(mask) = attention_mask {
            attn = attn.broadcast_add(mask)?;
        }
        let attn = softmax_manual(&attn)?;
        let out = attn.matmul(&v)?;
        let out = out.transpose(1, 2)?.reshape((b, seq_len, self.embed_dim))?;
        let out = self.out_proj.forward(&out)?;
        let x = (residual + out)?;

        let residual = &x;
        let x = self.final_layer_norm.forward(&x)?;
        let x = self.fc1.forward(&x)?;
        let x = gelu(&x)?;
        let x = self.fc2.forward(&x)?;
        residual + x
    }
}

// ============================================================================
// Full Audio Encoder
// ============================================================================

/// Qwen3-Omni Audio Encoder (AuT). Outputs embeddings of shape (batch, seq, output_dim).
pub struct Qwen3OmniAudioEncoder {
    conv2d1: Conv2d,
    conv2d2: Conv2d,
    conv2d3: Conv2d,
    conv_out: Linear,
    positional_embedding: SinusoidsPositionEmbedding,
    layers: Vec<AudioEncoderLayer>,
    ln_post: LayerNorm,
    proj1: Linear,
    proj2: Linear,
    config: AudioEncoderConfig,
    device: Device,
    embed_scale: f64,
}

impl Qwen3OmniAudioEncoder {
    /// Load from model directory. Expects thinker.audio_encoder.* weights when loading from full checkpoint;
    /// pass a VarBuilder already prefixed (e.g. vb.pp("thinker").pp("audio_encoder")).
    pub fn load(model_path: &str, device: &Device) -> CandleResult<Self> {
        let base = Path::new(model_path);
        let config_path = base.join("config.json");
        let config = if config_path.exists() {
            AudioEncoderConfig::from_json_path(&config_path)?
        } else {
            AudioEncoderConfig::default()
        };

        let index_path = base.join("model.safetensors.index.json");
        let files: Vec<String> = if index_path.exists() {
            let s = std::fs::read_to_string(&index_path)
                .map_err(|e| candle_core::Error::Msg(format!("Read index: {}", e)))?;
            let v: serde_json::Value =
                serde_json::from_str(&s).map_err(|e| candle_core::Error::Msg(format!("Parse index: {}", e)))?;
            let weight_map = v["weight_map"].as_object().ok_or_else(|| candle_core::Error::Msg("Missing weight_map".into()))?;
            let mut f: Vec<String> = weight_map
                .values()
                .filter_map(|v| v.as_str())
                .map(|s| base.join(s).to_string_lossy().into_owned())
                .collect();
            f.sort();
            f.dedup();
            f
        } else {
            let single = base.join("model.safetensors");
            if single.exists() {
                vec![single.to_string_lossy().into_owned()]
            } else {
                return Err(candle_core::Error::Msg("No model.safetensors or index".into()));
            }
        };

        let vb = unsafe { VarBuilder::from_mmaped_safetensors(&files, DType::F32, device)? };
        // Support multiple checkpoint layouts: model.thinker.audio_encoder.* (HF legacy),
        // thinker.audio_encoder.* (direct), thinker.audio_tower.* (HF Qwen3-Omni-30B-A3B).
        let vb_enc = if index_path.exists() {
            let s = std::fs::read_to_string(&index_path).unwrap_or_default();
            if s.contains("model.thinker.audio_encoder.") {
                vb.pp("model").pp("thinker").pp("audio_encoder")
            } else if s.contains("thinker.audio_tower.") {
                vb.pp("thinker").pp("audio_tower")
            } else {
                vb.pp("thinker").pp("audio_encoder")
            }
        } else {
            vb.pp("thinker").pp("audio_encoder")
        };

        let conv_cfg = Conv2dConfig {
            padding: 1,
            stride: 2,
            dilation: 1,
            groups: 1,
        };
        let conv2d1 = conv2d_no_bias(1, config.downsample_hidden_size, 3, conv_cfg, vb_enc.pp("conv2d1"))?;
        let conv2d2 = conv2d_no_bias(config.downsample_hidden_size, config.downsample_hidden_size, 3, conv_cfg, vb_enc.pp("conv2d2"))?;
        let conv2d3 = conv2d_no_bias(config.downsample_hidden_size, config.downsample_hidden_size, 3, conv_cfg, vb_enc.pp("conv2d3"))?;

        let conv_out_in = config.conv_out_input_dim();
        let conv_out = linear_no_bias(conv_out_in, config.d_model, vb_enc.pp("conv_out"))?;

        let positional_embedding = SinusoidsPositionEmbedding::new(
            config.max_source_positions,
            config.d_model,
            DType::F32,
            device,
        )?;

        let mut layers = Vec::with_capacity(config.encoder_layers);
        for i in 0..config.encoder_layers {
            let layer = AudioEncoderLayer::load(vb_enc.pp("layers").pp(i), &config)?;
            layers.push(layer);
        }

        let ln_post = candle_nn::layer_norm(config.d_model, 1e-5, vb_enc.pp("ln_post"))?;
        let proj1 = linear(config.d_model, config.d_model, vb_enc.pp("proj1"))?;
        let proj2 = linear(config.d_model, config.output_dim, vb_enc.pp("proj2"))?;

        let embed_scale = if config.scale_embedding {
            (config.d_model as f64).sqrt()
        } else {
            1.0
        };

        Ok(Self {
            conv2d1,
            conv2d2,
            conv2d3,
            conv_out,
            positional_embedding,
            layers,
            ln_post,
            proj1,
            proj2,
            config,
            device: device.clone(),
            embed_scale,
        })
    }

    /// Build from VarBuilder (e.g. zeros for test mode). Uses default config.
    /// Call with vb already prefixed, e.g. vb.pp("thinker").pp("audio_encoder").
    pub fn load_with_vb(vb: candle_nn::VarBuilder, device: &Device) -> CandleResult<Self> {
        let config = AudioEncoderConfig::default();
        let vb_enc = vb;

        let conv_cfg = Conv2dConfig {
            padding: 1,
            stride: 2,
            dilation: 1,
            groups: 1,
        };
        let conv2d1 = conv2d_no_bias(1, config.downsample_hidden_size, 3, conv_cfg, vb_enc.pp("conv2d1"))?;
        let conv2d2 = conv2d_no_bias(config.downsample_hidden_size, config.downsample_hidden_size, 3, conv_cfg, vb_enc.pp("conv2d2"))?;
        let conv2d3 = conv2d_no_bias(config.downsample_hidden_size, config.downsample_hidden_size, 3, conv_cfg, vb_enc.pp("conv2d3"))?;

        let conv_out_in = config.conv_out_input_dim();
        let conv_out = linear_no_bias(conv_out_in, config.d_model, vb_enc.pp("conv_out"))?;

        let positional_embedding = SinusoidsPositionEmbedding::new(
            config.max_source_positions,
            config.d_model,
            DType::F32,
            device,
        )?;

        let mut layers = Vec::with_capacity(config.encoder_layers);
        for i in 0..config.encoder_layers {
            let layer = AudioEncoderLayer::load(vb_enc.pp("layers").pp(i), &config)?;
            layers.push(layer);
        }

        let ln_post = candle_nn::layer_norm(config.d_model, 1e-5, vb_enc.pp("ln_post"))?;
        let proj1 = linear(config.d_model, config.d_model, vb_enc.pp("proj1"))?;
        let proj2 = linear(config.d_model, config.output_dim, vb_enc.pp("proj2"))?;

        let embed_scale = if config.scale_embedding {
            (config.d_model as f64).sqrt()
        } else {
            1.0
        };

        Ok(Self {
            conv2d1,
            conv2d2,
            conv2d3,
            conv_out,
            positional_embedding,
            layers,
            ln_post,
            proj1,
            proj2,
            config,
            device: device.clone(),
            embed_scale,
        })
    }

    /// Forward: input mel [batch, num_mel_bins, time], output [batch, seq, output_dim].
    pub fn forward(&self, input_features: &Tensor, attention_mask: Option<&Tensor>) -> CandleResult<Tensor> {
        let x = input_features.unsqueeze(1)?;
        let x = self.conv2d1.forward(&x)?;
        let x = self.conv2d2.forward(&x)?;
        let x = self.conv2d3.forward(&x)?;
        let (_batch, _ch, _h, _time_seq) = x.dims4()?;
        let x = x.permute((0, 3, 1, 2))?;
        let x = x.flatten_from(2)?;
        let x = self.conv_out.forward(&x)?;
        let seq_len = x.dim(1)?;
        let x = (x * self.embed_scale)?;
        let pos = self.positional_embedding.apply(seq_len)?;
        let x = x.broadcast_add(&pos)?;

        let mut x = x;
        for layer in &self.layers {
            x = layer.forward(&x, attention_mask)?;
        }
        let x = self.ln_post.forward(&x)?;
        let x = self.proj1.forward(&x)?;
        let x = gelu(&x)?;
        let x = self.proj2.forward(&x)?;
        Ok(x)
    }

    pub fn config(&self) -> &AudioEncoderConfig {
        &self.config
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_encoder_config_default() {
        let cfg = AudioEncoderConfig::default();
        assert_eq!(cfg.d_model, 1280);
        assert_eq!(cfg.encoder_layers, 32);
        assert_eq!(cfg.conv_out_input_dim(), 480 * 3); // conv_output_mel_dim() = 3 with default num_mel_bins
    }
}
