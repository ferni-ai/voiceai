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
mod voices;

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
use qwen_tts::model::{loader::ModelLoader, loader::LoaderConfig, Model};

use crate::audio::{encode_wav_s16le, f32_to_s16le};
use crate::voices::{get_voice_description, resolve_voice};

// ─── Constants ───────────────────────────────────────────────

const DEFAULT_MODEL_ID: &str = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign";
const SAMPLE_RATE: u32 = 24000;

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

struct AppState {
    model: Mutex<Model>,
    model_name: String,
}

// ─── Request/Response Types ──────────────────────────────────

/// OpenAI-compatible /v1/audio/speech request.
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct AudioSpeechRequest {
    input: String,
    #[serde(default = "default_voice")]
    voice: String,
    #[serde(default)]
    model: Option<String>,
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

/// Run voice design synthesis and return f32 samples.
fn synthesize_voice_design(
    model: &Model,
    text: &str,
    voice_id: &str,
    emotion: Option<&str>,
) -> anyhow::Result<(Vec<f32>, u32)> {
    let resolved = resolve_voice(voice_id);
    let mut description = get_voice_description(&resolved);

    if let Some(emo) = emotion {
        description = format!("{description}. Tone: {emo}");
    }

    info!(
        text_len = text.len(),
        voice = %resolved,
        "Synthesizing with VoiceDesign"
    );

    let start = Instant::now();

    let result = model.generate_voice_design_from_text(text, &description, "english", None)?;

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
        "Synthesis complete"
    );

    Ok((samples, sample_rate))
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
    })
}

/// POST /v1/audio/speech — OpenAI-compatible TTS endpoint.
///
/// Returns WAV audio (s16le PCM). Compatible with LocalTTSProvider `openai` API format.
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

    // Run synchronous inference off the tokio worker thread.
    let wav_bytes = tokio::task::spawn_blocking(move || {
        let model = state
            .model
            .lock()
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        let (samples, sample_rate) =
            synthesize_voice_design(&model, &text, &voice, None).map_err(|e| {
                error!(error = %e, "Synthesis failed");
                (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
            })?;

        Ok::<_, (StatusCode, String)>(encode_wav_s16le(&samples, sample_rate))
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))??;

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "audio/wav"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=speech.wav",
            ),
        ],
        wav_bytes,
    ))
}

/// POST /v1/audio/speech/stream — Streaming TTS endpoint.
///
/// Returns chunked s16le PCM bytes as they're generated. First chunk arrives in
/// ~200-350ms (TTFA). Compatible with LocalTTSProvider streaming mode.
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

    // Channel for streaming PCM chunks from the blocking generation thread.
    let (tx, rx) = tokio::sync::mpsc::channel::<Result<Vec<u8>, std::io::Error>>(32);

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
        let description = get_voice_description(&resolved);

        info!(
            text_len = text.len(),
            voice = %resolved,
            "Streaming synthesis with VoiceDesign"
        );

        let start = Instant::now();
        let mut total_samples = 0usize;
        let mut first_chunk = true;

        let result = model.generate_voice_design_streaming(
            &text,
            &description,
            "english",
            None,
            |samples: &[f32]| {
                if first_chunk {
                    let ttfa_ms = start.elapsed().as_millis();
                    info!(ttfa_ms, samples = samples.len(), "First audio chunk (TTFA)");
                    first_chunk = false;
                }
                total_samples += samples.len();
                let pcm_bytes = f32_to_s16le(samples);
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

/// POST /synthesize — Custom API endpoint.
///
/// Returns raw s16le PCM bytes. Compatible with LocalTTSProvider `custom` API format.
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

    // Run synchronous inference off the tokio worker thread.
    let pcm = tokio::task::spawn_blocking(move || {
        let model = state
            .model
            .lock()
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        let (samples, _sample_rate) =
            synthesize_voice_design(&model, &text, &voice_id, emotion.as_deref()).map_err(|e| {
                error!(error = %e, "Synthesis failed");
                (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
            })?;

        Ok::<_, (StatusCode, String)>(f32_to_s16le(&samples))
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))??;

    Ok((StatusCode::OK, pcm_response_headers(), pcm))
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
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr: SocketAddr = format!("{}:{}", args.host, args.port).parse()?;
    info!("Listening on http://{addr}");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
