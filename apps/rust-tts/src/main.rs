//! Pure Rust TTS server using qwen_tts crate (Candle + Metal).
//!
//! Exposes OpenAI-compatible and custom endpoints for Ferni LocalTTSProvider.
//!
//! Endpoints:
//! - `POST /v1/audio/speech`        — OpenAI-compatible TTS (returns WAV)
//! - `POST /v1/audio/speech/stream` — Streaming TTS (chunked s16le PCM)
//! - `POST /synthesize`             — Custom API (returns raw s16le PCM)
//! - `GET  /health`                 — Health check
//!
//! Usage:
//! ```bash
//! # Auto-download model, F16 inference (recommended):
//! cargo run --release -- --port 8501 --f16
//!
//! # Use a pre-downloaded local model:
//! cargo run --release -- --model-path /path/to/Qwen3-TTS-1.7B-VoiceDesign --port 8501 --f16
//! ```

mod audio;
mod audio_processing;
mod emotion;
mod styles;
mod voices;
mod websocket;

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use axum::{
    body::Body,
    extract::State,
    http::{header, HeaderMap, HeaderName, HeaderValue, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use clap::Parser;
use serde::{Deserialize, Serialize};
use tokio_stream::wrappers::ReceiverStream;
use tower_http::cors::CorsLayer;
use tracing::{error, info, warn};

use candle_core::{DType, Device};
use qwen_tts::model::{loader::ModelLoader, loader::LoaderConfig, options::VoiceDesignOptions, Model};

use crate::audio::f32_to_s16le;
use crate::audio_processing::{apply_speed, apply_volume, encode_output, resample, OutputFormat};
use crate::emotion::{resolve_emotion, resolve_speed, EmotionParams};
use crate::styles::{compose_description, resolve_register, resolve_style};
use crate::voices::{get_voice_description, resolve_voice};

// ─── Constants ───────────────────────────────────────────────

const DEFAULT_MODEL_ID: &str = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign";
pub(crate) const SAMPLE_RATE: u32 = 24000;

// ─── CLI ─────────────────────────────────────────────────────

#[derive(Parser, Debug)]
#[command(name = "qwen3-tts-server", about = "Pure Rust TTS server for Ferni")]
struct Args {
    /// Server port
    #[arg(long, default_value_t = 8501)]
    port: u16,

    /// Bind address
    #[arg(long, default_value = "127.0.0.1")]
    host: String,

    /// Path to a pre-downloaded model directory.
    /// If omitted, downloads from HuggingFace Hub automatically.
    #[arg(long)]
    model_path: Option<PathBuf>,

    /// HuggingFace model ID (used when --model-path is not set)
    #[arg(long, default_value = DEFAULT_MODEL_ID)]
    model_id: String,

    /// Use F16 inference (recommended for Metal GPU — ~40% faster).
    #[arg(long)]
    f16: bool,
}

// ─── App State ───────────────────────────────────────────────

pub(crate) struct AppState {
    pub(crate) model: Mutex<Model>,
    pub(crate) model_name: String,
}

// ─── Request/Response Types ──────────────────────────────────

/// OpenAI-compatible /v1/audio/speech request.
///
/// Extends the standard OpenAI schema with optional `emotion` and `speed`
/// fields. Serde ignores unknown fields, so callers that don't send these
/// get neutral defaults — full backward compatibility.
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct AudioSpeechRequest {
    input: String,
    #[serde(default = "default_voice")]
    voice: String,
    #[serde(default)]
    model: Option<String>,
    /// Emotion hint for prosody adjustment (e.g. "warm", "excited", "sad").
    #[serde(default)]
    emotion: Option<String>,
    /// Explicit speed override (0.5-2.0, default 1.0).
    #[serde(default)]
    speed: Option<f32>,
    /// Volume gain (0.0-3.0, default 1.0). Values > 1.0 use soft clipping.
    #[serde(default)]
    volume: Option<f32>,
    /// Target sample rate (8000-48000, default 24000).
    #[serde(default)]
    sample_rate: Option<u32>,
    /// Output format: "wav", "pcm-s16le", "pcm-f32le" (default "wav").
    #[serde(default)]
    response_format: Option<String>,
    /// Speaking style hint (e.g. "whisper", "storytelling", "sarcastic").
    #[serde(default)]
    style: Option<String>,
    /// Social register (e.g. "professional", "casual", "intimate").
    #[serde(default)]
    register: Option<String>,
}

fn default_voice() -> String {
    "ferni".to_string()
}

/// Custom /synthesize request (LocalTTSProvider 'custom' API).
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct SynthesizeRequest {
    text: String,
    #[serde(default = "default_voice")]
    voice_id: String,
    #[serde(default = "default_sample_rate")]
    sample_rate: u32,
    emotion: Option<String>,
    speed: Option<f32>,
    /// Volume gain (0.0-3.0, default 1.0).
    volume: Option<f32>,
    /// Output format: "wav", "pcm-s16le", "pcm-f32le" (default "pcm-s16le" for custom API).
    response_format: Option<String>,
    /// Speaking style hint (e.g. "whisper", "storytelling", "sarcastic").
    style: Option<String>,
    /// Social register (e.g. "professional", "casual", "intimate").
    register: Option<String>,
}

fn default_sample_rate() -> u32 {
    SAMPLE_RATE
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: String,
    model: String,
    model_loaded: bool,
    sample_rate: u32,
    backend: String,
    platform: String,
    websocket_enabled: bool,
}

// ─── Model Loading ───────────────────────────────────────────

/// Select the best available device (Metal on macOS, CPU otherwise).
fn select_device() -> anyhow::Result<Device> {
    // Try Metal first on macOS (Apple Silicon GPU).
    // This is a runtime check — the qwen_tts crate was compiled with metal feature.
    #[cfg(target_os = "macos")]
    {
        match Device::new_metal(0) {
            Ok(device) => {
                info!("Using Metal GPU (Apple Silicon)");
                return Ok(device);
            }
            Err(e) => {
                warn!("Metal not available ({e}), falling back to CPU");
            }
        }
    }

    info!("Using CPU device");
    Ok(Device::Cpu)
}

/// Download model from HuggingFace Hub and return the local cache directory.
fn download_model(model_id: &str) -> anyhow::Result<PathBuf> {
    info!("Downloading model from HuggingFace Hub: {model_id}");
    info!("(This may take a few minutes on first run for ~4GB model)");

    let api = hf_hub::api::sync::Api::new()?;
    let repo = api.model(model_id.to_string());

    // Download key model files to populate the cache directory.
    // The qwen_tts ModelLoader expects a directory with config.json + safetensors.
    // Text tokenizer: tries tokenizer.json first, falls back to vocab.json + merges.txt.
    let files = [
        "config.json",
        "generation_config.json",
        "tokenizer.json",
        "tokenizer_config.json",
        "vocab.json",
        "merges.txt",
    ];

    let mut model_dir = None;
    for filename in &files {
        match repo.get(filename) {
            Ok(path) => {
                if model_dir.is_none() {
                    // All files share the same parent directory in the HF cache
                    model_dir = path.parent().map(|p| p.to_path_buf());
                }
            }
            Err(e) => {
                warn!("Could not download {filename}: {e}");
            }
        }
    }

    // Download safetensors weight files (may be sharded)
    let weight_patterns = [
        "model.safetensors",
        "model-00001-of-00002.safetensors",
        "model-00002-of-00002.safetensors",
        "model.safetensors.index.json",
    ];
    for filename in &weight_patterns {
        match repo.get(filename) {
            Ok(path) => {
                if model_dir.is_none() {
                    model_dir = path.parent().map(|p| p.to_path_buf());
                }
            }
            Err(_) => {} // Not all patterns will exist
        }
    }

    // Download audio tokenizer weights AND config (required by qwen_tts for decode).
    // The loader reads: speech_tokenizer/config.json for architecture dimensions,
    // and speech_tokenizer/model.safetensors for weights.
    // Note: For nested paths the HF cache keeps the directory structure intact
    // under snapshot_dir/ — we don't use the returned path for model_dir since
    // config.json above already gave us the root.
    let tokenizer_patterns = [
        "speech_tokenizer/config.json",
        "speech_tokenizer/configuration.json",
        "speech_tokenizer/preprocessor_config.json",
        "speech_tokenizer/model.safetensors",
        "tokenizer.safetensors",
        "audio_tokenizer.safetensors",
    ];
    for filename in &tokenizer_patterns {
        if let Err(e) = repo.get(filename) {
            // Not all patterns will exist for every model variant
            tracing::debug!("Tokenizer file {filename} not available: {e}");
        }
    }

    model_dir.ok_or_else(|| anyhow::anyhow!("Failed to download any model files from {model_id}"))
}

/// Load the TTS model from a local path or HuggingFace Hub.
fn load_model(args: &Args) -> anyhow::Result<(Model, String)> {
    let device = select_device()?;

    let (model_dir, model_name) = if let Some(ref path) = args.model_path {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "qwen3-tts".to_string());
        (path.clone(), name)
    } else {
        let dir = download_model(&args.model_id)?;
        (dir, args.model_id.clone())
    };

    let dtype = if args.f16 { DType::F16 } else { DType::F32 };
    info!("Loading model from {:?} (dtype: {:?})...", model_dir, dtype);
    let start = Instant::now();

    let loader = ModelLoader::from_local_dir(&model_dir)?;
    let config = LoaderConfig { dtype, ..LoaderConfig::default() };
    let model = loader.load_tts_model(&device, &config)?;

    let elapsed = start.elapsed();
    info!("Model loaded in {:.1}s", elapsed.as_secs_f64());

    Ok((model, model_name))
}

// ─── Synthesis Core ──────────────────────────────────────────

/// Run voice design synthesis and return f32 samples plus the resolved emotion params.
pub(crate) fn synthesize_voice_design(
    model: &Model,
    text: &str,
    voice_id: &str,
    emotion: Option<&str>,
    explicit_speed: Option<f32>,
    style: Option<&str>,
    register: Option<&str>,
) -> anyhow::Result<(Vec<f32>, u32, EmotionParams)> {
    let resolved = resolve_voice(voice_id);
    let base_description = get_voice_description(&resolved);
    let emotion_params = resolve_emotion(emotion);
    let description = compose_description(
        &base_description,
        &emotion_params.description_modifier,
        style,
        register,
    );
    let speed = resolve_speed(emotion_params.speed, explicit_speed);

    info!(
        text_len = text.len(),
        voice = %resolved,
        emotion = %emotion_params.emotion,
        ?style,
        ?register,
        speed,
        "Synthesizing with VoiceDesign"
    );

    let start = Instant::now();

    // Build VoiceDesignOptions with emotion-derived temperature for expressiveness control.
    let options = emotion_params.temperature.map(|temp| VoiceDesignOptions {
        temperature: Some(temp),
        ..VoiceDesignOptions::default()
    });

    let result = model.generate_voice_design_from_text(text, &description, "english", options)?;

    let sample_rate = result.sample_rate as u32;
    let samples: Vec<f32> = result
        .audio
        .to_dtype(DType::F32)?
        .flatten_all()?
        .to_vec1::<f32>()?;

    let elapsed_ms = start.elapsed().as_millis();
    info!(
        samples = samples.len(),
        elapsed_ms,
        voice = %resolved,
        emotion = %emotion_params.emotion,
        "Synthesis complete"
    );

    Ok((samples, sample_rate, emotion_params))
}

// ─── Handlers ────────────────────────────────────────────────

async fn health(State(state): State<Arc<AppState>>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        model: state.model_name.clone(),
        model_loaded: true,
        sample_rate: SAMPLE_RATE,
        backend: "candle".to_string(),
        platform: if cfg!(target_os = "macos") {
            "apple-silicon".to_string()
        } else {
            "cpu".to_string()
        },
        websocket_enabled: true,
    })
}

