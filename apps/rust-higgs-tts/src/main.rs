//! Higgs Audio V2 TTS Server — SOTA quality local TTS via candle + Metal.
//!
//! Architecture:
//!   Text → Tokenizer → Llama 3.2 3B + DualFFN → Audio Tokens (8 codebooks)
//!                                                       ↓
//!                                             Delay Pattern Revert
//!                                                       ↓
//!                                        xcodec Decoder (ONNX) → 24kHz PCM
//!
//! Endpoints:
//!   POST /v1/audio/speech         — OpenAI-compatible TTS (returns WAV)
//!   POST /v1/audio/speech/stream  — Streaming TTS (chunked s16le PCM)
//!   POST /synthesize              — Custom API (returns raw s16le PCM)
//!   GET  /health                  — Health check
//!
//! Usage:
//!   # Download models first:
//!   bash scripts/higgs/download_model.sh
//!   python scripts/higgs/export_audio_tokenizer.py
//!
//!   # Run server:
//!   cargo run --release -- --port 8501

mod audio;
mod audio_decoder;
mod config;
mod generation;
mod model;

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use anyhow::{Context, Result};
use axum::{
    body::Body,
    extract::State,
    http::{header, HeaderMap, HeaderName, HeaderValue, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use candle_core::{DType, Device};
use candle_nn::VarBuilder;
use clap::Parser;
use serde::Deserialize;
use tokenizers::Tokenizer;
use tokio_stream::wrappers::ReceiverStream;
use tower_http::cors::CorsLayer;
use tracing::{error, info, warn};

use crate::audio::{encode_wav_s16le, f32_to_s16le, SAMPLE_RATE};
use crate::audio_decoder::XcodecDecoder;
use crate::config::HiggsAudioConfig;
use crate::generation::{decode_audio, generate_audio, generate_audio_streaming, GenerationConfig};
use crate::model::HiggsAudioModel;

// ─── CLI ─────────────────────────────────────────────────────

#[derive(Parser, Debug)]
#[command(
    name = "higgs-tts-server",
    about = "Higgs Audio V2 TTS server (candle + Metal)"
)]
struct Args {
    /// Server port
    #[arg(long, default_value_t = 8501)]
    port: u16,

    /// Bind address
    #[arg(long, default_value = "127.0.0.1")]
    host: String,

    /// Path to model directory (contains config.json, *.safetensors, tokenizer.json)
    #[arg(long, default_value = "models/higgs-audio-v2")]
    model_path: PathBuf,

    /// Path to xcodec decoder ONNX model
    #[arg(long, default_value = "models/higgs-audio-v2/xcodec_decoder.onnx")]
    decoder_model: PathBuf,

    /// Force CPU (skip Metal GPU)
    #[arg(long, default_value_t = false)]
    cpu: bool,

    /// Sampling temperature (0.0 = greedy, reference default = 0.3)
    #[arg(long, default_value_t = 0.3)]
    temperature: f32,

    /// Top-p nucleus sampling
    #[arg(long, default_value_t = 0.95)]
    top_p: f32,

    /// Top-k sampling: only consider top K tokens (0 = disabled, reference default = 50)
    #[arg(long, default_value_t = 50)]
    top_k: usize,

    /// Maximum audio tokens (each = 40ms at 25fps)
    #[arg(long, default_value_t = 1500)]
    max_tokens: usize,

    /// Pre-allocate KV cache for this many tokens (0 = dynamic allocation)
    #[arg(long, default_value_t = 0)]
    kv_cache_size: usize,
}

// ─── App State ───────────────────────────────────────────────

struct AppState {
    model: Mutex<HiggsAudioModel>,
    tokenizer: Tokenizer,
    decoder: XcodecDecoder,
    gen_config: GenerationConfig,
}

