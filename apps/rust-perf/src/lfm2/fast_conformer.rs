//! FastConformer audio encoder (Candle port).
//!
//! Port from NeMo/canary-180m-flash style FastConformer. Maps PCM → features for LFM2 backbone.
//! Conv1D subsampling reduces temporal dimension, then simplified self-attention layers
//! produce feature sequences for the backbone.

use candle_core::{DType, Device, Result, Tensor, D};
use candle_nn::{conv1d, linear, Conv1d, Conv1dConfig, Linear, Module, VarBuilder};

// ============================================================================
// CONFIG
// ============================================================================

/// Configuration for the FastConformer encoder (from LFM2-Audio-1.5B).
#[derive(Debug, Clone)]
pub struct FastConformerConfig {
    /// Number of input audio channels (1 for mono PCM).
    pub input_channels: usize,
    /// Hidden dimension of encoder output.
    pub hidden_dim: usize,
    /// Number of simplified self-attention layers.
    pub num_layers: usize,
    /// Temporal subsampling factor (conv stride product).
    pub subsampling_factor: usize,
}

impl Default for FastConformerConfig {
    fn default() -> Self {
        Self {
            input_channels: 1,
            hidden_dim: 512,
            num_layers: 2,
            subsampling_factor: 4,
        }
    }
}

// ============================================================================
// Attention layer: Linear Q/K/V → scaled dot-product → Linear out
// ============================================================================

struct ConformerAttentionLayer {
    q_proj: Linear,
    k_proj: Linear,
    v_proj: Linear,
    out_proj: Linear,
    hidden_dim: usize,
}

impl ConformerAttentionLayer {
    fn load(vb: VarBuilder, hidden_dim: usize) -> Result<Self> {
        let q_proj = linear(hidden_dim, hidden_dim, vb.pp("q_proj"))?;
        let k_proj = linear(hidden_dim, hidden_dim, vb.pp("k_proj"))?;
        let v_proj = linear(hidden_dim, hidden_dim, vb.pp("v_proj"))?;
        let out_proj = linear(hidden_dim, hidden_dim, vb.pp("out_proj"))?;
        Ok(Self {
            q_proj,
            k_proj,
            v_proj,
            out_proj,
            hidden_dim,
        })
    }

    fn forward(&self, x: &Tensor) -> Result<Tensor> {
        let residual = x;
        let (b, seq_len, _) = x.dims3()?;
        // Use 8 heads (or fewer if hidden_dim < 8)
        let num_heads = 8.min(self.hidden_dim);
        let head_dim = self.hidden_dim / num_heads;

        let q = self.q_proj.forward(x)?;
        let k = self.k_proj.forward(x)?;
        let v = self.v_proj.forward(x)?;

        // Reshape to (batch, heads, seq, head_dim) and make contiguous for matmul
        let q = q
            .reshape((b, seq_len, num_heads, head_dim))?
            .transpose(1, 2)?
            .contiguous()?;
        let k = k
            .reshape((b, seq_len, num_heads, head_dim))?
            .transpose(1, 2)?
            .contiguous()?;
        let v = v
            .reshape((b, seq_len, num_heads, head_dim))?
            .transpose(1, 2)?
            .contiguous()?;

        // Scaled dot-product attention
        let scale = 1.0 / (head_dim as f64).sqrt();
        let k_t = k.transpose(2, 3)?.contiguous()?;
        let attn = (q.matmul(&k_t)? * scale)?;
        // Manual softmax
        let max_a = attn.max_keepdim(D::Minus1)?;
        let exp_a = (attn.broadcast_sub(&max_a))?.exp()?;
        let sum_a = exp_a.sum_keepdim(D::Minus1)?;
        let attn = exp_a.broadcast_div(&sum_a)?;

        let out = attn.matmul(&v)?;
        let out = out
            .transpose(1, 2)?
            .reshape((b, seq_len, self.hidden_dim))?;
        let out = self.out_proj.forward(&out)?;

        // Residual connection
        residual + out
    }
}

// ============================================================================
// FastConformer Encoder
// ============================================================================

/// FastConformer encoder: PCM (or Mimi codes) → feature sequence for LFM2 backbone.
pub struct FastConformerEncoder {
    /// Conv1D for temporal subsampling (stride = subsampling_factor).
    subsample_conv: Conv1d,
    /// Linear projection from conv output channels to hidden_dim.
    proj: Linear,
    /// Simplified self-attention layers.
    layers: Vec<ConformerAttentionLayer>,
    config: FastConformerConfig,
    device: Device,
}

impl std::fmt::Debug for FastConformerEncoder {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("FastConformerEncoder")
            .field("config", &self.config)
            .finish()
    }
}

