use candle_core::{Device, Result, Tensor};

/// RoPE scaling type enumeration
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum RopeScalingType {
    /// No scaling (standard RoPE)
    #[default]
    Default,
    /// Linear interpolation for longer sequences
    Linear,
    /// NTK-aware dynamic scaling
    Dynamic,
    /// YaRN (Yet Another RoPE extensioN)
    Yarn,
    /// Long context RoPE with short/long factors
    LongRope,
    /// Llama 3's frequency-based scaling
    Llama3,
}

impl RopeScalingType {
    /// Parse rope type from string
    pub fn parse(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "linear" => Self::Linear,
            "dynamic" | "ntk" => Self::Dynamic,
            "yarn" => Self::Yarn,
            "longrope" | "long_rope" => Self::LongRope,
            "llama3" | "llama_3" => Self::Llama3,
            _ => Self::Default,
        }
    }
}

/// Compute linear scaling for RoPE frequencies.
///
/// Simple interpolation: frequencies are divided by the scaling factor,
/// allowing the model to handle sequences longer than its original training length.
pub fn compute_linear_scaling(inv_freq: &Tensor, factor: f64) -> Result<Tensor> {
    inv_freq.affine(1.0 / factor, 0.0)
}

/// Compute dynamic NTK-aware scaling for RoPE frequencies.
///
/// This method adjusts the frequency base based on the ratio between the
/// current sequence length and the original maximum, using NTK interpolation
/// which better preserves high-frequency components.
pub fn compute_dynamic_scaling(
    head_dim: usize,
    rope_theta: f64,
    seq_len: usize,
    original_max_len: usize,
    device: &Device,
) -> Result<Tensor> {
    let base = if seq_len > original_max_len {
        let ratio = seq_len as f64 / original_max_len as f64;
        rope_theta
            * (ratio * (head_dim as f64 / (head_dim as f64 - 2.0)))
                .powf(head_dim as f64 / (head_dim as f64 - 2.0))
    } else {
        rope_theta
    };

    let half_dim = head_dim / 2;
    let inv_freq: Vec<f32> = (0..half_dim)
        .map(|i| 1.0 / (base.powf(i as f64 * 2.0 / head_dim as f64) as f32))
        .collect();
    Tensor::from_vec(inv_freq, half_dim, device)
}

/// Compute YaRN scaling for RoPE frequencies.
///
/// YaRN partitions frequencies into three regions:
/// 1. Low frequencies (below beta_fast): interpolated
/// 2. High frequencies (above beta_slow): unchanged
/// 3. Middle frequencies: smoothly blended
pub fn compute_yarn_scaling(
    head_dim: usize,
    rope_theta: f64,
    factor: f64,
    original_max_len: usize,
    beta_fast: f64,
    beta_slow: f64,
    device: &Device,
) -> Result<(Tensor, f64)> {
    let half_dim = head_dim / 2;

    // Compute frequency boundaries
    let low_freq_factor = 1.0 / (beta_fast / (beta_fast - beta_slow));
    let high_freq_factor = 1.0 / (1.0 - (beta_slow / (beta_fast - beta_slow)));

    let low_freq_wavelen = original_max_len as f64 / low_freq_factor;
    let high_freq_wavelen = original_max_len as f64 / high_freq_factor;

    let inv_freq: Vec<f32> = (0..half_dim)
        .map(|i| {
            let freq = 1.0 / (rope_theta.powf(i as f64 * 2.0 / head_dim as f64));
            let wavelen = 2.0 * std::f64::consts::PI / freq;

            let scaled_freq = if wavelen < high_freq_wavelen {
                // High frequency: no scaling
                freq
            } else if wavelen > low_freq_wavelen {
                // Low frequency: full interpolation
                freq / factor
            } else {
                // Middle: smooth interpolation
                let smooth = (wavelen - high_freq_wavelen) / (low_freq_wavelen - high_freq_wavelen);
                freq * (1.0 - smooth) + (freq / factor) * smooth
            };
            scaled_freq as f32
        })
        .collect();

    // YaRN uses sqrt(1 + ln(factor) / ln(original_max_len)) as attention scaling
    let attention_factor = (1.0 + (factor.ln() / (original_max_len as f64).ln())).sqrt();

    Ok((
        Tensor::from_vec(inv_freq, half_dim, device)?,
        attention_factor,
    ))
}

