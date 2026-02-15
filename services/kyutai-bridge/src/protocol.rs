//! Shared protocol types for Kyutai STT/TTS WebSocket API.
//! Same as Python bridge: STT = binary PCM in, JSON out; TTS = JSON in, binary PCM then done.

use serde::{Deserialize, Serialize};

/// STT server → client: transcript message.
#[derive(Clone, Debug, Serialize)]
pub struct SttResponse {
    pub text: String,
    pub is_final: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vad: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_speaking: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl SttResponse {
    pub fn interim(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            is_final: false,
            vad: None,
            is_speaking: None,
            error: None,
        }
    }

    pub fn final_transcript(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            is_final: true,
            vad: Some(false),
            is_speaking: Some(false),
            error: None,
        }
    }

    pub fn error(msg: impl Into<String>) -> Self {
        Self {
            text: String::new(),
            is_final: false,
            vad: None,
            is_speaking: None,
            error: Some(msg.into()),
        }
    }
}

/// TTS client → server: synthesize request.
#[derive(Clone, Debug, Deserialize)]
pub struct TtsRequest {
    pub text: Option<String>,
    pub voice_id: Option<String>,
}

/// TTS server → client: done signal.
#[derive(Clone, Debug, Serialize)]
pub struct TtsDoneResponse {
    pub done: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl TtsDoneResponse {
    pub fn success() -> Self {
        Self { done: true, error: None }
    }

    pub fn with_error(msg: impl Into<String>) -> Self {
        Self {
            done: true,
            error: Some(msg.into()),
        }
    }
}
