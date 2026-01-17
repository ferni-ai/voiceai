//! Ferni TTS Service
//!
//! High-performance TTS with superhuman prosody transforms.
//!
//! ## Features
//! - Full W3C SSML 1.1 support
//! - 8 "Better than Human" prosody transforms
//! - Streaming audio output
//! - Multiple synthesis backends (CosyVoice, Azure, Google, OpenAI)
//! - Sub-50ms transform latency

use ferni_tts::api::{create_router, AppState};
use ferni_tts::config::Config;
use ferni_tts::synthesis;
use std::net::SocketAddr;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    init_tracing();

    // Load configuration
    let config = Config::from_env();
    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
        backend = ?config.synthesis.backend,
        "Starting Ferni TTS service"
    );

    // Create synthesis client
    let synthesis_client = synthesis::create_client(&config.synthesis)
        .await
        .map_err(|e| {
            tracing::error!("Failed to create synthesis client: {}", e);
            e
        })?;

    // Check backend health
    match synthesis_client.health_check().await {
        Ok(true) => tracing::info!(backend = synthesis_client.name(), "Synthesis backend healthy"),
        Ok(false) => tracing::warn!(backend = synthesis_client.name(), "Synthesis backend unhealthy"),
        Err(e) => tracing::warn!(backend = synthesis_client.name(), error = %e, "Health check failed"),
    }

    // Create app state
    let state = AppState::new(config.clone(), synthesis_client);

    // Create router
    let app = create_router(state);

    // Bind address
    let addr = SocketAddr::new(
        config.server.host.parse().unwrap_or([0, 0, 0, 0].into()),
        config.server.port,
    );

    tracing::info!(
        host = %config.server.host,
        port = config.server.port,
        "Server listening"
    );

    // Start server
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    tracing::info!("Server shutdown complete");
    Ok(())
}

fn init_tracing() {
    let config = Config::from_env();

    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| config.observability.log_level.parse().unwrap_or_else(|_| "info".parse().unwrap()));

    if config.observability.json_logs {
        tracing_subscriber::registry()
            .with(filter)
            .with(tracing_subscriber::fmt::layer().json())
            .init();
    } else {
        tracing_subscriber::registry()
            .with(filter)
            .with(tracing_subscriber::fmt::layer())
            .init();
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("Failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    tracing::info!("Shutdown signal received");
}
