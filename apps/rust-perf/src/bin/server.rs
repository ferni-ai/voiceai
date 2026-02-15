//! Qwen3-Omni Candle Inference Server
//!
//! Rust HTTP server wrapping the full Candle Omni pipeline.
//! Serves OpenAI-compatible endpoints + WebSocket streaming for real-time audio.
//!
//! Run:  cargo run --bin qwen3-omni-server --features server --no-default-features -- --model-path /path/to/weights
//! Test: curl http://localhost:8000/health
//! WS:   websocat ws://localhost:8000/v1/stream/omni

use std::sync::Arc;
use std::time::Instant;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::StatusCode,
    response::{IntoResponse, Json},
    routing::{get, post},
    Router,
};
use base64::Engine as _;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tower_http::cors::CorsLayer;

use ferni_perf::full_omni_pipeline::FullOmniPipeline;
use ferni_perf::humanization;
use ferni_perf::voice_biomarkers;

// =============================================================================
// STATE
// =============================================================================

struct AppState {
    pipeline: FullOmniPipeline,
    model_path: String,
    start_time: Instant,
}

// =============================================================================
// REQUEST / RESPONSE TYPES (OpenAI-compatible)
// =============================================================================

#[derive(Deserialize)]
struct ChatCompletionRequest {
    messages: Vec<ChatMessage>,
    #[serde(default = "default_model")]
    model: String,
    #[serde(default = "default_max_tokens")]
    max_tokens: usize,
    #[serde(default = "default_temperature")]
    temperature: f64,
    #[serde(default)]
    tools: Option<Vec<serde_json::Value>>,
    #[serde(default)]
    stream: bool,
}

#[derive(Deserialize, Serialize, Clone)]
struct ChatMessage {
    role: String,
    content: Option<String>,
    #[serde(default)]
    tool_calls: Option<Vec<serde_json::Value>>,
    #[serde(default)]
    tool_call_id: Option<String>,
}

fn default_model() -> String {
    "Qwen3-Omni".to_string()
}
fn default_max_tokens() -> usize {
    4096
}
fn default_temperature() -> f64 {
    0.7
}

#[derive(Serialize)]
struct ChatCompletionResponse {
    id: String,
    object: String,
    created: u64,
    model: String,
    choices: Vec<Choice>,
    usage: Usage,
}

#[derive(Serialize)]
struct Choice {
    index: usize,
    message: ResponseMessage,
    finish_reason: String,
}

#[derive(Serialize)]
struct ResponseMessage {
    role: String,
    content: Option<String>,
}

#[derive(Serialize)]
struct Usage {
    prompt_tokens: usize,
    completion_tokens: usize,
    total_tokens: usize,
}

#[derive(Serialize)]
struct AudioTranscriptionResponse {
    text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    duration_ms: Option<u64>,
}

#[derive(Deserialize)]
struct AudioSpeechRequest {
    input: String,
    #[serde(default = "default_model")]
    model: String,
    #[serde(default = "default_voice")]
    voice: String,
}

fn default_voice() -> String {
    "ferni".to_string()
}

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    model: String,
    uptime_seconds: u64,
    pipeline: String,
    omni_pipeline: bool,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: ErrorDetail,
}

#[derive(Serialize)]
struct ErrorDetail {
    message: String,
    r#type: String,
}

// =============================================================================
// OMNI ENDPOINT TYPES
// =============================================================================

#[derive(Deserialize)]
struct OmniAudioRequest {
    audio_base64: String,
    #[serde(default = "default_sample_rate")]
    sample_rate: u32,
}

fn default_sample_rate() -> u32 {
    16000
}

#[derive(Serialize)]
struct OmniTimingsResponse {
    mel_ms: f64,
    encoder_ms: f64,
    thinker_ms: f64,
    talker_ms: f64,
    code2wav_ms: f64,
    total_ms: f64,
}

#[derive(Serialize)]
struct OmniAudioResponse {
    audio_base64: String,
    sample_rate: u32,
    timings: OmniTimingsResponse,
}

// =============================================================================
// VOICE BIOMARKER TYPES
// =============================================================================

