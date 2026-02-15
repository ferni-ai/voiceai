//! LFM2-Audio Candle port (sub-100ms STS).
//!
//! Port of Liquid AI LFM2-Audio-1.5B: FastConformer encoder + LFM2 backbone + RQ-Transformer output.
//! Mimi codec is reused from the moshi/Kyutai stack. See docs/plans/LFM2-AUDIO-CANDLE-PORT.md.

mod fast_conformer;
mod lfm2_backbone;
mod pipeline;
mod rq_transformer;

pub use fast_conformer::{FastConformerConfig, FastConformerEncoder};
pub use lfm2_backbone::{Lfm2Backbone, Lfm2BackboneConfig};
pub use pipeline::{Lfm2PipelineTimings, Lfm2StsPipeline};
pub use rq_transformer::{RqTransformerAudio, RqTransformerConfig};