/// POST /v1/audio/speech — OpenAI-compatible TTS endpoint.
///
/// Returns WAV audio (s16le PCM). Compatible with LocalTTSProvider `openai` API format.
/// Prosody metadata is returned via `X-Prosody-*` response headers.
async fn audio_speech(
    State(state): State<Arc<AppState>>,
    Json(req): Json<AudioSpeechRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let text = req.input.trim().to_string();
    if text.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "input is required and must be non-empty".to_string(),
        ));
    }

    let voice = req.voice.clone();
    let emotion = req.emotion.clone();
    let speed = req.speed;
    let volume = req.volume;
    let target_sample_rate = req.sample_rate;
    let output_format = req.response_format
        .as_deref()
        .map(OutputFormat::from_str_lossy)
        .unwrap_or(OutputFormat::Wav);
    let style = req.style.clone();
    let register = req.register.clone();
    let style_for_headers = style.clone();
    let register_for_headers = register.clone();

    // Run synchronous inference off the tokio worker thread.
    let (output_bytes, emotion_params, actual_speed, actual_volume, final_sr) =
        tokio::task::spawn_blocking(move || {
            let model = state
                .model
                .lock()
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            let (mut samples, sample_rate, params) =
                synthesize_voice_design(
                    &model, &text, &voice, emotion.as_deref(), speed,
                    style.as_deref(), register.as_deref(),
                ).map_err(
                    |e| {
                        error!(error = %e, "Synthesis failed");
                        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
                    },
                )?;

            let final_speed = resolve_speed(params.speed, speed);

            // Post-processing: volume
            let vol = volume.unwrap_or(1.0);
            if (vol - 1.0).abs() > f32::EPSILON {
                apply_volume(&mut samples, vol);
            }

            // Post-processing: speed (time-stretch)
            if let Some(spd) = speed {
                if (spd - 1.0).abs() > f32::EPSILON {
                    samples = apply_speed(&samples, spd);
                }
            }

            // Post-processing: resample if target differs from source
            let final_sr = target_sample_rate.unwrap_or(sample_rate);
            if final_sr != sample_rate {
                samples = resample(&samples, sample_rate, final_sr);
            }

            let encoded = encode_output(&samples, final_sr, output_format);
            Ok::<_, (StatusCode, String)>((encoded, params, final_speed, vol, final_sr))
        })
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))??;

    let mut headers = HeaderMap::new();
    if let Ok(ct) = HeaderValue::from_str(output_format.content_type()) {
        headers.insert(header::CONTENT_TYPE, ct);
    }
    if output_format == OutputFormat::Wav {
        headers.insert(
            header::CONTENT_DISPOSITION,
            HeaderValue::from_static("attachment; filename=speech.wav"),
        );
    }
    append_prosody_headers(&mut headers, &emotion_params, actual_speed);
    append_style_register_headers(&mut headers, style_for_headers.as_deref(), register_for_headers.as_deref());
    if (actual_volume - 1.0).abs() > f32::EPSILON {
        if let Ok(v) = HeaderValue::from_str(&format!("{:.2}", actual_volume)) {
            headers.insert(HeaderName::from_static("x-prosody-volume"), v);
        }
    }
    if let Ok(v) = HeaderValue::from_str(&final_sr.to_string()) {
        headers.insert(HeaderName::from_static("x-sample-rate"), v);
    }

    Ok((StatusCode::OK, headers, output_bytes))
}

