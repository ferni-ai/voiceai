//! Rotary Position Embeddings (RoPE) implementations.
//!
//! Qwen3-TTS uses two types of RoPE:
//! 1. Standard RoPE for the code predictor
//! 2. Multimodal RoPE for the talker (3D: temporal, height, width)
//!
//! This module supports multiple RoPE scaling variants for extended context:
//! - `default`: Standard RoPE without scaling
//! - `linear`: Simple linear interpolation for longer sequences
//! - `dynamic`: NTK-aware dynamic scaling based on sequence length
//! - `yarn`: Yet Another RoPE extensioN with frequency partitioning
//! - `longrope`: Long context RoPE with separate short/long scaling factors
//! - `llama3`: Llama 3's smooth frequency-based scaling

use candle_core::{DType, IndexOp, Result, Tensor};

pub mod core;
pub mod simple;
pub mod standard;
pub mod talker;

/// Rotate half of the hidden dimensions.
///
/// This is used in the RoPE formula: (q * cos) + (rotate_half(q) * sin)
pub fn rotate_half(x: &Tensor) -> Result<Tensor> {
    let last_dim = x.dim(candle_core::D::Minus1)?;
    let half = last_dim / 2;
    let x1 = x.narrow(candle_core::D::Minus1, 0, half)?;
    let x2 = x.narrow(candle_core::D::Minus1, half, half)?;
    Tensor::cat(&[&x2.neg()?, &x1], candle_core::D::Minus1)
}

/// Apply standard rotary position embedding to query and key tensors.
///
/// Uses candle-nn's optimized CUDA/Metal kernel when available.
/// This expects half_dim cos/sin (head_dim/2) as produced by RotaryEmbedding.
///
/// Args:
///   q: Query tensor of shape (batch, heads, seq_len, head_dim)
///   k: Key tensor of shape (batch, heads, seq_len, head_dim)
///   cos: Cosine embeddings of shape (batch, seq_len, head_dim/2)
///   sin: Sine embeddings of shape (batch, seq_len, head_dim/2)
///
/// Returns:
///   (q_embed, k_embed) with position information encoded
pub fn apply_rotary_pos_emb(
    q: &Tensor,
    k: &Tensor,
    cos: &Tensor,
    sin: &Tensor,
) -> Result<(Tensor, Tensor)> {
    // Ensure q and k are contiguous (required by rope kernel)
    let q = q.contiguous()?;
    let k = k.contiguous()?;

    // Use candle-nn's optimized rope kernel (has CUDA implementation)
    // cos/sin are already at half_head_dim from RotaryEmbedding
    let q_embed = candle_nn::rotary_emb::rope(&q, cos, sin)?;
    let k_embed = candle_nn::rotary_emb::rope(&k, cos, sin)?;

    Ok((q_embed, k_embed))
}

/// Apply rotary position embedding manually with full_dim cos/sin.
///
/// This is used by modules that precompute full_dim cos/sin (like the audio
/// encoder/tokenizer transformers) and need manual RoPE application. Uses F32
/// internally for precision.
///
/// Args:
///   q: Query tensor of shape (batch, heads, seq_len, head_dim)
///   k: Key tensor of shape (batch, heads, seq_len, head_dim)
///   cos: Cosine embeddings of shape (batch, seq_len, head_dim) - full dim
///   sin: Sine embeddings of shape (batch, seq_len, head_dim) - full dim
///
/// Returns:
///   (q_embed, k_embed) with position information encoded
pub fn apply_rotary_pos_emb_manual(
    q: &Tensor,
    k: &Tensor,
    cos: &Tensor,
    sin: &Tensor,
) -> Result<(Tensor, Tensor)> {
    let original_dtype = q.dtype();

    // Convert to F32 for precision
    let q_f32 = q.to_dtype(DType::F32)?;
    let k_f32 = k.to_dtype(DType::F32)?;
    let cos_f32 = cos.to_dtype(DType::F32)?.unsqueeze(1)?;
    let sin_f32 = sin.to_dtype(DType::F32)?.unsqueeze(1)?;

    // RoPE formula: x * cos + rotate_half(x) * sin
    let q_embed = q_f32
        .broadcast_mul(&cos_f32)?
        .broadcast_add(&rotate_half(&q_f32)?.broadcast_mul(&sin_f32)?)?;
    let k_embed = k_f32
        .broadcast_mul(&cos_f32)?
        .broadcast_add(&rotate_half(&k_f32)?.broadcast_mul(&sin_f32)?)?;

    // Convert back to original dtype
    Ok((
        q_embed.to_dtype(original_dtype)?,
        k_embed.to_dtype(original_dtype)?,
    ))
}

