//! ConvNeXt blocks for the tokenizer decoder.

use candle_core::{Result, Tensor};
use candle_nn::{LayerNorm, Linear, Module, VarBuilder, layer_norm, linear};

use crate::audio::tokenizer::v2::causal_conv::CausalConv1d;

/// ConvNeXt block with causal convolutions.
///
/// Architecture:
/// - Depthwise causal conv (kernel=7)
/// - LayerNorm
/// - Pointwise expansion (4x)
/// - GELU activation
/// - Pointwise projection
/// - Learnable scale (gamma)
/// - Residual connection
#[derive(Debug, Clone)]
pub struct ConvNeXtBlock {
    dwconv: CausalConv1d,
    norm: LayerNorm,
    pwconv1: Linear,
    pwconv2: Linear,
    gamma: Tensor,
}

impl ConvNeXtBlock {
    pub fn new(dim: usize, vb: VarBuilder) -> Result<Self> {
        // Depthwise causal convolution
        let dwconv = CausalConv1d::new(
            dim,
            dim,
            7,   // kernel_size
            1,   // dilation
            1,   // stride
            dim, // groups (depthwise)
            vb.pp("dwconv"),
        )?;

        // LayerNorm
        let norm = layer_norm(dim, 1e-6, vb.pp("norm"))?;

        // Pointwise convolutions as linear layers
        let pwconv1 = linear(dim, 4 * dim, vb.pp("pwconv1"))?;
        let pwconv2 = linear(4 * dim, dim, vb.pp("pwconv2"))?;

        // Learnable scale parameter
        let gamma = vb.get_with_hints(dim, "gamma", candle_nn::Init::Const(1e-6))?;

        Ok(Self {
            dwconv,
            norm,
            pwconv1,
            pwconv2,
            gamma,
        })
    }

    pub fn load(dim: usize, vb: VarBuilder) -> Result<Self> {
        Self::new(dim, vb)
    }
}

impl Module for ConvNeXtBlock {
    /// Forward pass.
    ///
    /// Input shape: (batch, channels, time)
    /// Output shape: (batch, channels, time)
    fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        let residual = xs;

        // Depthwise conv
        let hidden = self.dwconv.forward(xs)?;

        // Transpose for LayerNorm: (batch, channels, time) -> (batch, time, channels)
        let hidden = hidden.transpose(1, 2)?;

        // LayerNorm + pointwise convs
        let hidden = self.norm.forward(&hidden)?;
        let hidden = self.pwconv1.forward(&hidden)?;
        let hidden = hidden.gelu()?;
        let hidden = self.pwconv2.forward(&hidden)?;

        // Apply gamma scale
        let hidden = hidden.broadcast_mul(&self.gamma)?;

        // Transpose back: (batch, time, channels) -> (batch, channels, time)
        let hidden = hidden.transpose(1, 2)?;

        // Residual connection
        residual + hidden
    }
}
