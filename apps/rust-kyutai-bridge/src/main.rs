//! Kyutai Rust/Candle Bridge Server
//!
//! WebSocket server exposing the same protocol as the Python `mlx-bridge-server.py`
//! so the Ferni voice agent can connect via `KYUTAI_STT_URL` / `KYUTAI_TTS_URL`.
//!
//! Phase 1: mock responses (no ML inference).
//! Phase 2: real Candle inference behind the `inference` feature flag.
//!
//! Run:  cargo run --release -- --port 8089
//! Test: curl http://127.0.0.1:8089/health

mod protocol;
mod stt;
mod tts;

use axum::{
    extract::ws::WebSocketUpgrade,
    response::{IntoResponse, Json},
    routing::get,
    Router,
};
use clap::Parser;
use serde_json::json;
use tokio::signal;
use tracing::info;

/// Kyutai STT + TTS bridge server (Rust/Candle).
#[derive(Parser, Debug)]
#[command(name = "kyutai-bridge", version, about)]
struct Args {
    /// Server port
    #[arg(long, default_value_t = 8089)]
    port: u16,

    /// Bind address
    #[arg(long, default_value = "127.0.0.1")]
    host: String,
}

// =============================================================================
// Handlers
// =============================================================================

/// GET /health
async fn health() -> impl IntoResponse {
    Json(json!({
        "status": "ok",
        "mode": "mock",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

/// GET /api/asr-streaming — WebSocket upgrade for STT
async fn stt_upgrade(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(stt::handle_stt)
}

/// GET /api/tts_streaming — WebSocket upgrade for TTS
async fn tts_upgrade(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(tts::handle_tts)
}

// =============================================================================
// Main
// =============================================================================

#[tokio::main]
async fn main() {
    // Initialize tracing (respects RUST_LOG env var)
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "kyutai_bridge=info".parse().unwrap()),
        )
        .init();

    let args = Args::parse();
    let bind_addr = format!("{}:{}", args.host, args.port);

    info!("Kyutai Bridge Server v{}", env!("CARGO_PKG_VERSION"));
    info!("  Mode: mock (Phase 1 — no ML inference)");
    info!("  Bind: {}", bind_addr);

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/asr-streaming", get(stt_upgrade))
        .route("/api/tts_streaming", get(tts_upgrade));

    let listener = tokio::net::TcpListener::bind(&bind_addr)
        .await
        .expect("Failed to bind");

    info!("Listening on {}", bind_addr);
    info!("  GET  /health");
    info!("  WS   /api/asr-streaming  (STT: PCM Int16 16kHz -> JSON transcript)");
    info!("  WS   /api/tts_streaming  (TTS: JSON request -> PCM Int16 24kHz)");

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
