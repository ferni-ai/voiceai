//! Voice Pipeline Orchestrator.
//!
//! Coordinates all ML models and DSP processing:
//!   - **Transcribe path**: Pre-STT DSP → Whisper STT → Biomarkers (parallel)
//!   - **Synthesize path**: Higgs TTS (persistent KV cache) → xCodec decode → Humanization DSP
//!   - **Streaming synthesis**: Sentence-level streaming via `synthesize_streaming()` with lightweight humanization
//!
//! All GPU-bound work runs via `spawn_blocking` to keep the async runtime free.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::Mutex;

use anyhow::{Context, Result};
use candle_core::{DType, Device};
use candle_nn::VarBuilder;
use tokenizers::Tokenizer;
use tracing::{debug, info, warn};

use crate::analysis::biomarkers;
use crate::audio::{self, STT_SAMPLE_RATE, TTS_SAMPLE_RATE};
use crate::dsp::{self, HumanizationContext};
use crate::protocol::{HumanizationInfo, VoiceBiomarkers};
use crate::stt::pre_stt::PreSTTProcessor;
use crate::stt::whisper::WhisperSttEngine;
use crate::tts::config::HiggsAudioConfig;
use crate::tts::decoder::XcodecDecoder;
use crate::tts::generation::{self, GenerationConfig};
use crate::tts::model::HiggsAudioModel;

/// Maximum KV cache tokens before forced reset.
/// Controls when to reset the persistent KV cache that provides
/// cross-turn conversation context.
const MAX_CONTEXT_TOKENS: usize = 8192;

/// Configuration for pipeline initialization.
#[derive(Debug, Clone)]
pub struct PipelineConfig {
    /// Path to Higgs Audio V2 model weights directory.
    pub higgs_model_path: Option<String>,
    /// Path to Whisper GGML model file.
    pub whisper_model_path: Option<String>,
    /// Path to xCodec ONNX model file.
    pub xcodec_model_path: Option<String>,
}

/// Result of a transcription request.
#[derive(Debug, Clone)]
pub struct TranscribeResult {
    pub text: String,
    pub biomarkers: Option<VoiceBiomarkers>,
    pub latency_ms: u64,
}

/// Result of a synthesis request.
#[derive(Debug, Clone)]
pub struct SynthesizeResult {
    /// Humanized audio as i16 LE PCM at 24kHz.
    pub audio_i16: Vec<i16>,
    /// How many KV cache tokens are now used (for session tracking).
    pub kv_cache_tokens: usize,
    /// Duration of the generated audio in milliseconds.
    pub duration_ms: u64,
    /// Humanization metadata for the client.
    pub humanization: HumanizationInfo,
}

/// Parameters for TTS generation tuned per emotion.
#[derive(Debug, Clone)]
pub struct EmotionParams {
    pub temperature: f32,
    pub top_k: usize,
    pub repetition_penalty: f32,
}

/// Configurable emotion-to-generation-parameter mapping.
#[derive(Debug, Clone)]
pub struct EmotionConfig {
    pub mappings: HashMap<String, EmotionParams>,
}

impl Default for EmotionConfig {
    fn default() -> Self {
        let mut mappings = HashMap::new();
        mappings.insert("gentle".into(), EmotionParams { temperature: 0.25, top_k: 30, repetition_penalty: 1.0 });
        mappings.insert("whisper".into(), EmotionParams { temperature: 0.2, top_k: 25, repetition_penalty: 1.0 });
        mappings.insert("serious".into(), EmotionParams { temperature: 0.3, top_k: 40, repetition_penalty: 1.1 });
        mappings.insert("playful".into(), EmotionParams { temperature: 0.45, top_k: 60, repetition_penalty: 1.0 });
        mappings.insert("empathetic".into(), EmotionParams { temperature: 0.3, top_k: 35, repetition_penalty: 1.0 });
        mappings.insert("excited".into(), EmotionParams { temperature: 0.5, top_k: 70, repetition_penalty: 1.0 });
        Self { mappings }
    }
}

/// The unified voice pipeline.
///
/// Holds loaded ML models behind Arc for sharing across sessions.
/// Models are loaded once at startup and reused for all sessions.
/// Per-session state (KV cache) is tracked by SessionManager.
pub struct VoicePipeline {
    /// Whisper STT engine (None if model not loaded).
    stt_engine: Option<Arc<WhisperSttEngine>>,
    /// Pre-STT DSP processor (always available).
    pre_stt: Arc<Mutex<PreSTTProcessor>>,
    /// Higgs Audio V2 model (Mutex because generate needs &mut self).
    tts_model: Option<Arc<Mutex<HiggsAudioModel>>>,
    /// HuggingFace tokenizer for text→token conversion.
    tokenizer: Option<Arc<Tokenizer>>,
    /// xCodec ONNX decoder (codes→PCM).
    xcodec: Option<Arc<XcodecDecoder>>,
    /// Generation parameters (temperature, top_k, etc.).
    gen_config: Arc<GenerationConfig>,
    /// Compute device (Metal GPU or CPU). Stored for future per-request GPU management.
    _device: Device,
    /// STT sample rate (Whisper uses 16kHz).
    stt_sample_rate: u32,
    /// Whether STT is available (Whisper model loaded).
    stt_available: bool,
    /// Whether TTS is available (Higgs + xCodec models loaded).
    tts_available: bool,
    /// Emotion-to-generation-parameter mapping for TTS generation.
    pub emotion_config: EmotionConfig,
}

