//! Orpheus TTS Server — Rust streaming server for Orpheus TTS.
//!
//! Architecture:
//!   Text → llama-server (Orpheus GGUF, Metal) → SNAC tokens → ONNX decoder → 24kHz PCM
//!
//! Endpoints:
//!   POST /v1/audio/speech         — OpenAI-compatible TTS (returns WAV)
//!   POST /v1/audio/speech/stream  — Streaming TTS (chunked s16le PCM)
//!   GET  /health                  — Health check
//!
//! Requirements:
//!   1. llama-server running with Orpheus GGUF model
//!   2. SNAC 24kHz ONNX decoder model
//!
//! Usage:
//!   # Start llama-server first:
//!   llama-server -m orpheus-3b-0.1-ft-q4_k_m.gguf -c 8192 --port 8502 -ngl 99 --flash-attn
//!
//!   # Then start this server:
//!   cargo run --release -- --port 8501 --snac-model models/snac_24khz_decoder.onnx

mod audio;
mod llm_client;
mod snac_decoder;
mod token_parser;

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
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
use serde::Deserialize;
use tokio_stream::wrappers::ReceiverStream;
use tower_http::cors::CorsLayer;
use tracing::{error, info, warn};

use crate::audio::{encode_wav_s16le, f32_to_s16le, SAMPLE_RATE};
use crate::llm_client::LlmClient;
use crate::snac_decoder::{SharedSnacDecoder, SnacDecoder};
use crate::token_parser::TokenParser;

// ─── CLI ─────────────────────────────────────────────────────

#[derive(Parser, Debug)]
#[command(name = "orpheus-tts-server", about = "Orpheus TTS server (llama.cpp + SNAC)")]
struct Args {
    /// Server port
    #[arg(long, default_value_t = 8501)]
    port: u16,

    /// Bind address
    #[arg(long, default_value = "127.0.0.1")]
    host: String,

    /// Path to SNAC 24kHz ONNX decoder model
    #[arg(long, default_value = "models/snac_24khz_decoder.onnx")]
    snac_model: PathBuf,

    /// llama-server URL (must be running with Orpheus GGUF model)
    #[arg(long, default_value = "http://127.0.0.1:8502")]
    llama_url: String,
}

// ─── App State ───────────────────────────────────────────────

struct AppState {
    snac: SharedSnacDecoder,
    llm: LlmClient,
}

// ─── Main ────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info,ort=warn")),
        )
        .init();

    let args = Args::parse();

    // Load SNAC decoder
    let snac = SnacDecoder::load(&args.snac_model)?;
    let snac = Arc::new(snac);

    // Create LLM client
    let llm = LlmClient::new(&args.llama_url);

    // Check llama-server connectivity
    if llm.health_check().await {
        info!(url = %args.llama_url, "llama-server is reachable");
    } else {
        warn!(
            url = %args.llama_url,
            "llama-server is NOT reachable — start it with: \
             llama-server -m <orpheus.gguf> -c 8192 --port 8502 -ngl 99 --flash-attn"
        );
    }

    let state = Arc::new(AppState { snac, llm });

    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/audio/speech", post(synthesize))
        .route("/v1/audio/speech/stream", post(synthesize_stream))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::new(args.host.parse()?, args.port);
    info!(
        %addr,
        snac_model = %args.snac_model.display(),
        llama_url = %args.llama_url,
        "Orpheus TTS server starting"
    );
    info!("Voices: {}", llm_client::VOICES.join(", "));

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

// ─── Health ──────────────────────────────────────────────────

async fn health(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let llama_ok = state.llm.health_check().await;

    let status = if llama_ok { "ok" } else { "degraded" };

    Json(serde_json::json!({
        "status": status,
        "model": "orpheus-3b",
        "snac": "loaded",
        "llama_server": if llama_ok { "connected" } else { "disconnected" },
        "voices": llm_client::VOICES,
        "sample_rate": SAMPLE_RATE,
    }))
}

// ─── Request/Response types ──────────────────────────────────

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
}

fn default_voice() -> String {
    llm_client::DEFAULT_VOICE.to_string()
}

/// Resolve voice name — maps persona names to Orpheus voices.
fn resolve_voice(voice: &str) -> &str {
    match voice.to_lowercase().as_str() {
        "ferni" | "default" => "tara",
        "maya" | "maya-santos" => "leah",
        "peter" | "peter-john" => "leo",
        "alex" | "alex-chen" => "dan",
        "jordan" | "jordan-taylor" => "jess",
        "nayan" | "nayan-patel" => "zac",
        v if llm_client::VOICES.contains(&v) => {
            // Return the matching voice from the static slice
            llm_client::VOICES.iter().find(|&&s| s == v).unwrap()
        }
        _ => llm_client::DEFAULT_VOICE,
    }
}

// ─── Batch Synthesis ─────────────────────────────────────────

