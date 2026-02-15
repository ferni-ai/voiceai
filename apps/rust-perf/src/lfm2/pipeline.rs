//! LFM2-Audio end-to-end STS pipeline (sub-100ms target).
//!
//! Pipeline: PCM in → FastConformer → LFM2 backbone → RQ-Transformer → codec IDs out.
//! Mimi decode (codec IDs → PCM) is external (moshi crate). See docs/plans/LFM2-AUDIO-CANDLE-PORT.md.

use candle_core::{Device, Result, Tensor};
use std::time::Instant;

use super::{FastConformerEncoder, Lfm2Backbone, RqTransformerAudio};

/// Per-component timing results from a forward pass.
#[derive(Debug, Clone)]
pub struct Lfm2PipelineTimings {
    pub encoder_ms: f64,
    pub backbone_ms: f64,
    pub audio_head_ms: f64,
    pub total_ms: f64,
}

/// End-to-end LFM2-Audio STS pipeline. Target: sub-100ms first-chunk latency.
#[derive(Debug)]
pub struct Lfm2StsPipeline {
    encoder: FastConformerEncoder,
    backbone: Lfm2Backbone,
    audio_head: RqTransformerAudio,
    device: Device,
}

impl Lfm2StsPipeline {
    /// Build pipeline from loaded encoder, backbone, and RQ-Transformer.
    pub fn new(
        encoder: FastConformerEncoder,
        backbone: Lfm2Backbone,
        audio_head: RqTransformerAudio,
        device: Device,
    ) -> Self {
        Self {
            encoder,
            backbone,
            audio_head,
            device,
        }
    }

    /// Build pipeline in test mode with zero weights on the given device.
    pub fn new_test_mode(device: &Device) -> Result<Self> {
        let encoder = FastConformerEncoder::new_test(device)?;
        let backbone = Lfm2Backbone::new_test(device)?;
        let audio_head = RqTransformerAudio::new_test(device)?;
        Ok(Self {
            encoder,
            backbone,
            audio_head,
            device: device.clone(),
        })
    }

    /// Forward: PCM (batch, samples) or (batch, channels, samples) → codec IDs (batch, seq, num_codebooks).
    ///
    /// Internally: encoder → backbone → audio_head. Mimi decode is external.
    pub fn forward(&self, pcm: &Tensor) -> Result<Tensor> {
        // Encoder: PCM → features (batch, T/sub, hidden_dim)
        let features = self.encoder.forward(pcm)?;

        // Backbone: features → hidden (batch, T/sub, hidden_dim)
        let hidden = self.backbone.forward(&features)?;

        // Audio head: hidden → codec IDs (batch, T/sub, num_codebooks)
        let codec_ids = self.audio_head.forward(&hidden)?;

        Ok(codec_ids)
    }

    /// Forward with per-component timing. Returns (codec_ids, timings).
    pub fn forward_timed(&self, pcm: &Tensor) -> Result<(Tensor, Lfm2PipelineTimings)> {
        let total_start = Instant::now();

        let enc_start = Instant::now();
        let features = self.encoder.forward(pcm)?;
        let encoder_ms = enc_start.elapsed().as_secs_f64() * 1000.0;

        let bb_start = Instant::now();
        let hidden = self.backbone.forward(&features)?;
        let backbone_ms = bb_start.elapsed().as_secs_f64() * 1000.0;

        let ah_start = Instant::now();
        let codec_ids = self.audio_head.forward(&hidden)?;
        let audio_head_ms = ah_start.elapsed().as_secs_f64() * 1000.0;

        let total_ms = total_start.elapsed().as_secs_f64() * 1000.0;

        let timings = Lfm2PipelineTimings {
            encoder_ms,
            backbone_ms,
            audio_head_ms,
            total_ms,
        };

        Ok((codec_ids, timings))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use candle_core::DType;

    #[test]
    fn test_pipeline_shape_chain() {
        let device = Device::Cpu;
        let pipeline = Lfm2StsPipeline::new_test_mode(&device).unwrap();

        // 1 second of 16kHz mono audio
        let pcm = Tensor::zeros(&[1, 16000], DType::F32, &device).unwrap();
        let codec_ids = pipeline.forward(&pcm).unwrap();

        let dims = codec_ids.dims();
        assert_eq!(dims.len(), 3);
        assert_eq!(dims[0], 1); // batch
        // Encoder subsampling: 16000 / 4 = 4000 frames
        assert_eq!(dims[1], 4000); // temporal frames
        assert_eq!(dims[2], 8); // num_codebooks
    }

    #[test]
    fn test_pipeline_timed() {
        let device = Device::Cpu;
        let pipeline = Lfm2StsPipeline::new_test_mode(&device).unwrap();
        let pcm = Tensor::zeros(&[1, 16000], DType::F32, &device).unwrap();
        let (codec_ids, timings) = pipeline.forward_timed(&pcm).unwrap();

        assert_eq!(codec_ids.dims(), &[1, 4000, 8]);
        assert!(timings.total_ms >= 0.0);
        assert!(timings.encoder_ms >= 0.0);
        assert!(timings.backbone_ms >= 0.0);
        assert!(timings.audio_head_ms >= 0.0);
    }

    #[test]
    fn test_pipeline_batch() {
        let device = Device::Cpu;
        let pipeline = Lfm2StsPipeline::new_test_mode(&device).unwrap();
        // Batch of 2
        let pcm = Tensor::zeros(&[2, 16000], DType::F32, &device).unwrap();
        let codec_ids = pipeline.forward(&pcm).unwrap();
        assert_eq!(codec_ids.dims(), &[2, 4000, 8]);
    }
}
