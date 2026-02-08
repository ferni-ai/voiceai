//! Qwen3-Omni Audio Encoder (AuT): Conv2d stem + sinusoidal pos embed + 32 transformer layers.
//!
//! Port of `apps/mlx-qwen3-omni/src/mlx_qwen3_omni/encoders/audio.py`.
//! Reference: `apps/rust-perf/src/candle_audio_encoder.rs`.
//!
//! Input: mel (batch, num_mel_bins, time) e.g. (1, 128, T).
//! Output: (batch, seq, output_dim) = (batch, seq, 2048).

use mlx_rs::{
    builder::Builder,
    error::Exception,
    macros::ModuleParameters,
    module::{Module, Param},
    nn, ops,
    Array,
};

use crate::config::AudioEncoderConfig;

// ─── Sinusoidal Position Embedding ────────────────────────

/// Sinusoidal positional embedding (max_length, channels).
#[derive(Debug, Clone, ModuleParameters)]
#[module(root = mlx_rs)]
pub struct SinusoidalPositionEmbedding {
    #[param]
    pub embedding: Param<Array>,
}

impl SinusoidalPositionEmbedding {
    pub fn new(max_length: usize, channels: usize) -> Result<Self, Exception> {
        let half = channels / 2;
        let log_inc = (10000.0_f64).ln() / (half.max(1) - 1) as f64;

        let mut data = vec![0.0_f32; max_length * channels];
        for t in 0..max_length {
            for i in 0..half {
                let angle = t as f64 * (log_inc * i as f64).exp();
                data[t * channels + i] = angle.sin() as f32;
                data[t * channels + half + i] = angle.cos() as f32;
            }
        }

        Ok(Self {
            embedding: Param::new(Array::from_slice(
                &data,
                &[max_length as i32, channels as i32],
            )),
        })
    }

    pub fn forward(&self, seq_len: usize) -> Result<Array, Exception> {
        let indices = ops::arange::<i32, i32>(0, seq_len as i32, 1)?;
        self.embedding.take_axis(&indices, 0)
    }
}

// ─── Audio Encoder Layer ──────────────────────────────────

/// Single encoder layer: pre-LayerNorm, MHA (with bias), pre-LayerNorm, FFN GELU.
#[derive(Debug, Clone, ModuleParameters)]
#[module(root = mlx_rs)]
pub struct AudioEncoderLayer {
    #[param]
    pub self_attn_layer_norm: nn::LayerNorm,
    #[param]
    pub q_proj: nn::Linear,
    #[param]
    pub k_proj: nn::Linear,
    #[param]
    pub v_proj: nn::Linear,
    #[param]
    pub out_proj: nn::Linear,
    #[param]
    pub final_layer_norm: nn::LayerNorm,
    #[param]
    pub fc1: nn::Linear,
    #[param]
    pub fc2: nn::Linear,

    pub num_heads: usize,
    pub head_dim: usize,
    pub scale: f32,
}

impl AudioEncoderLayer {
    pub fn new(config: &AudioEncoderConfig) -> Result<Self, Exception> {
        let embed_dim = config.d_model;
        let num_heads = config.encoder_attention_heads;
        let head_dim = embed_dim / num_heads;

        Ok(Self {
            self_attn_layer_norm: nn::LayerNormBuilder::new(embed_dim as i32)
                .eps(1e-5)
                .build()?,
            q_proj: nn::LinearBuilder::new(embed_dim as i32, embed_dim as i32)
                .bias(true)
                .build()?,
            k_proj: nn::LinearBuilder::new(embed_dim as i32, embed_dim as i32)
                .bias(true)
                .build()?,
            v_proj: nn::LinearBuilder::new(embed_dim as i32, embed_dim as i32)
                .bias(true)
                .build()?,
            out_proj: nn::LinearBuilder::new(embed_dim as i32, embed_dim as i32)
                .bias(true)
                .build()?,
            final_layer_norm: nn::LayerNormBuilder::new(embed_dim as i32)
                .eps(1e-5)
                .build()?,
            fc1: nn::LinearBuilder::new(embed_dim as i32, config.encoder_ffn_dim as i32)
                .bias(true)
                .build()?,
            fc2: nn::LinearBuilder::new(config.encoder_ffn_dim as i32, embed_dim as i32)
                .bias(true)
                .build()?,
            num_heads,
            head_dim,
            scale: (head_dim as f32).powf(-0.5),
        })
    }

