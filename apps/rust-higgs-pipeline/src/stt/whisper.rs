//! Whisper STT Engine — GGML-based speech recognition.
//! Adapted from rust-audio/src/stt.rs (NAPI wrappers removed).

use anyhow::Result;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

pub struct WhisperSttEngine {
    ctx: WhisperContext,
}

impl WhisperSttEngine {
    /// Load Whisper model from path (GGML format, e.g. ggml-base.en.bin).
    pub fn new(model_path: &str) -> Result<Self> {
        let params = WhisperContextParameters::default();
        let ctx = WhisperContext::new_with_params(model_path, params)
            .map_err(|e| anyhow::anyhow!("Whisper load: {}", e))?;
        Ok(Self { ctx })
    }

    /// Transcribe PCM f32 audio (16 kHz, mono). Returns full text.
    pub fn transcribe(&self, pcm: &[f32]) -> Result<String> {
        let mut state = self
            .ctx
            .create_state()
            .map_err(|e| anyhow::anyhow!("Whisper state: {}", e))?;

        let strategy = SamplingStrategy::Greedy { best_of: 1 };
        let mut params = FullParams::new(strategy);
        params.set_n_threads(1);
        params.set_no_timestamps(true);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_translate(false);
        params.set_language(Some("en"));

        state
            .full(params, pcm)
            .map_err(|e| anyhow::anyhow!("Whisper full: {}", e))?;

        let n = state.full_n_segments();
        let mut text = String::new();
        for i in 0..n {
            if let Some(segment) = state.get_segment(i) {
                if let Ok(s) = segment.to_str_lossy() {
                    text.push_str(&s);
                }
            }
        }
        Ok(text.trim().to_string())
    }
}