/// Apply multimodal rotary position embedding for 3D positions.
///
/// The head dimension is split into sections for temporal, height, and width,
/// with each section receiving its corresponding position encoding.
///
/// Args:
///   q: Query tensor of shape (batch, heads, seq_len, head_dim)
///   k: Key tensor of shape (batch, heads, seq_len, head_dim)
///   cos: Cosine embeddings of shape (3, batch, seq_len, head_dim)
///   sin: Sine embeddings of shape (3, batch, seq_len, head_dim)
///   mrope_section: Section sizes for temporal, height, width (e.g., [16, 24, 24])
///   interleaved: Whether to use interleaved layout
pub fn apply_multimodal_rotary_pos_emb(
    q: &Tensor,
    k: &Tensor,
    cos: &Tensor,
    sin: &Tensor,
    mrope_section: &[usize],
    interleaved: bool,
) -> Result<(Tensor, Tensor)> {
    if interleaved {
        // Interleaved mode: complex interleaving of modality positions
        apply_multimodal_rotary_pos_emb_interleaved(q, k, cos, sin, mrope_section)
    } else {
        // Standard mode: concatenate sections
        apply_multimodal_rotary_pos_emb_standard(q, k, cos, sin, mrope_section)
    }
}

fn apply_multimodal_rotary_pos_emb_standard(
    q: &Tensor,
    k: &Tensor,
    cos: &Tensor,
    sin: &Tensor,
    mrope_section: &[usize],
) -> Result<(Tensor, Tensor)> {
    // cos/sin shape: (3, batch, seq_len, head_dim/2) - already at half_dim
    // sum(mrope_section) = head_dim/2
    //
    // Split by mrope_section (3 sections) and assign each to its modality:
    //   Section 0 -> modality 0 (temporal)
    //   Section 1 -> modality 1 (height)
    //   Section 2 -> modality 2 (width)

    // Split cos and sin along the head_dim/2 dimension
    let mut cos_parts = Vec::new();
    let mut sin_parts = Vec::new();
    let mut offset = 0;

    for (i, &section_size) in mrope_section.iter().enumerate() {
        // Get the i-th modality's cos/sin
        let cos_modality = cos.i(i)?; // (batch, seq_len, head_dim/2)
        let sin_modality = sin.i(i)?;

        // Extract the section for this part
        let cos_section = cos_modality.narrow(candle_core::D::Minus1, offset, section_size)?;
        let sin_section = sin_modality.narrow(candle_core::D::Minus1, offset, section_size)?;

        cos_parts.push(cos_section);
        sin_parts.push(sin_section);
        offset += section_size;
    }

    // Concatenate all sections - result is already at half_dim
    let cos_half = Tensor::cat(
        &cos_parts.iter().collect::<Vec<_>>(),
        candle_core::D::Minus1,
    )?
    .contiguous()?;
    let sin_half = Tensor::cat(
        &sin_parts.iter().collect::<Vec<_>>(),
        candle_core::D::Minus1,
    )?
    .contiguous()?;

    // Ensure q and k are contiguous
    let q = q.contiguous()?;
    let k = k.contiguous()?;

    // Use candle-nn's optimized rope kernel
    let q_embed = candle_nn::rotary_emb::rope(&q, &cos_half, &sin_half)?;
    let k_embed = candle_nn::rotary_emb::rope(&k, &cos_half, &sin_half)?;

    Ok((q_embed, k_embed))
}

