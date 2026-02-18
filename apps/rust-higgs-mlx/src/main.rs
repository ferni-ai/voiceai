//! Higgs Audio V2 MLX Server — Rust TTS via WebSocket.
//!
//! Loads Higgs Audio V2 on Apple MLX with INT4 quantization.
//! Exposes /health (HTTP) and WebSocket TTS streaming.
//!
//! Usage:
//!   MODEL_DIR=../../models/higgs-audio-v2 PORT=8700 cargo run --release

mod config;
mod generate;
mod model;

use std::path::PathBuf;
use std::sync::Arc;

use anyhow::Result;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tracing::info;

use config::HiggsAudioConfig;
use generate::{
    build_text_tokens, generate_audio, load_weights, quantize_model_weights,
    GenerationConfig, XCodecDecoder,
};
use model::HiggsAudioModelMlx;

/// Application state shared across handlers.
struct AppState {
    model: Mutex<HiggsAudioModelMlx>,
    config: HiggsAudioConfig,
    tokenizer: tokenizers::Tokenizer,
    decoder: Mutex<Option<XCodecDecoder>>,
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    model: &'static str,
    backend: &'static str,
    quantization: &'static str,
}

// ─── WebSocket Protocol ─────────────────────────────────────

#[derive(Deserialize)]
#[serde(tag = "type")]
enum WsRequest {
    StartSession,
    Synthesize {
        text: String,
        #[serde(default = "default_request_id")]
        request_id: u64,
        #[serde(default = "default_temperature")]
        temperature: f32,
        #[serde(default = "default_max_tokens")]
        max_tokens: usize,
    },
    SynthesizeStreaming {
        text: String,
        #[serde(default = "default_request_id")]
        request_id: u64,
        #[serde(default = "default_temperature")]
        temperature: f32,
        #[serde(default = "default_max_tokens")]
        max_tokens: usize,
        #[serde(default = "default_chunk_size")]
        chunk_size: usize,
    },
    EndSession,
}

fn default_request_id() -> u64 {
    0
}
fn default_temperature() -> f32 {
    0.3
}
fn default_max_tokens() -> usize {
    750
}
fn default_chunk_size() -> usize {
    25
}

// ─── Handlers ───────────────────────────────────────────────

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        model: "higgs-audio-v2",
        backend: "mlx-rs",
        quantization: "int4",
    })
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws(socket, state))
}

/// Send a JSON message over the WebSocket.
async fn ws_json(socket: &mut WebSocket, json: serde_json::Value) {
    let _ = socket.send(Message::Text(json.to_string().into())).await;
}

/// Send binary data over the WebSocket.
async fn ws_binary(socket: &mut WebSocket, data: Vec<u8>) {
    let _ = socket.send(Message::Binary(data.into())).await;
}