    pub fn forward(&mut self, x: &Array) -> Result<Array, Exception> {
        let shape = x.shape();
        let (b, l) = (shape[0], shape[1]);
        let hd = self.head_dim as i32;
        let nh = self.num_heads as i32;

        let residual = x.clone();
        let x = self.self_attn_layer_norm.forward(x)?;

        let q = self.q_proj.forward(&x)?.reshape(&[b, l, nh, hd])?.transpose_axes(&[0, 2, 1, 3])?;
        let k = self.k_proj.forward(&x)?.reshape(&[b, l, nh, hd])?.transpose_axes(&[0, 2, 1, 3])?;
        let v = self.v_proj.forward(&x)?.reshape(&[b, l, nh, hd])?.transpose_axes(&[0, 2, 1, 3])?;

        let scale_arr = Array::from(self.scale);
        let k_t = k.transpose_axes(&[0, 1, 3, 2])?;
        let attn = q.matmul(&k_t)?.multiply(&scale_arr)?;
        let attn = ops::softmax_axis(&attn, -1, None)?;
        let out = attn.matmul(&v)?;
        let out = out.transpose_axes(&[0, 2, 1, 3])?.reshape(&[b, l, -1])?;
        let out = self.out_proj.forward(&out)?;
        let x = residual.add(&out)?;

        let residual = x.clone();
        let x = self.final_layer_norm.forward(&x)?;
        let x = nn::gelu(&self.fc1.forward(&x)?)?;
        let x = self.fc2.forward(&x)?;
        residual.add(&x)
    }
}

// ─── Qwen3OmniAudioEncoder ───────────────────────────────

/// Full audio encoder: Conv2d stem → sinusoidal pos → 32 layers → LN → proj.
#[derive(Debug, Clone, ModuleParameters)]
#[module(root = mlx_rs)]
pub struct Qwen3OmniAudioEncoder {
    #[param]
    pub conv2d1: nn::Conv2d,
    #[param]
    pub conv2d2: nn::Conv2d,
    #[param]
    pub conv2d3: nn::Conv2d,
    #[param]
    pub conv_out: nn::Linear,
    #[param]
    pub positional_embedding: SinusoidalPositionEmbedding,
    #[param]
    pub layers: Vec<AudioEncoderLayer>,
    #[param]
    pub ln_post: nn::LayerNorm,
    #[param]
    pub proj1: nn::Linear,
    #[param]
    pub proj2: nn::Linear,

    pub embed_scale: f32,
}

impl Qwen3OmniAudioEncoder {
    pub fn new(config: &AudioEncoderConfig) -> Result<Self, Exception> {
        let layers = (0..config.encoder_layers)
            .map(|_| AudioEncoderLayer::new(config))
            .collect::<Result<Vec<_>, _>>()?;

        let embed_scale = if config.scale_embedding {
            (config.d_model as f32).sqrt()
        } else {
            1.0
        };

        Ok(Self {
            conv2d1: nn::Conv2dBuilder::new(1, config.downsample_hidden_size as i32, (3, 3))
                .stride((2, 2))
                .padding((1, 1))
                .bias(false)
                .build()?,
            conv2d2: nn::Conv2dBuilder::new(
                config.downsample_hidden_size as i32,
                config.downsample_hidden_size as i32,
                (3, 3),
            )
            .stride((2, 2))
            .padding((1, 1))
            .bias(false)
            .build()?,
            conv2d3: nn::Conv2dBuilder::new(
                config.downsample_hidden_size as i32,
                config.downsample_hidden_size as i32,
                (3, 3),
            )
            .stride((2, 2))
            .padding((1, 1))
            .bias(false)
            .build()?,
            conv_out: nn::LinearBuilder::new(
                config.conv_out_input_dim() as i32,
                config.d_model as i32,
            )
            .bias(false)
            .build()?,
            positional_embedding: SinusoidalPositionEmbedding::new(
                config.max_source_positions,
                config.d_model,
            )?,
            layers,
            ln_post: nn::LayerNormBuilder::new(config.d_model as i32)
                .eps(1e-5)
                .build()?,
            proj1: nn::LinearBuilder::new(config.d_model as i32, config.d_model as i32)
                .bias(true)
                .build()?,
            proj2: nn::LinearBuilder::new(config.d_model as i32, config.output_dim as i32)
                .bias(true)
                .build()?,
            embed_scale,
        })
    }

    /// Forward: input_features (batch, num_mel_bins, time) → (batch, seq, output_dim).
    pub fn forward(&mut self, input_features: &Array) -> Result<Array, Exception> {
        let x = if input_features.ndim() == 3 {
            input_features.expand_dims(-1)?
        } else {
            input_features.clone()
        };

        let x = self.conv2d1.forward(&x)?;
        let x = self.conv2d2.forward(&x)?;
        let x = self.conv2d3.forward(&x)?;

        let shape = x.shape();
        let (b, h, w, c) = (shape[0], shape[1], shape[2], shape[3]);
        let x = x.transpose_axes(&[0, 2, 1, 3])?;
        let x = x.reshape(&[b, w, h * c])?;

        let x = self.conv_out.forward(&x)?;
        let seq_len = x.shape()[1] as usize;

        let scale_arr = Array::from(self.embed_scale);
        let x = x.multiply(&scale_arr)?;
        let pos = self.positional_embedding.forward(seq_len)?;
        let mut x = x.add(&pos)?;

        for layer in self.layers.iter_mut() {
            x = layer.forward(&x)?;
        }

        x = self.ln_post.forward(&x)?;
        x = nn::gelu(&self.proj1.forward(&x)?)?;
        x = self.proj2.forward(&x)?;

        Ok(x)
    }
}