fn apply_multimodal_rotary_pos_emb_interleaved(
    q: &Tensor,
    k: &Tensor,
    cos: &Tensor,
    sin: &Tensor,
    mrope_section: &[usize],
) -> Result<(Tensor, Tensor)> {
    // Interleaved multimodal RoPE implementation.
    // cos/sin are already at half_dim from TalkerRotaryEmbedding.
    //
    // This creates an interleaved pattern: [m0, m1, m2, m0, m1, m2, ...]
    // - Positions 0, 3, 6, ... come from modality 0
    // - Positions 1, 4, 7, ... come from modality 1
    // - Positions 2, 5, 8, ... come from modality 2

    let (_modalities, _batch, _seq_len, half_dim) = cos.dims4()?;
    let modality_num = mrope_section.len(); // Should be 3

    // cos/sin are already at half_dim, convert to F32 for precision during interleaving
    let original_dtype = cos.dtype();
    let cos_half = cos.contiguous()?.to_dtype(DType::F32)?;
    let sin_half = sin.contiguous()?.to_dtype(DType::F32)?;

    // Build the interleaved result efficiently using index_select on a flattened view
    // For each output position, determine which modality and source position to use
    //
    // With mrope_section = [24, 20, 20] and half_dim = 64:
    // - Positions 0, 3, 6, ..., 57, 60-63 come from modality 0
    // - Positions 1, 4, 7, ..., 58 come from modality 1
    // - Positions 2, 5, 8, ..., 59 come from modality 2

    let m1_end = if mrope_section.len() > 1 {
        (mrope_section[1] * modality_num).min(half_dim)
    } else {
        0
    };
    let m2_end = if mrope_section.len() > 2 {
        (mrope_section[2] * modality_num).min(half_dim)
    } else {
        0
    };

    // Build index arrays for gathering from each modality
    // We'll gather positions from each modality, then combine them
    let mut m0_positions: Vec<u32> = Vec::new();
    let mut m1_positions: Vec<u32> = Vec::new();
    let mut m2_positions: Vec<u32> = Vec::new();
    let mut output_modality: Vec<usize> = Vec::with_capacity(half_dim);

    for pos in 0..half_dim {
        let modality = if modality_num >= 3 && mrope_section.len() >= 3 {
            if pos >= 1 && pos < m1_end && (pos - 1) % modality_num == 0 {
                1
            } else if pos >= 2 && pos < m2_end && (pos - 2) % modality_num == 0 {
                2
            } else {
                0
            }
        } else {
            0
        };

        output_modality.push(modality);
        match modality {
            0 => m0_positions.push(pos as u32),
            1 => m1_positions.push(pos as u32),
            2 => m2_positions.push(pos as u32),
            _ => unreachable!(),
        }
    }

    // Get each modality's data
    let cos_m0 = cos_half.i(0)?.contiguous()?; // (batch, seq_len, half_dim)
    let sin_m0 = sin_half.i(0)?.contiguous()?;
    let cos_m1 = cos_half.i(1)?.contiguous()?;
    let sin_m1 = sin_half.i(1)?.contiguous()?;
    let cos_m2 = cos_half.i(2)?.contiguous()?;
    let sin_m2 = sin_half.i(2)?.contiguous()?;

    // Build result position by position (more reliable than complex index operations)
    let mut all_cos_parts: Vec<Tensor> = Vec::with_capacity(half_dim);
    let mut all_sin_parts: Vec<Tensor> = Vec::with_capacity(half_dim);

    for (pos, &modality) in output_modality.iter().enumerate() {
        let (cos_src, sin_src) = match modality {
            0 => (&cos_m0, &sin_m0),
            1 => (&cos_m1, &sin_m1),
            2 => (&cos_m2, &sin_m2),
            _ => unreachable!(),
        };

        let cos_col = cos_src.narrow(2, pos, 1)?;
        let sin_col = sin_src.narrow(2, pos, 1)?;
        all_cos_parts.push(cos_col);
        all_sin_parts.push(sin_col);
    }

    let cos_interleaved = Tensor::cat(&all_cos_parts.iter().collect::<Vec<_>>(), 2)?;
    let sin_interleaved = Tensor::cat(&all_sin_parts.iter().collect::<Vec<_>>(), 2)?;

    // cos_interleaved is already half_dim, convert to original dtype and make contiguous
    let cos_half = cos_interleaved.to_dtype(original_dtype)?.contiguous()?;
    let sin_half = sin_interleaved.to_dtype(original_dtype)?.contiguous()?;

    // Ensure q and k are contiguous
    let q = q.contiguous()?;
    let k = k.contiguous()?;

    // Use candle-nn's optimized rope kernel (expects half head_dim for cos/sin)
    let q_embed = candle_nn::rotary_emb::rope(&q, &cos_half, &sin_half)?;
    let k_embed = candle_nn::rotary_emb::rope(&k, &cos_half, &sin_half)?;

    Ok((q_embed, k_embed))
}