/// POST /v1/audio/speech/stream — Streaming TTS endpoint.
///
/// Returns chunked s16le PCM bytes as they're generated. First chunk arrives in
/// ~200-350ms (TTFA). Compatible with LocalTTSProvider streaming mode.
/// Prosody metadata is returned via `X-Prosody-*` response headers.
async fn audio_speech_stream(
    State(state): State<Arc<AppState>>,
    Json(req): Json<AudioSpeechRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let text = req.input.trim().to_string();
    if text.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "input is required and must be non-empty".to_string(),
        ));
    }

    let voice = req.voice.clone();
    let emotion = req.emotion.clone();
    let explicit_speed = req.speed;
    let stream_volume = req.volume.unwrap_or(1.0).clamp(0.0, 3.0);
    let style = req.style.clone();
    let register = req.register.clone();

    // Resolve emotion up front so we can set response headers before streaming starts.
    let emotion_params = resolve_emotion(emotion.as_deref());
    let actual_speed = resolve_speed(emotion_params.speed, explicit_speed);
    let description_for_thread = {
        let resolved = resolve_voice(&voice);
        let base = get_voice_description(&resolved);
        compose_description(
            &base,
            &emotion_params.description_modifier,
            style.as_deref(),
            register.as_deref(),
        )
    };
    let options = emotion_params.temperature.map(|temp| VoiceDesignOptions {
        temperature: Some(temp),
        ..VoiceDesignOptions::default()
    });

    // Channel for streaming PCM chunks from the blocking generation thread.
    let (tx, rx) = tokio::sync::mpsc::channel::<Result<Vec<u8>, std::io::Error>>(32);

    let emotion_label = emotion_params.emotion.clone();

    // Spawn blocking generation — sends PCM chunks through the channel.
    tokio::task::spawn_blocking(move || {
        let model = match state.model.lock() {
            Ok(m) => m,
            Err(e) => {
                let _ = tx.blocking_send(Err(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    e.to_string(),
                )));
                return;
            }
        };

        let resolved = resolve_voice(&voice);

        info!(
            text_len = text.len(),
            voice = %resolved,
            emotion = %emotion_label,
            "Streaming synthesis with VoiceDesign"
        );

        let start = Instant::now();
        let mut total_samples = 0usize;
        let mut first_chunk = true;

        let result = model.generate_voice_design_streaming(
            &text,
            &description_for_thread,
            "english",
            options,
            |samples: &[f32]| {
                if first_chunk {
                    let ttfa_ms = start.elapsed().as_millis();
                    info!(ttfa_ms, samples = samples.len(), "First audio chunk (TTFA)");
                    first_chunk = false;
                }
                total_samples += samples.len();

                // Apply per-chunk volume if not unity
                let pcm_bytes = if (stream_volume - 1.0).abs() > f32::EPSILON {
                    let mut chunk = samples.to_vec();
                    apply_volume(&mut chunk, stream_volume);
                    f32_to_s16le(&chunk)
                } else {
                    f32_to_s16le(samples)
                };
                let _ = tx.blocking_send(Ok(pcm_bytes));
            },
        );

        let elapsed_ms = start.elapsed().as_millis();
        match result {
            Ok(()) => {
                info!(
                    total_samples,
                    elapsed_ms,
                    voice = %resolved,
                    emotion = %emotion_label,
                    "Streaming synthesis complete"
                );
            }
            Err(e) => {
                error!(error = %e, "Streaming synthesis failed");
                let _ = tx.blocking_send(Err(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    e.to_string(),
                )));
            }
        }
        // tx drops here, closing the stream and signaling EOF.
    });

    // Build streaming response with chunked transfer encoding.
    let stream = ReceiverStream::new(rx);
    let body = Body::from_stream(stream);

    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/octet-stream"),
    );
    headers.insert(
        HeaderName::from_static("x-sample-rate"),
        HeaderValue::from_static("24000"),
    );
    headers.insert(
        HeaderName::from_static("x-audio-format"),
        HeaderValue::from_static("pcm-s16le"),
    );
    append_prosody_headers(&mut headers, &emotion_params, actual_speed);
    append_style_register_headers(&mut headers, style.as_deref(), register.as_deref());
    if (stream_volume - 1.0).abs() > f32::EPSILON {
        if let Ok(v) = HeaderValue::from_str(&format!("{:.2}", stream_volume)) {
            headers.insert(HeaderName::from_static("x-prosody-volume"), v);
        }
    }

    Ok((StatusCode::OK, headers, body))
}

