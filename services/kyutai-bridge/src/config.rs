//! Configuration for the Kyutai bridge.
//!
//! Supports:
//! - CLI arguments (clap)
//! - Environment variable overrides
//! - HuggingFace model repo IDs with automatic downloading
//! - Local model file paths

use clap::Parser;

/// Default HuggingFace repo for the main moshi model (safetensors).
pub const DEFAULT_MOSHI_HF_REPO: &str = "kyutai/moshiko-candle-bf16";

/// STT HuggingFace repo (used for stt_repo config field).
pub const DEFAULT_STT_HF_REPO: &str = "kyutai/stt-1b-en_fr";

/// STT audio constants.
pub const STT_BYTES_PER_BLOCK: usize = 1280 * 2; // 1280 samples @ 16k * 2 bytes (Int16)

/// ASR delay in tokens.
/// Default Kyutai value is 25 (~2s at 12.5fps). Lower = faster first output but slightly less accurate.
/// 5 tokens = ~400ms delay — good for real-time voice agent use.
pub const ASR_DELAY_IN_TOKENS: usize = 5;

/// Number of silence frames to feed after audio ends to flush the ASR delay pipeline.
/// Should be >= ASR_DELAY_IN_TOKENS + a few extra for Mimi codec latency.
pub const ASR_FLUSH_FRAMES: usize = 10;

/// ASR temperature (0 = greedy).
pub const ASR_TEMPERATURE: f64 = 0.0;

/// TTS generation temperature.
pub const TTS_TEMPERATURE: f64 = 0.6;

/// Maximum TTS steps (safety limit).
pub const TTS_MAX_STEPS: usize = 4096;

/// Number of Mimi codebooks for STT.
/// Moshi ASR configs all use 8 input audio codebooks (matching the LM's in_audio_codebooks).
pub const STT_MIMI_CODEBOOKS: usize = 8;

/// Number of Mimi codebooks for TTS (generated audio codebooks).
pub const TTS_MIMI_CODEBOOKS: usize = 8;

#[derive(Parser, Debug, Clone)]
#[command(name = "kyutai-bridge", about = "Kyutai DSM STT+TTS WebSocket bridge (Rust/Candle)")]
pub struct BridgeConfig {
    /// STT WebSocket port.
    #[arg(long, default_value_t = 8089, env = "KYUTAI_STT_PORT")]
    pub stt_port: u16,

    /// TTS WebSocket port.
    #[arg(long, default_value_t = 8090, env = "KYUTAI_TTS_PORT")]
    pub tts_port: u16,

    /// Bind address.
    #[arg(long, default_value = "127.0.0.1", env = "KYUTAI_BIND_ADDR")]
    pub bind_addr: String,

    /// Use CPU instead of GPU (Metal/CUDA).
    #[arg(long, default_value_t = false, env = "KYUTAI_CPU")]
    pub cpu: bool,

    /// HuggingFace repo for STT model.
    #[arg(long, default_value = DEFAULT_STT_HF_REPO, env = "KYUTAI_STT_REPO")]
    pub stt_repo: String,

    /// HuggingFace repo for the main moshi model (used for TTS LM).
    #[arg(long, default_value = DEFAULT_MOSHI_HF_REPO, env = "KYUTAI_MOSHI_REPO")]
    pub moshi_repo: String,

    /// Use GGUF quantized LM (e.g. model.q8.gguf from moshiko-candle-q8). Reduces VRAM (~4GB vs 15GB); enables T4.
    #[arg(long, default_value_t = false, env = "KYUTAI_USE_GGUF")]
    pub use_gguf: bool,

    /// Local path to LM model file (overrides HF download). Use .gguf path when KYUTAI_USE_GGUF=true.
    #[arg(long, env = "KYUTAI_LM_MODEL_FILE")]
    pub lm_model_file: Option<String>,

    /// Local path to Mimi model file (overrides HF download).
    #[arg(long, env = "KYUTAI_MIMI_MODEL_FILE")]
    pub mimi_model_file: Option<String>,

    /// Local path to text tokenizer file (overrides HF download).
    #[arg(long, env = "KYUTAI_TOKENIZER_FILE")]
    pub tokenizer_file: Option<String>,

    /// Enable full-duplex STS mode (load_streaming_both_ways). Single model for bidirectional audio; target ~160ms. Incompatible with separate STT/TTS.
    #[arg(long, default_value_t = false, env = "KYUTAI_FULL_DUPLEX")]
    pub full_duplex: bool,

    /// STT-only mode: skip TTS model loading to save ~14GB GPU memory.
    /// Use with an external TTS provider (e.g. Cartesia).
    #[arg(long, default_value_t = false, env = "KYUTAI_STT_ONLY")]
    pub stt_only: bool,

    /// Enable mock mode (no model loading; for protocol testing).
    #[arg(long, default_value_t = false, env = "KYUTAI_MOCK")]
    pub mock: bool,

    /// Log level (trace, debug, info, warn, error).
    #[arg(long, default_value = "info", env = "RUST_LOG")]
    pub log_level: String,
}

impl BridgeConfig {
    /// Whether to use real Candle inference.
    pub fn use_candle(&self) -> bool {
        !self.mock
    }
}
