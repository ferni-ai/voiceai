//! Error types for the Kyutai bridge.

use thiserror::Error;

#[derive(Error, Debug)]
pub enum BridgeError {
    #[error("Model loading failed: {0}")]
    ModelLoad(String),

    #[error("Inference error: {0}")]
    Inference(String),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("HuggingFace download error: {0}")]
    Download(String),

    #[error(transparent)]
    Candle(#[from] candle_core::Error),

    #[error(transparent)]
    Anyhow(#[from] anyhow::Error),

    #[error(transparent)]
    Io(#[from] std::io::Error),
}

pub type Result<T> = std::result::Result<T, BridgeError>;
