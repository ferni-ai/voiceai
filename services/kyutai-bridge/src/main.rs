//! Kyutai DSM STT + TTS WebSocket bridge (Rust/Candle).
//!
//! Production-ready WebSocket server for Ferni voice agent.
//! Same protocol as the Python MLX bridge; no Python, no MLX crash.
//!
//! Better-than-human targets:
//!   - STT first interim: < 150 ms
//!   - STT final: < 300 ms
//!   - TTS TTFB: < 250 ms
//!   - E2E to first audio: < 500 ms
//!
//! Usage:
//!   cargo run -p kyutai-bridge --release
//!   cargo run -p kyutai-bridge --release -- --mock   # protocol testing, no models
//!   cargo run -p kyutai-bridge --release -- --cpu    # force CPU inference
//!
//! See docs/plans/KYUTAI-DSM-BETTER-THAN-HUMAN.md for full targets.

mod audio;
mod config;
mod error;
mod full_duplex;
mod models;
mod protocol;
mod stt;
mod tts;

use axum::{
    extract::ws::WebSocketUpgrade,
    extract::State,
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use clap::Parser;
use config::BridgeConfig;
use full_duplex::handle_sts_full_duplex_socket;
use models::{FullDuplexModels, SttModels, TtsModels};
use serde_json::json;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;
use tower_http::cors::CorsLayer;
use tracing::{error, info};

// =============================================================================
// SHARED STATE
// =============================================================================

/// Application state shared across WebSocket connections.
#[derive(Clone)]
struct AppState {
    stt_models: Option<Arc<Mutex<SttModels>>>,
    tts_models: Option<Arc<Mutex<TtsModels>>>,
    full_duplex_models: Option<Arc<Mutex<FullDuplexModels>>>,
    startup_time: Instant,
    config: BridgeConfig,
}

impl AppState {
    fn is_ready(&self) -> bool {
        if self.config.mock {
            return true;
        }
        if self.config.full_duplex {
            self.full_duplex_models.is_some()
        } else if self.config.stt_only {
            self.stt_models.is_some()
        } else {
            self.stt_models.is_some() && self.tts_models.is_some()
        }
    }
}

// =============================================================================
// ROUTES
// =============================================================================

async fn stt_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    match &state.stt_models {
        Some(models) => {
            let models = Arc::clone(models);
            ws.on_upgrade(move |socket| stt::handle_stt_socket_candle(socket, models))
        }
        None => ws.on_upgrade(stt::handle_stt_socket_mock),
    }
}

async fn sts_full_duplex_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    match &state.full_duplex_models {
        Some(models) => {
            let models = Arc::clone(models);
            ws.on_upgrade(move |socket| handle_sts_full_duplex_socket(socket, models))
        }
        None => ws.on_upgrade(full_duplex::handle_sts_full_duplex_mock),
    }
}

async fn tts_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    match &state.tts_models {
        Some(models) => {
            let models = Arc::clone(models);
            ws.on_upgrade(move |socket| tts::handle_tts_socket_candle(socket, models))
        }
        None => ws.on_upgrade(tts::handle_tts_socket_mock),
    }
}

/// Health check: returns 200 if server is alive.
async fn health_handler(State(state): State<AppState>) -> impl IntoResponse {
    let uptime_secs = state.startup_time.elapsed().as_secs();
    Json(json!({
        "status": if state.is_ready() { "ready" } else { "loading" },
        "mode": if state.config.mock { "mock" } else { "candle" },
        "uptime_seconds": uptime_secs,
        "stt_loaded": state.stt_models.is_some(),
        "tts_loaded": state.tts_models.is_some(),
        "full_duplex_loaded": state.full_duplex_models.is_some(),
    }))
}

/// Readiness check: returns 200 only when models are loaded and warm.
async fn ready_handler(State(state): State<AppState>) -> impl IntoResponse {
    if state.is_ready() {
        (
            axum::http::StatusCode::OK,
            Json(json!({ "ready": true, "mode": if state.config.mock { "mock" } else { "candle" } })),
        )
    } else {
        (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "ready": false, "reason": "models still loading" })),
        )
    }
}

