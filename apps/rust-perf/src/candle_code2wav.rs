//! Qwen3-Omni Code2Wav in Candle.
//!
//! Port of Qwen3OmniMoeCode2Wav: codebook embedding + 8-layer transformer decoder +
//! causal ConvNet upsampling (480x) to 24 kHz waveform.
//! Loads code2wav.* weights when present in full checkpoint; forward uses them when loaded.

use candle_core::{DType, Device, IndexOp, Result as CandleResult, Tensor};
use candle_nn::{
    conv1d, conv_transpose1d, embedding, linear_no_bias, Conv1d, Conv1dConfig, ConvTranspose1d,
    ConvTranspose1dConfig, Embedding, Linear, Module, VarBuilder,
};
use std::path::Path;

use crate::candle_moe::{silu_manual, softmax_manual, RmsNorm};

// ============================================================================
// CONFIG
// ============================================================================

/// Code2Wav config (from config.json code2wav_config).
#[derive(Debug, Clone)]
pub struct Code2WavConfig {
    pub hidden_size: usize,
    pub num_hidden_layers: usize,
    pub num_attention_heads: usize,
    pub num_key_value_heads: usize,
    pub intermediate_size: usize,
    pub rms_norm_eps: f64,
    pub codebook_size: usize,
    pub codebook_dim: usize,
    pub num_quantizers: usize,
    pub semantic_codebook_size: usize,
    pub num_semantic_quantizers: usize,
    pub sliding_window: usize,
    pub decoder_dim: usize,
    pub upsample_rates: Vec<usize>,
    pub sample_rate: u32,
}

impl Default for Code2WavConfig {
    fn default() -> Self {
        Self {
            hidden_size: 1024,
            num_hidden_layers: 8,
            num_attention_heads: 16,
            num_key_value_heads: 16,
            intermediate_size: 3072,
            rms_norm_eps: 1e-5,
            codebook_size: 2048,
            codebook_dim: 512,
            num_quantizers: 16,
            semantic_codebook_size: 4096,
            num_semantic_quantizers: 1,
            sliding_window: 72,
            decoder_dim: 1536,
            upsample_rates: vec![8, 5, 4, 3],
            sample_rate: 24_000,
        }
    }
}

impl Code2WavConfig {
    pub fn from_json_path(path: &Path) -> CandleResult<Self> {
        let s = std::fs::read_to_string(path)
            .map_err(|e| candle_core::Error::Msg(format!("Failed to read config: {}", e)))?;
        let v: serde_json::Value =
            serde_json::from_str(&s).map_err(|e| candle_core::Error::Msg(format!("Parse config: {}", e)))?;
        let cfg = v
            .get("code2wav_config")
            .or(Some(&v));
        let cfg = cfg.ok_or_else(|| candle_core::Error::Msg("Missing code2wav_config".into()))?;
        let upsample: Vec<usize> = cfg
            .get("upsample_rates")
            .and_then(|x| x.as_array())
            .map(|a| a.iter().filter_map(|x| x.as_u64().map(|u| u as usize)).collect())
            .unwrap_or_else(|| vec![8, 5, 4, 3]);
        Ok(Self {
            hidden_size: cfg.get("hidden_size").and_then(|x| x.as_u64()).unwrap_or(1024) as usize,
            num_hidden_layers: cfg.get("num_hidden_layers").and_then(|x| x.as_u64()).unwrap_or(8) as usize,
            num_attention_heads: cfg.get("num_attention_heads").and_then(|x| x.as_u64()).unwrap_or(16) as usize,
            num_key_value_heads: cfg.get("num_key_value_heads").and_then(|x| x.as_u64()).unwrap_or(16) as usize,
            intermediate_size: cfg.get("intermediate_size").and_then(|x| x.as_u64()).unwrap_or(3072) as usize,
            rms_norm_eps: cfg.get("rms_norm_eps").and_then(|x| x.as_f64()).unwrap_or(1e-5),
            codebook_size: cfg.get("codebook_size").and_then(|x| x.as_u64()).unwrap_or(2048) as usize,
            codebook_dim: cfg.get("codebook_dim").and_then(|x| x.as_u64()).unwrap_or(512) as usize,
            num_quantizers: cfg.get("num_quantizers").and_then(|x| x.as_u64()).unwrap_or(16) as usize,
            semantic_codebook_size: cfg.get("semantic_codebook_size").and_then(|x| x.as_u64()).unwrap_or(4096) as usize,
            num_semantic_quantizers: cfg.get("num_semantic_quantizers").and_then(|x| x.as_u64()).unwrap_or(1) as usize,
            sliding_window: cfg.get("sliding_window").and_then(|x| x.as_u64()).unwrap_or(72) as usize,
            decoder_dim: cfg.get("decoder_dim").and_then(|x| x.as_u64()).unwrap_or(1536) as usize,
            upsample_rates: upsample,
            sample_rate: cfg.get("sample_rate").and_then(|x| x.as_u64()).unwrap_or(24_000) as u32,
        })
    }