#[derive(Serialize)]
struct BiomarkerResponse {
    biomarkers: voice_biomarkers::VoiceBiomarkers,
    breath_pauses: Vec<voice_biomarkers::BreathPause>,
    sample_count: usize,
    duration_ms: u64,
}

// =============================================================================
// WEBSOCKET TYPES
// =============================================================================

#[derive(Deserialize)]
struct WsConfig {
    #[serde(default = "default_sample_rate")]
    sample_rate: u32,
    #[serde(default)]
    format: String,
}

#[derive(Deserialize)]
struct WsAction {
    action: String,
}

// =============================================================================
// HANDLERS
// =============================================================================

async fn health(State(state): State<Arc<AppState>>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        model: "Qwen3-Omni (Candle/Rust)".to_string(),
        uptime_seconds: state.start_time.elapsed().as_secs(),
        pipeline: "Mel \u{2192} AuT \u{2192} Thinker \u{2192} Talker \u{2192} Code2Wav".to_string(),
        omni_pipeline: state.model_path != "test-mode",
    })
}

/// POST /v1/chat/completions — OpenAI-compatible text chat.
/// Currently runs Thinker text-in/text-out (no audio input in this endpoint).
/// The pipeline returns generated text from the Thinker model.
async fn chat_completions(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ChatCompletionRequest>,
) -> Result<Json<ChatCompletionResponse>, (StatusCode, Json<ErrorResponse>)> {
    let start = Instant::now();

    // Extract the last user message as input text
    let user_text = req
        .messages
        .iter()
        .rev()
        .find(|m| m.role == "user")
        .and_then(|m| m.content.clone())
        .unwrap_or_default();

    if user_text.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: ErrorDetail {
                    message: "No user message content provided".to_string(),
                    r#type: "invalid_request_error".to_string(),
                },
            }),
        ));
    }

    // Build prompt from full message history (system + user + assistant turns)
    let prompt = req
        .messages
        .iter()
        .map(|m| {
            let role = &m.role;
            let content = m.content.as_deref().unwrap_or("");
            format!("<|im_start|>{}\n{}<|im_end|>", role, content)
        })
        .collect::<Vec<_>>()
        .join("\n")
        + "\n<|im_start|>assistant\n";

    // Run Thinker text generation
    let response_text = match state.pipeline.generate_text(&prompt, req.max_tokens, req.temperature) {
        Ok(text) => {
            // Strip the prompt prefix if the model echoed it back
            let clean: String = if text.starts_with(&prompt) {
                text[prompt.len()..].to_string()
            } else {
                text
            };
            // Strip any trailing special tokens
            clean
                .trim_end_matches("<|im_end|>")
                .trim_end_matches("<|endoftext|>")
                .trim()
                .to_string()
        }
        Err(e) => {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: ErrorDetail {
                        message: format!("Thinker generation error: {}", e),
                        r#type: "server_error".to_string(),
                    },
                }),
            ));
        }
    };

    let latency_ms = start.elapsed().as_millis() as u64;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let prompt_tokens = prompt.len() / 4; // rough estimate
    let completion_tokens = response_text.len() / 4;

    Ok(Json(ChatCompletionResponse {
        id: format!("chatcmpl-candle-{}", now),
        object: "chat.completion".to_string(),
        created: now,
        model: req.model,
        choices: vec![Choice {
            index: 0,
            message: ResponseMessage {
                role: "assistant".to_string(),
                content: Some(response_text),
            },
            finish_reason: "stop".to_string(),
        }],
        usage: Usage {
            prompt_tokens,
            completion_tokens,
            total_tokens: prompt_tokens + completion_tokens,
        },
    }))
}