fn cors_layer() -> CorsLayer {
    use tower_http::cors::AllowOrigin;
    use axum::http::{HeaderValue, Method};

    // In production, restrict CORS to known Ferni origins.
    // In development / mock mode, allow all origins for local testing.
    let allowed_origins: Vec<HeaderValue> = vec![
        "https://app.ferni.ai".parse().unwrap(),
        "https://ferni.ai".parse().unwrap(),
        "https://ferni-prod.web.app".parse().unwrap(),
        "http://localhost:3004".parse().unwrap(),
        "http://localhost:8080".parse().unwrap(),
    ];

    CorsLayer::new()
        .allow_origin(AllowOrigin::list(allowed_origins))
        .allow_methods([Method::GET, Method::OPTIONS])
        .allow_headers(tower_http::cors::Any)
}

fn stt_app(state: AppState) -> Router {
    Router::new()
        .route("/api/asr-streaming", get(stt_handler))
        .route("/api/sts-full-duplex", get(sts_full_duplex_handler))
        .route("/health", get(health_handler))
        .route("/health/ready", get(ready_handler))
        .layer(tower::limit::ConcurrencyLimitLayer::new(32)) // Max 32 concurrent STT sessions
        .layer(cors_layer())
        .with_state(state)
}

fn tts_app(state: AppState) -> Router {
    Router::new()
        .route("/api/tts_streaming", get(tts_handler))
        .route("/health", get(health_handler))
        .route("/health/ready", get(ready_handler))
        .layer(tower::limit::ConcurrencyLimitLayer::new(32)) // Max 32 concurrent TTS sessions
        .layer(cors_layer())
        .with_state(state)
}

// =============================================================================
// MAIN
// =============================================================================

