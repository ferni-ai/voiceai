//! # Candle Qwen3-TTS
//!
//! A Rust implementation of Qwen3-TTS text-to-speech model for the Candle ML framework.
//!
//! This crate provides:
//! - High-level model API (`model::Model`)
//! - Speaker encoder (ECAPA-TDNN based)
//! - Audio tokenizer (12Hz)
//!
//! ## Architecture Overview
//!
//! Qwen3-TTS uses a hierarchical generation approach:
//! 1. Text is processed through a talker model with multimodal RoPE
//! 2. The first codebook (semantic) is predicted by the main talker
//! 3. Remaining codebooks (acoustic) are predicted by a sub-talker (code predictor)
//! 4. All 32 codes are decoded to audio via the tokenizer
//!
//! ## Example
//!
//! ```no_run
//! use qwen_tts::model::loader::{ModelLoader, LoaderConfig};
//! use candle_core::Device;
//!
//! # fn main() -> Result<(), Box<dyn std::error::Error>> {
//! let loader = ModelLoader::from_local_dir("/path/to/model")?;
//! let model = loader.load_tts_model(&Device::Cpu, &LoaderConfig::default())?;
//! let result = model.generate_custom_voice_from_text(
//!     "Hello, world!",
//!     "vivian",
//!     "english",
//!     None,
//!     None,
//! )?;
//! # Ok(())
//! # }

pub mod audio;
pub mod config;
pub mod io;
pub mod model;
pub mod nn;
pub mod synthesis;
pub mod text;