impl VoicePipeline {
    /// Initialize the pipeline, loading models as available.
    ///
    /// Models are optional — the server starts even if model files aren't present.
    /// Individual operations will return errors if their required model isn't loaded.
    pub async fn new(config: PipelineConfig) -> Result<Self> {
        let mut stt_available = false;
        let mut tts_available = false;

        // Select device: prefer Metal GPU, fallback to CPU
        let device = match Device::new_metal(0) {
            Ok(d) => {
                info!("Using Metal GPU");
                d
            }
            Err(e) => {
                warn!(error = %e, "Metal GPU not available, falling back to CPU");
                Device::Cpu
            }
        };

        // Pre-STT processor is always available (pure DSP, no model files)
        let pre_stt = Arc::new(Mutex::new(PreSTTProcessor::with_defaults()));

        // Generation config with sensible defaults
        let gen_config = Arc::new(GenerationConfig::default());

        // ── Load Whisper STT model ──────────────────────────────
        let stt_engine = if let Some(ref path) = config.whisper_model_path {
            info!(path = %path, "Loading Whisper STT model...");
            match WhisperSttEngine::new(path) {
                Ok(engine) => {
                    info!("Whisper STT model loaded successfully");
                    stt_available = true;
                    Some(Arc::new(engine))
                }
                Err(e) => {
                    warn!(error = %e, "Failed to load Whisper STT model — STT disabled");
                    None
                }
            }
        } else {
            info!("No Whisper model path configured — STT disabled");
            None
        };

        // ── Load Higgs Audio V2 TTS model ───────────────────────
        let (tts_model, tokenizer, xcodec) = if let Some(ref model_dir) = config.higgs_model_path {
            let model_path = Path::new(model_dir);
            info!(path = %model_dir, "Loading Higgs Audio V2 model...");

            match load_tts_models(model_path, &config.xcodec_model_path, &device) {
                Ok((model, tok, decoder)) => {
                    info!("Higgs Audio V2 TTS model loaded successfully");
                    tts_available = true;
                    (
                        Some(Arc::new(Mutex::new(model))),
                        Some(Arc::new(tok)),
                        Some(Arc::new(decoder)),
                    )
                }
                Err(e) => {
                    warn!(error = %e, "Failed to load Higgs TTS model — TTS disabled");
                    (None, None, None)
                }
            }
        } else {
            info!("No Higgs model path configured — TTS disabled");
            (None, None, None)
        };

        info!(
            stt = stt_available,
            tts = tts_available,
            device = ?device,
            "Voice pipeline initialized"
        );

        Ok(Self {
            stt_engine,
            pre_stt,
            tts_model,
            tokenizer,
            xcodec,
            gen_config,
            _device: device,
            stt_sample_rate: STT_SAMPLE_RATE,
            stt_available,
            tts_available,
            emotion_config: EmotionConfig::default(),
        })
    }

    /// Create a stub pipeline for testing (no models loaded).
    pub fn stub() -> Self {
        Self {
            stt_engine: None,
            pre_stt: Arc::new(Mutex::new(PreSTTProcessor::with_defaults())),
            tts_model: None,
            tokenizer: None,
            xcodec: None,
            gen_config: Arc::new(GenerationConfig::default()),
            _device: Device::Cpu,
            stt_sample_rate: STT_SAMPLE_RATE,
            stt_available: false,
            tts_available: false,
            emotion_config: EmotionConfig::default(),
        }
    }

    pub fn stt_available(&self) -> bool {
        self.stt_available
    }

    pub fn tts_available(&self) -> bool {
        self.tts_available
    }

    /// Transcribe audio: Pre-STT DSP → Whisper → Biomarkers.
    ///
    /// Runs STT and biomarker extraction in parallel since both
    /// are read-only operations on the same audio data.
    pub async fn transcribe(&self, audio_i16: Vec<i16>) -> Result<TranscribeResult> {
        let _span = tracing::debug_span!("transcribe", samples = audio_i16.len());
        let _guard = _span.enter();
        let start = Instant::now();

        if audio_i16.is_empty() {
            return Err(anyhow::anyhow!("No audio data to transcribe"));
        }

        // Convert i16 → f32 for DSP processing
        let audio_f32 = audio::i16_to_f32(&audio_i16);

        // Share audio via Arc to avoid cloning the entire buffer
        let audio_arc = Arc::new(audio_f32);
        let audio_for_stt = audio_arc.clone();
        let audio_for_bio = audio_arc.clone();
        let stt_engine = self.stt_engine.clone();
        let pre_stt = self.pre_stt.clone();
        let stt_sample_rate = self.stt_sample_rate;

        // Drop the span guard before await points — EnteredSpan is !Send
        drop(_guard);

        let (transcript, biomarkers) = tokio::join!(
            // Task 1: Pre-STT DSP → Whisper transcription
            run_stt(audio_for_stt, stt_engine, pre_stt),
            // Task 2: Voice biomarker extraction (independent)
            run_biomarkers(audio_for_bio, stt_sample_rate),
        );

        let text = transcript.unwrap_or_else(|e| {
            warn!("STT failed: {e}");
            "[transcription unavailable]".to_string()
        });

        let biomarkers = biomarkers.ok();

        let latency_ms = start.elapsed().as_millis() as u64;
        debug!(latency_ms, text_len = text.len(), "Transcription complete");

        Ok(TranscribeResult {
            text,
            biomarkers,
            latency_ms,
        })
    }

