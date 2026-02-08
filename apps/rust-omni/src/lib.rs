//! # Ferni Omni - Unified STT + Thinker + TTS
//!
//! Single Rust binary/library: transcribe (Whisper) → think (Candle MoE) → speak (ferni-tts-core).
//! NAPI bindings for Node.js voice agent integration.

mod napi;

pub use napi::{OmniConfig, OmniEngine, OmniTimings};
