//! NAPI bindings for OmniEngine: transcribe → think → speak.

use ferni_audio::{NativeWhisperStt, WhisperSttConfig};
use ferni_perf::{CandleThinker, CandleThinkerConfig, FullOmniPipeline};
use ferni_tts_core::audio::AudioFormat;
use ferni_tts_core::synthesis::{MockSynthesisClient, SynthesisRequest};
use napi::bindgen_prelude::*;
use napi::JsUnknown;
use napi::NapiValue;
use napi_derive::napi;
use std::sync::Arc;
use tokio::runtime::Runtime;

/// Per-stage timing metrics for the Omni pipeline.
#[napi(object)]
pub struct OmniTimings {
    pub mel_ms: f64,
    pub encoder_ms: f64,
    pub thinker_ms: f64,
    pub talker_ms: f64,
    pub code2wav_ms: f64,
    pub total_ms: f64,
}

/// Configuration for the Omni engine.
/// Optional paths: omit to disable STT or Thinker; TTS always uses Mock.
#[napi(object)]
pub struct OmniConfig {
    /// Path to Whisper GGML model (e.g. ggml-base.en.bin). Omit to disable STT.
    pub whisper_model_path: Option<String>,

    /// Path to Thinker model directory (safetensors + config). Omit to disable Thinker.
    pub thinker_model_path: Option<String>,

    /// Path to Thinker tokenizer (tokenizer.json). Omit to disable Thinker.
    pub thinker_tokenizer_path: Option<String>,

    /// Max new tokens for Thinker generation (default 256).
    pub thinker_max_tokens: Option<u32>,

    /// Temperature for Thinker (default 0.6).
    pub thinker_temperature: Option<f64>,

    /// If true, load full Qwen3-Omni pipeline and enable process_audio_omni (audio→audio, no Whisper/TTS).
    pub use_full_omni: Option<bool>,

    /// When true, build full Omni pipeline with zero weights (no checkpoint). For tests and shape validation.
    pub test_mode: Option<bool>,
}

/// Unified Omni engine: STT (Whisper) + Thinker (Candle MoE) + TTS (Mock); optional full audio→audio.
/// Call transcribe() → generate() → speak() for full pipeline, or process_audio_omni() when use_full_omni.
#[napi]
pub struct OmniEngine {
    stt: Option<NativeWhisperStt>,
    thinker: Option<CandleThinker>,
    full_omni_pipeline: Option<FullOmniPipeline>,
    tts_client: Arc<dyn ferni_tts_core::synthesis::SynthesisClient + Send + Sync>,
    rt: Runtime,
}

#[napi]
impl OmniEngine {
    #[napi(constructor)]
    pub fn new(config: OmniConfig) -> napi::Result<Self> {
        let stt = config
            .whisper_model_path
            .as_ref()
            .map(|path| {
                NativeWhisperStt::new(WhisperSttConfig {
                    model_path: path.clone(),
                })
            })
            .transpose()?;

        let use_full_omni = config.use_full_omni.unwrap_or(false);
        let test_mode = config.test_mode.unwrap_or(false);
        let (thinker, full_omni_pipeline) = if use_full_omni && test_mode {
            let pipeline = FullOmniPipeline::new_test_mode_cpu()
                .map_err(|e| napi::Error::from_reason(e.to_string()))?;
            (None, Some(pipeline))
        } else if let (Some(model_path), Some(tokenizer_path)) =
            (&config.thinker_model_path, &config.thinker_tokenizer_path)
        {
            if use_full_omni {
                let pipeline = FullOmniPipeline::load_from_dir(model_path, tokenizer_path)
                    .map_err(|e| napi::Error::from_reason(e.to_string()))?;
                (None, Some(pipeline))
            } else {
                let cfg = CandleThinkerConfig {
                    model_path: model_path.clone(),
                    tokenizer_path: tokenizer_path.clone(),
                    max_new_tokens: config.thinker_max_tokens,
                    temperature: config.thinker_temperature,
                };
                (Some(CandleThinker::new(cfg)?), None)
            }
        } else {
            (None, None)
        };

        let tts_client: Arc<dyn ferni_tts_core::synthesis::SynthesisClient + Send + Sync> =
            Arc::new(MockSynthesisClient::new());

        let rt = Runtime::new().map_err(|e| napi::Error::from_reason(e.to_string()))?;

        Ok(Self {
            stt,
            thinker,
            full_omni_pipeline,
            tts_client,
            rt,
        })
    }

