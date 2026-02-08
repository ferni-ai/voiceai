//! Mock Synthesis Client
//!
//! For testing and development without a real TTS backend.

use super::{SynthesisClient, SynthesisRequest, SynthesisResponse, SynthesisStream};
use crate::audio::AudioFormat;
use crate::error::Result;
use async_trait::async_trait;
use std::time::Duration;
use tokio::sync::mpsc;
use futures::Stream;
use std::pin::Pin;
use std::task::{Context, Poll};

/// Mock TTS client for testing
pub struct MockSynthesisClient {
    /// Simulated latency in milliseconds
    latency_ms: u64,

    /// Available voices
    voices: Vec<String>,
}

impl Default for MockSynthesisClient {
    fn default() -> Self {
        Self::new()
    }
}

impl MockSynthesisClient {
    /// Create a new mock client
    pub fn new() -> Self {
        Self {
            latency_ms: 50,
            voices: vec![
                "ferni".to_string(),
                "maya".to_string(),
                "peter".to_string(),
                "jordan".to_string(),
                "alex".to_string(),
                "nayan".to_string(),
            ],
        }
    }

    /// Set simulated latency
    pub fn with_latency(mut self, latency_ms: u64) -> Self {
        self.latency_ms = latency_ms;
        self
    }

    /// Generate mock audio data
    fn generate_mock_audio(&self, text: &str, format: AudioFormat) -> Vec<u8> {
        // Generate silence with duration based on text length
        // Approximate: 100 characters ≈ 5 seconds of speech
        let duration_ms = (text.len() as u64 * 50).max(500);
        let bytes_per_ms = format.bytes_per_second() / 1000;
        let total_bytes = (bytes_per_ms * duration_ms as usize).max(1000);

        // Generate low-level noise to simulate audio
        let mut audio = Vec::with_capacity(total_bytes);
        for i in 0..total_bytes / 2 {
            // Generate a simple sine wave
            let t = i as f32 / format.sample_rate as f32;
            let freq = 220.0; // A3 note
            let sample = (t * freq * 2.0 * std::f32::consts::PI).sin();
            let value = (sample * 0.1 * 32767.0) as i16;
            audio.extend_from_slice(&value.to_le_bytes());
        }

        audio
    }
}

#[async_trait]
impl SynthesisClient for MockSynthesisClient {
    fn name(&self) -> &'static str {
        "mock"
    }

    async fn health_check(&self) -> Result<bool> {
        Ok(true)
    }

    async fn synthesize(&self, request: SynthesisRequest) -> Result<SynthesisResponse> {
        // Simulate latency
        tokio::time::sleep(Duration::from_millis(self.latency_ms)).await;

        let audio = self.generate_mock_audio(&request.text, request.output_format);

        Ok(SynthesisResponse::new(audio, request.output_format)
            .with_latency(self.latency_ms))
    }

    async fn synthesize_stream(&self, request: SynthesisRequest) -> Result<SynthesisStream> {
        let latency_ms = self.latency_ms;
        let text = request.text.clone();
        let format = request.output_format;
        let (tx, rx) = mpsc::channel(16);

        tokio::spawn(async move {
            // Simulate initial latency
            tokio::time::sleep(Duration::from_millis(latency_ms)).await;

            // Generate audio in chunks
            let total_audio = {
                let duration_ms = (text.len() as u64 * 50).max(500);
                let bytes_per_ms = format.bytes_per_second() / 1000;
                (bytes_per_ms * duration_ms as usize).max(1000)
            };

            let chunk_size = format.bytes_for_duration(100); // 100ms chunks
            let num_chunks = (total_audio / chunk_size).max(1);

            for i in 0..num_chunks {
                let is_final = i == num_chunks - 1;
                let chunk_bytes = if is_final {
                    total_audio - (i * chunk_size)
                } else {
                    chunk_size
                };

                // Generate chunk audio
                let mut audio = Vec::with_capacity(chunk_bytes);
                for j in 0..chunk_bytes / 2 {
                    let t = (i * chunk_size / 2 + j) as f32 / format.sample_rate as f32;
                    let freq = 220.0 + (i as f32 * 10.0); // Slightly varying frequency
                    let sample = (t * freq * 2.0 * std::f32::consts::PI).sin();
                    let value = (sample * 0.1 * 32767.0) as i16;
                    audio.extend_from_slice(&value.to_le_bytes());
                }

                let response = SynthesisResponse {
                    audio,
                    format,
                    duration_ms: format.duration_ms(chunk_bytes),
                    is_final,
                    chunk_index: i as u32,
                    request_id: None,
                    latency_ms: if i == 0 { Some(latency_ms) } else { None },
                };

                if tx.send(Ok(response)).await.is_err() {
                    break;
                }

                // Simulate processing time between chunks
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        });

        Ok(Box::pin(ReceiverStream { receiver: rx }))
    }

    async fn list_voices(&self) -> Result<Vec<String>> {
        Ok(self.voices.clone())
    }
}

/// Stream adapter for mpsc receiver
struct ReceiverStream {
    receiver: mpsc::Receiver<Result<SynthesisResponse>>,
}

impl Stream for ReceiverStream {
    type Item = Result<SynthesisResponse>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        Pin::new(&mut self.receiver).poll_recv(cx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_synthesis() {
        let client = MockSynthesisClient::new().with_latency(10);
        let request = SynthesisRequest::new("Hello, world!");

        let response = client.synthesize(request).await.unwrap();
        assert!(!response.audio.is_empty());
        assert!(response.duration_ms > 0);
    }

    #[tokio::test]
    async fn test_mock_streaming() {
        use futures::StreamExt;

        let client = MockSynthesisClient::new().with_latency(10);
        let request = SynthesisRequest::new("Hello, world!");

        let mut stream = client.synthesize_stream(request).await.unwrap();

        let mut chunks = Vec::new();
        while let Some(result) = stream.next().await {
            chunks.push(result.unwrap());
        }

        assert!(!chunks.is_empty());
        assert!(chunks.last().unwrap().is_final);
    }

    #[tokio::test]
    async fn test_list_voices() {
        let client = MockSynthesisClient::new();
        let voices = client.list_voices().await.unwrap();

        assert!(voices.contains(&"ferni".to_string()));
        assert!(voices.contains(&"maya".to_string()));
    }
}