    /// Synthesize speech: Higgs TTS → xCodec decode → Humanization DSP.
    ///
    /// The KV cache is tracked externally by SessionState. The `kv_cache_tokens`
    /// parameter is updated to reflect the new cache size after generation.
    /// When it exceeds MAX_CONTEXT_TOKENS, the cache is reset.
    pub async fn synthesize(
        &self,
        text: String,
        emotion: String,
        intensity: f32,
        kv_cache_tokens: usize,
        persona: String,
        biomarkers: Option<&biomarkers::VoiceBiomarkers>,
    ) -> Result<SynthesizeResult> {
        let _span = tracing::debug_span!("synthesize", text_len = text.len(), %emotion);
        let _guard = _span.enter();
        let start = Instant::now();

        if text.is_empty() {
            return Ok(SynthesizeResult {
                audio_i16: Vec::new(),
                kv_cache_tokens,
                duration_ms: 0,
                humanization: HumanizationInfo {
                    stages_applied: Vec::new(),
                    breath_count: 0,
                    filler_count: 0,
                },
            });
        }

        const MAX_TEXT_BYTES: usize = 32 * 1024; // 32KB
        if text.len() > MAX_TEXT_BYTES {
            return Err(anyhow::anyhow!("Text too long: {} bytes (max {})", text.len(), MAX_TEXT_BYTES));
        }

        // Phase 1: TTS generation (blocking — GPU bound)
        let tts_model = self.tts_model.clone();
        let tokenizer = self.tokenizer.clone();
        let xcodec = self.xcodec.clone();
        let gen_config = self.gen_config.clone();
        let emotion_params = self.emotion_config.mappings.get(&emotion).cloned();
        if emotion_params.is_none() && emotion != "neutral" {
            warn!(emotion = %emotion, "No generation parameters for emotion, using defaults");
        }
        let text_clone = text.clone();
        let emotion_for_tts = emotion.clone();
        let current_kv_tokens = kv_cache_tokens;

        // Drop the span guard before await points — EnteredSpan is !Send
        drop(_guard);

        let (tts_audio, new_kv_tokens) = tokio::task::spawn_blocking(move || {
            run_tts(
                text_clone,
                &emotion_for_tts,
                current_kv_tokens,
                tts_model,
                tokenizer,
                xcodec,
                &gen_config,
                emotion_params.as_ref(),
            )
        })
        .await
        .context("TTS task panicked")??;

        // Phase 2: Humanization DSP (blocking — CPU bound, modifies audio)
        let cloned_biomarkers = biomarkers.cloned();
        let emotion_clone = emotion.clone();
        let persona_clone = persona.clone();
        let humanized = tokio::task::spawn_blocking(move || {
            run_humanization(tts_audio, emotion_clone, intensity, persona_clone, cloned_biomarkers.as_ref())
        })
        .await
        .context("Humanization task panicked")?;

        // Convert f32 → i16 for wire format
        let audio_i16 = audio::f32_to_i16(&humanized.samples);
        let duration_ms = (audio_i16.len() as f64 / TTS_SAMPLE_RATE as f64 * 1000.0) as u64;

        let total_ms = start.elapsed().as_millis() as u64;
        debug!(
            total_ms,
            tts_tokens = new_kv_tokens,
            audio_samples = audio_i16.len(),
            duration_ms,
            "Synthesis complete"
        );

        Ok(SynthesizeResult {
            audio_i16,
            kv_cache_tokens: new_kv_tokens,
            duration_ms,
            humanization: HumanizationInfo {
                stages_applied: vec![
                    "breath".into(),
                    "filler".into(),
                    "prosody".into(),
                    "emotion".into(),
                    "texture".into(),
                    "pacing".into(),
                    "physiological".into(),
                ],
                breath_count: humanized.metadata.breaths_injected as u32,
                filler_count: humanized.metadata.fillers_injected as u32,
            },
        })
    }
    /// Synthesize speech with streaming output.
    ///
    /// Audio chunks are sent through `tx` as they become available.
    /// Each chunk is humanized (stages 3-5 only: prosody, emotion, texture —
    /// breath/filler injection is skipped because it changes sample count).
    ///
    /// Returns metadata about the full synthesis once complete.
    pub async fn synthesize_streaming(
        &self,
        text: String,
        emotion: String,
        intensity: f32,
        kv_cache_tokens: usize,
        _persona: String,
        chunk_steps: Option<usize>,
        tx: tokio::sync::mpsc::Sender<Vec<i16>>,
        biomarkers: Option<&biomarkers::VoiceBiomarkers>,
    ) -> Result<SynthesizeResult> {
        let start = Instant::now();

        if text.is_empty() {
            return Ok(SynthesizeResult {
                audio_i16: Vec::new(),
                kv_cache_tokens,
                duration_ms: 0,
                humanization: HumanizationInfo {
                    stages_applied: Vec::new(),
                    breath_count: 0,
                    filler_count: 0,
                },
            });
        }

        const MAX_TEXT_BYTES: usize = 32 * 1024; // 32KB
        if text.len() > MAX_TEXT_BYTES {
            return Err(anyhow::anyhow!("Text too long: {} bytes (max {})", text.len(), MAX_TEXT_BYTES));
        }

        let tts_model = self.tts_model.clone()
            .context("TTS model not loaded")?;
        let tokenizer = self.tokenizer.clone()
            .context("Tokenizer not loaded")?;
        let xcodec = self.xcodec.clone()
            .context("xCodec not loaded")?;
        let gen_config = self.gen_config.clone();
        let chunk_size = chunk_steps.unwrap_or(gen_config.chunk_size);

        // Apply emotion-specific generation parameters (same mapping as batch synthesize)
        let emotion_params = self.emotion_config.mappings.get(&emotion).cloned();
        if emotion_params.is_none() && emotion != "neutral" {
            warn!(emotion = %emotion, "No generation parameters for emotion, using defaults");
        }
        let effective_gen_config = Arc::new(match emotion_params {
            Some(ref params) => GenerationConfig {
                max_audio_tokens: gen_config.max_audio_tokens,
                temperature: params.temperature,
                top_p: gen_config.top_p,
                top_k: params.top_k,
                repetition_penalty: params.repetition_penalty,
                chunk_size: gen_config.chunk_size,
            },
            None => GenerationConfig {
                max_audio_tokens: gen_config.max_audio_tokens,
                temperature: gen_config.temperature,
                top_p: gen_config.top_p,
                top_k: gen_config.top_k,
                repetition_penalty: gen_config.repetition_penalty,
                chunk_size: gen_config.chunk_size,
            },
        });

        // Split text into sentences for speculative first-sentence generation
        let sentences = split_sentences(&text);
        let emotion_for_prep = emotion.clone();

        let mut total_samples = 0usize;
        let mut total_kv_tokens = kv_cache_tokens;

        for (i, sentence) in sentences.iter().enumerate() {
            let prepared = prepare_text(sentence, &emotion_for_prep);
            let tokens = tokenize(&tokenizer, &prepared)?;

            debug!(
                sentence_idx = i,
                num_tokens = tokens.len(),
                sentence_len = sentence.len(),
                kv_tokens = total_kv_tokens,
                "Streaming sentence"
            );

            // Create std::sync::mpsc channel for blocking thread
            let (sync_tx, sync_rx) = std::sync::mpsc::channel::<generation::StreamChunk>();

            let model = tts_model.clone();
            let decoder = xcodec.clone();
            let config = effective_gen_config.clone();
            let current_kv = total_kv_tokens;

            // Spawn blocking thread for TTS generation
            let gen_handle = tokio::task::spawn_blocking(move || {
                let mut model_guard = model.lock();

                generation::generate_audio_streaming(
                    &mut model_guard,
                    &decoder,
                    &tokens,
                    &config,
                    current_kv,
                    MAX_CONTEXT_TOKENS,
                    chunk_size,
                    sync_tx,
                )
            });

            // Bridge std::sync::mpsc → tokio::sync::mpsc with lightweight humanization.
            // Uses a dedicated thread since std::sync::mpsc::Receiver isn't Sync.
            let (bridge_tx, mut bridge_rx) = tokio::sync::mpsc::channel::<(Vec<f32>, usize)>(32);
            let bridge_thread = std::thread::spawn(move || {
                let mut chunk_samples = 0usize;
                loop {
                    match sync_rx.recv_timeout(Duration::from_secs(5)) {
                        Ok(chunk) => match chunk {
                            generation::StreamChunk::Audio(audio_f32) => {
                                let len = audio_f32.len();
                                chunk_samples += len;
                                if bridge_tx.blocking_send((audio_f32, len)).is_err() {
                                    break;
                                }
                            }
                            generation::StreamChunk::Done { .. } => break,
                        },
                        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                            warn!("Bridge thread recv timed out after 5s, breaking");
                            break;
                        }
                        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
                    }
                }
                chunk_samples
            });

            // Async task: apply humanization and forward to output channel
            let tx_clone = tx.clone();
            let emotion_clone = emotion.clone();
            let intensity_val = intensity;
            let bio_params = biomarkers.map(biomarkers::biomarkers_to_humanization_params);

            let humanize_handle = tokio::task::spawn(async move {
                let mut chunk_samples = 0usize;
                while let Some((audio_f32, len)) = bridge_rx.recv().await {
                    let effective_intensity = match &bio_params {
                        Some(params) => intensity_val * params.intensity_scale,
                        None => intensity_val,
                    };
                    let humanized = lightweight_humanize(
                        audio_f32,
                        &emotion_clone,
                        effective_intensity,
                    );
                    let audio_i16 = audio::f32_to_i16(&humanized);
                    chunk_samples += len;
                    if tx_clone.send(audio_i16).await.is_err() {
                        break;
                    }
                }
                chunk_samples
            });

            // Wait for generation to complete
            let (audio_steps, new_tokens) = gen_handle
                .await
                .context("Streaming TTS task panicked")??;

            // Wait for bridge thread and humanization to finish
            let _bridge_samples = match bridge_thread.join() {
                Ok(v) => v,
                Err(e) => {
                    warn!("Bridge thread panicked: {:?}", e);
                    0
                }
            };
            let chunk_samples = match humanize_handle.await {
                Ok(v) => v,
                Err(e) => {
                    warn!("Humanize task panicked: {:?}", e);
                    0
                }
            };
            total_samples += chunk_samples;

            // Guard: single generation exceeding max context → full reset
            if new_tokens > MAX_CONTEXT_TOKENS {
                tracing::error!(
                    new_tokens,
                    max = MAX_CONTEXT_TOKENS,
                    "Single generation exceeded max context, resetting KV cache"
                );
                let mut model_guard = tts_model.lock();
                if let Err(e) = model_guard.slide_caches(0) {
                    warn!(error = %e, "Full cache reset failed");
                }
                drop(model_guard);
                total_kv_tokens = 0;
            } else {
                // Update KV cache with sliding window instead of hard reset
                total_kv_tokens = if current_kv > MAX_CONTEXT_TOKENS {
                    new_tokens
                } else {
                    current_kv + new_tokens
                };

                // Sliding window: trim if over limit
                if total_kv_tokens > MAX_CONTEXT_TOKENS {
                    let mut model_guard = tts_model.lock();
                    if let Err(e) = model_guard.slide_caches(MAX_CONTEXT_TOKENS) {
                        warn!(error = %e, "slide_caches failed, continuing with full cache");
                    } else {
                        total_kv_tokens = MAX_CONTEXT_TOKENS;
                    }
                    drop(model_guard);
                }
            }

            debug!(
                sentence_idx = i,
                audio_steps,
                chunk_samples,
                kv_tokens = total_kv_tokens,
                "Sentence streaming complete"
            );
        }