// ─── Main ────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info,ort=warn")),
        )
        .init();

    let args = Args::parse();

    // Select device
    let device = if args.cpu {
        info!("Using CPU (forced)");
        Device::Cpu
    } else {
        match Device::new_metal(0) {
            Ok(d) => {
                info!("Using Metal GPU");
                d
            }
            Err(e) => {
                warn!(error = %e, "Metal GPU not available, falling back to CPU");
                Device::Cpu
            }
        }
    };

    // Load model config
    let config_path = args.model_path.join("config.json");
    info!(path = %config_path.display(), "Loading model config");
    let config_str = std::fs::read_to_string(&config_path)
        .with_context(|| format!("Failed to read {}", config_path.display()))?;
    let config: HiggsAudioConfig = serde_json::from_str(&config_str)
        .context("Failed to parse config.json")?;

    info!(
        hidden_size = config.text_config.hidden_size,
        num_layers = config.text_config.num_hidden_layers,
        num_codebooks = config.audio_num_codebooks,
        codebook_size = config.audio_codebook_size,
        dual_ffn_layers = config.audio_dual_ffn_layers.len(),
        adapter_type = %config.audio_adapter_type,
        "Model config loaded"
    );

    // Find safetensors files
    let safetensors_files = find_safetensors(&args.model_path)?;
    info!(
        num_files = safetensors_files.len(),
        "Loading model weights from safetensors"
    );

    let load_start = Instant::now();

    // Load weights via VarBuilder
    let vb = unsafe {
        VarBuilder::from_mmaped_safetensors(&safetensors_files, DType::BF16, &device)
            .context("Failed to load safetensors")?
    };

    // Build model
    let mut model = HiggsAudioModel::load(config.clone(), vb, &device)
        .context("Failed to build model")?;

    let load_ms = load_start.elapsed().as_millis();
    info!(load_ms, "Model loaded successfully");

    // Phase 4: Pre-allocate KV caches if requested
    if args.kv_cache_size > 0 {
        warn!(
            kv_cache_size = args.kv_cache_size,
            "Pre-allocating KV caches (Phase 1: no effect — reset_caches() drops all tensors \
             at generation start. Phase 2: implement slice-assignment cache strategy to reuse \
             pre-allocated memory)"
        );
        model
            .preallocate_caches(args.kv_cache_size)
            .context("Failed to pre-allocate KV caches")?;
    }

    // Load tokenizer
    let tokenizer_path = args.model_path.join("tokenizer.json");
    info!(path = %tokenizer_path.display(), "Loading tokenizer");
    let tokenizer = Tokenizer::from_file(&tokenizer_path)
        .map_err(|e| anyhow::anyhow!("Failed to load tokenizer: {e}"))?;

    // Load xcodec decoder
    let decoder = XcodecDecoder::load(&args.decoder_model, config.audio_num_codebooks)
        .context("Failed to load xcodec decoder")?;

    let gen_config = GenerationConfig {
        max_audio_tokens: args.max_tokens,
        temperature: args.temperature,
        top_p: args.top_p,
        top_k: args.top_k,
        ..Default::default()
    };

    let state = Arc::new(AppState {
        model: Mutex::new(model),
        tokenizer,
        decoder,
        gen_config,
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/audio/speech", post(synthesize))
        .route("/v1/audio/speech/stream", post(synthesize_stream))
        .route("/synthesize", post(synthesize_custom))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::new(args.host.parse()?, args.port);
    info!(
        %addr,
        model_path = %args.model_path.display(),
        decoder = %args.decoder_model.display(),
        temperature = args.temperature,
        top_p = args.top_p,
        max_tokens = args.max_tokens,
        "Higgs Audio V2 TTS server starting"
    );

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

/// Find all .safetensors files in a directory.
fn find_safetensors(dir: &PathBuf) -> Result<Vec<PathBuf>> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir)
        .with_context(|| format!("Cannot read model directory: {}", dir.display()))?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.extension()
                .map_or(false, |ext| ext == "safetensors")
        })
        .collect();

    if files.is_empty() {
        anyhow::bail!(
            "No .safetensors files found in {}",
            dir.display()
        );
    }

    files.sort();
    Ok(files)
}