    /// Transcribe audio (Float32Array, 16 kHz mono) to text via Whisper.
    #[napi]
    pub fn transcribe(&self, audio: Float32Array) -> napi::Result<String> {
        let stt = self
            .stt
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("STT not configured: set whisper_model_path"))?;
        stt.transcribe(audio)
    }

    /// Generate text from prompt via Candle Thinker (MoE).
    #[napi]
    pub fn generate(&self, prompt: String) -> napi::Result<String> {
        let thinker = self
            .thinker
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Thinker not configured: set thinker_model_path and thinker_tokenizer_path"))?;
        thinker.generate(prompt)
    }

    /// Synthesize text to speech (Float32Array) via TTS core (Mock).
    #[napi]
    pub fn speak(&self, text: String) -> napi::Result<Float32Array> {
        let client = Arc::clone(&self.tts_client);
        let request = SynthesisRequest::new(text)
            .with_voice("ferni")
            .with_format(AudioFormat {
                sample_rate: 24000,
                bits_per_sample: 16,
                channels: 1,
            });

        let response = self
            .rt
            .block_on(client.synthesize(request))
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;

        // Core Mock returns PCM i16 as bytes (LE); convert to f32 for NAPI
        let bytes = response.audio;
        let mut samples = Vec::with_capacity(bytes.len() / 2);
        for chunk in bytes.chunks(2) {
            if chunk.len() == 2 {
                let s = i16::from_le_bytes([chunk[0], chunk[1]]);
                samples.push(s as f32 / 32768.0);
            }
        }
        Ok(Float32Array::new(samples))
    }

    /// Full Qwen3-Omni: raw audio (16 kHz mono f32) → waveform (24 kHz f32). No Whisper, no external TTS.
    /// Requires use_full_omni true and thinker_model_path + thinker_tokenizer_path set (or test_mode true).
    #[napi]
    pub fn process_audio_omni(&self, audio: Float32Array) -> napi::Result<Float32Array> {
        let pipeline = self
            .full_omni_pipeline
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Full Omni not configured: set use_full_omni and thinker paths or test_mode"))?;
        let samples = audio.as_ref();
        let out = pipeline
            .process_audio(samples)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        Ok(Float32Array::new(out))
    }

    /// Streaming: run pipeline and invoke callback for each audio chunk (24 kHz f32).
    /// Returns per-stage timings when done.
    #[napi]
    pub fn process_audio_omni_streaming(
        &self,
        env: Env,
        audio: Float32Array,
        callback: JsFunction,
    ) -> napi::Result<OmniTimings> {
        let pipeline = self
            .full_omni_pipeline
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Full Omni not configured: set use_full_omni and thinker paths or test_mode"))?;
        let samples = audio.as_ref();
        let (rx, t) = pipeline
            .process_audio_streaming(samples)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        while let Ok(chunk) = rx.recv() {
            let arr = Float32Array::new(chunk.samples);
            let napi_val = unsafe {
                ToNapiValue::to_napi_value(env.raw(), arr).map_err(|e| napi::Error::from_reason(e.to_string()))?
            };
            let unknown = unsafe { JsUnknown::from_raw_unchecked(env.raw(), napi_val) };
            callback.call(None, &[unknown])?;
        }
        Ok(OmniTimings {
            mel_ms: t.mel_ms,
            encoder_ms: t.encoder_ms,
            thinker_ms: t.thinker_ms,
            talker_ms: t.talker_ms,
            code2wav_ms: t.code2wav_ms,
            total_ms: t.total_ms,
        })
    }

    /// Same as process_audio_omni but returns per-stage timing metrics.
    #[napi]
    pub fn process_audio_omni_timed(&self, audio: Float32Array) -> napi::Result<OmniTimings> {
        let pipeline = self
            .full_omni_pipeline
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Full Omni not configured: set use_full_omni and thinker paths or test_mode"))?;
        let samples = audio.as_ref();
        let (_out, t) = pipeline
            .process_audio_timed(samples)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        Ok(OmniTimings {
            mel_ms: t.mel_ms,
            encoder_ms: t.encoder_ms,
            thinker_ms: t.thinker_ms,
            talker_ms: t.talker_ms,
            code2wav_ms: t.code2wav_ms,
            total_ms: t.total_ms,
        })
    }

    /// Input sample rate for the Omni pipeline (16 kHz).
    #[napi(getter)]
    pub fn sample_rate_in(&self) -> u32 {
        16000
    }

    /// Output sample rate for the Omni pipeline (24 kHz).
    #[napi(getter)]
    pub fn sample_rate_out(&self) -> u32 {
        self.full_omni_pipeline
            .as_ref()
            .map(|p| p.sample_rate_out())
            .unwrap_or(24000)
    }

    /// True if the full Omni pipeline is loaded and ready for process_audio_omni.
    #[napi(getter)]
    pub fn is_ready(&self) -> bool {
        self.full_omni_pipeline.is_some()
    }
}
