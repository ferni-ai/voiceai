//! Synthesis Client Trait
//!
//! Abstract interface for TTS synthesis backends.

use crate::audio::AudioFormat;
use crate::error::Result;
use async_trait::async_trait;
use futures::Stream;
use std::pin::Pin;

/// Request for speech synthesis
#[derive(Debug, Clone)]
pub struct SynthesisRequest {
    /// Text to synthesize (can be plain text or SSML)
    pub text: String,

    /// Whether the text is SSML
    pub is_ssml: bool,

    /// Voice ID to use
    pub voice_id: String,

    /// Desired output format
    pub output_format: AudioFormat,

    /// Speaking rate multiplier (1.0 = normal)
    pub rate: f32,

    /// Pitch adjustment in semitones
    pub pitch: f32,

    /// Volume adjustment (0.0-1.0)
    pub volume: f32,

    /// Language code (e.g., "en-US")
    pub language: Option<String>,

    /// Voice style (if supported)
    pub style: Option<String>,

    /// Reference audio for voice cloning
    pub reference_audio: Option<Vec<u8>>,

    /// Enable streaming response
    pub streaming: bool,
}

impl Default for SynthesisRequest {
    fn default() -> Self {
        Self {
            text: String::new(),
            is_ssml: false,
            voice_id: "ferni".to_string(),
            output_format: AudioFormat::default(),
            rate: 1.0,
            pitch: 0.0,
            volume: 1.0,
            language: Some("en-US".to_string()),
            style: None,
            reference_audio: None,
            streaming: true,
        }
    }
}

impl SynthesisRequest {
    /// Create a new synthesis request
    pub fn new(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            ..Default::default()
        }
    }

    /// Create a request with SSML
    pub fn ssml(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            is_ssml: true,
            ..Default::default()
        }
    }

    pub fn with_voice(mut self, voice_id: impl Into<String>) -> Self {
        self.voice_id = voice_id.into();
        self
    }

    pub fn with_format(mut self, format: AudioFormat) -> Self {
        self.output_format = format;
        self
    }

    pub fn with_rate(mut self, rate: f32) -> Self {
        self.rate = rate;
        self
    }

    pub fn with_pitch(mut self, pitch: f32) -> Self {
        self.pitch = pitch;
        self
    }

    pub fn with_volume(mut self, volume: f32) -> Self {
        self.volume = volume;
        self
    }

    pub fn with_language(mut self, language: impl Into<String>) -> Self {
        self.language = Some(language.into());
        self
    }

    pub fn with_style(mut self, style: impl Into<String>) -> Self {
        self.style = Some(style.into());
        self
    }

    pub fn with_reference_audio(mut self, audio: Vec<u8>) -> Self {
        self.reference_audio = Some(audio);
        self
    }

    pub fn non_streaming(mut self) -> Self {
        self.streaming = false;
        self
    }
}

/// Response from synthesis
#[derive(Debug, Clone)]
pub struct SynthesisResponse {
    /// Synthesized audio data
    pub audio: Vec<u8>,

    /// Audio format
    pub format: AudioFormat,

    /// Duration in milliseconds
    pub duration_ms: u64,

    /// Whether this is the final chunk (for streaming)
    pub is_final: bool,

    /// Chunk index (for streaming)
    pub chunk_index: u32,

    /// Request ID for tracing
    pub request_id: Option<String>,

    /// Synthesis latency in milliseconds
    pub latency_ms: Option<u64>,
}

impl SynthesisResponse {
    /// Create a new synthesis response
    pub fn new(audio: Vec<u8>, format: AudioFormat) -> Self {
        let duration_ms = format.duration_ms(audio.len());
        Self {
            audio,
            format,
            duration_ms,
            is_final: true,
            chunk_index: 0,
            request_id: None,
            latency_ms: None,
        }
    }

    pub fn with_request_id(mut self, id: impl Into<String>) -> Self {
        self.request_id = Some(id.into());
        self
    }

    pub fn with_latency(mut self, latency_ms: u64) -> Self {
        self.latency_ms = Some(latency_ms);
        self
    }
}

/// Stream of synthesis responses
pub type SynthesisStream = Pin<Box<dyn Stream<Item = Result<SynthesisResponse>> + Send>>;

/// Trait for TTS synthesis backends
#[async_trait]
pub trait SynthesisClient: Send + Sync {
    /// Backend name
    fn name(&self) -> &'static str;

    /// Check if backend is healthy
    async fn health_check(&self) -> Result<bool>;

    /// Synthesize speech (non-streaming)
    async fn synthesize(&self, request: SynthesisRequest) -> Result<SynthesisResponse>;

    /// Synthesize speech with streaming
    async fn synthesize_stream(&self, request: SynthesisRequest) -> Result<SynthesisStream>;

    /// List available voices
    async fn list_voices(&self) -> Result<Vec<String>>;

    /// Check if a specific voice is available
    async fn has_voice(&self, voice_id: &str) -> Result<bool> {
        let voices = self.list_voices().await?;
        Ok(voices.iter().any(|v| v == voice_id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_request_builder() {
        let req = SynthesisRequest::new("Hello world")
            .with_voice("maya")
            .with_rate(1.2)
            .with_pitch(2.0);

        assert_eq!(req.text, "Hello world");
        assert_eq!(req.voice_id, "maya");
        assert_eq!(req.rate, 1.2);
        assert_eq!(req.pitch, 2.0);
        assert!(!req.is_ssml);
    }

    #[test]
    fn test_ssml_request() {
        let req = SynthesisRequest::ssml("<speak>Hello</speak>")
            .with_voice("ferni");

        assert!(req.is_ssml);
        assert_eq!(req.voice_id, "ferni");
    }
}
