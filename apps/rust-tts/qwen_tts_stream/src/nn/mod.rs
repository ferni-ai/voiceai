//! Model implementations for Qwen3-TTS.
//!
//! This module contains all the neural network components:
//! - Normalization (RMSNorm)
//! - Rotary Position Embeddings (standard and multimodal)
//! - Attention mechanisms
//! - MLP layers
//! - Decoder layers
//! - Speaker encoder (ECAPA-TDNN)
//! - Code predictor
//! - Talker model
//! - Top-level generation model

pub mod attention;
pub mod code_predictor;
pub mod decoder_layer;
pub mod generation;
pub mod generation_options;
pub mod generation_tests;
pub mod generation_utils;
pub mod kv_cache;
pub mod mlp;
pub mod mt_rng;
pub mod norm;
pub mod rope;
pub mod rope_scaling;
pub mod sampling;
pub mod speaker_encoder;
pub mod talker;
pub mod timing;
