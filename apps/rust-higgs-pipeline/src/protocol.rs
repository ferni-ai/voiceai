//! WebSocket Protocol Types — Client/Server message definitions.
//!
//! ## Message Flow
//! ```text
//! Client                               Server
//!   │                                     │
//!   ├── StartSession ────────────────────►│
//!   │                                     │
//!   ├── Binary(i16 LE PCM) ─────────────►│  (accumulated in session buffer)
//!   │                                     │
//!   ├── Transcribe ──────────────────────►│
//!   │◄─────────────────────── Transcript ─┤
//!   │                                     │
//!   ├── Synthesize / SynthesizeStreaming ─►│
//!   │◄───────────────────────── AudioStart┤
//!   │◄───────────── Binary(i16 LE PCM) ──┤  (one or more chunks)
//!   │◄────────────────────────── AudioDone┤
//!   │                                     │
//!   ├── EndSession ──────────────────────►│
//! ```
//!
//! ## Audio Format
//! - **STT input**: 16-bit signed LE PCM, 16 kHz mono
//! - **TTS output**: 16-bit signed LE PCM, 24 kHz mono
//!
//! ## Valid Emotions
//! Direct: `gentle`, `whisper`, `serious`, `playful`, `empathetic`, `excited`, `neutral`
//! Mapped aliases: `sad`→`gentle`, `joy`→`excited`, `anger`→`serious`, etc.
//! (see `pipeline::prepare_text` for the full mapping)
//!
//! ## Constraints
//! - Max audio frame: 30 seconds (960,000 bytes at 16 kHz)
//! - Text length: 32 KB max (`MAX_TEXT_BYTES` in `pipeline.rs`) plus model context limit of 8192 tokens

use serde::{Deserialize, Serialize};

pub use crate::analysis::biomarkers::VoiceBiomarkers;

/// Summary of humanization DSP stages applied to synthesized audio.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HumanizationInfo {
    pub stages_applied: Vec<String>,
    pub breath_count: u32,
    pub filler_count: u32,
}

/// Messages sent from the client to the server over WebSocket.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    /// Initialize a new voice session.
    StartSession {
        session_id: String,
        persona: Option<String>,
    },
    /// Request transcription of accumulated audio buffer.
    Transcribe,
    /// Request TTS synthesis for the given text (batch — waits for full audio).
    Synthesize {
        text: String,
        emotion: Option<String>,
        intensity: Option<f32>,
        request_id: Option<u32>,
    },
    /// Request streaming TTS synthesis for the given text.
    /// Audio chunks are sent as binary frames as they become available.
    SynthesizeStreaming {
        text: String,
        emotion: Option<String>,
        intensity: Option<f32>,
        chunk_steps: Option<usize>,
        request_id: Option<u32>,
    },
    /// End the current session and release resources.
    EndSession,
}

/// Messages sent from the server to the client over WebSocket.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    /// Transcription result with optional voice biomarkers.
    Transcript {
        text: String,
        biomarkers: Option<VoiceBiomarkers>,
        latency_ms: u64,
    },
    /// Signals the start of an audio stream.
    AudioStart {
        sample_rate: u32,
        request_id: Option<u32>,
    },
    /// Signals the end of an audio stream.
    AudioDone {
        duration_ms: u64,
        humanization: Option<HumanizationInfo>,
        request_id: Option<u32>,
    },
    /// An error occurred processing the request.
    /// `request_id` is populated when the error relates to a specific Synthesize/SynthesizeStreaming request.
    Error { code: String, message: String, request_id: Option<u32> },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn synthesize_with_request_id_roundtrip() {
        let msg = ClientMessage::Synthesize {
            text: "Hello world".into(),
            emotion: Some("gentle".into()),
            intensity: Some(0.7),
            request_id: Some(42),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"request_id\":42"));

        let parsed: ClientMessage = serde_json::from_str(&json).unwrap();
        match parsed {
            ClientMessage::Synthesize { request_id, text, .. } => {
                assert_eq!(request_id, Some(42));
                assert_eq!(text, "Hello world");
            }
            _ => panic!("Expected Synthesize variant"),
        }
    }

    #[test]
    fn synthesize_without_request_id() {
        // Backwards compatible: request_id is optional and can be omitted
        let json = r#"{"type":"synthesize","text":"Hi","emotion":null,"intensity":null}"#;
        let parsed: ClientMessage = serde_json::from_str(json).unwrap();
        match parsed {
            ClientMessage::Synthesize { request_id, .. } => {
                assert_eq!(request_id, None);
            }
            _ => panic!("Expected Synthesize variant"),
        }
    }

    #[test]
    fn synthesize_streaming_roundtrip() {
        let msg = ClientMessage::SynthesizeStreaming {
            text: "Stream this text".into(),
            emotion: Some("excited".into()),
            intensity: Some(0.8),
            chunk_steps: Some(25),
            request_id: Some(7),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"type\":\"synthesize_streaming\""));
        assert!(json.contains("\"chunk_steps\":25"));

        let parsed: ClientMessage = serde_json::from_str(&json).unwrap();
        match parsed {
            ClientMessage::SynthesizeStreaming {
                text,
                chunk_steps,
                request_id,
                ..
            } => {
                assert_eq!(text, "Stream this text");
                assert_eq!(chunk_steps, Some(25));
                assert_eq!(request_id, Some(7));
            }
            _ => panic!("Expected SynthesizeStreaming variant"),
        }
    }

    #[test]
    fn synthesize_streaming_minimal() {
        // All optional fields omitted
        let json = r#"{"type":"synthesize_streaming","text":"Hello"}"#;
        let parsed: ClientMessage = serde_json::from_str(json).unwrap();
        match parsed {
            ClientMessage::SynthesizeStreaming {
                text,
                emotion,
                intensity,
                chunk_steps,
                request_id,
            } => {
                assert_eq!(text, "Hello");
                assert_eq!(emotion, None);
                assert_eq!(intensity, None);
                assert_eq!(chunk_steps, None);
                assert_eq!(request_id, None);
            }
            _ => panic!("Expected SynthesizeStreaming variant"),
        }
    }

    #[test]
    fn audio_start_with_request_id() {
        let msg = ServerMessage::AudioStart {
            sample_rate: 24000,
            request_id: Some(5),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"request_id\":5"));
        assert!(json.contains("\"sample_rate\":24000"));
    }

    #[test]
    fn audio_done_with_request_id() {
        let msg = ServerMessage::AudioDone {
            duration_ms: 1500,
            humanization: None,
            request_id: Some(5),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"request_id\":5"));
        assert!(json.contains("\"duration_ms\":1500"));
    }

    #[test]
    fn audio_start_without_request_id() {
        let msg = ServerMessage::AudioStart {
            sample_rate: 24000,
            request_id: None,
        };
        let json = serde_json::to_string(&msg).unwrap();
        // request_id should serialize as null when None
        assert!(json.contains("\"sample_rate\":24000"));
    }
}