impl FastConformerEncoder {
    /// Load from VarBuilder with real weights. Prefix: encoder / audio_encoder per LFM2-Audio-1.5B.
    pub fn load(vb: VarBuilder, config: FastConformerConfig, device: &Device) -> Result<Self> {
        Self::build(vb, config, device)
    }

    /// Build from VarBuilder (e.g. VarBuilder::zeros for tests).
    pub fn load_with_vb(vb: VarBuilder, device: &Device) -> Result<Self> {
        Self::build(vb, FastConformerConfig::default(), device)
    }

    /// Zero-weight constructor for tests.
    pub fn new_test(device: &Device) -> Result<Self> {
        let vb = VarBuilder::zeros(DType::F32, device);
        Self::build(vb.pp("encoder"), FastConformerConfig::default(), device)
    }

    fn build(vb: VarBuilder, config: FastConformerConfig, device: &Device) -> Result<Self> {
        // Conv1D subsampling: input_channels → hidden_dim, stride = subsampling_factor
        let conv_cfg = Conv1dConfig {
            padding: config.subsampling_factor / 2,
            stride: config.subsampling_factor,
            dilation: 1,
            groups: 1,
        };
        let subsample_conv = conv1d(
            config.input_channels,
            config.hidden_dim,
            config.subsampling_factor + 1, // kernel slightly larger than stride
            conv_cfg,
            vb.pp("subsample_conv"),
        )?;

        // Linear projection (identity dim in this case, but keeps the pattern)
        let proj = linear(config.hidden_dim, config.hidden_dim, vb.pp("proj"))?;

        // Self-attention layers
        let mut layers = Vec::with_capacity(config.num_layers);
        for i in 0..config.num_layers {
            let layer =
                ConformerAttentionLayer::load(vb.pp("layers").pp(i), config.hidden_dim)?;
            layers.push(layer);
        }

        Ok(Self {
            subsample_conv,
            proj,
            layers,
            config,
            device: device.clone(),
        })
    }

    /// Forward: (batch, channels, samples) or (batch, samples) → (batch, T/subsampling_factor, hidden_dim).
    pub fn forward(&self, x: &Tensor) -> Result<Tensor> {
        // Ensure input is (batch, channels, samples)
        let x = match x.dims().len() {
            2 => x.unsqueeze(1)?, // (batch, samples) → (batch, 1, samples)
            3 => x.clone(),
            _ => {
                return Err(candle_core::Error::Msg(format!(
                    "FastConformer: expected 2D or 3D input, got {}D",
                    x.dims().len()
                )))
            }
        };

        // Conv1D subsampling: (batch, channels, samples) → (batch, hidden_dim, T/sub)
        let x = self.subsample_conv.forward(&x)?;

        // Transpose to (batch, seq, hidden_dim) for attention
        let x = x.transpose(1, 2)?;

        // Linear projection
        let mut x = self.proj.forward(&x)?;

        // Self-attention layers
        for layer in &self.layers {
            x = layer.forward(&x)?;
        }

        Ok(x)
    }

    pub fn config(&self) -> &FastConformerConfig {
        &self.config
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fast_conformer_config_default() {
        let cfg = FastConformerConfig::default();
        assert_eq!(cfg.input_channels, 1);
        assert_eq!(cfg.hidden_dim, 512);
        assert_eq!(cfg.num_layers, 2);
        assert_eq!(cfg.subsampling_factor, 4);
    }

    #[test]
    fn test_fast_conformer_forward_shape() {
        let device = Device::Cpu;
        let encoder = FastConformerEncoder::new_test(&device).unwrap();
        // 1 second of 16kHz mono audio
        let pcm = Tensor::zeros(&[1, 16000], DType::F32, &device).unwrap();
        let out = encoder.forward(&pcm).unwrap();
        let (b, seq, h) = out.dims3().unwrap();
        assert_eq!(b, 1);
        assert_eq!(h, 512);
        // Conv1d with stride=4, kernel=5, padding=2: output = (16000 + 2*2 - 5)/4 + 1 = 4000
        assert_eq!(seq, 4000);
    }

    #[test]
    fn test_fast_conformer_3d_input() {
        let device = Device::Cpu;
        let encoder = FastConformerEncoder::new_test(&device).unwrap();
        // Already 3D: (batch, channels, samples)
        let pcm = Tensor::zeros(&[1, 1, 16000], DType::F32, &device).unwrap();
        let out = encoder.forward(&pcm).unwrap();
        let (b, seq, h) = out.dims3().unwrap();
        assert_eq!(b, 1);
        assert_eq!(h, 512);
        assert_eq!(seq, 4000);
    }
}
