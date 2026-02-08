//! # Ferni TTS - Superhuman Text-to-Speech (HTTP Service)
//!
//! Thin HTTP wrapper around ferni-tts-core. Core provides SSML, superhuman transforms,
//! synthesis trait + mock. This crate adds REST API, CosyVoice backend, and streaming.

pub use ferni_tts_core::{config, ssml, superhuman, audio, error};
pub mod synthesis;

pub mod api;

// Re-export for backward compatibility
pub use config::Config;
pub use error::{Error, Result};

/// Service-level error wrapper so we can impl IntoResponse (orphan rule)
pub struct ServiceError(pub error::Error);

impl From<error::Error> for ServiceError {
    fn from(e: error::Error) -> Self {
        ServiceError(e)
    }
}

impl axum::response::IntoResponse for ServiceError {
    fn into_response(self) -> axum::response::Response {
        use axum::http::StatusCode;
        use axum::Json;

        let status = StatusCode::from_u16(self.0.status_code()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
        let body = serde_json::json!({
            "error": {
                "code": self.0.status_code(),
                "message": self.0.to_string(),
                "retryable": self.0.is_retryable(),
            }
        });
        (status, Json(body)).into_response()
    }
}

pub mod prelude {
    pub use ferni_tts_core::prelude::*;
}