#[tokio::main]
async fn main() {
    let config = BridgeConfig::parse();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| config.log_level.clone().into()),
        )
        .init();

    info!("Kyutai DSM Bridge v{}", env!("CARGO_PKG_VERSION"));
    info!(
        "Mode: {}",
        if config.mock { "mock (no models)" } else { "candle (real inference)" }
    );

    let startup_time = Instant::now();

    // ── Fast-fail: reject unsupported flag combinations ──
    if config.use_gguf {
        error!("KYUTAI_USE_GGUF=true is not yet supported: moshi crate only loads safetensors. \
                Use KYUTAI_MOSHI_REPO=kyutai/moshiko-candle-bf16 or wait for moshi GGUF support.");
        std::process::exit(1);
    }
    // Full-duplex mode is supported: bidirectional inference at ~160ms latency.
    // Requires a model loaded with load_streaming_both_ways.
    if config.full_duplex && config.stt_only {
        error!("KYUTAI_FULL_DUPLEX=true and KYUTAI_STT_ONLY=true are mutually exclusive. \
                Full-duplex uses a single bidirectional model.");
        std::process::exit(1);
    }

    // Load models if not in mock mode
    let (stt_models, tts_models, full_duplex_models) = if config.use_candle() {
        info!("Resolving model paths...");
        let split_paths = if config.stt_only {
            // STT-only mode: only resolve STT model paths
            match models::resolve_stt_only_paths(&config).await {
                Ok(p) => p,
                Err(e) => {
                    error!(error = %e, "Failed to resolve STT model paths");
                    std::process::exit(1);
                }
            }
        } else {
            match models::resolve_split_model_paths(&config).await {
                Ok(p) => p,
                Err(e) => {
                    error!(error = %e, "Failed to resolve model paths");
                    std::process::exit(1);
                }
            }
        };

        let device = match models::select_device(config.cpu) {
            Ok(d) => d,
            Err(e) => {
                error!(error = %e, "Failed to select compute device");
                std::process::exit(1);
            }
        };

        if config.full_duplex {
            info!("Loading full-duplex STS model (load_streaming_both_ways)...");
            let fd = match models::load_full_duplex_models(&split_paths.tts, &device) {
                Ok(m) => {
                    info!("Full-duplex model loaded (target ~160ms bidirectional)");
                    m
                }
                Err(e) => {
                    error!(error = %e, "Failed to load full-duplex model");
                    std::process::exit(1);
                }
            };
            if let Err(e) = models::warmup_full_duplex_models(&fd) {
                error!(error = %e, "Full-duplex warmup failed (continuing anyway)");
            }
            let load_time = startup_time.elapsed();
            info!(load_ms = load_time.as_millis(), "Full-duplex model ready");
            (None, None, Some(Arc::new(Mutex::new(fd))))
        } else {
            info!("Loading STT models (from {})...", config.stt_repo);
            let stt = match models::load_stt_models(&split_paths.stt, &device) {
                Ok(m) => {
                    info!("STT models loaded");
                    m
                }
                Err(e) => {
                    error!(error = %e, "Failed to load STT models");
                    std::process::exit(1);
                }
            };

            let tts = if config.stt_only {
                info!("STT-only mode: skipping TTS model loading (saves ~14GB GPU memory)");
                None
            } else {
                info!("Loading TTS models (from {})...", config.moshi_repo);
                match models::load_tts_models(&split_paths.tts, &device) {
                    Ok(m) => {
                        info!("TTS models loaded");
                        Some(m)
                    }
                    Err(e) => {
                        error!(error = %e, "Failed to load TTS models");
                        std::process::exit(1);
                    }
                }
            };

            // Warmup STT (always) and TTS (if loaded)
            if let Some(ref tts_models) = tts {
                if let Err(e) = models::warmup_models(&stt, tts_models) {
                    error!(error = %e, "Model warmup failed (continuing anyway)");
                }
            } else {
                // STT-only warmup
                if let Err(e) = models::warmup_stt_only(&stt) {
                    error!(error = %e, "STT warmup failed (continuing anyway)");
                }
            }

            let load_time = startup_time.elapsed();
            info!(
                load_ms = load_time.as_millis(),
                stt_only = config.stt_only,
                "Models loaded and warmed up"
            );

            (
                Some(Arc::new(Mutex::new(stt))),
                tts.map(|t| Arc::new(Mutex::new(t))),
                None,
            )
        }
    } else {
        info!("Mock mode: no models loaded");
        (None, None, None)
    };

    let state = AppState {
        stt_models,
        tts_models,
        full_duplex_models,
        startup_time,
        config: config.clone(),
    };

    let bind_addr = config.bind_addr.clone();
    let stt_addr: SocketAddr = format!("{}:{}", bind_addr, config.stt_port)
        .parse()
        .expect("Invalid STT bind address");
    let tts_addr: SocketAddr = format!("{}:{}", bind_addr, config.tts_port)
        .parse()
        .expect("Invalid TTS bind address");

    let stt_listener = tokio::net::TcpListener::bind(stt_addr)
        .await
        .expect("Failed to bind STT port");
    let tts_listener = tokio::net::TcpListener::bind(tts_addr)
        .await
        .expect("Failed to bind TTS port");

    info!("STT: ws://{}:{}/api/asr-streaming", bind_addr, config.stt_port);
    info!("TTS: ws://{}:{}/api/tts_streaming", bind_addr, config.tts_port);
    info!(
        "Health: http://{}:{}/health",
        bind_addr, config.stt_port
    );
    info!("Ready to serve (better-than-human latency targets active)");

    // Graceful shutdown on SIGTERM/SIGINT — both servers get the signal via watch channel
    let (shutdown_tx, _) = tokio::sync::watch::channel(false);
    let shutdown_rx_stt = shutdown_tx.subscribe();
    let shutdown_rx_tts = shutdown_tx.subscribe();

    let make_shutdown = |mut rx: tokio::sync::watch::Receiver<bool>| async move {
        let _ = rx.wait_for(|&v| v).await;
    };

    // Spawn signal listener that notifies both servers
    tokio::spawn(async move {
        let ctrl_c = tokio::signal::ctrl_c();
        #[cfg(unix)]
        let terminate = async {
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                .expect("SIGTERM handler")
                .recv()
                .await;
        };
        #[cfg(not(unix))]
        let terminate = std::future::pending::<()>();

        tokio::select! {
            _ = ctrl_c => info!("Received SIGINT, shutting down gracefully"),
            _ = terminate => info!("Received SIGTERM, shutting down gracefully"),
        }
        let _ = shutdown_tx.send(true);
    });

    let (r1, r2) = tokio::join!(
        axum::serve(stt_listener, stt_app(state.clone()))
            .with_graceful_shutdown(make_shutdown(shutdown_rx_stt)),
        axum::serve(tts_listener, tts_app(state))
            .with_graceful_shutdown(make_shutdown(shutdown_rx_tts)),
    );
    if let Err(e) = r1 {
        error!(error = %e, "STT server error");
    }
    if let Err(e) = r2 {
        error!(error = %e, "TTS server error");
    }
    info!("Shutdown complete");
}
