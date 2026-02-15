//! Ferni Unified Inference Gateway
//!
//! Lightweight proxy that routes inference requests to the appropriate backend:
//!   - Omni:    Audio-in → Audio-out via Qwen3-Omni Candle server
//!   - Quality: Kyutai STT → Ollama LLM → Rust TTS (best quality, ~600ms)
//!   - Speed:   LFM2 pipeline (lowest latency, future)
//!
//! Run:  cargo run --release -- --port 8600
//! Test: curl http://127.0.0.1:8600/health

mod backends;
mod config;

use std::sync::Arc;
use std::time::Instant;

use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use clap::Parser;
use serde::{Deserialize, Serialize};
use tokio::signal;
use tracing::{info, warn};

use crate::backends::{check_all_backends, BackendStatus};
use crate::config::{Args, BackendConfig};

// =============================================================================
// STATE
// =============================================================================

struct AppState {
    config: BackendConfig,
    client: reqwest::Client,
    start_time: Instant,
}

// =============================================================================
// REQUEST / RESPONSE TYPES
// =============================================================================

#[derive(Deserialize)]
struct InferenceRequest {
    mode: String,
    #[serde(default)]
    payload: serde_json::Value,
}

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    uptime_seconds: u64,
    backends: Vec<BackendStatus>,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
    available_modes: Vec<String>,
}

// =============================================================================
// HANDLERS
// =============================================================================

/// GET /health — Aggregate health from all backends.
async fn health(State(state): State<Arc<AppState>>) -> Json<HealthResponse> {
    let backends = check_all_backends(&state.client, &state.config).await;
    let all_down = backends.iter().all(|b| !b.available);

    Json(HealthResponse {
        status: if all_down {
            "degraded".to_string()
        } else {
            "ok".to_string()
        },
        uptime_seconds: state.start_time.elapsed().as_secs(),
        backends,
    })
}

/// GET /v1/backends — List backends and their status.
async fn list_backends(State(state): State<Arc<AppState>>) -> Json<Vec<BackendStatus>> {
    let backends = check_all_backends(&state.client, &state.config).await;
    Json(backends)
}

/// POST /v1/inference — Route to backend based on mode field.
async fn inference(
    State(state): State<Arc<AppState>>,
    Json(req): Json<InferenceRequest>,
) -> Result<Response, (StatusCode, Json<ErrorResponse>)> {
    match req.mode.as_str() {
        "omni" => proxy_to_backend(&state, &state.config.omni_url, &req.payload).await,
        "quality" => quality_pipeline(&state, &req.payload).await,
        "speed" => proxy_to_backend(&state, &state.config.lfm2_url, &req.payload).await,
        _ => Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: format!("Unknown mode '{}'. Use omni, quality, or speed.", req.mode),
                available_modes: vec![
                    "omni".to_string(),
                    "quality".to_string(),
                    "speed".to_string(),
                ],
            }),
        )),
    }
}

/// POST /v1/inference/omni — Direct route to Omni pipeline.
async fn inference_omni(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Response, (StatusCode, Json<ErrorResponse>)> {
    info!("Routing to omni pipeline");
    proxy_to_backend(&state, &state.config.omni_url, &payload).await
}

/// POST /v1/inference/quality — Direct route to Quality pipeline (STT + LLM + TTS).
async fn inference_quality(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Response, (StatusCode, Json<ErrorResponse>)> {
    info!("Routing to quality pipeline");
    quality_pipeline(&state, &payload).await
}

/// POST /v1/inference/speed — Direct route to Speed pipeline (LFM2).
async fn inference_speed(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Response, (StatusCode, Json<ErrorResponse>)> {
    info!("Routing to speed pipeline (LFM2)");
    proxy_to_backend(&state, &state.config.lfm2_url, &payload).await
}

// =============================================================================
// PROXY HELPERS
// =============================================================================

/// Forward a JSON payload to a backend and return its response.
async fn proxy_to_backend(
    state: &AppState,
    backend_url: &str,
    payload: &serde_json::Value,
) -> Result<Response, (StatusCode, Json<ErrorResponse>)> {
    let url = format!("{}/v1/audio/omni", backend_url.trim_end_matches('/'));
    let start = Instant::now();

    let resp = state
        .client
        .post(&url)
        .json(payload)
        .send()
        .await
        .map_err(|e| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(ErrorResponse {
                    error: format!("Backend unavailable: {}", e),
                    available_modes: vec![
                        "omni".to_string(),
                        "quality".to_string(),
                        "speed".to_string(),
                    ],
                }),
            )
        })?;

    let status = resp.status();
    let body = resp.bytes().await.map_err(|e| {
        (
            StatusCode::BAD_GATEWAY,
            Json(ErrorResponse {
                error: format!("Failed to read backend response: {}", e),
                available_modes: vec![],
            }),
        )
    })?;

    info!(
        latency_ms = start.elapsed().as_millis() as u64,
        "Backend responded with {}", status
    );

    let resp_status = StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::OK);
    Ok((resp_status, body).into_response())
}

