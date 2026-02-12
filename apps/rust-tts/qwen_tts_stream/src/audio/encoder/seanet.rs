//! Encoder for the 12Hz tokenizer.
//!
//! Native Qwen3-TTS encoder implementation for converting audio waveforms to discrete codes.
//!
//! # Architecture
//! ```text
//! Audio (24kHz) → SeaNet Encoder → Transformer → Downsample → Split RVQ → Codes (12.5Hz)
//! ```
//!
//! # Weight Structure
//!
//! Qwen3-TTS encoder weights use the following prefix structure:
//! - `encoder.encoder.*` - SeaNet encoder (Conv layers and ResNet blocks)
//! - `encoder.encoder_transformer.*` - Transformer layers
//! - `encoder.downsample.*` - Downsampling convolution
//! - `encoder.quantizer.*` - Split RVQ (semantic + acoustic)

use candle_core::{DType, Module, Result, Tensor};
use candle_nn::{Conv1d, Conv1dConfig, VarBuilder, conv1d};

use crate::audio::encoder::transformer::TransformerLayer;
use crate::nn::rope::simple::SimpleRotaryEmbedding;

/// SeaNet residual block.
///
/// Structure: x -> ELU -> conv1 -> ELU -> conv2 -> + x
#[derive(Debug, Clone)]
struct SeaNetResBlock {
    conv1: Conv1d,
    conv2: Conv1d,
}

impl SeaNetResBlock {
    fn new(channels: usize, compress: usize, dilation: usize, vb: VarBuilder) -> Result<Self> {
        let hidden = channels / compress;

        // First conv: channels -> hidden, kernel=3, dilation
        let conv1 = conv1d(
            channels,
            hidden,
            3,
            Conv1dConfig {
                padding: 0,
                dilation,
                ..Default::default()
            },
            vb.pp("block.1.conv"),
        )?;

        // Second conv: hidden -> channels, kernel=1
        let conv2 = conv1d(
            hidden,
            channels,
            1,
            Conv1dConfig::default(),
            vb.pp("block.3.conv"),
        )?;

        Ok(Self { conv1, conv2 })
    }

    fn forward(&self, xs: &Tensor, dilation: usize) -> Result<Tensor> {
        // ELU activation
        let activated = xs.elu(1.0)?;

        // Causal padding for dilated conv
        let effective_kernel = (3 - 1) * dilation + 1;
        let padding = effective_kernel - 1;
        let padded = activated.pad_with_zeros(2, padding, 0)?;

        let h = self.conv1.forward(&padded)?;
        let h = h.elu(1.0)?;
        let h = self.conv2.forward(&h)?;

        // Skip connection
        xs + h
    }
}

/// SeaNet encoder - extracts features from audio.
///
/// Architecture: init_conv -> [resblock -> downsample] * 4 -> final_conv
#[derive(Debug, Clone)]
pub struct SeaNetEncoder {
    init_conv: Conv1d,
    // Each stage: (resblock, downsample_conv)
    stages: Vec<(SeaNetResBlock, Conv1d)>,
    final_conv: Conv1d,
    ratios: Vec<usize>,
}