        let duration_ms = (total_samples as f64 / TTS_SAMPLE_RATE as f64 * 1000.0) as u64;
        let total_ms = start.elapsed().as_millis() as u64;

        info!(
            total_ms,
            sentences = sentences.len(),
            total_samples,
            duration_ms,
            kv_tokens = total_kv_tokens,
            "Streaming synthesis complete"
        );

        Ok(SynthesizeResult {
            audio_i16: Vec::new(), // Audio was streamed, not accumulated
            kv_cache_tokens: total_kv_tokens,
            duration_ms,
            humanization: HumanizationInfo {
                stages_applied: vec![
                    "prosody".into(),
                    "emotion".into(),
                    "texture".into(),
                ],
                // breath_count and filler_count are 0 for streaming (lightweight humanization only)
                breath_count: 0,
                filler_count: 0,
            },
        })
    }
}

// ── Sentence Splitting ────────────────────────────────────────────

/// Split text into sentences for speculative first-sentence generation.
///
/// Handles common abbreviations (Dr., Mr., U.S.A.) and decimal numbers (3.14).
/// Splits on ". ", "! ", "? " followed by uppercase or end of string.
fn split_sentences(text: &str) -> Vec<String> {
    let text = text.trim();
    if text.is_empty() {
        return Vec::new();
    }

    // Common abbreviations that shouldn't trigger a split
    const ABBREVS: &[&str] = &[
        "Dr.", "Mr.", "Mrs.", "Ms.", "Prof.", "Sr.", "Jr.",
        "St.", "Ave.", "Blvd.", "vs.", "etc.", "i.e.", "e.g.",
        "U.S.", "U.K.", "U.N.",
    ];

    let mut sentences = Vec::new();
    // Use byte indexing directly — all delimiters (. ! ? space) are single-byte ASCII,
    // so byte positions always land on valid UTF-8 boundaries.
    let bytes = text.as_bytes();
    let mut segment_start = 0;
    let mut i = 0;

    while i < bytes.len() {
        let b = bytes[i];

        // Check for sentence-ending punctuation (ASCII only).
        // Note: Unicode sentence terminators (e.g., U+3002 CJK period) are not handled.
        if b == b'.' || b == b'!' || b == b'?' {
            // Safety: skip if byte position is not a UTF-8 char boundary
            if !text.is_char_boundary(i) {
                i += 1;
                continue;
            }
            // Look ahead: need space + uppercase, or end of text
            let at_end = i + 1 >= bytes.len();
            let followed_by_space_upper = i + 2 < bytes.len()
                && bytes[i + 1] == b' '
                && bytes[i + 2].is_ascii_uppercase();
            let followed_by_space_end = i + 1 < bytes.len()
                && bytes[i + 1] == b' '
                && i + 2 >= bytes.len();

            if at_end || followed_by_space_upper || followed_by_space_end {
                let current = &text[segment_start..=i];

                // Check it's not an abbreviation
                let is_abbrev = b == b'.' && ABBREVS.iter().any(|a| current.ends_with(a));

                // Check it's not a decimal number (digit before period, digit after)
                let is_decimal = b == b'.'
                    && i > 0 && bytes[i - 1].is_ascii_digit()
                    && i + 1 < bytes.len() && bytes[i + 1].is_ascii_digit();

                if !is_abbrev && !is_decimal {
                    let trimmed = current.trim();
                    if !trimmed.is_empty() {
                        sentences.push(trimmed.to_string());
                    }
                    // Skip the space after punctuation
                    if i + 1 < bytes.len() && bytes[i + 1] == b' ' {
                        segment_start = i + 2;
                        i += 1;
                    } else {
                        segment_start = i + 1;
                    }
                }
            }
        }

        i += 1;
    }

    // Push remaining text
    if segment_start < text.len() {
        let trimmed = text[segment_start..].trim();
        if !trimmed.is_empty() {
            sentences.push(trimmed.to_string());
        }
    }

    // If splitting produced nothing meaningful, return original
    if sentences.is_empty() {
        sentences.push(text.to_string());
    }

    sentences
}

