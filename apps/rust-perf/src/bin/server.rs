//! Qwen3-Omni Candle Inference Server
//!
//! Rust HTTP server wrapping the full Candle Omni pipeline.
//! Serves OpenAI-compatible endpoints that the TypeScript Qwen3OmniClient talks to.
//!
//! Run:  cargo run --bin qwen3-omni-server --features server --no-default-features -- --model-path /path/to/weights
//! Test: curl http://localhost:8000/health

use std::sync::Arc;
use std::time::Instant;

use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use tower_http::cors::CorsLayer;

use ferni_perf::full_omni_pipeline::FullOmniPipeline;

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
// HANDLERS
// =============================================================================

async fn health(State(state): State<Arc<AppState>>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        model: "Qwen3-Omni (Candle/Rust)".to_string(),
        uptime_seconds: state.start_time.elapsed().as_secs(),
        pipeline: "Mel → AuT → Thinker → Talker → Code2Wav".to_string(),
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
            let clean = if text.starts_with(&prompt) {
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

/// POST /v1/audio/transcriptions — Audio → Text (STT via full Omni pipeline).
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

    // Audio → Mel → Encoder → Thinker → text transcription
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

/// POST /v1/audio/speech — Text → Audio (TTS via Talker + Code2Wav).
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

    // Text → Thinker (hidden states) → Talker → Code2Wav → waveform
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
                .flat_map(|s| s.to_le_bytes())
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
// MAIN
// =============================================================================

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();

    let model_path = args
        .iter()
        .position(|a| a == "--model-path")
        .and_then(|i| args.get(i + 1))
        .cloned()
        .or_else(|| std::env::var("OMNI_MODEL_PATH").ok())
        .unwrap_or_else(|| {
            eprintln!("Usage: qwen3-omni-server --model-path /path/to/weights");
            eprintln!("   Or: OMNI_MODEL_PATH=/path/to/weights qwen3-omni-server");
            eprintln!("\nStarting in test mode (zero weights, shape validation only)...");
            String::new()
        });

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
        let tokenizer_path = format!("{}/tokenizer.json", model_path);
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

    axum::serve(listener, app).await.expect("Server error");
}
