//! Sonata — NAPI bindings for pocket-voice STT/TTS on Apple Silicon.
//!
//! Wraps pocket-voice's C FFI (libpocket_stt + libpocket_tts_rs) in safe Rust
//! structs, then exports to Node.js via NAPI-RS.
//!
//! Architecture:
//!   Node.js → NAPI → Safe Rust wrappers → C FFI → pocket-voice (candle + Metal)

pub mod ffi;
mod stt;
mod tts;

// NAPI exports (only when building as cdylib for Node.js)
#[cfg(feature = "napi")]
mod napi_bindings;
