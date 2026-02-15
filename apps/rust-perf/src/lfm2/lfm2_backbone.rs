//! LFM2 backbone (hybrid conv+attention) – Candle port.
//!
//! Port of LFM2-1.2B backbone. Consumes encoder features, produces hidden sequence for RQ-Transformer.
//! Uses alternating conv1d + linear blocks with residual connections.

use candle_core::{DType, Device, Result, Tensor};
use candle_nn::{conv1d, linear, Conv1d, Conv1dConfig, Linear, Module, VarBuilder};

// ============================================================================
// CONFIG
// ============================================================================

/// Configuration for the LFM2 backbone (from LFM2-Audio-1.5B).
#[derive(Debug, Clone)]
pub struct Lfm2BackboneConfig {
    /// Hidden dimension (matches encoder output and RQ-Transformer input).
    pub hidden_dim: usize,
    /// Number of hybrid conv+linear blocks.
    pub num_blocks: usize,
}

impl Default for Lfm2BackboneConfig {
    fn default() -> Self {
        Self {
            hidden_dim: 512,
            num_blocks: 4,
        }
    }
}

// ============================================================================
// Hybrid block: Conv1D (kernel=3, padding=1) + Linear, with residual
// ============================================================================

struct HybridBlock {
    conv: Conv1d,
    linear: Linear,
    hidden_dim: usize,
}

impl HybridBlock {
    fn load(vb: VarBuilder, hidden_dim: usize) -> Result<Self> {
        let conv_cfg = Conv1dConfig {
            padding: 1,
            stride: 1,
            dilation: 1,
            groups: 1,
        };
        let conv = conv1d(hidden_dim, hidden_dim, 3, conv_cfg, vb.pp("conv"))?;
        let linear_layer = linear(hidden_dim, hidden_dim, vb.pp("linear"))?;
        Ok(Self {
            conv,
            linear: linear_layer,
            hidden_dim,
        })
    }

    fn forward(&self, x: &Tensor) -> Result<Tensor> {
        let residual = x;
        let (_b, _seq, _h) = x.dims3()?;

        // Conv1D expects (batch, channels, seq) — transpose, convolve, transpose back
        let x = x.transpose(1, 2)?; // (batch, hidden, seq)
        let x = self.conv.forward(&x)?; // (batch, hidden, seq) — padding=1 preserves length
        let x = x.transpose(1, 2)?; // (batch, seq, hidden)

        // Linear projection
        let x = self.linear.forward(&x)?;

        // Residual
        residual + x
    }
}

// ============================================================================
// LFM2 Backbone
// ============================================================================

/// LFM2 backbone: encoder feature sequence → hidden sequence for audio output head.
pub struct Lfm2Backbone {
    blocks: Vec<HybridBlock>,
    config: Lfm2BackboneConfig,
    device: Device,
}

impl std::fmt::Debug for Lfm2Backbone {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Lfm2Backbone")
            .field("config", &self.config)
            .finish()
    }
}

impl Lfm2Backbone {
    /// Load from VarBuilder with real weights. Prefix: backbone / model per LFM2-Audio-1.5B.
    pub fn load(vb: VarBuilder, config: Lfm2BackboneConfig, device: &Device) -> Result<Self> {
        Self::build(vb, config, device)
    }

    /// Build from VarBuilder (e.g. VarBuilder::zeros for tests).
    pub fn load_with_vb(vb: VarBuilder, device: &Device) -> Result<Self> {
        Self::build(vb, Lfm2BackboneConfig::default(), device)
    }

    /// Zero-weight constructor for tests.
    pub fn new_test(device: &Device) -> Result<Self> {
        let vb = VarBuilder::zeros(DType::F32, device);
        Self::build(vb.pp("backbone"), Lfm2BackboneConfig::default(), device)
    }

    fn build(vb: VarBuilder, config: Lfm2BackboneConfig, device: &Device) -> Result<Self> {
        let mut blocks = Vec::with_capacity(config.num_blocks);
        for i in 0..config.num_blocks {
            let block = HybridBlock::load(vb.pp("blocks").pp(i), config.hidden_dim)?;
            blocks.push(block);
        }

        Ok(Self {
            blocks,
            config,
            device: device.clone(),
        })
    }

    /// Forward: (batch, seq_len, hidden_dim) → (batch, seq_len, hidden_dim).
    pub fn forward(&self, x: &Tensor) -> Result<Tensor> {
        let mut x = x.clone();
        for block in &self.blocks {
            x = block.forward(&x)?;
        }
        Ok(x)
    }

    pub fn config(&self) -> &Lfm2BackboneConfig {
        &self.config
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_backbone_config_default() {
        let cfg = Lfm2BackboneConfig::default();
        assert_eq!(cfg.hidden_dim, 512);
        assert_eq!(cfg.num_blocks, 4);
    }

    #[test]
    fn test_backbone_forward_shape() {
        let device = Device::Cpu;
        let backbone = Lfm2Backbone::new_test(&device).unwrap();
        let input = Tensor::zeros(&[1, 100, 512], DType::F32, &device).unwrap();
        let out = backbone.forward(&input).unwrap();
        let (b, seq, h) = out.dims3().unwrap();
        assert_eq!(b, 1);
        assert_eq!(seq, 100); // seq preserved
        assert_eq!(h, 512);
    }

    #[test]
    fn test_backbone_preserves_seq_length() {
        let device = Device::Cpu;
        let backbone = Lfm2Backbone::new_test(&device).unwrap();
        // Various sequence lengths
        for seq_len in [10, 50, 200, 4000] {
            let input = Tensor::zeros(&[1, seq_len, 512], DType::F32, &device).unwrap();
            let out = backbone.forward(&input).unwrap();
            assert_eq!(out.dim(1).unwrap(), seq_len);
        }
    }
}