/// POST /v1/audio/transcriptions — Audio -> Text (STT via full Omni pipeline).
/// Accepts raw audio bytes (16kHz mono f32 PCM) and returns transcription text.
async fn audio_transcriptions(
    State(state): State<Arc<AppState>>,
    body: axum::body::Bytes,
) -> Result<Json<AudioTranscriptionResponse>, (StatusCode, Json<ErrorResponse>)> {
    let start = Instant::now();

    if body.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: ErrorDetail {
                    message: "Empty audio data".to_string(),
                    r#type: "invalid_request_error".to_string(),
                },
            }),
        ));
    }

    // Interpret body as f32 PCM samples (16kHz mono)
    let samples: Vec<f32> = body
        .chunks(4)
        .filter_map(|chunk| {
            if chunk.len() == 4 {
                Some(f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
            } else {
                None
            }
        })
        .collect();

    if samples.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: ErrorDetail {
                    message: "No valid audio samples in request body".to_string(),
                    r#type: "invalid_request_error".to_string(),
                },
            }),
        ));
    }

    // Audio -> Mel -> Encoder -> Thinker -> text transcription
    match state.pipeline.transcribe_audio(&samples, 512, 0.0) {
        Ok((text, timings)) => {
            let duration = start.elapsed().as_millis() as u64;
            eprintln!(
                "📝 Transcribed {} samples → {} chars in {}ms (mel: {:.1}ms, encoder: {:.1}ms, thinker: {:.1}ms)",
                samples.len(), text.len(), duration,
                timings.mel_ms, timings.encoder_ms, timings.thinker_ms,
            );
            Ok(Json(AudioTranscriptionResponse {
                text,
                duration_ms: Some(duration),
            }))
        }
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: ErrorDetail {
                    message: format!("Transcription error: {}", e),
                    r#type: "server_error".to_string(),
                },
            }),
        )),
    }
}

/// POST /v1/audio/speech — Text -> Audio (TTS via Talker + Code2Wav).
/// Returns raw audio bytes (24kHz mono f32 PCM).
async fn audio_speech(
    State(state): State<Arc<AppState>>,
    Json(req): Json<AudioSpeechRequest>,
) -> Result<Vec<u8>, (StatusCode, Json<ErrorResponse>)> {
    if req.input.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: ErrorDetail {
                    message: "Empty input text".to_string(),
                    r#type: "invalid_request_error".to_string(),
                },
            }),
        ));
    }

    // Text -> Thinker (hidden states) -> Talker -> Code2Wav -> waveform
    match state.pipeline.synthesize_speech(&req.input, 0.7) {
        Ok((waveform, timings)) => {
            eprintln!(
                "🔊 Synthesized '{}' → {} samples in {:.1}ms (thinker: {:.1}ms, talker: {:.1}ms, code2wav: {:.1}ms)",
                if req.input.len() > 50 { &req.input[..50] } else { &req.input },
                waveform.len(),
                timings.total_ms, timings.thinker_ms, timings.talker_ms, timings.code2wav_ms,
            );
            let bytes: Vec<u8> = waveform
                .iter()
                .flat_map(|s: &f32| s.to_le_bytes())
                .collect();
            Ok(bytes)
        }
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: ErrorDetail {
                    message: format!("Speech synthesis error: {}", e),
                    r#type: "server_error".to_string(),
                },
            }),
        )),
    }
}

// =============================================================================
// VOICE BIOMARKERS: POST /v1/audio/biomarkers
// =============================================================================

/// Accepts raw PCM bytes (s16le 16kHz mono), returns voice biomarkers JSON.
async fn audio_biomarkers(
    body: axum::body::Bytes,
) -> Result<Json<BiomarkerResponse>, (StatusCode, Json<ErrorResponse>)> {
    let start = Instant::now();

    if body.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: ErrorDetail {
                    message: "Empty audio data".to_string(),
                    r#type: "invalid_request_error".to_string(),
                },
            }),
        ));
    }

    // Parse Int16 PCM to f32 (same pattern as WebSocket handler)
    let samples: Vec<f32> = body
        .chunks(2)
        .filter_map(|chunk| {
            if chunk.len() == 2 {
                let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
                Some(sample as f32 / 32768.0)
            } else {
                None
            }
        })
        .collect();

    if samples.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: ErrorDetail {
                    message: "No valid audio samples in request body".to_string(),
                    r#type: "invalid_request_error".to_string(),
                },
            }),
        ));
    }

    let sample_count = samples.len();
    let biomarkers = voice_biomarkers::analyze_biomarkers(&samples, 16000);
    let breath_pauses = voice_biomarkers::detect_breath_pauses(&samples, 16000);
    let duration_ms = start.elapsed().as_millis() as u64;

    eprintln!(
        "🎙️ Biomarkers: {} samples, pitch={:.0}Hz, energy={:.3}, jitter={:.3}, shimmer={:.3}, speech={}, {}ms",
        sample_count, biomarkers.pitch_hz, biomarkers.energy,
        biomarkers.jitter, biomarkers.shimmer, biomarkers.is_speech, duration_ms,
    );

    Ok(Json(BiomarkerResponse {
        biomarkers,
        breath_pauses,
        sample_count,
        duration_ms,
    }))
}

