//! # ferni-mlx-omni
//!
//! Qwen3-Omni on Apple MLX (Rust) — full audio-to-audio pipeline.
//!
//! ## Architecture
//!
//! ```text
//! Audio (16kHz) → Mel → AuT Encoder → Thinker (MoE, layer 18 hidden)
//!                                          ↓
//!                                      Talker (20 MoE + 5 dense)
//!                                          ↓
//!                                      Code2Wav (8-layer + ConvNet 480x)
//!                                          ↓
//!                                      Waveform (24kHz)
//! ```
//!
//! ## Backend
//!
//! Uses [`mlx-rs`](https://github.com/oxideai/mlx-rs) for Apple MLX (Metal GPU, unified memory).
//! **Apple Silicon only** — for Linux/GCE, use the Candle backend (`apps/rust-perf`).
//!
//! ## References
//!
//! - Python MLX implementation: `apps/mlx-qwen3-omni/src/mlx_qwen3_omni/`
//! - Candle implementation: `apps/rust-perf/src/candle_*.rs`
//! - Architecture: Qwen3-Omni technical report (arXiv:2509.17765)

pub mod config;
pub mod mel;
pub mod audio_encoder;
pub mod thinker;
pub mod talker;
pub mod code2wav;
pub mod pipeline;
pub mod conversion;
pub mod generate;