// ─── Health ──────────────────────────────────────────────────

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "model": "higgs-audio-v2",
        "sample_rate": SAMPLE_RATE,
        "voices": VOICE_NAMES,
    }))
}

// ─── Voice Mapping ──────────────────────────────────────────

/// Available voice names (Higgs V2 base model has a default voice;
/// persona voices require LoRA fine-tuning in Phase 2).
const VOICE_NAMES: &[&str] = &[
    "default", "ferni", "maya", "peter", "alex", "jordan", "nayan",
];

/// Resolve persona voice name to a model voice identifier.
/// Phase 1: all voices map to "default" (base model voice).
/// Phase 2: each will have a LoRA adapter.
fn resolve_voice(voice: &str) -> &str {
    match voice.to_lowercase().as_str() {
        "ferni" | "default" | "" => "default",
        "maya" | "maya-santos" => "default", // Phase 2: LoRA
        "peter" | "peter-john" => "default",
        "alex" | "alex-chen" => "default",
        "jordan" | "jordan-taylor" => "default",
        "nayan" | "nayan-patel" => "default",
        _ => "default",
    }
}

// ─── Request Types ──────────────────────────────────────────

/// OpenAI-compatible speech request.
#[derive(Deserialize)]
#[allow(dead_code)]
struct SpeechRequest {
    input: String,
    #[serde(default = "default_voice")]
    voice: String,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    emotion: Option<String>,
    #[serde(default)]
    speed: Option<f32>,
    #[serde(default)]
    volume: Option<f32>,
    #[serde(default)]
    style: Option<String>,
    #[serde(default)]
    register: Option<String>,
    #[serde(default)]
    physiological_state: Option<String>,
    #[serde(default)]
    paralinguistic: Option<String>,
}

/// Custom API speech request (matches /synthesize endpoint).
#[derive(Deserialize)]
#[allow(dead_code)]
struct CustomSpeechRequest {
    text: String,
    #[serde(default = "default_voice")]
    voice_id: String,
    #[serde(default)]
    sample_rate: Option<u32>,
    #[serde(default)]
    emotion: Option<String>,
    #[serde(default)]
    speed: Option<f32>,
}

fn default_voice() -> String {
    "default".to_string()
}

/// Maximum allowed input text length (in bytes/chars).
/// Prevents excessive generation times and potential OOM on very long inputs.
const MAX_INPUT_CHARS: usize = 4096;

// ─── Text Preparation ───────────────────────────────────────

