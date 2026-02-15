//! RQ-Transformer audio output head – Candle port.
//!
//! Predicts audio codebook tokens from backbone hidden state. Projects hidden features
//! to codebook logits, then argmax to produce codec IDs for Mimi decode.

use candle_core::{DType, Device, Result, Tensor, D};
use candle_nn::{linear, Linear, Module, VarBuilder};

// ============================================================================
// CONFIG
// ============================================================================

/// Configuration for the RQ-Transformer audio output head.
#[derive(Debug, Clone)]
pub struct RqTransformerConfig {
    /// Input hidden dimension from backbone (must match Lfm2BackboneConfig.hidden_dim).
    pub hidden_dim: usize,
    /// Number of Mimi codebooks (e.g. 8).
    pub num_codebooks: usize,
    /// Codebook vocabulary size per codebook (e.g. 2048).
    pub codebook_size: usize,
}

impl Default for RqTransformerConfig {
    fn default() -> Self {
        Self {
            hidden_dim: 512,
            num_codebooks: 8,
            codebook_size: 2048,
        }
    }
}

// ============================================================================
// RQ-Transformer
// ============================================================================

/// RQ-Transformer: backbone hidden sequence → audio codebook IDs (Mimi codebooks).
pub struct RqTransformerAudio {
    /// Projects hidden_dim → num_codebooks * codebook_size.
    output_proj: Linear,
    config: RqTransformerConfig,
    device: Device,
}

impl std::fmt::Debug for RqTransformerAudio {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RqTransformerAudio")
            .field("config", &self.config)
            .finish()
    }
}

impl RqTransformerAudio {
    /// Load from VarBuilder with real weights. Prefix: rq_transformer / audio_head per LFM2-Audio-1.5B.
    pub fn load(vb: VarBuilder, config: RqTransformerConfig, device: &Device) -> Result<Self> {
        Self::build(vb, config, device)
    }

    /// Build from VarBuilder (e.g. VarBuilder::zeros for tests).
    pub fn load_with_vb(vb: VarBuilder, device: &Device) -> Result<Self> {
        Self::build(vb, RqTransformerConfig::default(), device)
    }

    /// Zero-weight constructor for tests.
    pub fn new_test(device: &Device) -> Result<Self> {
        let vb = VarBuilder::zeros(DType::F32, device);
        Self::build(vb.pp("audio_head"), RqTransformerConfig::default(), device)
    }

    fn build(vb: VarBuilder, config: RqTransformerConfig, device: &Device) -> Result<Self> {
        let out_features = config.num_codebooks * config.codebook_size;
        let output_proj = linear(config.hidden_dim, out_features, vb.pp("output_proj"))?;

        Ok(Self {
            output_proj,
            config,
            device: device.clone(),
        })
    }

    /// Forward: (batch, seq_len, hidden_dim) → codec IDs (batch, seq_len, num_codebooks) as I64.
    ///
    /// Projects hidden to logits, reshapes to per-codebook, and argmax to pick token IDs.
    pub fn forward(&self, hidden: &Tensor) -> Result<Tensor> {
        let (b, seq_len, _) = hidden.dims3()?;

        // Project: (batch, seq, hidden) → (batch, seq, num_codebooks * codebook_size)
        let logits = self.output_proj.forward(hidden)?;

        // Reshape: (batch, seq, num_codebooks, codebook_size)
        let logits = logits.reshape((
            b,
            seq_len,
            self.config.num_codebooks,
            self.config.codebook_size,
        ))?;

        // Argmax on last dim → codec IDs: (batch, seq, num_codebooks) as I64
        let ids = logits.argmax(D::Minus1)?;

        Ok(ids)
    }

    pub fn config(&self) -> &RqTransformerConfig {
        &self.config
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rq_config_default() {
        let cfg = RqTransformerConfig::default();
        assert_eq!(cfg.hidden_dim, 512);
        assert_eq!(cfg.num_codebooks, 8);
        assert_eq!(cfg.codebook_size, 2048);
    }

    #[test]
    fn test_rq_forward_shape() {
        let device = Device::Cpu;
        let rq = RqTransformerAudio::new_test(&device).unwrap();
        let hidden = Tensor::zeros(&[1, 100, 512], DType::F32, &device).unwrap();
        let ids = rq.forward(&hidden).unwrap();
        let dims = ids.dims();
        assert_eq!(dims, &[1, 100, 8]); // (batch, seq, codebooks)
        assert_eq!(ids.dtype(), DType::U32); // argmax returns U32 in Candle
    }

    #[test]
    fn test_rq_forward_with_nonzero_input() {
        let device = Device::Cpu;
        let rq = RqTransformerAudio::new_test(&device).unwrap();
        // Use ones instead of zeros to verify non-trivial path
        let hidden = Tensor::ones(&[2, 50, 512], DType::F32, &device).unwrap();
        let ids = rq.forward(&hidden).unwrap();
        let dims = ids.dims();
        assert_eq!(dims, &[2, 50, 8]); // batch=2
    }
}
