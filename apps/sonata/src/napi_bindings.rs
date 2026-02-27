//! NAPI bindings for Sonata STT/TTS engines.
//!
//! Exports SonataSTT and SonataTTS classes to Node.js via NAPI-RS.
//! Only compiled when the "napi" feature is enabled.

use napi::bindgen_prelude::*;
use napi_derive::napi;

use crate::stt::SttEngine;
use crate::tts::TtsEngine;

// ─── SonataSTT ──────────────────────────────────────────────────────────────────

/// Speech-to-text engine using Kyutai Moshi STT 1B on Metal GPU.
/// Processes 80ms audio frames (1920 samples at 24kHz) and returns text.
#[napi]
pub struct SonataSTT {
    engine: SttEngine,
}

#[napi]
impl SonataSTT {
    /// Create a new STT engine. Downloads model from HuggingFace on first call (~1.5GB).
    /// Requires Apple Silicon with Metal GPU.
    ///
    /// @param hf_repo - HuggingFace model repo (default: "kyutai/stt-1b-en_fr-candle")
    /// @param model_path - Model file within repo (default: "model.safetensors")
    /// @param enable_vad - Enable semantic VAD for silence detection
    #[napi(factory)]
    pub fn create(
        hf_repo: String,
        model_path: Option<String>,
        enable_vad: bool,
    ) -> Result<Self> {
        let engine = SttEngine::create(
            &hf_repo,
            model_path.as_deref(),
            enable_vad,
        )
        .map_err(|e| Error::new(Status::GenericFailure, e))?;

        Ok(SonataSTT { engine })
    }

    /// Process one frame of PCM audio (Float32Array, 24kHz, mono).
    /// Recommended: 1920 samples per frame (80ms).
    /// Returns the number of recognized words from this frame.
    #[napi]
    pub fn process_frame(&mut self, pcm: Float32Array) -> Result<i32> {
        self.engine
            .process_frame(&pcm)
            .map_err(|e| Error::new(Status::GenericFailure, e))
    }

    /// Flush remaining text after speech ends. Feeds silence to extract
    /// any pending words from the model's internal delay.
    /// Returns the number of words.
    #[napi]
    pub fn flush(&mut self) -> Result<i32> {
        self.engine
            .flush()
            .map_err(|e| Error::new(Status::GenericFailure, e))
    }

    /// Get all recognized text from the last process_frame/flush call.
    #[napi]
    pub fn get_all_text(&self) -> Result<String> {
        self.engine
            .get_all_text()
            .map_err(|e| Error::new(Status::GenericFailure, e))
    }

    /// Get semantic VAD probability for a time horizon.
    /// Horizons: 0=0.5s, 1=1.0s, 2=2.0s, 3=3.0s
    /// Returns probability of NO voice activity (higher = more likely silent).
    /// Returns -1.0 if VAD is not enabled.
    #[napi]
    pub fn get_vad_prob(&self, horizon: i32) -> f64 {
        self.engine.get_vad_prob(horizon) as f64
    }

    /// Reset streaming state for a new utterance.
    #[napi]
    pub fn reset(&mut self) {
        self.engine.reset();
    }

    /// Returns the expected frame size in samples (1920 = 80ms at 24kHz).
    #[napi]
    pub fn frame_size() -> i32 {
        SttEngine::frame_size()
    }

    /// Returns the expected sample rate in Hz (24000).
    #[napi]
    pub fn sample_rate() -> i32 {
        SttEngine::sample_rate()
    }
}

// ─── SonataTTS ──────────────────────────────────────────────────────────────────

/// Text-to-speech engine using Kyutai DSM TTS 1.6B on Metal GPU.
/// Generates 80ms audio frames (1920 samples at 24kHz) per step.
/// Supports streaming: feed text incrementally, call step() to generate audio.
#[napi]
pub struct SonataTTS {
    engine: TtsEngine,
}

#[napi]
impl SonataTTS {
    /// Create a new TTS engine. Downloads model from HuggingFace on first call (~3GB).
    /// Requires Apple Silicon with Metal GPU.
    ///
    /// @param hf_repo - HuggingFace model repo (default: "kyutai/tts-1.6b-en_fr")
    /// @param voice_path - Path to voice .wav or .safetensors for voice cloning (optional)
    /// @param n_q - Number of audio codebooks (8-32, default: 24)
    #[napi(factory)]
    pub fn create(
        hf_repo: String,
        voice_path: Option<String>,
        n_q: Option<i32>,
    ) -> Result<Self> {
        let engine = TtsEngine::create(&hf_repo, voice_path.as_deref(), n_q)
            .map_err(|e| Error::new(Status::GenericFailure, e))?;

        Ok(SonataTTS { engine })
    }

    /// Feed text for synthesis. Can be called multiple times as LLM tokens arrive.
    /// Text is tokenized and queued internally.
    #[napi]
    pub fn set_text(&mut self, text: String) -> Result<()> {
        self.engine
            .set_text(&text)
            .map_err(|e| Error::new(Status::GenericFailure, e))
    }

    /// Signal that all text has been provided. The engine will generate
    /// remaining audio and drain to completion.
    #[napi]
    pub fn set_text_done(&mut self) -> Result<()> {
        self.engine
            .set_text_done()
            .map_err(|e| Error::new(Status::GenericFailure, e))
    }

    /// Run one generation step. Produces ~80ms of audio per step (at 12.5 Hz).
    /// This is a blocking call that runs Metal GPU inference.
    /// Returns true if generation is complete.
    #[napi]
    pub fn step(&mut self) -> Result<bool> {
        self.engine
            .step()
            .map_err(|e| Error::new(Status::GenericFailure, e))
    }

    /// Read decoded PCM audio from the output buffer.
    /// Returns a Float32Array with up to max_samples samples.
    #[napi]
    pub fn get_audio(&mut self, max_samples: i32) -> Result<Float32Array> {
        let mut buf = vec![0f32; max_samples as usize];
        let n_read = self
            .engine
            .get_audio(&mut buf)
            .map_err(|e| Error::new(Status::GenericFailure, e))?;
        buf.truncate(n_read);
        Ok(Float32Array::new(buf))
    }

    /// Returns true if generation is complete.
    #[napi]
    pub fn is_done(&self) -> bool {
        self.engine.is_done()
    }

    /// Reset the engine for a new utterance. Clears all queued text and audio.
    /// Voice conditioning (if loaded) is preserved across resets.
    #[napi]
    pub fn reset(&mut self) -> Result<()> {
        self.engine
            .reset()
            .map_err(|e| Error::new(Status::GenericFailure, e))
    }

    /// Returns the output frame size in samples (1920 = 80ms at 24kHz).
    #[napi]
    pub fn frame_size() -> i32 {
        TtsEngine::frame_size()
    }

    /// Returns the output sample rate in Hz (24000).
    #[napi]
    pub fn sample_rate() -> i32 {
        TtsEngine::sample_rate()
    }
}
