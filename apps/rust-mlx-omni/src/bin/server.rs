//! OpenAI-compatible HTTP server for Qwen3-Omni on MLX.
//!
//! Endpoints:
//! - `POST /v1/chat/completions` — text (+ audio conditioning) → text
//! - `POST /v1/audio/transcriptions` — audio → text
//! - `POST /v1/audio/speech` — text → audio
//! - `GET /health` — health check
//!
//! Usage:
//! ```bash
//! cargo run --bin mlx-omni-server --features server -- --model /path/to/Qwen3-Omni-7B --port 8800
//! ```

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use tower_http::cors::CorsLayer;
use tracing::info;

use ferni_mlx_omni::pipeline::FullOmniPipeline;

/// Server state. Pipeline is behind Mutex for &mut self on transcribe/synthesize/generate.
struct AppState {
    pipeline: Mutex<FullOmniPipeline>,
    model_name: String,
}

// ─── Types ────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct ChatCompletionRequest {
    model: Option<String>,
    messages: Vec<ChatMessage>,
    temperature: Option<f32>,
    max_tokens: Option<usize>,
    stream: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct ChatCompletionResponse {
    id: String,
    object: String,
    created: u64,
    model: String,
    choices: Vec<ChatChoice>,
    usage: Usage,
}

#[derive(Debug, Serialize)]
struct ChatChoice {
    index: usize,
    message: ChatMessage2,
    finish_reason: String,
}

#[derive(Debug, Serialize)]
struct ChatMessage2 {
    role: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct Usage {
    prompt_tokens: usize,
    completion_tokens: usize,
    total_tokens: usize,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: String,
    model: String,
    backend: String,
}

// ─── Handlers ─────────────────────────────────────────────

async fn health(State(state): State<Arc<AppState>>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        model: state.model_name.clone(),
        backend: "mlx-rs".to_string(),
    })
}

async fn chat_completions(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ChatCompletionRequest>,
) -> Result<Json<ChatCompletionResponse>, (StatusCode, String)> {
    let temperature = req.temperature.unwrap_or(0.7);
    let max_tokens = req.max_tokens.unwrap_or(256);

    // Concatenate messages into a prompt
    let prompt = req
        .messages
        .iter()
        .map(|m| format!("<|im_start|>{}\n{}<|im_end|>", m.role, m.content))
        .collect::<Vec<_>>()
        .join("\n");
    let prompt = format!("{prompt}\n<|im_start|>assistant\n");

    let mut pipeline = state
        .pipeline
        .lock()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let (text, prompt_tokens, completion_tokens) = pipeline
        .generate_text(&prompt, max_tokens, temperature)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    Ok(Json(ChatCompletionResponse {
        id: format!("chatcmpl-mlx-{}", now),
        object: "chat.completion".to_string(),
        created: now,
        model: state.model_name.clone(),
        choices: vec![ChatChoice {
            index: 0,
            message: ChatMessage2 {
                role: "assistant".to_string(),
                content: text,
            },
            finish_reason: if completion_tokens >= max_tokens {
                "length".to_string()
            } else {
                "stop".to_string()
            },
        }],
        usage: Usage {
            prompt_tokens,
            completion_tokens,
            total_tokens: prompt_tokens + completion_tokens,
        },
    }))
}

// ─── Main ─────────────────────────────────────────────────

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    // Parse args
    let args: Vec<String> = std::env::args().collect();
    let model_dir = args
        .iter()
        .position(|a| a == "--model")
        .and_then(|i| args.get(i + 1))
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(std::env::var("QWEN3_OMNI_MODEL_PATH").unwrap_or_else(|_| {
                eprintln!("Usage: mlx-omni-server --model /path/to/model [--port 8800]");
                std::process::exit(1);
            }))
        });

    let port: u16 = args
        .iter()
        .position(|a| a == "--port")
        .and_then(|i| args.get(i + 1))
        .and_then(|p| p.parse().ok())
        .unwrap_or(8800);

    info!("Loading Qwen3-Omni from {:?}...", model_dir);
    let pipeline = FullOmniPipeline::load(&model_dir)?;
    let model_name = model_dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "qwen3-omni".to_string());
    info!("Model loaded: {}", model_name);

    let state = Arc::new(AppState {
        pipeline: Mutex::new(pipeline),
        model_name,
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/chat/completions", post(chat_completions))
        // TODO: /v1/audio/transcriptions
        // TODO: /v1/audio/speech
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("MLX Omni server listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
