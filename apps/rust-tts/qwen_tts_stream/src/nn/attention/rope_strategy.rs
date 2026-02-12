//! RoPE application strategies for attention.
//!
//! Different attention types require different RoPE application methods.
//! This module provides a unified interface for both standard and multimodal RoPE.

use candle_core::{Result, Tensor};

use crate::nn::rope::{apply_multimodal_rotary_pos_emb, apply_rotary_pos_emb};

/// Strategy for applying rotary position embeddings in attention.
///
/// Encapsulates the differences between standard and multimodal RoPE application,
/// allowing unified attention implementation.
#[derive(Debug, Clone)]
pub enum RopeStrategy {
    /// Standard 1D RoPE for code predictor.
    /// Uses candle-nn's optimized kernel with half_dim cos/sin.
    Standard,

    /// Multimodal 3D RoPE for talker.
    /// Splits head dimension across temporal, height, width modalities.
    Multimodal {
        /// Section sizes for each modality (e.g., [16, 24, 24]).
        mrope_section: Vec<usize>,
        /// Whether to use interleaved layout.
        interleaved: bool,
    },
}

impl RopeStrategy {
    /// Apply RoPE to query and key tensors using the appropriate strategy.
    ///
    /// Args:
    ///   q: Query tensor of shape (batch, heads, seq_len, head_dim)
    ///   k: Key tensor of shape (batch, heads, seq_len, head_dim)
    ///   cos: Cosine embeddings
    ///        - Standard: (batch, seq_len, head_dim/2)
    ///        - Multimodal: (3, batch, seq_len, head_dim/2)
    ///   sin: Sine embeddings (same shape as cos)
    ///
    /// Returns:
    ///   (q_embed, k_embed) with position information encoded
    pub fn apply(
        &self,
        q: &Tensor,
        k: &Tensor,
        cos: &Tensor,
        sin: &Tensor,
    ) -> Result<(Tensor, Tensor)> {
        match self {
            RopeStrategy::Standard => apply_rotary_pos_emb(q, k, cos, sin),
            RopeStrategy::Multimodal {
                mrope_section,
                interleaved,
            } => apply_multimodal_rotary_pos_emb(q, k, cos, sin, mrope_section, *interleaved),
        }
    }

    /// Create a standard RoPE strategy.
    pub fn standard() -> Self {
        RopeStrategy::Standard
    }

    /// Create a multimodal RoPE strategy.
    pub fn multimodal(mrope_section: Vec<usize>, interleaved: bool) -> Self {
        RopeStrategy::Multimodal {
            mrope_section,
            interleaved,
        }
    }
}
