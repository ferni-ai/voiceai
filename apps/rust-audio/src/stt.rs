//! Whisper STT (Speech-to-Text) via whisper-rs
//!
//! On-device transcription using Whisper GGML models.
//! Connects after the Pre-STT pipeline (AGC, noise suppression, bandwidth extension).
//! On macOS, uses Metal for 8-40x realtime on Apple Silicon.
//!
//! Model: ggml-base.en.bin (~142MB) or ggml-small.en.bin (~466MB) at 16 kHz mono f32.

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::{Arc, Mutex};

use whisper_rs::{
    FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperState,
};

/// STT engine: holds loaded Whisper context and state for transcription.
/// Thread-safe via Mutex for state (context is shared, state is per-call or pooled).
pub struct WhisperSttEngine {
    ctx: Arc<WhisperContext>,
}

impl WhisperSttEngine {
    /// Load Whisper model from path (GGML format, e.g. ggml-base.en.bin).
    pub fn new(model_path: &str) -> std::result::Result<Self, String> {
        let params = WhisperContextParameters::default();
        let ctx = WhisperContext::new_with_params(model_path, params)
            .map_err(|e| format!("Whisper load: {}", e))?;
        Ok(Self {
            ctx: Arc::new(ctx),
        })
    }

    /// Transcribe PCM f32 audio (16 kHz, mono). Returns full text.
    pub fn transcribe(&self, pcm: &[f32]) -> std::result::Result<String, String> {
        let mut state: WhisperState = self.ctx.create_state().map_err(|e| format!("Whisper state: {}", e))?;

        let strategy = SamplingStrategy::Greedy { best_of: 1 };
        let mut params = FullParams::new(strategy);
        params.set_n_threads(1);
        params.set_no_timestamps(true);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_translate(false);
        params.set_language(Some("en"));

        state.full(params, pcm).map_err(|e| format!("Whisper full: {}", e))?;

        let n = state.full_n_segments();
        let mut text = String::new();
        for i in 0..n {
            if let Some(seg) = state.get_segment(i) {
                if let Ok(s) = seg.to_str() {
                    text.push_str(s);
                }
            }
        }
        Ok(text.trim().to_string())
    }
}

/// NAPI: Optional STT config
#[napi(object)]
pub struct WhisperSttConfig {
    /// Path to GGML model (e.g. ggml-base.en.bin)
    pub model_path: String,
}

/// NAPI: Whisper STT engine for Node.js
/// Load once, then call transcribe() with Float32Array (16 kHz mono).
#[napi]
pub struct NativeWhisperStt {
    engine: Arc<Mutex<WhisperSttEngine>>,
}

#[napi]
impl NativeWhisperStt {
    #[napi(constructor)]
    pub fn new(config: WhisperSttConfig) -> napi::Result<Self> {
        let engine = match WhisperSttEngine::new(&config.model_path) {
            Ok(e) => e,
            Err(e) => return Err(napi::Error::from_reason(e.as_str())),
        };
        Ok(Self {
            engine: Arc::new(Mutex::new(engine)),
        })
    }

    /// Transcribe Float32Array PCM (16 kHz, mono). Returns transcript text.
    #[napi]
    pub fn transcribe(&self, pcm: Float32Array) -> napi::Result<String> {
        let slice = pcm.as_ref();
        let engine = self
            .engine
            .lock()
            .map_err(|e| napi::Error::from_reason(format!("Lock: {}", e)))?;
        match engine.transcribe(slice) {
            Ok(s) => Ok(s),
            Err(e) => Err(napi::Error::from_reason(e.as_str())),
        }
    }
}

/// One-shot transcribe: load model, transcribe, return text.
/// Prefer NativeWhisperStt when transcribing multiple chunks.
#[napi]
pub fn transcribe_whisper(model_path: String, pcm: Float32Array) -> napi::Result<String> {
    let engine = match WhisperSttEngine::new(&model_path) {
        Ok(e) => e,
        Err(e) => return Err(napi::Error::from_reason(e.as_str())),
    };
    match engine.transcribe(pcm.as_ref()) {
        Ok(s) => Ok(s),
        Err(e) => Err(napi::Error::from_reason(e.as_str())),
    }
}
