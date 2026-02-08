//! # Ferni Performance Library
//!
//! SIMD-optimized operations for Ferni voice agent.
//! Called from Node.js via NAPI-RS bindings.
//!
//! ## Features
//! - Cosine similarity (SIMD-accelerated)
//! - Text similarity (Jaccard with k-shingles)
//! - Batch similarity operations (parallel)
//! - LSH for near-duplicate detection
//! - SIMD-accelerated JSON parsing (tool-call-sanitizer)
//! - SSML pattern extraction and manipulation
//! - Aho-Corasick multi-pattern matching (O(n) for all patterns)

mod embedding_cache;
mod fft_analyzer;
mod fluency_analyzer;
mod json_parser;
#[cfg(feature = "napi")]
mod onnx_router;
mod signal_extractor;
mod ssml_processor;
mod token_counter;
mod turn_analyzer;

// Candle GPU router (Metal acceleration for Apple Silicon)
#[cfg(feature = "napi")]
mod candle_router;
// Shared MoE building blocks (Thinker + Talker)
mod candle_moe;
// Qwen3-Omni Thinker (MoE, Metal, generation)
mod candle_thinker;
// Mel spectrogram for Qwen3-Omni Audio Encoder (AuT)
mod candle_mel;
// Qwen3-Omni Audio Encoder (AuT)
mod candle_audio_encoder;
// Qwen3-Omni Talker (text decoder + code predictor)
mod candle_talker;
// Qwen3-Omni Code2Wav (codec -> waveform)
mod candle_code2wav;
// Full Qwen3-Omni audio-to-audio pipeline
mod full_omni_pipeline;

// Re-export ONNX router for FTIS V3 (CPU fallback)
#[cfg(feature = "napi")]
pub use onnx_router::*;

// Re-export Candle router for GPU-accelerated FTIS V3
#[cfg(feature = "napi")]
pub use candle_router::*;

// Re-export shared MoE types (used by Thinker/Talker)
pub use candle_moe::*;
// Re-export Candle Thinker for Qwen3-Omni generation
pub use candle_thinker::*;
// Re-export mel spectrogram for AuT pipeline
pub use candle_mel::*;
// Re-export Audio Encoder for full Omni pipeline
pub use candle_audio_encoder::*;
// Re-export Talker for full Omni pipeline
pub use candle_talker::*;
// Re-export Code2Wav for full Omni pipeline
pub use candle_code2wav::*;
// Re-export full Omni pipeline for rust-omni
pub use full_omni_pipeline::*;

// NAPI bindings (cosine_similarity, get_library_info, OnnxRouter, CandleRouter, etc.)
// Only compiled when feature "napi" is enabled so cargo test --no-default-features can run.
#[cfg(feature = "napi")]
mod napi_bindings;
#[cfg(feature = "napi")]
pub use napi_bindings::*;