// ── Lightweight Humanization ──────────────────────────────────────

/// Apply lightweight humanization for streaming chunks.
///
/// Only applies stages 3-5 (prosody, emotion, texture) — skips breath and
/// filler injection which change sample count and break chunk boundaries.
fn lightweight_humanize(samples: Vec<f32>, emotion: &str, intensity: f32) -> Vec<f32> {
    if samples.is_empty() {
        return samples;
    }

    let mut audio = samples;
    let sample_rate = TTS_SAMPLE_RATE;
    let effective_intensity = intensity.clamp(0.0, 1.0);

    // Determine emotion for processing
    let emotion_str = if emotion == "neutral" || emotion.is_empty() {
        "neutral"
    } else {
        emotion
    };

    // Stage 3: Prosody modification
    let pitch_shift = dsp::prosody::emotion_pitch_shift(emotion_str) * effective_intensity;
    dsp::prosody::apply_prosody(&mut audio, sample_rate, pitch_shift, true);

    // Stage 4: Emotion coloring
    dsp::emotion::apply_emotion_color(&mut audio, sample_rate, emotion_str, effective_intensity);

    // Stage 5: Vocal texture
    dsp::texture::add_vocal_texture(&mut audio, sample_rate, emotion_str, effective_intensity);

    // Clamp to valid range
    for sample in audio.iter_mut() {
        *sample = sample.clamp(-1.0, 1.0);
    }

    audio
}

// ── Model Loading ──────────────────────────────────────────────────