/// Build the custom response headers for the /synthesize endpoint.
fn pcm_response_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("application/octet-stream"));
    headers.insert(HeaderName::from_static("x-sample-rate"), HeaderValue::from_static("24000"));
    headers.insert(HeaderName::from_static("x-audio-format"), HeaderValue::from_static("pcm-s16le"));
    headers
}

/// Append prosody metadata headers describing the emotion applied.
fn append_prosody_headers(headers: &mut HeaderMap, params: &EmotionParams, actual_speed: f32) {
    if let Ok(v) = HeaderValue::from_str(&params.emotion) {
        headers.insert(HeaderName::from_static("x-prosody-emotion"), v);
    }
    if let Ok(v) = HeaderValue::from_str(&format!("{:.2}", actual_speed)) {
        headers.insert(HeaderName::from_static("x-prosody-speed"), v);
    }
    if let Ok(v) = HeaderValue::from_str(&params.pitch_shift_semitones.to_string()) {
        headers.insert(HeaderName::from_static("x-prosody-pitch-shift"), v);
    }
}

/// Append style and register metadata headers if present.
fn append_style_register_headers(headers: &mut HeaderMap, style: Option<&str>, register: Option<&str>) {
    if let Some(s) = style.filter(|s| resolve_style(Some(s)).is_some()) {
        if let Ok(v) = HeaderValue::from_str(s) {
            headers.insert(HeaderName::from_static("x-prosody-style"), v);
        }
    }
    if let Some(r) = register.filter(|r| resolve_register(Some(r)).is_some()) {
        if let Ok(v) = HeaderValue::from_str(r) {
            headers.insert(HeaderName::from_static("x-prosody-register"), v);
        }
    }
}