async fn synthesize(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SpeechRequest>,
) -> impl IntoResponse {
    let text = req.input.trim().to_string();
    if text.is_empty() {
        return (StatusCode::BAD_REQUEST, "Empty input").into_response();
    }

    let voice = resolve_voice(&req.voice);
    let start = Instant::now();

    info!(text_len = text.len(), voice, "Batch synthesis request");

    // Generate all tokens, then decode
    match generate_full_audio(&state, &text, voice).await {
        Ok(samples) => {
            let elapsed_ms = start.elapsed().as_millis();
            let duration_s = samples.len() as f64 / SAMPLE_RATE as f64;
            let rtf = elapsed_ms as f64 / (duration_s * 1000.0);

            info!(
                elapsed_ms,
                samples = samples.len(),
                duration_s = format!("{:.2}", duration_s),
                rtf = format!("{:.2}", rtf),
                voice,
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
        Err(e) => {
            error!(error = %e, "Batch synthesis failed");
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response()
        }
    }
}

/// Generate all audio from text (non-streaming).
async fn generate_full_audio(
    state: &AppState,
    text: &str,
    voice: &str,
) -> anyhow::Result<Vec<f32>> {
    let mut rx = state.llm.stream_tokens(text, voice).await?;
    let mut parser = TokenParser::new();
    let mut all_samples = Vec::new();

    while let Some(token) = rx.recv().await {
        if let Some(codes) = parser.feed_token(&token) {
            let samples = state
                .snac
                .decode(&codes.level_0, &codes.level_1, &codes.level_2)?;
            all_samples.extend_from_slice(&samples);
        }
    }

    // Flush remaining codes
    if let Some(codes) = parser.flush() {
        let samples = state
            .snac
            .decode(&codes.level_0, &codes.level_1, &codes.level_2)?;
        all_samples.extend_from_slice(&samples);
    }

    info!(
        total_tokens = parser.total_tokens,
        total_samples = all_samples.len(),
        "Token generation and SNAC decode complete"
    );

    Ok(all_samples)
}

// ─── Streaming Synthesis ─────────────────────────────────────

async fn synthesize_stream(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SpeechRequest>,
) -> impl IntoResponse {
    let text = req.input.trim().to_string();
    if text.is_empty() {
        return (StatusCode::BAD_REQUEST, "Empty input").into_response();
    }

    let voice = resolve_voice(&req.voice).to_string();
    let volume = req.volume.unwrap_or(1.0);

    info!(
        text_len = text.len(),
        voice,
        "Streaming synthesis request"
    );

    let (tx, rx) = tokio::sync::mpsc::channel::<Result<Vec<u8>, std::io::Error>>(64);

    let state_clone = state.clone();
    tokio::spawn(async move {
        let start = Instant::now();
        let mut first_audio = true;
        let mut total_bytes = 0usize;
        let mut total_samples = 0usize;

        match state_clone.llm.stream_tokens(&text, &voice).await {
            Ok(mut token_rx) => {
                let mut parser = TokenParser::new();

                while let Some(token) = token_rx.recv().await {
                    if let Some(codes) = parser.feed_token(&token) {
                        match state_clone
                            .snac
                            .decode(&codes.level_0, &codes.level_1, &codes.level_2)
                        {
                            Ok(samples) => {
                                if first_audio && !samples.is_empty() {
                                    let ttfa_ms = start.elapsed().as_millis();
                                    info!(
                                        ttfa_ms,
                                        samples = samples.len(),
                                        "First audio chunk (TTFA)"
                                    );
                                    first_audio = false;
                                }

                                total_samples += samples.len();

                                // Apply volume if needed
                                let pcm = if (volume - 1.0).abs() > f32::EPSILON {
                                    let scaled: Vec<f32> =
                                        samples.iter().map(|&s| s * volume).collect();
                                    f32_to_s16le(&scaled)
                                } else {
                                    f32_to_s16le(&samples)
                                };

                                total_bytes += pcm.len();
                                if tx.send(Ok(pcm)).await.is_err() {
                                    break;
                                }
                            }
                            Err(e) => {
                                warn!(error = %e, "SNAC decode failed for chunk");
                            }
                        }
                    }
                }

                // Flush remaining
                if let Some(codes) = parser.flush() {
                    if let Ok(samples) = state_clone
                        .snac
                        .decode(&codes.level_0, &codes.level_1, &codes.level_2)
                    {
                        total_samples += samples.len();
                        let pcm = f32_to_s16le(&samples);
                        total_bytes += pcm.len();
                        let _ = tx.send(Ok(pcm)).await;
                    }
                }

                let elapsed_ms = start.elapsed().as_millis();
                let duration_s = total_samples as f64 / SAMPLE_RATE as f64;
                let rtf = if duration_s > 0.0 {
                    elapsed_ms as f64 / (duration_s * 1000.0)
                } else {
                    0.0
                };

                info!(
                    elapsed_ms,
                    total_bytes,
                    total_samples,
                    total_tokens = parser.total_tokens,
                    duration_s = format!("{:.2}", duration_s),
                    rtf = format!("{:.2}", rtf),
                    voice,
                    "Streaming synthesis complete"
                );
            }
            Err(e) => {
                error!(error = %e, "Failed to start LLM streaming");
                let _ = tx
                    .send(Err(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        e.to_string(),
                    )))
                    .await;
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