/// Compute LongRoPE scaling with separate short/long factors.
///
/// LongRope applies different scaling factors to each dimension,
/// using short_factor for sequences within training length and
/// long_factor for extended sequences.
pub fn compute_longrope_scaling(
    head_dim: usize,
    rope_theta: f64,
    seq_len: usize,
    original_max_len: usize,
    short_factor: &[f64],
    long_factor: &[f64],
    device: &Device,
) -> Result<Tensor> {
    let half_dim = head_dim / 2;
    let factors = if seq_len > original_max_len {
        long_factor
    } else {
        short_factor
    };

    let inv_freq: Vec<f32> = (0..half_dim)
        .map(|i| {
            let base_freq = 1.0 / (rope_theta.powf(i as f64 * 2.0 / head_dim as f64));
            let factor = factors.get(i).copied().unwrap_or(1.0);
            (base_freq / factor) as f32
        })
        .collect();

    Tensor::from_vec(inv_freq, half_dim, device)
}

/// Compute Llama3-style frequency scaling.
///
/// Llama3 applies smooth interpolation based on wavelength, with
/// separate handling for low and high frequency components.
pub fn compute_llama3_scaling(
    head_dim: usize,
    rope_theta: f64,
    factor: f64,
    original_max_len: usize,
    low_freq_factor: f64,
    high_freq_factor: f64,
    device: &Device,
) -> Result<Tensor> {
    let half_dim = head_dim / 2;

    let low_freq_wavelen = original_max_len as f64 / low_freq_factor;
    let high_freq_wavelen = original_max_len as f64 / high_freq_factor;

    let inv_freq: Vec<f32> = (0..half_dim)
        .map(|i| {
            let freq = 1.0 / (rope_theta.powf(i as f64 * 2.0 / head_dim as f64));
            let wavelen = 2.0 * std::f64::consts::PI / freq;

            let scaled_freq = if wavelen < high_freq_wavelen {
                freq
            } else if wavelen > low_freq_wavelen {
                freq / factor
            } else {
                // Smooth interpolation
                let smooth = (original_max_len as f64 / wavelen - low_freq_factor)
                    / (high_freq_factor - low_freq_factor);
                freq * (1.0 - smooth) + (freq / factor) * smooth
            };
            scaled_freq as f32
        })
        .collect();

    Tensor::from_vec(inv_freq, half_dim, device)
}

#[cfg(test)]
mod tests {
    use crate::{
        config::rope_config::RopeScaling,
        nn::rope::{standard::RotaryEmbedding, talker::TalkerRotaryEmbedding},
    };

    use super::*;

    #[test]
    fn test_linear_scaling() -> Result<()> {
        let device = Device::Cpu;
        let scaling = RopeScaling {
            rope_type: Some("linear".to_string()),
            factor: Some(2.0),
            ..Default::default()
        };
        let rope = RotaryEmbedding::with_scaling(64, 8192, 10000.0, &scaling, &device)?;

        assert_eq!(rope.scaling_type(), RopeScalingType::Linear);
        assert_eq!(rope.attention_scaling(), 1.0);

        let x = Tensor::randn(0f32, 1.0, (1, 4, 10, 64), &device)?;
        let position_ids = Tensor::arange(0i64, 10, &device)?.unsqueeze(0)?;
        let (cos, sin) = rope.forward(&x, &position_ids)?;

        assert_eq!(cos.dims(), &[1, 10, 32]);
        assert_eq!(sin.dims(), &[1, 10, 32]);
        Ok(())
    }