/// Prepare text for Higgs Audio V2 TTS.
///
/// Uses Llama 3 chat template format with system prompt containing scene
/// description tags, matching the official boson_multimodal Python reference.
/// The tokenizer resolves `<|start_header_id|>` etc. as single special token IDs
/// (128006, 128007, 128009, 128018, 128019).
fn prepare_text(text: &str, _voice: &str, emotion: Option<&str>) -> String {
    // Inject emotion tags into the text as inline style markers.
    //
    // Phase 1 limitation: These emotion tags (e.g. `[gentle]`, `[excited]`) are
    // cosmetic — the base Higgs Audio V2 model was not specifically trained on
    // inline emotion tags. They're kept because they are harmless and may have
    // minor effects via contextual conditioning in the chat template.
    //
    // Phase 2: Fine-tune with emotion-tagged data to enable real prosody control
    // from these inline markers.
    //
    // Maps high-level emotion names from emotion-event-dispatcher.ts
    // to inline tags.
    let tagged_text = if let Some(emo) = emotion {
        let tag = match emo {
            // Direct tag names
            "gentle" | "whisper" | "serious" | "playful" | "empathetic" | "excited" => emo,
            // Emotion-event-dispatcher mappings
            "sadness" | "sad" | "concern" | "grief" => "gentle",
            "anxiety" | "stress" | "worry" | "fear" => "gentle",
            "excitement" | "joy" | "happy" | "elated" | "celebration" => "excited",
            "anger" | "frustration" | "annoyed" => "serious",
            "surprise" | "amazed" | "wonder" => "excited",
            "love" | "gratitude" | "warmth" | "caring" => "empathetic",
            "humor" | "funny" | "silly" | "amused" => "playful",
            "calm" | "peaceful" | "relaxed" | "soothing" => "gentle",
            "confidence" | "determined" | "assertive" => "serious",
            "vulnerable" | "tender" | "intimate" => "whisper",
            "curious" | "interested" | "intrigued" => "playful",
            "empathy" | "compassion" | "sympathy" | "understanding" => "empathetic",
            // Paralinguistic signals
            "laugh" | "sigh" | "hmm" => emo, // Pass through as-is
            _ => "",
        };

        if tag.is_empty() {
            text.to_string()
        } else {
            format!("[{tag}] {text}")
        }
    } else {
        text.to_string()
    };

    // Llama 3 chat template with scene description (matches reference inference code)
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

/// Tokenize prepared text.
fn tokenize(tokenizer: &Tokenizer, text: &str) -> Result<Vec<u32>> {
    let encoding = tokenizer
        .encode(text, false)
        .map_err(|e| anyhow::anyhow!("Tokenization failed: {e}"))?;
    Ok(encoding.get_ids().to_vec())
}

// ─── Synthesis Core ─────────────────────────────────────────

/// Run full TTS pipeline: text → tokens → model → audio codes → PCM.
fn run_synthesis(
    state: &AppState,
    text: &str,
    voice: &str,
    emotion: Option<&str>,
) -> Result<Vec<f32>> {
    let prepared = prepare_text(text, voice, emotion);
    let tokens = tokenize(&state.tokenizer, &prepared)?;

    info!(
        text_len = text.len(),
        token_count = tokens.len(),
        voice,
        "Running synthesis"
    );

    let mut model = state
        .model
        .lock()
        .map_err(|e| anyhow::anyhow!("Model lock poisoned: {e}"))?;

    let generated = generate_audio(&mut model, &tokens, &state.gen_config)?;

    info!(
        raw_steps = generated.raw_steps,
        aligned_frames = generated.codes.get(0).map_or(0, |c| c.len()),
        "Decoding audio"
    );

    let samples = decode_audio(&state.decoder, &generated)?;

    Ok(samples)
}

/// Streaming TTS pipeline: text → tokens → model → audio codes → chunked PCM.
///
/// Uses `generate_audio_streaming()` which decodes audio in chunks, so the
/// first audio bytes arrive before the full generation completes (better TTFA).
fn run_synthesis_streaming(
    state: &AppState,
    text: &str,
    voice: &str,
    emotion: Option<&str>,
    volume: f32,
    tx: &tokio::sync::mpsc::Sender<Result<Vec<u8>, std::io::Error>>,
) -> Result<(usize, f64)> {
    let prepared = prepare_text(text, voice, emotion);
    let tokens = tokenize(&state.tokenizer, &prepared)?;

    info!(
        text_len = text.len(),
        token_count = tokens.len(),
        voice,
        "Running streaming synthesis"
    );

    let mut model = state
        .model
        .lock()
        .map_err(|e| anyhow::anyhow!("Model lock poisoned: {e}"))?;

    let start = Instant::now();
    let mut first_chunk = true;

    let total_samples = generate_audio_streaming(
        &mut model,
        &tokens,
        &state.gen_config,
        &state.decoder,
        25, // chunk_frames: 25 frames = 1 second of audio at 25fps
        |samples| {
            // Convert f32 PCM to s16le bytes with volume scaling
            let pcm = if (volume - 1.0).abs() > f32::EPSILON {
                let scaled: Vec<f32> = samples.iter().map(|&s| s * volume).collect();
                f32_to_s16le(&scaled)
            } else {
                f32_to_s16le(samples)
            };

            if first_chunk {
                let ttfa_ms = start.elapsed().as_millis();
                info!(ttfa_ms, chunk_bytes = pcm.len(), "First audio chunk (TTFA)");
                first_chunk = false;
            }

            tx.blocking_send(Ok(pcm))
                .map_err(|_| anyhow::anyhow!("Channel closed"))?;
            Ok(())
        },
    )?;

    let duration_s = total_samples as f64 / SAMPLE_RATE as f64;
    let elapsed_ms = start.elapsed().as_millis();
    let rtf = if duration_s > 0.0 {
        elapsed_ms as f64 / (duration_s * 1000.0)
    } else {
        0.0
    };

    info!(
        elapsed_ms,
        total_samples,
        duration_s = format!("{:.2}", duration_s),
        rtf = format!("{:.2}", rtf),
        "Streaming decode complete"
    );

    Ok((total_samples, duration_s))
}

// ─── OpenAI-Compatible Endpoint ─────────────────────────────

async fn synthesize(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SpeechRequest>,
) -> impl IntoResponse {
    let text = req.input.trim().to_string();
    if text.is_empty() {
        return (StatusCode::BAD_REQUEST, "Empty input").into_response();
    }
    if text.len() > MAX_INPUT_CHARS {
        return (
            StatusCode::BAD_REQUEST,
            format!("Input too long: {} chars (max {})", text.len(), MAX_INPUT_CHARS),
        ).into_response();
    }

    let voice = resolve_voice(&req.voice).to_string();
    let start = Instant::now();

    info!(text_len = text.len(), voice = voice.as_str(), "Batch synthesis request");

    // Run synthesis in a blocking task (model inference is CPU/GPU bound)
    let state_clone = state.clone();
    let emotion = req.emotion.clone();
    let voice_owned = voice.clone();
    let result = tokio::task::spawn_blocking(move || {
        run_synthesis(&state_clone, &text, &voice_owned, emotion.as_deref())
    })
    .await;

    match result {
        Ok(Ok(samples)) => {
            let elapsed_ms = start.elapsed().as_millis();
            let duration_s = samples.len() as f64 / SAMPLE_RATE as f64;
            let rtf = if duration_s > 0.0 {
                elapsed_ms as f64 / (duration_s * 1000.0)
            } else {
                0.0
            };

            info!(
                elapsed_ms,
                samples = samples.len(),
                duration_s = format!("{:.2}", duration_s),
                rtf = format!("{:.2}", rtf),
                voice = voice.as_str(),
                "Batch synthesis complete"
            );

            let wav = encode_wav_s16le(&samples, SAMPLE_RATE);

            let mut headers = HeaderMap::new();
            headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("audio/wav"));
            headers.insert(
                HeaderName::from_static("x-audio-duration"),
                HeaderValue::from_str(&format!("{:.2}", duration_s)).unwrap(),
            );

            (headers, wav).into_response()
        }
        Ok(Err(e)) => {
            error!(error = %e, "Synthesis failed");
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response()
        }
        Err(e) => {
            error!(error = %e, "Synthesis task panicked");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal error".to_string(),
            )
                .into_response()
        }
    }
}