/// POST /synthesize — Custom API endpoint.
///
/// Returns raw s16le PCM bytes. Compatible with LocalTTSProvider `custom` API format.
/// Prosody metadata is returned via `X-Prosody-*` response headers.
async fn synthesize(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SynthesizeRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let text = req.text.trim().to_string();
    if text.is_empty() {
        return Ok((StatusCode::OK, pcm_response_headers(), Vec::new()));
    }

    let voice_id = req.voice_id.clone();
    let emotion = req.emotion.clone();
    let explicit_speed = req.speed;
    let volume = req.volume;
    let target_sample_rate = req.sample_rate;
    let output_format = req.response_format
        .as_deref()
        .map(OutputFormat::from_str_lossy)
        .unwrap_or(OutputFormat::PcmS16le); // custom API defaults to raw s16le
    let style = req.style.clone();
    let register = req.register.clone();
    let style_for_headers = style.clone();
    let register_for_headers = register.clone();

    // Run synchronous inference off the tokio worker thread.
    let (output_bytes, emotion_params, actual_speed, actual_volume, final_sr) =
        tokio::task::spawn_blocking(move || {
            let model = state
                .model
                .lock()
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            let (mut samples, sample_rate, params) =
                synthesize_voice_design(
                    &model, &text, &voice_id, emotion.as_deref(), explicit_speed,
                    style.as_deref(), register.as_deref(),
                ).map_err(|e| {
                        error!(error = %e, "Synthesis failed");
                        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
                    })?;

            let final_speed = resolve_speed(params.speed, explicit_speed);

            // Post-processing: volume
            let vol = volume.unwrap_or(1.0);
            if (vol - 1.0).abs() > f32::EPSILON {
                apply_volume(&mut samples, vol);
            }

            // Post-processing: speed
            if let Some(spd) = explicit_speed {
                if (spd - 1.0).abs() > f32::EPSILON {
                    samples = apply_speed(&samples, spd);
                }
            }

            // Post-processing: resample
            let final_sr = if target_sample_rate != sample_rate {
                let resampled = resample(&samples, sample_rate, target_sample_rate);
                samples = resampled;
                target_sample_rate
            } else {
                sample_rate
            };

            let encoded = encode_output(&samples, final_sr, output_format);
            Ok::<_, (StatusCode, String)>((encoded, params, final_speed, vol, final_sr))
        })
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))??;

    let mut headers = HeaderMap::new();
    if let Ok(ct) = HeaderValue::from_str(output_format.content_type()) {
        headers.insert(header::CONTENT_TYPE, ct);
    }
    if let Ok(v) = HeaderValue::from_str(&final_sr.to_string()) {
        headers.insert(HeaderName::from_static("x-sample-rate"), v);
    }
    if let Ok(v) = HeaderValue::from_str(match output_format {
        OutputFormat::Wav => "wav",
        OutputFormat::PcmS16le => "pcm-s16le",
        OutputFormat::PcmF32le => "pcm-f32le",
    }) {
        headers.insert(HeaderName::from_static("x-audio-format"), v);
    }
    append_prosody_headers(&mut headers, &emotion_params, actual_speed);
    append_style_register_headers(&mut headers, style_for_headers.as_deref(), register_for_headers.as_deref());
    if (actual_volume - 1.0).abs() > f32::EPSILON {
        if let Ok(v) = HeaderValue::from_str(&format!("{:.2}", actual_volume)) {
            headers.insert(HeaderName::from_static("x-prosody-volume"), v);
        }
    }

    Ok((StatusCode::OK, headers, output_bytes))
}

// ─── Main ────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let args = Args::parse();

    info!("Starting Qwen3-TTS Rust server");
    info!("Model: {}", args.model_path.as_ref().map_or(args.model_id.as_str(), |p| p.to_str().unwrap_or("?")));
    info!("Sample rate: {SAMPLE_RATE}Hz");

    let (model, model_name) = load_model(&args)?;

    let state = Arc::new(AppState {
        model: Mutex::new(model),
        model_name,
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/audio/speech", post(audio_speech))
        .route("/v1/audio/speech/stream", post(audio_speech_stream))
        .route("/synthesize", post(synthesize))
        .route("/ws/v1/audio/speech", get(websocket::ws_handler))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr: SocketAddr = format!("{}:{}", args.host, args.port).parse()?;
    info!("Listening on http://{addr}");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