    /// Total upsampling factor (e.g. 8*5*4*3 = 480).
    pub fn total_upsample_factor(&self) -> usize {
        self.upsample_rates.iter().product()
    }
}

// ============================================================================
// Code2Wav 8-layer decoder: attention + SiLU MLP + RMSNorm per layer
// ============================================================================

/// Causal self-attention (no RoPE) for Code2Wav decoder.
struct Code2WavDecoderAttention {
    q_proj: Linear,
    k_proj: Linear,
    v_proj: Linear,
    o_proj: Linear,
    qk_norm: crate::candle_moe::QKNorm,
    num_heads: usize,
    num_kv_heads: usize,
    head_dim: usize,
}

impl Code2WavDecoderAttention {
    fn load(vb: VarBuilder, cfg: &Code2WavConfig) -> CandleResult<Self> {
        let hidden = cfg.hidden_size;
        let num_heads = cfg.num_attention_heads;
        let num_kv_heads = cfg.num_key_value_heads;
        let head_dim = hidden / num_heads;
        let q_proj = linear_no_bias(hidden, num_heads * head_dim, vb.pp("q_proj"))?;
        let k_proj = linear_no_bias(hidden, num_kv_heads * head_dim, vb.pp("k_proj"))?;
        let v_proj = linear_no_bias(hidden, num_kv_heads * head_dim, vb.pp("v_proj"))?;
        let o_proj = linear_no_bias(num_heads * head_dim, hidden, vb.pp("o_proj"))?;
        let qk_norm = crate::candle_moe::QKNorm::load(vb, head_dim, cfg.rms_norm_eps)?;
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

    fn forward(&self, hidden_states: &Tensor, attention_mask: Option<&Tensor>) -> CandleResult<Tensor> {
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
        let n_rep = self.num_heads / self.num_kv_heads;
        let k = crate::candle_moe::repeat_kv(k, n_rep)?;
        let v = crate::candle_moe::repeat_kv(v, n_rep)?;
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

/// SiLU-gated MLP for Code2Wav decoder.
struct Code2WavDecoderMLP {
    gate_proj: Linear,
    up_proj: Linear,
    down_proj: Linear,
}

impl Code2WavDecoderMLP {
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
        let gate = silu_manual(&self.gate_proj.forward(x)?)?;
        let up = self.up_proj.forward(x)?;
        self.down_proj.forward(&(gate * up)?)
    }
}

/// Single decoder layer: pre-norm attention + pre-norm MLP + residuals.
struct Code2WavDecoderLayer {
    self_attn: Code2WavDecoderAttention,
    mlp: Code2WavDecoderMLP,
    input_layernorm: RmsNorm,
    post_attention_layernorm: RmsNorm,
}

impl Code2WavDecoderLayer {
    fn load(vb: VarBuilder, cfg: &Code2WavConfig) -> CandleResult<Self> {
        let self_attn = Code2WavDecoderAttention::load(vb.pp("self_attn"), cfg)?;
        let mlp = Code2WavDecoderMLP::load(
            vb.pp("mlp"),
            cfg.hidden_size,
            cfg.intermediate_size,
        )?;
        let input_layernorm = RmsNorm::load(vb.pp("input_layernorm"), cfg.hidden_size, cfg.rms_norm_eps)?;
        let post_attention_layernorm =
            RmsNorm::load(vb.pp("post_attention_layernorm"), cfg.hidden_size, cfg.rms_norm_eps)?;
        Ok(Self {
            self_attn,
            mlp,
            input_layernorm,
            post_attention_layernorm,
        })
    }

    fn forward(&self, x: &Tensor, attention_mask: Option<&Tensor>) -> CandleResult<Tensor> {
        let residual = x;
        let x = self.input_layernorm.forward(x)?;
        let x = self.self_attn.forward(&x, attention_mask)?;
        let x = (residual + x)?;
        let residual = &x;
        let x = self.post_attention_layernorm.forward(&x)?;
        let x = self.mlp.forward(&x)?;
        Ok((residual + x)?)
    }
}

/// 8-layer transformer decoder: input_proj -> 8 layers -> final_proj (hidden_size -> decoder_dim).
struct Code2WavDecoder {
    input_proj: Linear,
    layers: Vec<Code2WavDecoderLayer>,
    final_norm: RmsNorm,
    final_proj: Linear,
}

impl Code2WavDecoder {
    fn load(vb: VarBuilder, cfg: &Code2WavConfig) -> CandleResult<Self> {
        let embed_out_dim = cfg.codebook_dim * cfg.num_quantizers;
        let input_proj = linear_no_bias(embed_out_dim, cfg.hidden_size, vb.pp("input_proj"))?;
        let mut layers = Vec::with_capacity(cfg.num_hidden_layers);
        let vb_layers = vb.pp("layers");
        for i in 0..cfg.num_hidden_layers {
            let layer = Code2WavDecoderLayer::load(vb_layers.pp(i), cfg)?;
            layers.push(layer);
        }
        let final_norm = RmsNorm::load(vb.pp("norm"), cfg.hidden_size, cfg.rms_norm_eps)?;
        let final_proj = linear_no_bias(cfg.hidden_size, cfg.decoder_dim, vb.pp("final_proj"))?;
        Ok(Self {
            input_proj,
            layers,
            final_norm,
            final_proj,
        })
    }

    fn forward(&self, hidden: &Tensor, attention_mask: Option<&Tensor>) -> CandleResult<Tensor> {
        let mut x = self.input_proj.forward(hidden)?;
        for layer in &self.layers {
            x = layer.forward(&x, attention_mask)?;
        }
        let x = self.final_norm.forward(&x)?;
        self.final_proj.forward(&x)
    }
}

fn causal_mask(seq_len: usize, device: &Device) -> CandleResult<Tensor> {
    let mut mask_data = vec![0.0f32; seq_len * seq_len];
    for i in 0..seq_len {
        for j in (i + 1)..seq_len {
            mask_data[i * seq_len + j] = f32::NEG_INFINITY;
        }
    }
    Tensor::from_vec(mask_data, (seq_len, seq_len), device)?
        .to_dtype(DType::F32)?
        .unsqueeze(0)?
        .unsqueeze(0)
}

// ============================================================================
// ConvNet Upsampler: progressive transposed convolution (decoder_dim -> waveform)
// ============================================================================

/// Single upsampling block: ConvTranspose1d (upsample by rate) followed by SiLU activation.
/// Each block halves the channel count while increasing temporal resolution.
struct UpsampleBlock {
    conv_transpose: ConvTranspose1d,
}

impl UpsampleBlock {
    fn load(
        vb: VarBuilder,
        in_channels: usize,
        out_channels: usize,
        rate: usize,
    ) -> CandleResult<Self> {
        let kernel_size = rate * 2;
        // Padding chosen so output_len = input_len * rate exactly:
        // (L-1)*rate - 2*padding + kernel_size + output_padding = L*rate
        // => padding = (rate + output_padding) / 2
        let output_padding = rate % 2;
        let padding = (rate + output_padding) / 2;
        let cfg = ConvTranspose1dConfig {
            padding,
            output_padding,
            stride: rate,
            dilation: 1,
            groups: 1,
        };
        let conv_transpose = conv_transpose1d(in_channels, out_channels, kernel_size, cfg, vb)?;
        Ok(Self { conv_transpose })
    }

    fn forward(&self, x: &Tensor) -> CandleResult<Tensor> {
        let x = self.conv_transpose.forward(x)?;
        silu_manual(&x)
    }
}

/// Causal ConvNet upsampler: projects decoder_dim → initial channels, then progressively
/// upsamples through transposed convolutions at rates [8, 5, 4, 3] (total 480x),
/// finally maps to 1 channel via output Conv1d + tanh.
///
/// Channel progression (default decoder_dim=1536):
///   decoder_dim → 512 → 256 → 128 → 64 → 1
struct ConvNetUpsampler {
    input_conv: Conv1d,
    upsample_blocks: Vec<UpsampleBlock>,
    output_conv: Conv1d,
}

impl ConvNetUpsampler {
    fn load(vb: VarBuilder, cfg: &Code2WavConfig) -> CandleResult<Self> {
        // Initial projection: decoder_dim -> initial_channels
        // Channel widths halve at each upsampling stage
        let num_stages = cfg.upsample_rates.len();
        let initial_channels = 512usize.max(1 << num_stages);

        let input_conv_cfg = Conv1dConfig {
            padding: 3, // kernel_size=7, causal-ish padding
            stride: 1,
            dilation: 1,
            groups: 1,
        };
        let input_conv = conv1d(
            cfg.decoder_dim,
            initial_channels,
            7,
            input_conv_cfg,
            vb.pp("input_conv"),
        )?;

        let mut upsample_blocks = Vec::with_capacity(num_stages);
        let mut channels = initial_channels;
        for (i, &rate) in cfg.upsample_rates.iter().enumerate() {
            let out_channels = channels / 2;
            let block = UpsampleBlock::load(
                vb.pp("upsample_blocks").pp(i),
                channels,
                out_channels,
                rate,
            )?;
            upsample_blocks.push(block);
            channels = out_channels;
        }

        // Final conv: remaining channels -> 1 (mono waveform)
        let output_conv_cfg = Conv1dConfig {
            padding: 3,
            stride: 1,
            dilation: 1,
            groups: 1,
        };
        let output_conv = conv1d(channels, 1, 7, output_conv_cfg, vb.pp("output_conv"))?;

        Ok(Self {
            input_conv,
            upsample_blocks,
            output_conv,
        })
    }

    /// Forward: (batch, seq, decoder_dim) -> (batch, samples).
    /// Transposes to channel-first for Conv1d, runs upsampling, transposes back.
    fn forward(&self, x: &Tensor) -> CandleResult<Tensor> {
        // x: (batch, seq, decoder_dim) -> (batch, decoder_dim, seq) for Conv1d
        let x = x.transpose(1, 2)?;
        let mut x = self.input_conv.forward(&x)?;
        for block in &self.upsample_blocks {
            x = block.forward(&x)?;
        }
        let x = self.output_conv.forward(&x)?;
        // tanh activation to normalize waveform to [-1, 1]
        let x = x.tanh()?;
        // (batch, 1, samples) -> (batch, samples)
        x.squeeze(1)
    }
}

// ============================================================================
// Code2Wav model (load from checkpoint when code2wav.* present; forward)
// ============================================================================

/// Qwen3-Omni Code2Wav: codec token indices -> waveform (24 kHz).
///
/// Full architecture:
///   1. Codebook embedding: lookup each quantizer's token, concat across quantizers
///   2. 8-layer transformer decoder with causal attention
///   3. ConvNet upsampler: transposed convolutions at rates [8,5,4,3] = 480x → 24kHz waveform
///
/// When code2wav.* weights are present: loads all components from checkpoint.
/// When loaded via VarBuilder::zeros: builds full architecture for shape validation.
/// Otherwise (no weights): returns zeros (stub behavior).
pub struct Qwen3OmniCode2Wav {
    config: Code2WavConfig,
    device: Device,
    /// Codebook embedding (one table shared across quantizers).
    codebook_embed: Option<Embedding>,
    /// 8-layer transformer decoder (embed -> input_proj -> 8 layers -> final_proj to decoder_dim).
    decoder: Option<Code2WavDecoder>,
    /// ConvNet upsampler: progressive transposed convolutions (decoder_dim -> waveform).
    upsampler: Option<ConvNetUpsampler>,
    /// Legacy linear output_proj fallback (decoder_dim -> total_upsample_factor).
    /// Used when checkpoint has output_proj weights but no ConvNet weights.
    output_proj: Option<Linear>,
}

impl Qwen3OmniCode2Wav {
    /// Load from VarBuilder (e.g. zeros for tests). Call with vb.pp("code2wav").
    /// Uses default config and builds codebook embed + output_proj so forward runs with real shapes.
    pub fn load_with_vb(vb: VarBuilder, device: &Device) -> CandleResult<Self> {
        Self::load_with_vb_with_config(vb, &Code2WavConfig::default(), device)
    }

    /// Load from VarBuilder with explicit config.
    /// Builds codebook embed + 8-layer decoder + ConvNet upsampler (full architecture).
    pub fn load_with_vb_with_config(
        vb: VarBuilder,
        config: &Code2WavConfig,
        device: &Device,
    ) -> CandleResult<Self> {
        let vb_c2w = vb;
        let codebook_embed = embedding(
            config.codebook_size,
            config.codebook_dim,
            vb_c2w.pp("model").pp("embed"),
        )?;
        let decoder = Code2WavDecoder::load(vb_c2w.pp("model").pp("decoder"), config)?;
        let upsampler = ConvNetUpsampler::load(vb_c2w.pp("model").pp("upsampler"), config)?;
        Ok(Self {
            config: config.clone(),
            device: device.clone(),
            codebook_embed: Some(codebook_embed),
            decoder: Some(decoder),
            upsampler: Some(upsampler),
            output_proj: None,
        })
    }

    /// Load from model directory. Loads code2wav.* weights when index has code2wav prefix.
    /// Tries ConvNet upsampler first; falls back to linear output_proj for older checkpoints.
    pub fn load(model_path: &str, device: &Device) -> CandleResult<Self> {
        let base = Path::new(model_path);
        let config_path = base.join("config.json");
        let config = if config_path.exists() {
            Code2WavConfig::from_json_path(&config_path)?
        } else {
            Code2WavConfig::default()
        };

        let index_path = base.join("model.safetensors.index.json");
        let (codebook_embed, decoder, upsampler, output_proj) = if index_path.exists() {
            let s = std::fs::read_to_string(&index_path)
                .map_err(|e| candle_core::Error::Msg(format!("Read index: {}", e)))?;
            let v: serde_json::Value = serde_json::from_str(&s)
                .map_err(|e| candle_core::Error::Msg(format!("Parse index: {}", e)))?;
            let weight_map = v["weight_map"]
                .as_object()
                .ok_or_else(|| candle_core::Error::Msg("Missing weight_map".into()))?;
            // Support HF key layout (model.code2wav.*) and direct (code2wav.*)
            let has_hf_code2wav = weight_map.keys().any(|k| k.starts_with("model.code2wav."));
            let has_code2wav = has_hf_code2wav || weight_map.keys().any(|k| k.starts_with("code2wav."));
            if !has_code2wav {
                (None, None, None, None)
            } else {
                let files: Vec<String> = weight_map
                    .values()
                    .filter_map(|v| v.as_str())
                    .map(|s| base.join(s).to_string_lossy().into_owned())
                    .collect::<Vec<_>>();
                let vb =
                    unsafe { VarBuilder::from_mmaped_safetensors(&files, DType::F32, device)? };
                let vb_c2w = if has_hf_code2wav {
                    vb.pp("model").pp("code2wav")
                } else {
                    vb.pp("code2wav")
                };
                let codebook_embed = embedding(
                    config.codebook_size,
                    config.codebook_dim,
                    vb_c2w.pp("model").pp("embed"),
                )
                .ok();
                let decoder =
                    Code2WavDecoder::load(vb_c2w.pp("model").pp("decoder"), &config).ok();
                // Try ConvNet upsampler first, fall back to linear output_proj
                let upsampler =
                    ConvNetUpsampler::load(vb_c2w.pp("model").pp("upsampler"), &config).ok();
                let output_proj = if upsampler.is_none() {
                    let upsample = config.total_upsample_factor();
                    if decoder.is_some() {
                        linear_no_bias(
                            config.decoder_dim,
                            upsample,
                            vb_c2w.pp("model").pp("output_proj"),
                        )
                        .ok()
                    } else {
                        linear_no_bias(
                            config.decoder_dim,
                            upsample,
                            vb_c2w.pp("model").pp("output_proj"),
                        )
                        .or_else(|_| {
                            linear_no_bias(
                                config.codebook_dim * config.num_quantizers,
                                upsample,
                                vb_c2w.pp("model").pp("output_proj"),
                            )
                        })
                        .ok()
                    }
                } else {
                    None
                };
                (codebook_embed, decoder, upsampler, output_proj)
            }
        } else {
            (None, None, None, None)
        };

        Ok(Self {
            config,
            device: device.clone(),
            codebook_embed,
            decoder,
            upsampler,
            output_proj,
        })
    }

    /// Forward: codec_token_ids (batch, seq, num_quantizers) -> waveform (batch, samples).
    ///
    /// Pipeline: embed → 8-layer transformer decoder → ConvNet upsampler (480x) → tanh.
    /// Falls back to linear output_proj if ConvNet not loaded, or zeros if no weights at all.
    pub fn forward(&self, codec_token_ids: &Tensor) -> CandleResult<Tensor> {
        let (batch, seq, num_q) = codec_token_ids.dims3()?;
        let samples = seq * self.config.total_upsample_factor();

        if let Some(ref embed) = self.codebook_embed {
            let mut embedded_list: Vec<Tensor> = Vec::with_capacity(num_q);
            for q in 0..num_q {
                let ids = codec_token_ids.i((.., .., q))?;
                let e = embed.forward(&ids)?;
                embedded_list.push(e);
            }
            let stacked = Tensor::stack(&embedded_list, 2)?;
            let (b, s, _q, dim) = stacked.dims4()?;
            let hidden = stacked.reshape((b, s, num_q * dim))?;

            // Transformer decoder (8 layers with causal mask)
            let hidden = if let Some(ref dec) = self.decoder {
                let mask = if s > 1 {
                    Some(causal_mask(s, &self.device)?)
                } else {
                    None
                };
                dec.forward(&hidden, mask.as_ref())?
            } else {
                hidden
            };

            // ConvNet upsampler (preferred) or linear fallback
            if let Some(ref up) = self.upsampler {
                up.forward(&hidden)
            } else if let Some(ref proj) = self.output_proj {
                let out = proj.forward(&hidden)?;
                let (_, _, up) = out.dims3()?;
                out.reshape((b, s * up))
            } else {
                Tensor::zeros(&[b, samples], DType::F32, &self.device)
            }
        } else {
            Tensor::zeros(&[batch, samples], DType::F32, &self.device)
        }
    }

    pub fn config(&self) -> &Code2WavConfig {
        &self.config
    }

    pub fn sample_rate(&self) -> u32 {
        self.config.sample_rate
    }

    /// True if codebook (and optionally output) weights were loaded.
    pub fn has_weights(&self) -> bool {
        self.codebook_embed.is_some()
    }

    /// True if the ConvNet upsampler is loaded (preferred path).
    pub fn has_convnet_upsampler(&self) -> bool {
        self.upsampler.is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_code2wav_config_default() {
        let cfg = Code2WavConfig::default();
        assert_eq!(cfg.hidden_size, 1024);
        assert_eq!(cfg.num_quantizers, 16);
        assert_eq!(cfg.total_upsample_factor(), 480);
        assert_eq!(cfg.sample_rate, 24_000);
    }

    #[test]
    fn test_code2wav_forward_shape() {
        let device = Device::Cpu;
        let temp = std::env::temp_dir().join("ferni_c2w_test");
        std::fs::create_dir_all(&temp).ok();
        let path_str = temp.to_string_lossy();
        let c2w = Qwen3OmniCode2Wav::load(&path_str, &device).unwrap();
        let batch = 1u32;
        let seq = 10u32;
        let num_q = c2w.config().num_quantizers as u32;
        let ids = Tensor::zeros(&[batch as usize, seq as usize, num_q as usize], DType::I64, &device).unwrap();
        let out = c2w.forward(&ids).unwrap();
        let (b, samples) = out.dims2().unwrap();
        assert_eq!(b, 1);
        assert_eq!(samples, seq as usize * c2w.config().total_upsample_factor());
    }

    #[test]
    fn test_code2wav_load_with_vb_forward_shape() {
        let device = Device::Cpu;
        let vb = candle_nn::VarBuilder::zeros(candle_core::DType::F32, &device);
        let c2w = Qwen3OmniCode2Wav::load_with_vb(vb.pp("code2wav"), &device).unwrap();
        assert!(c2w.has_weights());
        assert!(c2w.has_convnet_upsampler());
        let batch = 1usize;
        let seq = 5usize;
        let num_q = c2w.config().num_quantizers;
        let ids = Tensor::zeros(&[batch, seq, num_q], DType::I64, &device).unwrap();
        let out = c2w.forward(&ids).unwrap();
        let (b, samples) = out.dims2().unwrap();
        assert_eq!(b, 1);
        assert_eq!(samples, seq * c2w.config().total_upsample_factor());
    }

    #[test]
    fn test_convnet_upsampler_shape() {
        let device = Device::Cpu;
        let vb = candle_nn::VarBuilder::zeros(candle_core::DType::F32, &device);
        let cfg = Code2WavConfig::default();
        let upsampler =
            ConvNetUpsampler::load(vb.pp("upsampler"), &cfg).unwrap();
        // Input: (batch=1, seq=4, decoder_dim=1536)
        let x = Tensor::zeros(&[1, 4, cfg.decoder_dim], DType::F32, &device).unwrap();
        let out = upsampler.forward(&x).unwrap();
        let (b, samples) = out.dims2().unwrap();
        assert_eq!(b, 1);
        // 4 frames * 480x upsample = 1920 samples
        assert_eq!(samples, 4 * cfg.total_upsample_factor());
    }

    #[test]
    fn test_convnet_upsampler_two_frames() {
        // Minimum practical input is 2 frames (single frame triggers usize underflow
        // in Candle's ConvTranspose1d formula for large strides).
        let device = Device::Cpu;
        let vb = candle_nn::VarBuilder::zeros(candle_core::DType::F32, &device);
        let cfg = Code2WavConfig::default();
        let upsampler =
            ConvNetUpsampler::load(vb.pp("upsampler"), &cfg).unwrap();
        let x = Tensor::zeros(&[1, 2, cfg.decoder_dim], DType::F32, &device).unwrap();
        let out = upsampler.forward(&x).unwrap();
        let (b, samples) = out.dims2().unwrap();
        assert_eq!(b, 1);
        assert_eq!(samples, 2 * cfg.total_upsample_factor());
    }

    #[test]
    fn test_code2wav_full_pipeline_with_convnet() {
        // Full forward: codec tokens → embed → decoder → ConvNet → waveform
        let device = Device::Cpu;
        let vb = candle_nn::VarBuilder::zeros(candle_core::DType::F32, &device);
        let c2w = Qwen3OmniCode2Wav::load_with_vb(vb.pp("code2wav"), &device).unwrap();
        assert!(c2w.has_convnet_upsampler());
        let seq = 3usize;
        let num_q = c2w.config().num_quantizers;
        let ids = Tensor::zeros(&[1, seq, num_q], DType::I64, &device).unwrap();
        let out = c2w.forward(&ids).unwrap();
        let (b, samples) = out.dims2().unwrap();
        assert_eq!(b, 1);
        assert_eq!(samples, seq * 480); // 3 * 480 = 1440
    }
}