/// Load all TTS-related models (Higgs + Tokenizer + xCodec).
fn load_tts_models(
    model_dir: &Path,
    xcodec_path: &Option<String>,
    device: &Device,
) -> Result<(HiggsAudioModel, Tokenizer, XcodecDecoder)> {
    // Load model config
    let config_path = model_dir.join("config.json");
    info!(path = %config_path.display(), "Loading model config");
    let config_str = std::fs::read_to_string(&config_path)
        .with_context(|| format!("Failed to read {}", config_path.display()))?;
    let config: HiggsAudioConfig =
        serde_json::from_str(&config_str).context("Failed to parse config.json")?;

    info!(
        hidden_size = config.text_config.hidden_size,
        num_layers = config.text_config.num_hidden_layers,
        num_codebooks = config.audio_num_codebooks,
        codebook_size = config.audio_codebook_size,
        "Model config loaded"
    );

    // Load safetensors weights
    let safetensors_files = find_safetensors(model_dir)?;
    info!(
        num_files = safetensors_files.len(),
        "Loading model weights from safetensors"
    );

    let load_start = Instant::now();

    let vb = unsafe {
        VarBuilder::from_mmaped_safetensors(&safetensors_files, DType::BF16, device)
            .context("Failed to load safetensors")?
    };

    let model =
        HiggsAudioModel::load(config.clone(), vb, device).context("Failed to build model")?;

    let load_ms = load_start.elapsed().as_millis();
    info!(load_ms, "Higgs model loaded");

    // Load tokenizer
    let tokenizer_path = model_dir.join("tokenizer.json");
    info!(path = %tokenizer_path.display(), "Loading tokenizer");
    let tokenizer = Tokenizer::from_file(&tokenizer_path)
        .map_err(|e| anyhow::anyhow!("Failed to load tokenizer: {e}"))?;

    // Load xCodec decoder
    let xcodec_file = xcodec_path
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| model_dir.join("xcodec_decoder.onnx"));

    info!(path = %xcodec_file.display(), "Loading xCodec decoder");
    let decoder = XcodecDecoder::load(&xcodec_file, config.audio_num_codebooks)
        .context("Failed to load xCodec decoder")?;

    Ok((model, tokenizer, decoder))
}

/// Find all .safetensors files in a directory.
fn find_safetensors(dir: &Path) -> Result<Vec<PathBuf>> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir)
        .with_context(|| format!("Cannot read model directory: {}", dir.display()))?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().map_or(false, |ext| ext == "safetensors"))
        .collect();

    if files.is_empty() {
        anyhow::bail!("No .safetensors files found in {}", dir.display());
    }

    files.sort();
    Ok(files)
}

// ── Text Preparation ───────────────────────────────────────────────

/// Prepare text for Higgs Audio V2 TTS using Llama 3 chat template.
fn prepare_text(text: &str, emotion: &str) -> String {
    let tagged_text = if !emotion.is_empty() && emotion != "neutral" {
        let tag = match emotion {
            "gentle" | "whisper" | "serious" | "playful" | "empathetic" | "excited" => emotion,
            "sadness" | "sad" | "concern" | "grief" => "gentle",
            "anxiety" | "stress" | "worry" | "fear" => "gentle",
            "excitement" | "joy" | "happy" | "elated" | "celebration" => "excited",
            "anger" | "frustration" | "annoyed" => "serious",
            "surprise" | "amazed" | "wonder" => "excited",
            "love" | "gratitude" | "warmth" | "caring" => "empathetic",
            "humor" | "funny" | "silly" | "amused" => "playful",
            "calm" | "peaceful" | "relaxed" | "soothing" => "gentle",
            "vulnerable" | "tender" | "intimate" => "whisper",
            "curious" | "interested" | "intrigued" => "playful",
            other => {
                warn!("Unknown emotion: {other}, using neutral");
                ""
            }
        };

        if tag.is_empty() {
            text.to_string()
        } else {
            format!("[{tag}] {text}")
        }
    } else {
        text.to_string()
    };

    format!(
        "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n\
         Generate audio following instruction.\n\n\
         <|scene_desc_start|>\n\
         Audio is recorded from a quiet room.\n\
         <|scene_desc_end|>\
         <|eot_id|>\
         <|start_header_id|>user<|end_header_id|>\n\n\
         Convert the text to speech: {tagged_text}\
         <|eot_id|>\
         <|start_header_id|>assistant<|end_header_id|>\n\n"
    )
}

/// Tokenize prepared text using the HuggingFace tokenizer.
fn tokenize(tokenizer: &Tokenizer, text: &str) -> Result<Vec<u32>> {
    let encoding = tokenizer
        .encode(text, false)
        .map_err(|e| anyhow::anyhow!("Tokenization failed: {e}"))?;
    Ok(encoding.get_ids().to_vec())
}

// ── Blocking Task Functions ────────────────────────────────────────

/// Run STT in a blocking task: Pre-STT DSP → Whisper transcription.
async fn run_stt(
    audio_f32: Arc<Vec<f32>>,
    stt_engine: Option<Arc<WhisperSttEngine>>,
    pre_stt: Arc<Mutex<PreSTTProcessor>>,
) -> Result<String> {
    let engine = match stt_engine {
        Some(e) => e,
        None => anyhow::bail!("STT not available — Whisper model not loaded"),
    };

    tokio::task::spawn_blocking(move || {
        let _span = tracing::debug_span!("stt").entered();
        // Pre-STT DSP: AGC, noise suppression, bandwidth extension
        let processed = {
            let mut processor = pre_stt.lock();
            processor.process(&audio_f32, true)
        };

        // Whisper transcription
        engine.transcribe(&processed)
    })
    .await
    .context("STT task panicked")?
}

