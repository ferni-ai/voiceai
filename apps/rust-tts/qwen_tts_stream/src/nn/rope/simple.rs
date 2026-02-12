//! Simple RoPE implementation for audio encoder/tokenizer transformers.
//!
//! This provides a lightweight RoPE that outputs full_dim cos/sin tensors
//! for use with manual RoPE application (via `apply_rotary_pos_emb_manual`).

use candle_core::{DType, Device, Result, Tensor};

/// Simple RoPE embedding with precomputed cos/sin.
///
/// This is a lightweight alternative to `RotaryEmbedding` used by the audio
/// encoder and tokenizer transformers. It precomputes cos/sin for all positions
/// up to max_seq_len and outputs full_dim tensors (not half_dim).
///
/// Use with `apply_rotary_pos_emb_manual()` for RoPE application.
#[derive(Debug, Clone)]
pub struct SimpleRotaryEmbedding {
    cos: Tensor,
    sin: Tensor,
}

impl SimpleRotaryEmbedding {
    /// Create a new simple RoPE embedding.
    ///
    /// Args:
    ///   head_dim: Dimension of each attention head
    ///   max_seq_len: Maximum sequence length to precompute
    ///   rope_theta: Base theta for frequency computation (default: 10000.0)
    ///   device: Device for tensor storage
    ///   dtype: Data type for cos/sin tensors
    pub fn new(
        head_dim: usize,
        max_seq_len: usize,
        rope_theta: f64,
        device: &Device,
        dtype: DType,
    ) -> Result<Self> {
        // Create inverse frequencies for half the dimension
        // since we apply rotary to pairs of dimensions
        let half_dim = head_dim / 2;
        let inv_freq: Vec<f32> = (0..half_dim)
            .map(|i| 1.0 / (rope_theta as f32).powf(i as f32 / half_dim as f32))
            .collect();
        let inv_freq = Tensor::new(inv_freq.as_slice(), device)?.to_dtype(dtype)?;

        let positions: Vec<f32> = (0..max_seq_len).map(|i| i as f32).collect();
        let positions = Tensor::new(positions.as_slice(), device)?.to_dtype(dtype)?;

        // [seq_len, half_dim]
        let freqs = positions
            .unsqueeze(1)?
            .broadcast_mul(&inv_freq.unsqueeze(0)?)?;

        // Compute cos/sin at half_dim then repeat to full head_dim
        // This allows direct element-wise multiplication with the full head_dim
        let cos_half = freqs.cos()?;
        let sin_half = freqs.sin()?;

        // Repeat each value twice: [seq_len, half_dim] -> [seq_len, head_dim]
        // [cos0, cos1, cos2, ...] -> [cos0, cos0, cos1, cos1, ...]
        let cos = Tensor::cat(&[&cos_half, &cos_half], 1)?;
        let sin = Tensor::cat(&[&sin_half, &sin_half], 1)?;

        Ok(Self { cos, sin })
    }

    /// Get cos/sin for a given sequence length starting at offset.
    ///
    /// Args:
    ///   seq_len: Length of the sequence
    ///   offset: Starting position (for incremental decoding)
    ///
    /// Returns:
    ///   (cos, sin) each of shape (seq_len, head_dim) - full dim for manual application
    pub fn get(&self, seq_len: usize, offset: usize) -> Result<(Tensor, Tensor)> {
        let head_dim = self.cos.dim(1)?;
        let cos = self
            .cos
            .narrow(0, offset, seq_len)?
            .narrow(1, 0, head_dim)?;
        let sin = self
            .sin
            .narrow(0, offset, seq_len)?
            .narrow(1, 0, head_dim)?;
        Ok((cos, sin))
    }

    /// Get cos/sin for a given sequence length (no offset).
    ///
    /// Returns:
    ///   (cos, sin) each of shape (batch, seq_len, head_dim) after unsqueezing batch dim
    pub fn forward(&self, seq_len: usize) -> Result<(Tensor, Tensor)> {
        let (cos, sin) = self.get(seq_len, 0)?;
        // Add batch dimension: (seq_len, head_dim) -> (1, seq_len, head_dim)
        Ok((cos.unsqueeze(0)?, sin.unsqueeze(0)?))
    }
}