// =============================================================================
// WEBSOCKET STREAMING: GET /v1/stream/omni
// =============================================================================

/// WebSocket upgrade handler. Accepts connection and delegates to handle_omni_ws.
async fn ws_stream_omni(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_omni_ws(socket, state))
}

/// WebSocket session handler for streaming audio-to-audio inference.
///
/// Protocol:
///   1. Client sends JSON config:  {"sample_rate": 16000, "format": "pcm_s16le"}
///   2. Client sends binary frames: PCM Int16 16kHz mono audio
///   3. Client sends JSON action:   {"action": "process"}
///   4. Server responds with:
///      - JSON timings:  {"type": "timings", "mel_ms": ..., ...}
///      - Binary frames: PCM f32 24kHz mono (each frame = 480 samples = 20ms)
///      - JSON done:     {"type": "done"}
///   5. Client can send more audio for next turn, or close.
async fn handle_omni_ws(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();

    // Step 1: Wait for config message
    let config: WsConfig = match receiver.next().await {
        Some(Ok(Message::Text(text))) => {
            match serde_json::from_str(&text) {
                Ok(c) => c,
                Err(e) => {
                    let err = serde_json::json!({
                        "type": "error",
                        "message": format!("Invalid config JSON: {}", e)
                    });
                    let _ = sender
                        .send(Message::Text(err.to_string().into()))
                        .await;
                    return;
                }
            }
        }
        Some(Ok(Message::Close(_))) | None => return,
        _ => {
            let err = serde_json::json!({
                "type": "error",
                "message": "Expected JSON config as first message"
            });
            let _ = sender
                .send(Message::Text(err.to_string().into()))
                .await;
            return;
        }
    };

    eprintln!(
        "🔌 WebSocket connected: sample_rate={}, format={}",
        config.sample_rate,
        if config.format.is_empty() { "pcm_s16le" } else { &config.format }
    );

    // Audio buffer accumulates binary frames between "process" commands
    let mut audio_buffer: Vec<u8> = Vec::new();

    // Step 2-5: Message loop
    while let Some(msg_result) = receiver.next().await {
        match msg_result {
            // Binary frame: accumulate PCM audio
            Ok(Message::Binary(data)) => {
                audio_buffer.extend_from_slice(&data);
            }

            // Text frame: JSON control message
            Ok(Message::Text(text)) => {
                let text_str: &str = &text;
                if let Ok(action) = serde_json::from_str::<WsAction>(text_str) {
                    if action.action == "process" {
                        // Convert Int16 PCM to f32 (divide by 32768.0)
                        let samples: Vec<f32> = audio_buffer
                            .chunks(2)
                            .filter_map(|chunk| {
                                if chunk.len() == 2 {
                                    let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
                                    Some(sample as f32 / 32768.0)
                                } else {
                                    None
                                }
                            })
                            .collect();

                        let sample_count = samples.len();
                        audio_buffer.clear();

                        if sample_count == 0 {
                            let err = serde_json::json!({
                                "type": "error",
                                "message": "No audio samples buffered"
                            });
                            let _ = sender
                                .send(Message::Text(err.to_string().into()))
                                .await;
                            continue;
                        }

                        eprintln!(
                            "🎙️ Processing {} samples ({:.1}s at 16kHz)",
                            sample_count,
                            sample_count as f64 / 16000.0
                        );

                        // Run pipeline on blocking thread (CPU-bound Metal GPU work)
                        let pipeline_state = state.clone();
                        let result = tokio::task::spawn_blocking(move || {
                            pipeline_state.pipeline.process_audio_streaming(&samples)
                        })
                        .await;

                        match result {
                            Ok(Ok((rx, timings))) => {
                                // Send timings
                                let timings_msg = serde_json::json!({
                                    "type": "timings",
                                    "mel_ms": timings.mel_ms,
                                    "encoder_ms": timings.encoder_ms,
                                    "thinker_ms": timings.thinker_ms,
                                    "talker_ms": timings.talker_ms,
                                    "code2wav_ms": timings.code2wav_ms,
                                    "total_ms": timings.total_ms,
                                });
                                if sender
                                    .send(Message::Text(timings_msg.to_string().into()))
                                    .await
                                    .is_err()
                                {
                                    break;
                                }

                                // Stream audio chunks as binary frames (f32 PCM 24kHz)
                                let mut chunk_count = 0usize;
                                while let Ok(chunk) = rx.recv() {
                                    let bytes: Vec<u8> = chunk
                                        .samples
                                        .iter()
                                        .flat_map(|s| s.to_le_bytes())
                                        .collect();
                                    chunk_count += 1;
                                    if sender
                                        .send(Message::Binary(bytes.into()))
                                        .await
                                        .is_err()
                                    {
                                        break;
                                    }
                                }

                                eprintln!(
                                    "📡 Streamed {} chunks ({:.1}ms total pipeline)",
                                    chunk_count, timings.total_ms
                                );

                                // Send done
                                let done_msg = serde_json::json!({"type": "done"});
                                let _ = sender
                                    .send(Message::Text(done_msg.to_string().into()))
                                    .await;
                            }
                            Ok(Err(e)) => {
                                let err = serde_json::json!({
                                    "type": "error",
                                    "message": format!("Pipeline error: {}", e)
                                });
                                let _ = sender
                                    .send(Message::Text(err.to_string().into()))
                                    .await;
                            }
                            Err(e) => {
                                let err = serde_json::json!({
                                    "type": "error",
                                    "message": format!("Task join error: {}", e)
                                });
                                let _ = sender
                                    .send(Message::Text(err.to_string().into()))
                                    .await;
                            }
                        }
                    }
                }
            }

            Ok(Message::Close(_)) => break,
            Err(_) => break,
            _ => {} // Ignore Ping/Pong (handled by axum internally)
        }
    }

    eprintln!("🔌 WebSocket disconnected");
}