/// Extract voice biomarkers in a blocking task.
async fn run_biomarkers(audio_f32: Arc<Vec<f32>>, sample_rate: u32) -> Result<VoiceBiomarkers> {
    tokio::task::spawn_blocking(move || {
        if audio_f32.is_empty() {
            anyhow::bail!("No audio for biomarkers");
        }

        let bio = biomarkers::analyze_biomarkers(&audio_f32, sample_rate);

        Ok(VoiceBiomarkers {
            pitch_hz: bio.pitch_hz,
            energy: bio.energy,
            jitter: bio.jitter,
            shimmer: bio.shimmer,
            breathiness: bio.breathiness,
            speech_rate: bio.speech_rate,
            is_speech: bio.is_speech,
        })
    })
    .await
    .context("Biomarker task panicked")?
}

/// Run TTS generation in a blocking context.
///
/// Returns (audio_f32, new_kv_cache_tokens).
fn run_tts(
    text: String,
    emotion: &str,
    kv_cache_tokens: usize,
    tts_model: Option<Arc<Mutex<HiggsAudioModel>>>,
    tokenizer: Option<Arc<Tokenizer>>,
    xcodec: Option<Arc<XcodecDecoder>>,
    gen_config: &GenerationConfig,
    emotion_params: Option<&EmotionParams>,
) -> Result<(Vec<f32>, usize)> {
    // Check all required components are available
    let model = match tts_model {
        Some(ref m) => m,
        None => {
            return Err(anyhow::anyhow!("TTS model not loaded"));
        }
    };
    let tokenizer = tokenizer
        .as_ref()
        .context("Tokenizer not loaded but TTS model is available")?;
    let xcodec = xcodec
        .as_ref()
        .context("xCodec not loaded but TTS model is available")?;

    // Prepare text with emotion tags and Llama 3 chat template
    let prepared = prepare_text(&text, emotion);
    let tokens = tokenize(tokenizer, &prepared)?;

    // Override generation config with emotion-specific params if available
    let effective_config = match emotion_params {
        Some(params) => GenerationConfig {
            max_audio_tokens: gen_config.max_audio_tokens,
            temperature: params.temperature,
            top_p: gen_config.top_p,
            top_k: params.top_k,
            repetition_penalty: params.repetition_penalty,
            chunk_size: gen_config.chunk_size,
        },
        None => GenerationConfig {
            max_audio_tokens: gen_config.max_audio_tokens,
            temperature: gen_config.temperature,
            top_p: gen_config.top_p,
            top_k: gen_config.top_k,
            repetition_penalty: gen_config.repetition_penalty,
            chunk_size: gen_config.chunk_size,
        },
    };

    info!(
        num_tokens = tokens.len(),
        kv_cache_tokens,
        temperature = effective_config.temperature,
        top_k = effective_config.top_k,
        "Starting TTS generation"
    );

    // Generate audio codes with persistent KV cache
    let mut model_guard = model.lock();

    let (generated, new_tokens_added) = generation::generate_audio_persistent(
        &mut model_guard,
        &tokens,
        &effective_config,
        kv_cache_tokens,
        MAX_CONTEXT_TOKENS,
    )?;

    // Release model lock before decoding
    drop(model_guard);

    // Decode audio codes → PCM via xCodec
    let audio_f32 = generation::decode_audio(xcodec, &generated)?;

    let total_tokens = if kv_cache_tokens > MAX_CONTEXT_TOKENS {
        // Cache was reset, only new tokens count
        new_tokens_added
    } else {
        kv_cache_tokens + new_tokens_added
    };

    info!(
        audio_samples = audio_f32.len(),
        duration_ms = (audio_f32.len() as f64 / TTS_SAMPLE_RATE as f64 * 1000.0) as u64,
        total_kv_tokens = total_tokens,
        "TTS generation complete"
    );

    Ok((audio_f32, total_tokens))
}

