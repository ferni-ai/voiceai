use std::sync::Arc;
use std::time::Instant;

use axum::extract::State;
use axum::extract::ws::WebSocketUpgrade;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use serde_json::json;
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

use crate::pipeline::VoicePipeline;
use crate::session::SessionManager;
use crate::ws_handler::handle_ws;


/// Shared application state accessible from all routes.
pub struct AppState {
    pub pipeline: Arc<VoicePipeline>,
    pub sessions: RwLock<SessionManager>,
    pub started_at: Instant,
}

impl AppState {
    pub fn new(pipeline: Arc<VoicePipeline>) -> Self {
        Self {
            pipeline,
            sessions: RwLock::new(SessionManager::new()),
            started_at: Instant::now(),
        }
    }
}

/// Build the Axum router with all routes.
pub fn build_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/ws", get(ws_upgrade))
        .route("/health", get(health))
        .route("/health/ready", get(health_ready))
        .route("/stats", get(stats))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

/// WebSocket upgrade handler.
async fn ws_upgrade(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws(socket, state))
}

/// Liveness probe — the process is running.
async fn health() -> impl IntoResponse {
    axum::Json(json!({ "status": "ok" }))
}

/// Readiness probe — models are loaded and the server can handle requests.
async fn health_ready(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let stt = state.pipeline.stt_available();
    let tts = state.pipeline.tts_available();
    let ready = stt && tts;

    let status_code = if ready {
        axum::http::StatusCode::OK
    } else {
        axum::http::StatusCode::SERVICE_UNAVAILABLE
    };

    (
        status_code,
        axum::Json(json!({
            "status": if ready { "ready" } else { "not_ready" },
            "stt_available": stt,
            "tts_available": tts,
        })),
    )
}

/// Stats endpoint with aggregate metrics.
async fn stats(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let sessions = state.sessions.read().await;
    let (total_transcriptions, total_syntheses) = sessions.aggregate_stats();
    let uptime = state.started_at.elapsed().as_secs();

    axum::Json(json!({
        "active_sessions": sessions.session_count(),
        "total_transcriptions": total_transcriptions,
        "total_syntheses": total_syntheses,
        "uptime_seconds": uptime,
    }))
}