/// Quality pipeline: STT → LLM → TTS orchestration.
async fn quality_pipeline(
    state: &AppState,
    payload: &serde_json::Value,
) -> Result<Response, (StatusCode, Json<ErrorResponse>)> {
    let pipeline_start = Instant::now();

    // Step 1: STT — send audio to Kyutai for transcription
    let stt_url = format!(
        "{}/v1/audio/transcriptions",
        state.config.kyutai_stt_url.trim_end_matches('/')
    );
    let stt_resp = state
        .client
        .post(&stt_url)
        .json(payload)
        .send()
        .await
        .map_err(|e| backend_unavailable(&format!("STT backend: {}", e)))?;

    let stt_result: serde_json::Value =
        stt_resp.json().await.map_err(|e| {
            backend_unavailable(&format!("STT response parse error: {}", e))
        })?;

    let transcript = stt_result["text"]
        .as_str()
        .unwrap_or("")
        .to_string();

    info!(stt_ms = pipeline_start.elapsed().as_millis() as u64, "STT complete");

    // Step 2: LLM — send transcript to Ollama
    let llm_start = Instant::now();
    let llm_url = format!(
        "{}/api/chat",
        state.config.ollama_url.trim_end_matches('/')
    );
    let llm_body = serde_json::json!({
        "model": payload.get("model").and_then(|m| m.as_str()).unwrap_or("llama3.2"),
        "messages": [{"role": "user", "content": transcript}],
        "stream": false,
    });

    let llm_resp = state
        .client
        .post(&llm_url)
        .json(&llm_body)
        .send()
        .await
        .map_err(|e| backend_unavailable(&format!("LLM backend: {}", e)))?;

    let llm_result: serde_json::Value =
        llm_resp.json().await.map_err(|e| {
            backend_unavailable(&format!("LLM response parse error: {}", e))
        })?;

    let llm_text = llm_result["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    info!(llm_ms = llm_start.elapsed().as_millis() as u64, "LLM complete");

    // Step 3: TTS — synthesize response audio
    let tts_start = Instant::now();
    let tts_url = format!(
        "{}/v1/audio/speech",
        state.config.tts_url.trim_end_matches('/')
    );
    let tts_body = serde_json::json!({
        "input": llm_text,
        "voice": payload.get("voice").and_then(|v| v.as_str()).unwrap_or("ferni"),
        "model": "tts-1",
    });

    let tts_resp = state
        .client
        .post(&tts_url)
        .json(&tts_body)
        .send()
        .await
        .map_err(|e| backend_unavailable(&format!("TTS backend: {}", e)))?;

    let audio_bytes = tts_resp.bytes().await.map_err(|e| {
        backend_unavailable(&format!("TTS response read error: {}", e))
    })?;

    let total_ms = pipeline_start.elapsed().as_millis() as u64;
    info!(
        tts_ms = tts_start.elapsed().as_millis() as u64,
        total_ms,
        "Quality pipeline complete"
    );

    let result = serde_json::json!({
        "transcript": transcript,
        "response_text": llm_text,
        "audio_bytes": audio_bytes.len(),
        "pipeline_ms": total_ms,
    });

    Ok(Json(result).into_response())
}

fn backend_unavailable(msg: &str) -> (StatusCode, Json<ErrorResponse>) {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(ErrorResponse {
            error: msg.to_string(),
            available_modes: vec![
                "omni".to_string(),
                "quality".to_string(),
                "speed".to_string(),
            ],
        }),
    )
}

// =============================================================================
// MAIN
// =============================================================================

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "ferni_inference=info".parse().unwrap()),
        )
        .init();

    let args = Args::parse();
    let config = BackendConfig::from_args(&args);
    let bind_addr = format!("{}:{}", args.host, args.port);

    info!("Ferni Inference Gateway v{}", env!("CARGO_PKG_VERSION"));
    info!("  Bind: {}", bind_addr);
    info!("  Backends:");
    info!("    Omni:  {}", config.omni_url);
    info!("    STT:   {}", config.kyutai_stt_url);
    info!("    LLM:   {}", config.ollama_url);
    info!("    TTS:   {}", config.tts_url);
    info!("    LFM2:  {}", config.lfm2_url);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .expect("Failed to create HTTP client");

    // Check backend health on startup
    let backends = check_all_backends(&client, &config).await;
    for b in &backends {
        if b.available {
            info!(
                "  {} ({}) — available ({:.0}ms)",
                b.name,
                b.mode,
                b.latency_ms.unwrap_or(0.0)
            );
        } else {
            warn!(
                "  {} ({}) — unavailable: {}",
                b.name,
                b.mode,
                b.error.as_deref().unwrap_or("unknown")
            );
        }
    }

    // Use a longer timeout for inference requests (not health checks)
    let inference_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .expect("Failed to create inference HTTP client");

    let state = Arc::new(AppState {
        config,
        client: inference_client,
        start_time: Instant::now(),
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/backends", get(list_backends))
        .route("/v1/inference", post(inference))
        .route("/v1/inference/omni", post(inference_omni))
        .route("/v1/inference/quality", post(inference_quality))
        .route("/v1/inference/speed", post(inference_speed))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&bind_addr)
        .await
        .expect("Failed to bind");

    info!("Listening on {}", bind_addr);
    info!("  GET  /health");
    info!("  GET  /v1/backends");
    info!("  POST /v1/inference          (mode: omni|quality|speed)");
    info!("  POST /v1/inference/omni");
    info!("  POST /v1/inference/quality");
    info!("  POST /v1/inference/speed");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("Server error");

    info!("Server shut down");
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("Failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => info!("Received SIGINT"),
        _ = terminate => info!("Received SIGTERM"),
    }
}