// ─── Streaming Endpoint ─────────────────────────────────────

async fn synthesize_stream(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SpeechRequest>,
) -> impl IntoResponse {
    let text = req.input.trim().to_string();
    if text.is_empty() {
        return (StatusCode::BAD_REQUEST, "Empty input").into_response();
    }
    if text.len() > MAX_INPUT_CHARS {
        return (
            StatusCode::BAD_REQUEST,
            format!("Input too long: {} chars (max {})", text.len(), MAX_INPUT_CHARS),
        ).into_response();
    }

    let voice = resolve_voice(&req.voice).to_string();
    let volume = req.volume.unwrap_or(1.0);
    let emotion = req.emotion.clone();

    info!(text_len = text.len(), voice, "Streaming synthesis request");

    let (tx, rx) = tokio::sync::mpsc::channel::<Result<Vec<u8>, std::io::Error>>(64);

    let state_clone = state.clone();
    tokio::task::spawn_blocking(move || {
        match run_synthesis_streaming(&state_clone, &text, &voice, emotion.as_deref(), volume, &tx) {
            Ok((total_samples, duration_s)) => {
                info!(
                    total_samples,
                    duration_s = format!("{:.2}", duration_s),
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
    });

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
        HeaderValue::from_static("s16le"),
    );
    headers.insert(
        HeaderName::from_static("x-audio-channels"),
        HeaderValue::from_static("1"),
    );

    (headers, body).into_response()
}

// ─── Custom API Endpoint ────────────────────────────────────

async fn synthesize_custom(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CustomSpeechRequest>,
) -> impl IntoResponse {
    let text = req.text.trim().to_string();
    if text.is_empty() {
        return (StatusCode::BAD_REQUEST, "Empty text").into_response();
    }
    if text.len() > MAX_INPUT_CHARS {
        return (
            StatusCode::BAD_REQUEST,
            format!("Input too long: {} chars (max {})", text.len(), MAX_INPUT_CHARS),
        ).into_response();
    }

    let voice = resolve_voice(&req.voice_id).to_string();
    let start = Instant::now();

    info!(text_len = text.len(), voice = voice.as_str(), "Custom API synthesis request");

    let state_clone = state.clone();
    let emotion = req.emotion.clone();
    let voice_owned = voice.clone();
    let result = tokio::task::spawn_blocking(move || {
        run_synthesis(&state_clone, &text, &voice_owned, emotion.as_deref())
    })
    .await;

    match result {
        Ok(Ok(samples)) => {
            let elapsed_ms = start.elapsed().as_millis();
            info!(
                elapsed_ms,
                samples = samples.len(),
                voice = voice.as_str(),
                "Custom API synthesis complete"
            );

            let pcm = f32_to_s16le(&samples);

            let mut headers = HeaderMap::new();
            headers.insert(
                header::CONTENT_TYPE,
                HeaderValue::from_static("application/octet-stream"),
            );
            headers.insert(
                HeaderName::from_static("x-sample-rate"),
                HeaderValue::from_static("24000"),
            );

            (headers, pcm).into_response()
        }
        Ok(Err(e)) => {
            error!(error = %e, "Custom API synthesis failed");
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response()
        }
        Err(e) => {
            error!(error = %e, "Custom API synthesis task panicked");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal error".to_string(),
            )
                .into_response()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_voice_resolution() {
        // Persona names resolve to "default" in Phase 1
        assert_eq!(resolve_voice("ferni"), "default");
        assert_eq!(resolve_voice("maya"), "default");
        assert_eq!(resolve_voice("peter"), "default");
        assert_eq!(resolve_voice("alex"), "default");
        assert_eq!(resolve_voice("jordan"), "default");
        assert_eq!(resolve_voice("nayan"), "default");
        // Unknown voices also map to default
        assert_eq!(resolve_voice("unknown-voice"), "default");
        assert_eq!(resolve_voice(""), "default");
        // Case-insensitive
        assert_eq!(resolve_voice("FERNI"), "default");
        assert_eq!(resolve_voice("Maya"), "default");
    }

    #[test]
    fn test_text_preparation() {
        let result = prepare_text("Hello world", "default", None);
        assert!(result.contains("<|begin_of_text|>"));
        assert!(result.contains("Convert the text to speech: Hello world"));
        assert!(result.contains("<|scene_desc_start|>"));
        assert!(!result.contains("[gentle]"));

        // With emotion
        let result = prepare_text("Hello world", "default", Some("sadness"));
        assert!(result.contains("[gentle] Hello world"));

        // Unknown emotion → no tag
        let result = prepare_text("Hello world", "default", Some("unknown_emotion"));
        assert!(result.contains("Convert the text to speech: Hello world"));
        assert!(!result.contains("["));
    }

    #[test]
    fn test_max_input_length() {
        assert_eq!(MAX_INPUT_CHARS, 4096);
    }
}
