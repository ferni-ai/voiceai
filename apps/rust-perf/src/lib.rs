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
// Requires both candle_models (for candle-nn) AND napi (for NAPI bindings).
// Without dual gate, `cargo run --features server --no-default-features` fails
// because candle_router.rs has ungated `use napi::*` imports.
#[cfg(all(feature = "candle_models", feature = "napi"))]
mod candle_router;

// ============================================================================
// Candle ML model modules (behind "candle_models" feature flag)
// These add ~10K lines of Qwen3-Omni + LFM2 model code and pull in
// candle-nn, candle-transformers, safetensors, half dependencies.
// Disabled in Docker/GCE builds to reduce compile time and binary size.
// ============================================================================
#[cfg(feature = "candle_models")]
mod candle_moe;
#[cfg(feature = "candle_models")]
mod candle_thinker;
#[cfg(feature = "candle_models")]
mod candle_mel;
#[cfg(feature = "candle_models")]
mod candle_audio_encoder;
#[cfg(feature = "candle_models")]
mod candle_talker;
#[cfg(feature = "candle_models")]
mod candle_code2wav;
#[cfg(feature = "candle_models")]
pub mod full_omni_pipeline;
#[cfg(feature = "candle_models")]
pub mod lfm2;

// Voice biomarker extraction (pitch, jitter, shimmer, breathiness, speech rate)
pub mod voice_biomarkers;
// Post-TTS audio humanization DSP pipeline (breath injection, prosody, emotion coloring, fillers, texture, pacing)
pub mod humanization;

// Re-export ONNX router for FTIS V3 (CPU fallback)
#[cfg(feature = "napi")]
pub use onnx_router::*;

// Re-export Candle router for GPU-accelerated FTIS V3
#[cfg(all(feature = "candle_models", feature = "napi"))]
pub use candle_router::*;

// Re-export Candle model types (only when candle_models feature enabled)
#[cfg(feature = "candle_models")]
pub use candle_moe::*;
#[cfg(feature = "candle_models")]
pub use candle_thinker::*;
#[cfg(feature = "candle_models")]
pub use candle_mel::*;
#[cfg(feature = "candle_models")]
pub use candle_audio_encoder::*;
#[cfg(feature = "candle_models")]
pub use candle_talker::*;
#[cfg(feature = "candle_models")]
pub use candle_code2wav::*;
#[cfg(feature = "candle_models")]
pub use full_omni_pipeline::*;
#[cfg(feature = "candle_models")]
pub use lfm2::*;

// NAPI bindings (cosine_similarity, get_library_info, OnnxRouter, CandleRouter, etc.)
// Only compiled when feature "napi" is enabled so cargo test --no-default-features can run.
#[cfg(feature = "napi")]
mod napi_bindings;
#[cfg(feature = "napi")]
pub use napi_bindings::*;