/// Run humanization DSP pipeline with optional biomarker feedback.
fn run_humanization(
    audio_f32: Vec<f32>,
    emotion: String,
    intensity: f32,
    persona: String,
    bio: Option<&biomarkers::VoiceBiomarkers>,
) -> dsp::HumanizationResult {
    let ctx = HumanizationContext {
        emotion,
        intensity,
        persona,
        user_pitch_hz: bio.map(|b| b.pitch_hz),
        user_energy: bio.map(|b| b.energy),
        user_jitter: bio.map(|b| b.jitter),
        user_speech_rate: bio.map(|b| b.speech_rate),
        ..Default::default()
    };
    dsp::humanize_audio(&audio_f32, TTS_SAMPLE_RATE, &ctx)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_stub_transcribe_empty() {
        let pipeline = VoicePipeline::stub();
        let result = pipeline.transcribe(vec![]).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("No audio data"));
    }

    #[tokio::test]
    async fn test_stub_transcribe_with_audio() {
        let pipeline = VoicePipeline::stub();
        // 0.5s of 16kHz audio
        let audio: Vec<i16> = (0..8000).map(|i| (i % 100) as i16).collect();
        let result = pipeline.transcribe(audio).await.unwrap();
        // STT not available → returns error message, but biomarkers still work
        assert!(!result.text.is_empty());
        assert!(result.biomarkers.is_some());
        assert!(result.latency_ms < 1000);

        // Verify biomarker fields
        let bio = result.biomarkers.unwrap();
        assert!(bio.energy >= 0.0);
    }

    #[tokio::test]
    async fn test_stub_synthesize_empty() {
        let pipeline = VoicePipeline::stub();
        let result = pipeline
            .synthesize(String::new(), "neutral".into(), 0.5, 0, "ferni".into(), None)
            .await
            .unwrap();
        assert!(result.audio_i16.is_empty());
        assert_eq!(result.duration_ms, 0);
    }

    #[tokio::test]
    async fn test_stub_synthesize_with_text_errors() {
        let pipeline = VoicePipeline::stub();
        let result = pipeline
            .synthesize(
                "Hello, how are you?".into(),
                "warm".into(),
                0.7,
                0,
                "ferni".into(),
                None,
            )
            .await;
        // Stub pipeline has no TTS model loaded — should return error
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("TTS model not loaded"));
    }

    #[tokio::test]
    async fn test_kv_cache_tracking() {
        let pipeline = VoicePipeline::stub();
        // Stub pipeline returns error (no TTS model) — empty text still returns Ok
        let result = pipeline
            .synthesize(String::new(), "neutral".into(), 0.5, 0, "ferni".into(), None)
            .await
            .unwrap();
        assert_eq!(result.kv_cache_tokens, 0);
    }

    #[test]
    fn test_max_context_tokens_constant() {
        assert_eq!(MAX_CONTEXT_TOKENS, 8192);
    }

    #[test]
    fn test_prepare_text_neutral() {
        let result = prepare_text("Hello world", "neutral");
        assert!(result.contains("Hello world"));
        assert!(result.contains("<|begin_of_text|>"));
        assert!(!result.contains("[neutral]")); // neutral should not add a tag
    }

    #[test]
    fn test_prepare_text_with_emotion() {
        let result = prepare_text("Hello world", "gentle");
        assert!(result.contains("[gentle] Hello world"));
    }

    #[test]
    fn test_prepare_text_emotion_mapping() {
        // sad maps to gentle
        let result = prepare_text("I'm sorry", "sad");
        assert!(result.contains("[gentle] I'm sorry"));

        // joy maps to excited
        let result = prepare_text("Yay!", "joy");
        assert!(result.contains("[excited] Yay!"));
    }

    // ── split_sentences tests ──────────────────────────────────────

    #[test]
    fn test_split_simple_sentences() {
        let result = split_sentences("Hello world. How are you? I am fine!");
        assert_eq!(result, vec!["Hello world.", "How are you?", "I am fine!"]);
    }

    #[test]
    fn test_split_single_sentence() {
        let result = split_sentences("Just one sentence.");
        assert_eq!(result, vec!["Just one sentence."]);
    }

    #[test]
    fn test_split_no_punctuation() {
        let result = split_sentences("No punctuation here");
        assert_eq!(result, vec!["No punctuation here"]);
    }

    #[test]
    fn test_split_preserves_abbreviations() {
        let result = split_sentences("Dr. Smith went to the store. He bought milk.");
        assert_eq!(result, vec!["Dr. Smith went to the store.", "He bought milk."]);
    }

    #[test]
    fn test_split_handles_decimals() {
        let result = split_sentences("The value is 3.14 approximately. Got it.");
        assert_eq!(result, vec!["The value is 3.14 approximately.", "Got it."]);
    }

    #[test]
    fn test_split_empty_string() {
        let result = split_sentences("");
        assert!(result.is_empty());
    }

    #[test]
    fn test_split_whitespace_only() {
        let result = split_sentences("   ");
        assert!(result.is_empty());
    }

    #[test]
    fn test_split_exclamation_and_question() {
        let result = split_sentences("Wow! Really? Yes.");
        assert_eq!(result, vec!["Wow!", "Really?", "Yes."]);
    }

    #[test]
    fn test_split_multiple_abbreviations() {
        let result = split_sentences("Mr. and Mrs. Jones arrived. They were happy.");
        assert_eq!(result, vec!["Mr. and Mrs. Jones arrived.", "They were happy."]);
    }

    // ── lightweight_humanize tests ─────────────────────────────────

    #[test]
    fn test_lightweight_humanize_empty() {
        let result = lightweight_humanize(Vec::new(), "warm", 0.7);
        assert!(result.is_empty());
    }

    #[test]
    fn test_lightweight_humanize_preserves_length() {
        let samples: Vec<f32> = (0..24000)
            .map(|i| 0.3 * (250.0 * 2.0 * std::f32::consts::PI * i as f32 / 24000.0).sin())
            .collect();
        let len = samples.len();
        let result = lightweight_humanize(samples, "warm", 0.7);
        assert_eq!(result.len(), len, "Lightweight humanization should not change sample count");
    }

    #[test]
    fn test_lightweight_humanize_values_in_range() {
        let samples: Vec<f32> = (0..24000)
            .map(|i| 0.5 * (200.0 * 2.0 * std::f32::consts::PI * i as f32 / 24000.0).sin())
            .collect();
        let result = lightweight_humanize(samples, "excited", 1.0);
        for s in &result {
            assert!(*s >= -1.0 && *s <= 1.0, "Sample out of range: {}", s);
        }
    }

    // ── L6: Additional test coverage ──────────────────────────────

    #[test]
    fn test_prepare_text_unknown_emotion() {
        // Unknown emotion should fall through to empty tag (neutral behavior)
        let result = prepare_text("Hello", "some_unknown_emotion");
        // Should contain the text without an emotion tag
        assert!(result.contains("Hello"));
        assert!(!result.contains("[some_unknown_emotion]"));
    }

    #[tokio::test]
    async fn test_stub_synthesize_empty_text_returns_ok() {
        let pipeline = VoicePipeline::stub();
        let result = pipeline
            .synthesize(String::new(), "neutral".into(), 0.5, 0, "ferni".into(), None)
            .await
            .unwrap();
        assert!(result.audio_i16.is_empty());
        assert_eq!(result.kv_cache_tokens, 0);
    }
}