    #[test]
    fn test_dynamic_scaling() -> Result<()> {
        let device = Device::Cpu;
        let scaling = RopeScaling {
            rope_type: Some("dynamic".to_string()),
            original_max_position_embeddings: Some(4096),
            ..Default::default()
        };
        let rope = RotaryEmbedding::with_scaling(64, 8192, 10000.0, &scaling, &device)?;

        assert_eq!(rope.scaling_type(), RopeScalingType::Dynamic);

        // Test with sequence length within original max (should use original frequencies)
        let x = Tensor::randn(0f32, 1.0, (1, 4, 100, 64), &device)?;
        let position_ids = Tensor::arange(0i64, 100, &device)?.unsqueeze(0)?;
        let (cos1, _) = rope.forward(&x, &position_ids)?;

        // Test with sequence length beyond original max (should scale frequencies)
        let x = Tensor::randn(0f32, 1.0, (1, 4, 5000, 64), &device)?;
        let position_ids = Tensor::arange(0i64, 5000, &device)?.unsqueeze(0)?;
        let (cos2, _) = rope.forward(&x, &position_ids)?;

        assert_eq!(cos1.dims(), &[1, 100, 32]);
        assert_eq!(cos2.dims(), &[1, 5000, 32]);
        Ok(())
    }

    #[test]
    fn test_yarn_scaling() -> Result<()> {
        let device = Device::Cpu;
        let scaling = RopeScaling {
            rope_type: Some("yarn".to_string()),
            factor: Some(2.0),
            original_max_position_embeddings: Some(4096),
            beta_fast: Some(32.0),
            beta_slow: Some(1.0),
            ..Default::default()
        };
        let rope = RotaryEmbedding::with_scaling(64, 8192, 10000.0, &scaling, &device)?;

        assert_eq!(rope.scaling_type(), RopeScalingType::Yarn);
        // YaRN applies sqrt(1 + ln(factor) / ln(original_max_len)) scaling
        assert!(rope.attention_scaling() > 1.0);

        let x = Tensor::randn(0f32, 1.0, (1, 4, 10, 64), &device)?;
        let position_ids = Tensor::arange(0i64, 10, &device)?.unsqueeze(0)?;
        let (cos, sin) = rope.forward(&x, &position_ids)?;

        assert_eq!(cos.dims(), &[1, 10, 32]);
        assert_eq!(sin.dims(), &[1, 10, 32]);
        Ok(())
    }

    #[test]
    fn test_llama3_scaling() -> Result<()> {
        let device = Device::Cpu;
        let scaling = RopeScaling {
            rope_type: Some("llama3".to_string()),
            factor: Some(8.0),
            original_max_position_embeddings: Some(8192),
            low_freq_factor: Some(1.0),
            high_freq_factor: Some(4.0),
            ..Default::default()
        };
        let rope = RotaryEmbedding::with_scaling(64, 65536, 500000.0, &scaling, &device)?;

        assert_eq!(rope.scaling_type(), RopeScalingType::Llama3);

        let x = Tensor::randn(0f32, 1.0, (1, 4, 10, 64), &device)?;
        let position_ids = Tensor::arange(0i64, 10, &device)?.unsqueeze(0)?;
        let (cos, sin) = rope.forward(&x, &position_ids)?;

        assert_eq!(cos.dims(), &[1, 10, 32]);
        assert_eq!(sin.dims(), &[1, 10, 32]);
        Ok(())
    }

    #[test]
    fn test_multimodal_rope_with_scaling() -> Result<()> {
        let device = Device::Cpu;
        let scaling = RopeScaling {
            rope_type: Some("linear".to_string()),
            factor: Some(2.0),
            mrope_section: vec![16, 24, 24],
            ..Default::default()
        };
        let rope = TalkerRotaryEmbedding::with_scaling(64, 8192, 10000.0, &scaling, &device)?;

        assert_eq!(rope.scaling_type(), RopeScalingType::Linear);

        let x = Tensor::randn(0f32, 1.0, (1, 4, 10, 64), &device)?;
        // 3D position IDs: (3, batch, seq_len) for temporal, height, width
        let position_ids = Tensor::arange(0i64, 10, &device)?
            .unsqueeze(0)?
            .unsqueeze(0)?
            .repeat((3, 1, 1))?;

        let (cos, sin) = rope.forward(&x, &position_ids)?;
        assert_eq!(cos.dims(), &[3, 1, 10, 32]);
        assert_eq!(sin.dims(), &[3, 1, 10, 32]);
        Ok(())
    }
}
