use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use clap::Parser;
use tracing::info;

use higgs_voice_pipeline::pipeline::{PipelineConfig, VoicePipeline};
use higgs_voice_pipeline::server::{build_router, AppState};

#[derive(Parser)]
#[command(name = "higgs-voice-pipeline")]
#[command(about = "Unified voice pipeline: Whisper STT + Higgs TTS + humanization DSP")]
struct Args {
    /// Port to listen on
    #[arg(long, default_value = "8600")]
    port: u16,

    /// Path to Higgs Audio V2 model weights
    #[arg(long)]
    higgs_model: Option<String>,

    /// Path to Whisper model (ggml format)
    #[arg(long)]
    whisper_model: Option<String>,

    /// Path to xCodec ONNX model
    #[arg(long)]
    xcodec_model: Option<String>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing with env-filter support (e.g. RUST_LOG=debug)
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "higgs_voice_pipeline=info,tower_http=info".into()),
        )
        .init();

    let args = Args::parse();

    info!("Higgs Voice Pipeline starting on port {}", args.port);

    if let Some(ref path) = args.higgs_model {
        info!(path = %path, "Higgs model path configured");
    }
    if let Some(ref path) = args.whisper_model {
        info!(path = %path, "Whisper model path configured");
    }
    if let Some(ref path) = args.xcodec_model {
        info!(path = %path, "xCodec model path configured");
    }

    // Initialize pipeline with real model loading
    let pipeline = VoicePipeline::new(PipelineConfig {
        higgs_model_path: args.higgs_model,
        whisper_model_path: args.whisper_model,
        xcodec_model_path: args.xcodec_model,
    })
    .await?;

    let state = Arc::new(AppState::new(Arc::new(pipeline)));

    // Background task: reap idle sessions every 60s
    let state_clone = Arc::clone(&state);
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(60));
        loop {
            interval.tick().await;
            let mut sessions = state_clone.sessions.write().await;
            let expired = sessions.cleanup_expired();
            if expired > 0 {
                tracing::info!(expired, "Cleaned up expired sessions");
            }
        }
    });

    let router = build_router(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], args.port));
    info!("Listening on {addr}");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("Server shut down cleanly");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    tracing::info!("Shutdown signal received, starting graceful shutdown");
}