// =============================================================================
// HTTP OMNI ENDPOINT: POST /v1/audio/omni
// =============================================================================

/// Non-streaming audio-to-audio pipeline. Accepts base64-encoded Int16 PCM,
/// returns base64-encoded f32 PCM with timing metrics.
async fn audio_omni(
    State(state): State<Arc<AppState>>,
    Json(req): Json<OmniAudioRequest>,
) -> Result<Json<OmniAudioResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Decode base64 to raw bytes
    let audio_bytes = base64::engine::general_purpose::STANDARD
        .decode(&req.audio_base64)
        .map_err(|e| {
            (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: ErrorDetail {
                        message: format!("Invalid base64 audio: {}", e),
                        r#type: "invalid_request_error".to_string(),
                    },
                }),
            )
        })?;

    // Convert Int16 PCM to f32
    let samples: Vec<f32> = audio_bytes
        .chunks(2)
        .filter_map(|chunk| {
            if chunk.len() == 2 {
                let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
                Some(sample as f32 / 32768.0)
            } else {
                None
            }
        })
        .collect();

    if samples.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: ErrorDetail {
                    message: "No valid audio samples after base64 decode".to_string(),
                    r#type: "invalid_request_error".to_string(),
                },
            }),
        ));
    }

    let sample_count = samples.len();

    // Run pipeline on blocking thread
    let pipeline_state = state.clone();
    let result = tokio::task::spawn_blocking(move || {
        pipeline_state.pipeline.process_audio_timed(&samples)
    })
    .await;

    match result {
        Ok(Ok((waveform, timings))) => {
            // Encode output f32 PCM as base64
            let output_bytes: Vec<u8> = waveform
                .iter()
                .flat_map(|s| s.to_le_bytes())
                .collect();
            let output_base64 =
                base64::engine::general_purpose::STANDARD.encode(&output_bytes);

            eprintln!(
                "🎙️ Omni: {} input samples → {} output samples in {:.1}ms",
                sample_count,
                waveform.len(),
                timings.total_ms,
            );

            Ok(Json(OmniAudioResponse {
                audio_base64: output_base64,
                sample_rate: 24000,
                timings: OmniTimingsResponse {
                    mel_ms: timings.mel_ms,
                    encoder_ms: timings.encoder_ms,
                    thinker_ms: timings.thinker_ms,
                    talker_ms: timings.talker_ms,
                    code2wav_ms: timings.code2wav_ms,
                    total_ms: timings.total_ms,
                },
            }))
        }
        Ok(Err(e)) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: ErrorDetail {
                    message: format!("Pipeline error: {}", e),
                    r#type: "server_error".to_string(),
                },
            }),
        )),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: ErrorDetail {
                    message: format!("Task join error: {}", e),
                    r#type: "server_error".to_string(),
                },
            }),
        )),
    }
}