async fn handle_ws(mut socket: WebSocket, state: Arc<AppState>) {
    info!("WebSocket client connected");

    while let Some(Ok(msg)) = socket.recv().await {
        let text = match msg {
            Message::Text(t) => t,
            Message::Close(_) => break,
            _ => continue,
        };

        let req: WsRequest = match serde_json::from_str(&text) {
            Ok(r) => r,
            Err(e) => {
                ws_json(&mut socket, serde_json::json!({"type": "Error", "message": format!("Invalid JSON: {e}")})).await;
                continue;
            }
        };

        match req {
            WsRequest::StartSession => {
                ws_json(&mut socket, serde_json::json!({"type": "SessionStarted"})).await;
            }

            WsRequest::Synthesize {
                text: synth_text,
                request_id,
                temperature,
                max_tokens,
            } => {
                let gen_config = GenerationConfig {
                    max_audio_tokens: max_tokens,
                    temperature,
                    ..Default::default()
                };

                let text_tokens = match build_text_tokens(&synth_text, &state.tokenizer) {
                    Ok(t) => t,
                    Err(e) => {
                        ws_json(&mut socket, serde_json::json!({"type": "Error", "message": e.to_string()})).await;
                        continue;
                    }
                };

                let result = {
                    let mut model = state.model.lock().await;
                    generate_audio(&mut model, &text_tokens, &state.config, &gen_config)
                };

                match result {
                    Ok(generated) => {
                        let mut dec = state.decoder.lock().await;
                        if let Some(ref mut decoder) = *dec {
                            match decoder.decode(&generated.codes) {
                                Ok(pcm) => {
                                    let bytes: Vec<u8> = pcm.iter().flat_map(|&s| s.to_le_bytes()).collect();
                                    ws_binary(&mut socket, bytes).await;
                                }
                                Err(e) => {
                                    ws_json(&mut socket, serde_json::json!({"type": "Error", "message": format!("Decode: {e}")})).await;
                                    continue;
                                }
                            }
                        }
                        ws_json(&mut socket, serde_json::json!({
                            "type": "SynthesisComplete",
                            "request_id": request_id,
                            "audio_tokens": generated.raw_steps,
                            "tokens_per_sec": generated.stats.tokens_per_sec,
                            "rtf": generated.stats.rtf,
                            "audio_duration_s": generated.stats.audio_duration_s,
                        })).await;
                    }
                    Err(e) => {
                        ws_json(&mut socket, serde_json::json!({"type": "Error", "message": e.to_string()})).await;
                    }
                }
            }

            WsRequest::SynthesizeStreaming {
                text: synth_text,
                request_id,
                temperature,
                max_tokens,
                chunk_size,
            } => {
                let gen_config = GenerationConfig {
                    max_audio_tokens: max_tokens,
                    temperature,
                    chunk_size,
                    ..Default::default()
                };

                let text_tokens = match build_text_tokens(&synth_text, &state.tokenizer) {
                    Ok(t) => t,
                    Err(e) => {
                        ws_json(&mut socket, serde_json::json!({"type": "Error", "message": e.to_string()})).await;
                        continue;
                    }
                };

                let result = {
                    let mut model = state.model.lock().await;
                    generate_audio(&mut model, &text_tokens, &state.config, &gen_config)
                };

                match result {
                    Ok(generated) => {
                        let mut dec = state.decoder.lock().await;
                        if let Some(ref mut decoder) = *dec {
                            match decoder.decode(&generated.codes) {
                                Ok(pcm) => {
                                    let samples_per_chunk = ((gen_config.chunk_size as f64) * 0.04 * 24000.0) as usize;
                                    let samples_per_chunk = samples_per_chunk.max(960);

                                    for chunk in pcm.chunks(samples_per_chunk) {
                                        ws_json(&mut socket, serde_json::json!({
                                            "type": "AudioChunk",
                                            "request_id": request_id,
                                            "samples": chunk.len(),
                                        })).await;

                                        let bytes: Vec<u8> = chunk.iter().flat_map(|&s| s.to_le_bytes()).collect();
                                        ws_binary(&mut socket, bytes).await;
                                    }
                                }
                                Err(e) => {
                                    ws_json(&mut socket, serde_json::json!({"type": "Error", "message": format!("Decode: {e}")})).await;
                                    continue;
                                }
                            }
                        }
                        ws_json(&mut socket, serde_json::json!({
                            "type": "StreamComplete",
                            "request_id": request_id,
                            "audio_tokens": generated.raw_steps,
                            "tokens_per_sec": generated.stats.tokens_per_sec,
                            "rtf": generated.stats.rtf,
                            "audio_duration_s": generated.stats.audio_duration_s,
                        })).await;
                    }
                    Err(e) => {
                        ws_json(&mut socket, serde_json::json!({"type": "Error", "message": e.to_string()})).await;
                    }
                }
            }

            WsRequest::EndSession => {
                ws_json(&mut socket, serde_json::json!({"type": "SessionEnded"})).await;
                break;
            }
        }
    }

    info!("WebSocket client disconnected");
}

// ─── Main ───────────────────────────────────────────────────

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let model_dir = std::env::var("MODEL_DIR")
        .unwrap_or_else(|_| "../../models/higgs-audio-v2".into());
    let model_dir = PathBuf::from(&model_dir);
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8700);

    info!(model_dir = %model_dir.display(), port, "Starting Higgs MLX Rust server");

    // Load config
    let config_path = model_dir.join("config.json");
    let config_str = std::fs::read_to_string(&config_path)?;
    let config: HiggsAudioConfig = serde_json::from_str(&config_str)?;
    info!(
        layers = config.text_config.num_hidden_layers,
        hidden = config.text_config.hidden_size,
        codebooks = config.audio_num_codebooks,
        "Config loaded"
    );

    // Create model
    info!("Creating MLX model...");
    let mut model = HiggsAudioModelMlx::new(&config)
        .map_err(|e| anyhow::anyhow!("Model creation failed: {e}"))?;

    // Load weights
    load_weights(&mut model, &model_dir)?;

    // INT4 weight quantization
    quantize_model_weights(&mut model)?;

    // Load tokenizer
    let tokenizer_path = model_dir.join("tokenizer.json");
    let tokenizer = tokenizers::Tokenizer::from_file(&tokenizer_path)
        .map_err(|e| anyhow::anyhow!("Failed to load tokenizer: {e}"))?;
    info!("Tokenizer loaded");

    // Load xCodec decoder
    let xcodec_path = model_dir.join("xcodec_decoder.onnx");
    let decoder = if xcodec_path.exists() {
        Some(XCodecDecoder::new(&xcodec_path, config.audio_num_codebooks)?)
    } else {
        info!("xCodec decoder not found, audio decode disabled");
        None
    };

    let state = Arc::new(AppState {
        model: Mutex::new(model),
        config,
        tokenizer,
        decoder: Mutex::new(decoder),
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/ws", get(ws_handler))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await?;
    info!(port, "Server listening — health: /health, TTS: /ws");
    axum::serve(listener, app).await?;

    Ok(())
}
