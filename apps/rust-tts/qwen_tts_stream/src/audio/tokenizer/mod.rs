//! 12Hz Audio Tokenizer (V2).
//!
//! This tokenizer converts between audio waveforms and discrete codes at 12.5Hz.
//! It consists of:
//! - Encoder (based on Mimi): Audio → Codes
//! - Decoder: Codes → Audio
//!
//! The decoder uses:
//! - Split Residual Vector Quantizer for dequantization
//! - ConvNeXt blocks for upsampling
//! - Transformer for sequence modeling
//! - Snake activation-based vocoder

pub mod v2;
pub mod wrapper;