// =============================================================================
// HUMANIZATION ENDPOINT: POST /v1/audio/humanize
// =============================================================================

#[derive(Deserialize)]
struct HumanizeRequest {
    /// Base64-encoded PCM audio (s16le, 24kHz mono)
    audio_base64: String,
    /// Humanization context from the TypeScript intelligence layer
    context: humanization::HumanizationContext,
    #[serde(default = "default_humanize_sample_rate")]
    sample_rate: u32,
}

fn default_humanize_sample_rate() -> u32 {
    24000
}

#[derive(Serialize)]
struct HumanizeResponse {
    audio_base64: String,
    sample_rate: u32,
    metadata: humanization::HumanizationMetadata,
}

/// POST /v1/audio/humanize — Apply humanization DSP to TTS audio.
///
/// Accepts base64-encoded Int16 PCM (24kHz mono) + HumanizationContext JSON.
/// Returns humanized audio as base64-encoded Int16 PCM with metadata.
async fn audio_humanize(
    Json(req): Json<HumanizeRequest>,
) -> Result<Json<HumanizeResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Decode base64 to raw bytes
    let audio_bytes = base64::engine::general_purpose::STANDARD
        .decode(&req.audio_base64)
        .map_err(|e| {
            (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: ErrorDetail {
                        message: format!("Invalid base64 audio: {}", e),
                        r#type: "invalid_request_error".to_string(),
                    },
                }),
            )
        })?;

    // Convert Int16 PCM to f32 normalized
    let samples: Vec<f32> = audio_bytes
        .chunks(2)
        .filter_map(|chunk| {
            if chunk.len() == 2 {
                let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
                Some(sample as f32 / 32768.0)
            } else {
                None
            }
        })
        .collect();

    if samples.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: ErrorDetail {
                    message: "No valid audio samples after base64 decode".to_string(),
                    r#type: "invalid_request_error".to_string(),
                },
            }),
        ));
    }

    let sample_count = samples.len();
    let sample_rate = req.sample_rate;
    let context = req.context;

    // Run humanization on blocking thread (CPU-bound DSP work)
    let result = tokio::task::spawn_blocking(move || {
        humanization::humanize_audio(&samples, sample_rate, &context)
    })
    .await;

    match result {
        Ok(humanized) => {
            // Convert f32 back to Int16 PCM
            let output_bytes: Vec<u8> = humanized
                .samples
                .iter()
                .flat_map(|s| {
                    let clamped = s.clamp(-1.0, 1.0);
                    let i16_val = (clamped * 32767.0) as i16;
                    i16_val.to_le_bytes()
                })
                .collect();
            let output_base64 =
                base64::engine::general_purpose::STANDARD.encode(&output_bytes);

            eprintln!(
                "🎭 Humanized {} samples → {} samples in {:.1}ms (breaths: {}, fillers: {}, pitch: {:.1}st)",
                sample_count,
                humanized.samples.len(),
                humanized.metadata.processing_ms,
                humanized.metadata.breaths_injected,
                humanized.metadata.fillers_injected,
                humanized.metadata.pitch_shift_semitones,
            );

            Ok(Json(HumanizeResponse {
                audio_base64: output_base64,
                sample_rate: req.sample_rate,
                metadata: humanized.metadata,
            }))
        }
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: ErrorDetail {
                    message: format!("Humanization task error: {}", e),
                    r#type: "server_error".to_string(),
                },
            }),
        )),
    }
}