impl SeaNetEncoder {
    pub fn new(vb: VarBuilder) -> Result<Self> {
        // Qwen3-TTS uses ratios [4, 5, 6, 8] (reversed from decoder [8, 6, 5, 4])
        let ratios = vec![4, 5, 6, 8];
        let n_filters = 64;
        let compress = 2;

        let vb = vb.pp("layers");

        // Layer 0: Initial conv (1 -> 64, kernel=7)
        let init_conv = conv1d(1, n_filters, 7, Conv1dConfig::default(), vb.pp("0.conv"))?;

        let mut stages = Vec::new();
        let mut mult = 1usize;
        let mut layer_idx = 1;

        for &ratio in ratios.iter() {
            // ResNet block
            let resblock = SeaNetResBlock::new(
                mult * n_filters,
                compress,
                1, // dilation base = 2^0 = 1
                vb.pp(layer_idx),
            )?;
            layer_idx += 1;

            // Skip ELU layer (index layer_idx is just activation, no weights)
            // Downsample conv
            let downsample = conv1d(
                mult * n_filters,
                mult * n_filters * 2,
                ratio * 2,
                Conv1dConfig {
                    stride: ratio,
                    ..Default::default()
                },
                vb.pp(format!("{}.conv", layer_idx + 1)),
            )?;
            layer_idx += 2;

            stages.push((resblock, downsample));
            mult *= 2;
        }

        // Final conv: 1024 -> 512, kernel=3
        let final_conv = conv1d(
            mult * n_filters, // 1024
            512,
            3,
            Conv1dConfig::default(),
            vb.pp(format!("{}.conv", layer_idx + 1)),
        )?;

        Ok(Self {
            init_conv,
            stages,
            final_conv,
            ratios,
        })
    }

    pub fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        // Initial conv with causal padding
        let padded = xs.pad_with_zeros(2, 6, 0)?; // kernel=7, pad=6
        let mut h = self.init_conv.forward(&padded)?;

        for (i, (resblock, downsample)) in self.stages.iter().enumerate() {
            // ResNet block
            h = resblock.forward(&h, 1)?;

            // ELU + Downsample
            h = h.elu(1.0)?;

            let ratio = self.ratios[i];
            let kernel_size = ratio * 2;
            let padding = kernel_size - ratio; // causal padding
            let padded = h.pad_with_zeros(2, padding, 0)?;
            h = downsample.forward(&padded)?;
        }

        // Final ELU + conv
        h = h.elu(1.0)?;
        let padded = h.pad_with_zeros(2, 2, 0)?; // kernel=3, pad=2
        self.final_conv.forward(&padded)
    }
}

/// Transformer encoder.
#[derive(Debug, Clone)]
pub struct EncoderTransformer {
    layers: Vec<TransformerLayer>,
    rope: SimpleRotaryEmbedding,
}

impl EncoderTransformer {
    pub fn new(
        dim: usize,
        num_heads: usize,
        mlp_dim: usize,
        num_layers: usize,
        device: &candle_core::Device,
        dtype: DType,
        vb: VarBuilder,
    ) -> Result<Self> {
        let layers = (0..num_layers)
            .map(|i| TransformerLayer::new(dim, num_heads, mlp_dim, vb.pp(format!("layers.{}", i))))
            .collect::<Result<Vec<_>>>()?;

        let head_dim = dim / num_heads;
        // Use standard rope_theta=10000.0 for the encoder transformer
        let rope = SimpleRotaryEmbedding::new(head_dim, 8192, 10000.0, device, dtype)?;

        Ok(Self { layers, rope })
    }

    pub fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        let mut h = xs.clone();
        for layer in &self.layers {
            h = layer.forward(&h, &self.rope)?;
        }
        Ok(h)
    }
}

/// Downsampling convolution.
///
/// Note: The Qwen3-TTS encoder downsample layer does not use bias,
/// so we manually construct the Conv1d with weight only.
#[derive(Debug, Clone)]
pub struct Downsample {
    conv: Conv1d,
    stride: usize,
}

impl Downsample {
    pub fn new(dim: usize, stride: usize, vb: VarBuilder) -> Result<Self> {
        let kernel_size = stride * 2;

        // Load weight manually since the model doesn't have bias
        // Weight shape: (out_channels, in_channels, kernel_size)
        let weight = vb.get((dim, dim, kernel_size), "conv.weight")?;

        let config = Conv1dConfig {
            stride,
            ..Default::default()
        };

        let conv = Conv1d::new(weight, None, config);
        Ok(Self { conv, stride })
    }

    pub fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        // Causal padding
        let kernel_size = self.stride * 2;
        let padding = kernel_size - self.stride;
        let padded = xs.pad_with_zeros(2, padding, 0)?;
        self.conv.forward(&padded)
    }
}
