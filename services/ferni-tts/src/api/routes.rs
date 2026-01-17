//! API Routes
//!
//! HTTP route definitions for the TTS service.

use super::handlers;
use super::middleware;
use super::AppState;
use axum::{
    routing::{get, post},
    Router,
};
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

/// Create the main API router
pub fn create_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        // Health endpoints
        .route("/health", get(handlers::health_check))
        .route("/health/ready", get(handlers::readiness_check))
        .route("/health/live", get(handlers::liveness_check))
        // Synthesis endpoints
        .route("/v1/synthesize", post(handlers::synthesize))
        .route("/v1/synthesize/stream", post(handlers::synthesize_stream))
        .route("/v1/synthesize/ssml", post(handlers::synthesize_ssml))
        // Voice endpoints
        .route("/v1/voices", get(handlers::list_voices))
        .route("/v1/voices/:voice_id", get(handlers::get_voice))
        // Metrics
        .route("/metrics", get(handlers::metrics))
        // Apply middleware
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .layer(axum::middleware::from_fn(middleware::request_id))
        .layer(axum::middleware::from_fn(middleware::request_timing))
        .with_state(state)
}