#[cfg(test)]
mod tests {
    use crate::nn::rope::standard::RotaryEmbedding;
    use crate::nn::rope::{
        apply_multimodal_rotary_pos_emb_interleaved, apply_multimodal_rotary_pos_emb_standard,
        rotate_half,
    };
    use crate::nn::rope_scaling::RopeScalingType;
    use candle_core::{Device, Result, Tensor};

    #[test]
    fn test_rotate_half() -> Result<()> {
        let device = Device::Cpu;
        let x = Tensor::arange(0f32, 8.0, &device)?.reshape((1, 1, 1, 8))?;
        let rotated = rotate_half(&x)?;
        let rotated_flat = rotated.flatten_all()?.to_vec1::<f32>()?;
        // First half should be negated second half, second half should be first half
        assert_eq!(
            rotated_flat,
            vec![-4.0, -5.0, -6.0, -7.0, 0.0, 1.0, 2.0, 3.0]
        );
        Ok(())
    }

    #[test]
    fn test_standard_rope() -> Result<()> {
        let device = Device::Cpu;
        let rope = RotaryEmbedding::new(64, 8192, 10000.0, &device)?;

        let x = Tensor::randn(0f32, 1.0, (2, 4, 10, 64), &device)?;
        let position_ids = Tensor::arange(0i64, 10, &device)?
            .unsqueeze(0)?
            .repeat((2, 1))?;

        let (cos, sin) = rope.forward(&x, &position_ids)?;
        // cos/sin are now at half_dim (32) for optimized rope kernel
        assert_eq!(cos.dims(), &[2, 10, 32]);
        assert_eq!(sin.dims(), &[2, 10, 32]);
        assert_eq!(rope.scaling_type(), RopeScalingType::Default);
        Ok(())
    }

    #[test]
    fn test_rope_scaling_type_parsing() {
        assert_eq!(RopeScalingType::parse("default"), RopeScalingType::Default);
        assert_eq!(RopeScalingType::parse("linear"), RopeScalingType::Linear);
        assert_eq!(RopeScalingType::parse("dynamic"), RopeScalingType::Dynamic);
        assert_eq!(RopeScalingType::parse("ntk"), RopeScalingType::Dynamic);
        assert_eq!(RopeScalingType::parse("yarn"), RopeScalingType::Yarn);
        assert_eq!(
            RopeScalingType::parse("longrope"),
            RopeScalingType::LongRope
        );
        assert_eq!(RopeScalingType::parse("llama3"), RopeScalingType::Llama3);
        assert_eq!(RopeScalingType::parse("unknown"), RopeScalingType::Default);
    }

    #[test]
    fn test_interleaved_multimodal_rope() -> Result<()> {
        let device = Device::Cpu;
        // Use head_dim=64, which means half_dim=32
        let x = Tensor::randn(0f32, 1.0, (2, 8, 5, 64), &device)?;

        // Create multimodal cos/sin tensors at half_dim (3, batch, seq_len, half_dim)
        // mrope_section [8, 12, 12] sums to 32 = half_dim
        let cos = Tensor::randn(0f32, 1.0, (3, 2, 5, 32), &device)?;
        let sin = Tensor::randn(0f32, 1.0, (3, 2, 5, 32), &device)?;

        let mrope_section = &[8, 12, 12];

        // Test both modes produce valid output shapes
        let (q_std, k_std) =
            apply_multimodal_rotary_pos_emb_standard(&x, &x, &cos, &sin, mrope_section)?;
        let (q_int, k_int) =
            apply_multimodal_rotary_pos_emb_interleaved(&x, &x, &cos, &sin, mrope_section)?;

        assert_eq!(q_std.dims(), &[2, 8, 5, 64]);
        assert_eq!(k_std.dims(), &[2, 8, 5, 64]);
        assert_eq!(q_int.dims(), &[2, 8, 5, 64]);
        assert_eq!(k_int.dims(), &[2, 8, 5, 64]);
        Ok(())
    }
}
