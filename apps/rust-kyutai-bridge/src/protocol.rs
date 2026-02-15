//! WebSocket protocol types for the Kyutai STT + TTS bridge.
//!
//! Matches the Python bridge (`scripts/kyutai/mlx-bridge-server.py`) exactly:
//!
//! **STT (`/api/asr-streaming`)**
//!   Inbound:  binary PCM frames (Int16, 16 kHz, mono)
//!   Outbound: JSON `{ "text": String, "is_final": bool }`
//!             optional `{ "vad": bool, "is_speaking": bool }`
//!
//! **TTS (`/api/tts_streaming`)**
//!   Inbound:  JSON `{ "text": String, "voice_id": String }`
//!   Outbound: binary PCM frames (Int16, 24 kHz, mono)
//!             then JSON `{ "done": true }`

use serde::{Deserialize, Serialize};

// =============================================================================
// STT protocol
// =============================================================================

/// STT transcript event sent to the client.
#[derive(Debug, Serialize)]
pub struct SttTranscript {
    pub text: String,
    pub is_final: bool,
}

/// VAD status event sent to the client.
#[derive(Debug, Serialize)]
pub struct SttVadStatus {
    pub vad: bool,
    pub is_speaking: bool,
}

// =============================================================================
// TTS protocol
// =============================================================================

/// TTS request received from the client.
#[derive(Debug, Deserialize)]
pub struct TtsRequest {
    pub text: String,
    #[serde(default)]
    pub voice_id: String,
}

/// TTS completion event sent to the client.
#[derive(Debug, Serialize)]
pub struct TtsDone {
    pub done: bool,
}

// =============================================================================
// Audio constants
// =============================================================================

/// STT input sample rate (Hz). Used by Phase 2 inference.
#[allow(dead_code)]
pub const STT_SAMPLE_RATE: u32 = 16_000;

/// TTS output sample rate (Hz). Used by Phase 2 inference.
#[allow(dead_code)]
pub const TTS_SAMPLE_RATE: u32 = 24_000;

/// Bytes per Int16 sample.
pub const BYTES_PER_SAMPLE: usize = 2;

/// Number of STT input bytes that trigger the first mock interim (~320 bytes = 10 ms).
/// Matches the Python bridge's `STT_CHUNK_BYTES`.
pub const STT_CHUNK_BYTES: usize = 320;

/// TTS chunk size in samples (240 samples = 10 ms at 24 kHz).
/// Matches the Python bridge's `TTS_CHUNK_SAMPLES`.
pub const TTS_CHUNK_SAMPLES: usize = 240;

/// Number of silence TTS chunks to send in mock mode.
pub const TTS_MOCK_CHUNKS: usize = 5;
