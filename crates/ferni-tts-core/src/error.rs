//! Error types for Ferni TTS
//!
//! Unified error handling with rich context for debugging.

use thiserror::Error;

/// Result type alias using our Error type
pub type Result<T> = std::result::Result<T, Error>;

/// Main error type for Ferni TTS
#[derive(Error, Debug)]
pub enum Error {
    // =========================================================================
    // SSML Errors
    // =========================================================================
    #[error("SSML parse error at position {position}: {message}")]
    SsmlParse {
        message: String,
        position: usize,
        #[source]
        source: Option<Box<dyn std::error::Error + Send + Sync>>,
    },

    #[error("Invalid SSML element '{element}': {reason}")]
    SsmlInvalidElement { element: String, reason: String },

    #[error("SSML attribute error on '{element}': {message}")]
    SsmlAttribute { element: String, message: String },

    #[error("Unsupported SSML feature: {feature}")]
    SsmlUnsupported { feature: String },

    // =========================================================================
    // Superhuman Transform Errors
    // =========================================================================
    #[error("Transform '{transform}' failed: {reason}")]
    TransformFailed { transform: String, reason: String },

    #[error("Invalid context for transform: {message}")]
    InvalidContext { message: String },

    #[error("Circadian calculation error: {message}")]
    CircadianError { message: String },

    // =========================================================================
    // Audio Pipeline Errors
    // =========================================================================
    #[error("Audio encoding error: {message}")]
    AudioEncode { message: String },

    #[error("Audio decoding error: {message}")]
    AudioDecode { message: String },

    #[error("Resampling error: {message}")]
    Resample { message: String },

    #[error("Invalid audio format: expected {expected}, got {actual}")]
    AudioFormat { expected: String, actual: String },

    #[error("Audio buffer overflow: max {max_bytes} bytes")]
    BufferOverflow { max_bytes: usize },

    // =========================================================================
    // Synthesis Backend Errors
    // =========================================================================
    #[error("Synthesis backend unavailable: {backend}")]
    BackendUnavailable { backend: String },

    #[error("Synthesis failed: {message}")]
    SynthesisFailed { message: String },

    #[error("Voice '{voice}' not found")]
    VoiceNotFound { voice: String },

    #[error("Backend timeout after {timeout_ms}ms")]
    BackendTimeout { timeout_ms: u64 },

    // =========================================================================
    // API Errors
    // =========================================================================
    #[error("Authentication failed: {reason}")]
    AuthFailed { reason: String },

    #[error("Rate limit exceeded: {limit} requests per {window_seconds}s")]
    RateLimited { limit: u32, window_seconds: u32 },

    #[error("Invalid request: {message}")]
    InvalidRequest { message: String },

    #[error("Request too large: {size_bytes} bytes (max: {max_bytes})")]
    RequestTooLarge { size_bytes: usize, max_bytes: usize },

    // =========================================================================
    // Configuration Errors
    // =========================================================================
    #[error("Configuration error: {message}")]
    Config { message: String },

    #[error("Missing required environment variable: {var}")]
    MissingEnv { var: String },

    // =========================================================================
    // Generic Errors
    // =========================================================================
    #[error("Internal error: {message}")]
    Internal { message: String },

    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

impl Error {
    /// Create an SSML parse error
    pub fn ssml_parse(message: impl Into<String>, position: usize) -> Self {
        Self::SsmlParse {
            message: message.into(),
            position,
            source: None,
        }
    }

    /// Create an invalid request error
    pub fn invalid_request(message: impl Into<String>) -> Self {
        Self::InvalidRequest {
            message: message.into(),
        }
    }

    /// Create an internal error
    pub fn internal(message: impl Into<String>) -> Self {
        Self::Internal {
            message: message.into(),
        }
    }

    /// Check if error is retryable
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            Error::BackendUnavailable { .. }
                | Error::BackendTimeout { .. }
                | Error::SynthesisFailed { .. }
        )
    }

    /// Get HTTP status code for this error
    pub fn status_code(&self) -> u16 {
        match self {
            Error::SsmlParse { .. }
            | Error::SsmlInvalidElement { .. }
            | Error::SsmlAttribute { .. }
            | Error::InvalidRequest { .. }
            | Error::AudioFormat { .. } => 400,

            Error::AuthFailed { .. } => 401,

            Error::RateLimited { .. } => 429,

            Error::SsmlUnsupported { .. } => 501,

            Error::BackendUnavailable { .. } | Error::BackendTimeout { .. } => 503,

            Error::RequestTooLarge { .. } => 413,

            Error::VoiceNotFound { .. } => 404,

            _ => 500,
        }
    }
}

// IntoResponse is implemented in the ferni-tts HTTP service crate (depends on axum).
