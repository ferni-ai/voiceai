//! Standard RoPE implementation for the code predictor.

use candle_core::{DType, Device, Result, Tensor};

use crate::{config::rope_config::RopeScaling, nn::rope_scaling::RopeScalingType};

use crate::nn::rope::core::RopeCore;

/// Standard RoPE for the code predictor.
///
/// Uses simple 1D position encoding without multimodal extensions.
/// Supports multiple scaling variants for extended context windows:
/// - Default: Standard RoPE without scaling
/// - Linear: Simple interpolation
/// - Dynamic: NTK-aware adaptive scaling
/// - YaRN: Frequency-partitioned scaling
/// - LongRoPE: Dimension-wise scaling factors
/// - Llama3: Smooth frequency-based scaling
#[derive(Debug, Clone)]
pub struct RotaryEmbedding {
    core: RopeCore,
}

impl RotaryEmbedding {
    /// Create a new RoPE embedding with default (no) scaling.
    pub fn new(
        head_dim: usize,
        max_position_embeddings: usize,
        rope_theta: f64,
        device: &Device,
    ) -> Result<Self> {
        let core = RopeCore::new(head_dim, max_position_embeddings, rope_theta, device)?;
        Ok(Self { core })
    }

    /// Create a RoPE embedding with scaling configuration.
    pub fn with_scaling(
        head_dim: usize,
        max_position_embeddings: usize,
        rope_theta: f64,
        scaling: &RopeScaling,
        device: &Device,
    ) -> Result<Self> {
        let core = RopeCore::with_scaling(
            head_dim,
            max_position_embeddings,
            rope_theta,
            scaling,
            device,
        )?;
        Ok(Self { core })
    }

    /// Get the attention scaling factor.
    pub fn attention_scaling(&self) -> f64 {
        self.core.attention_scaling
    }

    /// Get the scaling type.
    pub fn scaling_type(&self) -> RopeScalingType {
        self.core.scaling_type
    }

    /// Compute cos and sin for given position IDs.
    ///
    /// Args:
    ///   x: Input tensor (used for dtype/device)
    ///   position_ids: Position indices of shape (batch, seq_len)
    ///
    /// Returns:
    ///   (cos, sin) each of shape (batch, seq_len, head_dim/2) - half dim for optimized rope kernel
    pub fn forward(&self, x: &Tensor, position_ids: &Tensor) -> Result<(Tensor, Tensor)> {
        let dtype = x.dtype();
        let seq_len = position_ids.dim(1)?;

        // Get inv_freq (may be recomputed for dynamic scaling types)
        let inv_freq = self.core.get_inv_freq(seq_len)?;

        // inv_freq: (head_dim/2,) -> (1, head_dim/2, 1)
        let inv_freq = inv_freq.unsqueeze(0)?.unsqueeze(2)?;
        let inv_freq = inv_freq.to_dtype(DType::F32)?;

        // position_ids: (batch, seq_len) -> (batch, 1, seq_len)
        let position_ids = position_ids.unsqueeze(1)?.to_dtype(DType::F32)?;

        // freqs: (batch, head_dim/2, seq_len)
        let freqs = inv_freq.broadcast_mul(&position_ids)?;

        // Transpose to (batch, seq_len, head_dim/2) and make contiguous
        let freqs = freqs.transpose(1, 2)?.contiguous()?;

        // Keep at half_dim - candle_nn::rope expects half_dim cos/sin
        let cos = (freqs.cos()? * self.core.attention_scaling)?.to_dtype(dtype)?;
        let sin = (freqs.sin()? * self.core.attention_scaling)?.to_dtype(dtype)?;

        Ok((cos, sin))
    }
}