// =============================================================================
// MAIN
// =============================================================================

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();

    // Support both --model-path and --omni-model-path
    let model_path = args
        .iter()
        .position(|a| a == "--model-path" || a == "--omni-model-path")
        .and_then(|i| args.get(i + 1))
        .cloned()
        .or_else(|| std::env::var("OMNI_MODEL_PATH").ok())
        .unwrap_or_else(|| {
            eprintln!("Usage: qwen3-omni-server --model-path /path/to/weights");
            eprintln!("   Or: qwen3-omni-server --omni-model-path /path/to/weights --omni-tokenizer-path /path/to/tokenizer.json");
            eprintln!("   Or: OMNI_MODEL_PATH=/path/to/weights qwen3-omni-server");
            eprintln!("\nStarting in test mode (zero weights, shape validation only)...");
            String::new()
        });

    // Optional explicit tokenizer path (defaults to {model_path}/tokenizer.json)
    let tokenizer_path_override = args
        .iter()
        .position(|a| a == "--omni-tokenizer-path")
        .and_then(|i| args.get(i + 1))
        .cloned();

    let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = std::env::var("PORT").unwrap_or_else(|_| "8000".to_string());
    let bind_addr = format!("{}:{}", host, port);

    eprintln!("🚀 Qwen3-Omni Candle Server");
    eprintln!("   Rust + Metal (Mac) / CPU (Linux)");
    eprintln!("   Bind: {}", bind_addr);

    let pipeline = if model_path.is_empty() {
        eprintln!("   Mode: test (zero weights)");
        FullOmniPipeline::new_test_mode_cpu()
            .expect("Failed to create test pipeline")
    } else {
        eprintln!("   Model: {}", model_path);
        let tokenizer_path = tokenizer_path_override
            .unwrap_or_else(|| format!("{}/tokenizer.json", model_path));
        eprintln!("   Tokenizer: {}", tokenizer_path);
        FullOmniPipeline::load_from_dir(&model_path, &tokenizer_path)
            .expect("Failed to load pipeline")
    };

    eprintln!("   Pipeline: Mel → AuT → Thinker → Talker → Code2Wav");
    eprintln!("   Output: {}Hz", pipeline.sample_rate_out());

    let state = Arc::new(AppState {
        pipeline,
        model_path: if model_path.is_empty() { "test-mode".to_string() } else { model_path },
        start_time: Instant::now(),
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/chat/completions", post(chat_completions))
        .route("/v1/audio/transcriptions", post(audio_transcriptions))
        .route("/v1/audio/speech", post(audio_speech))
        .route("/v1/audio/biomarkers", post(audio_biomarkers))
        .route("/v1/audio/humanize", post(audio_humanize))
        .route("/v1/stream/omni", get(ws_stream_omni))
        .route("/v1/audio/omni", post(audio_omni))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&bind_addr)
        .await
        .expect("Failed to bind");

    eprintln!("✅ Listening on {}", bind_addr);
    eprintln!("   GET  /health");
    eprintln!("   POST /v1/chat/completions");
    eprintln!("   POST /v1/audio/transcriptions");
    eprintln!("   POST /v1/audio/speech");
    eprintln!("   POST /v1/audio/biomarkers");
    eprintln!("   POST /v1/audio/humanize");
    eprintln!("   GET  /v1/stream/omni          (WebSocket)");
    eprintln!("   POST /v1/audio/omni           (non-streaming)");

    axum::serve(listener, app).await.expect("Server error");
}
