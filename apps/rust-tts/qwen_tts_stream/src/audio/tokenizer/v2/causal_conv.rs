//! Causal convolution layers.
//!
//! These ensure that the output at time t only depends on inputs at times <= t.

use candle_core::{Result, Tensor};
use candle_nn::{
    Conv1d, Conv1dConfig, ConvTranspose1d, ConvTranspose1dConfig, Module, VarBuilder,
    conv_transpose1d, conv1d,
};

/// Causal 1D convolution.
///
/// Pads the input on the left so the output only depends on past inputs.
#[derive(Debug, Clone)]
pub struct CausalConv1d {
    conv: Conv1d,
    padding: usize,
    kernel_size: usize,
    stride: usize,
}

impl CausalConv1d {
    pub fn new(
        in_channels: usize,
        out_channels: usize,
        kernel_size: usize,
        dilation: usize,
        stride: usize,
        groups: usize,
        vb: VarBuilder,
    ) -> Result<Self> {
        // For causal conv, we pad on the left only
        let effective_kernel = (kernel_size - 1) * dilation + 1;
        let padding = effective_kernel - stride;

        let config = Conv1dConfig {
            padding: 0, // We'll handle padding manually
            dilation,
            stride,
            groups,
            ..Default::default()
        };

        let conv = conv1d(
            in_channels,
            out_channels,
            kernel_size,
            config,
            vb.pp("conv"),
        )?;

        Ok(Self {
            conv,
            padding,
            kernel_size: effective_kernel,
            stride,
        })
    }

    pub fn load(
        in_channels: usize,
        out_channels: usize,
        kernel_size: usize,
        dilation: usize,
        stride: usize,
        groups: usize,
        vb: VarBuilder,
    ) -> Result<Self> {
        Self::new(
            in_channels,
            out_channels,
            kernel_size,
            dilation,
            stride,
            groups,
            vb,
        )
    }

    fn get_extra_padding(&self, length: usize) -> usize {
        // Calculate extra padding needed to ensure output is properly aligned
        let n_frames = (length as f64 - self.kernel_size as f64 + self.padding as f64)
            / self.stride as f64
            + 1.0;
        let ideal_length = ((n_frames.ceil() - 1.0) * self.stride as f64 + self.kernel_size as f64
            - self.padding as f64) as usize;
        ideal_length.saturating_sub(length)
    }
}

impl Module for CausalConv1d {
    fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        let length = xs.dim(2)?;
        let extra_padding = self.get_extra_padding(length);

        // Pad on the left (causal) and right (for alignment)
        let padded = xs.pad_with_zeros(2, self.padding, extra_padding)?;

        self.conv.forward(&padded)
    }
}

/// Causal 1D transposed convolution (deconvolution).
///
/// Used for upsampling while maintaining causality.
#[derive(Debug, Clone)]
pub struct CausalConvTranspose1d {
    conv: ConvTranspose1d,
    left_pad: usize,
    right_pad: usize,
}

impl CausalConvTranspose1d {
    pub fn new(
        in_channels: usize,
        out_channels: usize,
        kernel_size: usize,
        stride: usize,
        vb: VarBuilder,
    ) -> Result<Self> {
        let config = ConvTranspose1dConfig {
            padding: 0,
            stride,
            dilation: 1,
            output_padding: 0,
            groups: 1,
        };

        let conv = conv_transpose1d(
            in_channels,
            out_channels,
            kernel_size,
            config,
            vb.pp("conv"),
        )?;

        // Calculate trimming to maintain causality
        // Python: left_pad = right_pad = ceil(kernel_size - stride)
        // Since kernel_size and stride are integers, ceil() just returns the value
        let pad = kernel_size.saturating_sub(stride);
        let left_pad = pad;
        let right_pad = pad;

        Ok(Self {
            conv,
            left_pad,
            right_pad,
        })
    }

    pub fn load(
        in_channels: usize,
        out_channels: usize,
        kernel_size: usize,
        stride: usize,
        vb: VarBuilder,
    ) -> Result<Self> {
        Self::new(in_channels, out_channels, kernel_size, stride, vb)
    }
}

impl Module for CausalConvTranspose1d {
    fn forward(&self, xs: &Tensor) -> Result<Tensor> {
        let output = self.conv.forward(xs)?;

        // Trim the output to remove non-causal parts
        let length = output.dim(2)?;
        let end = length.saturating_sub(self.right_pad);

        if self.left_pad > 0 || self.right_pad > 0 {
            output.narrow(2, self.left_pad, end - self.left_pad)
        } else {
            Ok(output)
        }
    }
}
