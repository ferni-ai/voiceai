//! Cartesia TTS Client
//!
//! High-performance, low-latency cloud TTS backend.
//! Cartesia provides streaming audio synthesis with < 100ms time-to-first-byte.
//!
//! ## Features
//!
//! - WebSocket-based streaming for minimal latency
//! - High-quality neural voices
//! - Multiple output formats (PCM, MP3)
//! - Voice cloning support
//!
//! ## Usage
//!
//! ```rust,ignore
//! let client = CartesiaClient::new(&config)?;
//! let response = client.synthesize(request).await?;
//! ```

use super::{SynthesisClient, SynthesisRequest, SynthesisResponse, SynthesisStream};
use crate::audio::AudioFormat;
use crate::config::{CartesiaOutputFormat, CartesiaTtsConfig};
use crate::error::{Error, Result};
use async_trait::async_trait;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use futures::{SinkExt, Stream, StreamExt};
use serde::{Deserialize, Serialize};
use std::pin::Pin;
use std::task::{Context, Poll};
use std::time::Instant;
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};

/// Cartesia WebSocket message types
#[derive(Debug, Serialize)]
struct CartesiaRequest {
    model_id: String,
    transcript: String,
    voice: CartesiaVoice,
    output_format: CartesiaOutputFormatSpec,
    #[serde(skip_serializing_if = "Option::is_none")]
    context_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    language: Option<String>,
}

#[derive(Debug, Serialize)]
struct CartesiaVoice {
    mode: String,
    id: String,
}

#[derive(Debug, Serialize)]
struct CartesiaOutputFormatSpec {
    container: String,
    encoding: String,
    sample_rate: u32,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum CartesiaResponse {
    #[serde(rename = "chunk")]
    Chunk { data: String, step_time: Option<f64> },
    #[serde(rename = "done")]
    Done { context_id: Option<String> },
    #[serde(rename = "error")]
    Error { message: String, code: Option<String> },
}

/// Cartesia TTS client
pub struct CartesiaClient {
    config: CartesiaTtsConfig,
}

impl CartesiaClient {
    /// Create a new Cartesia client
    pub fn new(config: &CartesiaTtsConfig) -> Result<Self> {
        if config.api_key.is_empty() {
            return Err(Error::Config {
                message: "Cartesia API key is required".to_string(),
            });
        }

        Ok(Self {
            config: config.clone(),
        })
    }

    /// Get the WebSocket URL with API key
    fn get_ws_url(&self) -> String {
        let base = &self.config.endpoint;
        if base.contains('?') {
            format!("{}&api_key={}", base, self.config.api_key)
        } else {
            format!("{}?api_key={}&cartesia_version=2024-06-10", base, self.config.api_key)
        }
    }

    /// Convert our output format to Cartesia spec
    fn get_output_format(&self, requested: &AudioFormat) -> CartesiaOutputFormatSpec {
        let (container, encoding, sample_rate) = match self.config.output_format {
            CartesiaOutputFormat::RawPcm16000 => ("raw", "pcm_s16le", 16000),
            CartesiaOutputFormat::RawPcm22050 => ("raw", "pcm_s16le", 22050),
            CartesiaOutputFormat::RawPcm24000 => ("raw", "pcm_s16le", 24000),
            CartesiaOutputFormat::RawPcm44100 => ("raw", "pcm_s16le", 44100),
            CartesiaOutputFormat::Mp3 => ("mp3", "mp3", requested.sample_rate),
        };

        CartesiaOutputFormatSpec {
            container: container.to_string(),
            encoding: encoding.to_string(),
            sample_rate,
        }
    }

    /// Map voice ID to Cartesia voice ID
    fn map_voice_id(&self, voice_id: &str) -> String {
        // Map Ferni persona names to Cartesia voice IDs
        // These can be configured or fetched from a voice registry
        match voice_id {
            "ferni" => self.config.default_voice_id.clone(),
            "maya" => "79a125e8-cd45-4c13-8a67-188112f4dd22".to_string(), // Female, warm
            "peter" => "a0e99841-438c-4a64-b679-ae501e7d6091".to_string(), // Male, analytical
            "jordan" => "248be419-c632-4f23-adf1-5324ed7dbf1d".to_string(), // Neutral, efficient
            "alex" => "421b3369-f63f-4b03-8980-37a44df1d4e8".to_string(), // Professional
            "nayan" => "5619d38c-cf51-4d8e-9575-48f61a280413".to_string(), // Wise, serene
            _ => self.config.default_voice_id.clone(),
        }
    }

    /// Synthesize via HTTP REST API (non-streaming fallback)
    async fn synthesize_http(&self, request: &SynthesisRequest) -> Result<SynthesisResponse> {
        let start = Instant::now();

        let output_format = self.get_output_format(&request.output_format);
        let voice_id = self.map_voice_id(&request.voice_id);

        let payload = serde_json::json!({
            "model_id": self.config.model_id,
            "transcript": request.text,
            "voice": {
                "mode": "id",
                "id": voice_id
            },
            "output_format": {
                "container": output_format.container,
                "encoding": output_format.encoding,
                "sample_rate": output_format.sample_rate
            }
        });

        let http_endpoint = self.config.endpoint
            .replace("wss://", "https://")
            .replace("/websocket", "/bytes");

        let client = reqwest::Client::new();
        let response = client
            .post(&http_endpoint)
            .header("X-API-Key", &self.config.api_key)
            .header("Cartesia-Version", "2024-06-10")
            .header("Content-Type", "application/json")
            .json(&payload)
            .timeout(std::time::Duration::from_millis(
                self.config.connect_timeout_ms + 10000,
            ))
            .send()
            .await
            .map_err(|e| Error::SynthesisFailed {
                message: format!("Cartesia HTTP request failed: {}", e),
            })?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Error::SynthesisFailed {
                message: format!("Cartesia synthesis failed with status {}: {}", status, body),
            });
        }

        let audio = response.bytes().await.map_err(|e| Error::SynthesisFailed {
            message: format!("Failed to read Cartesia response: {}", e),
        })?;

        let latency = start.elapsed().as_millis() as u64;

        // Create audio format based on output format
        let format = AudioFormat {
            sample_rate: output_format.sample_rate,
            bits_per_sample: 16,
            channels: 1,
        };

        Ok(SynthesisResponse::new(audio.to_vec(), format).with_latency(latency))
    }
}

#[async_trait]
impl SynthesisClient for CartesiaClient {
    fn name(&self) -> &'static str {
        "cartesia"
    }

    async fn health_check(&self) -> Result<bool> {
        // Try to establish WebSocket connection
        let url = self.get_ws_url();
        let timeout = std::time::Duration::from_millis(self.config.connect_timeout_ms);

        match tokio::time::timeout(timeout, connect_async(&url)).await {
            Ok(Ok((ws_stream, _))) => {
                // Connection successful, close cleanly
                let (mut write, _) = ws_stream.split();
                let _ = write.close().await;
                Ok(true)
            }
            Ok(Err(_)) => Ok(false),
            Err(_) => Ok(false), // Timeout
        }
    }

    async fn synthesize(&self, request: SynthesisRequest) -> Result<SynthesisResponse> {
        // Use HTTP endpoint for non-streaming requests (simpler, still fast)
        self.synthesize_http(&request).await
    }

    async fn synthesize_stream(&self, request: SynthesisRequest) -> Result<SynthesisStream> {
        let url = self.get_ws_url();
        let config = self.config.clone();
        let output_format = self.get_output_format(&request.output_format);
        let voice_id = self.map_voice_id(&request.voice_id);

        let (tx, rx) = mpsc::channel(32);

        // Spawn WebSocket streaming task
        tokio::spawn(async move {
            let start = Instant::now();

            // Connect to Cartesia WebSocket
            let ws_result = connect_async(&url).await;
            let (mut ws_stream, _) = match ws_result {
                Ok(stream) => stream,
                Err(e) => {
                    let _ = tx
                        .send(Err(Error::BackendUnavailable {
                            backend: format!("Cartesia WebSocket connection failed: {}", e),
                        }))
                        .await;
                    return;
                }
            };

            // Send synthesis request
            let cartesia_request = CartesiaRequest {
                model_id: config.model_id.clone(),
                transcript: request.text.clone(),
                voice: CartesiaVoice {
                    mode: "id".to_string(),
                    id: voice_id,
                },
                output_format: CartesiaOutputFormatSpec {
                    container: output_format.container.clone(),
                    encoding: output_format.encoding.clone(),
                    sample_rate: output_format.sample_rate,
                },
                context_id: None,
                language: request.language.clone(),
            };

            let request_json = match serde_json::to_string(&cartesia_request) {
                Ok(json) => json,
                Err(e) => {
                    let _ = tx
                        .send(Err(Error::SynthesisFailed {
                            message: format!("Failed to serialize request: {}", e),
                        }))
                        .await;
                    return;
                }
            };

            if let Err(e) = ws_stream.send(Message::Text(request_json)).await {
                let _ = tx
                    .send(Err(Error::SynthesisFailed {
                        message: format!("Failed to send request: {}", e),
                    }))
                    .await;
                return;
            }

            // Process response chunks
            let format = AudioFormat {
                sample_rate: output_format.sample_rate,
                bits_per_sample: 16,
                channels: 1,
            };
            let mut chunk_index = 0u32;
            let mut first_chunk_latency: Option<u64> = None;

            while let Some(msg_result) = ws_stream.next().await {
                match msg_result {
                    Ok(Message::Text(text)) => {
                        match serde_json::from_str::<CartesiaResponse>(&text) {
                            Ok(CartesiaResponse::Chunk { data, step_time: _ }) => {
                                // Decode base64 audio data
                                let audio_bytes = match BASE64.decode(&data) {
                                    Ok(bytes) => bytes,
                                    Err(e) => {
                                        let _ = tx
                                            .send(Err(Error::SynthesisFailed {
                                                message: format!(
                                                    "Failed to decode audio chunk: {}",
                                                    e
                                                ),
                                            }))
                                            .await;
                                        return;
                                    }
                                };

                                // Record first chunk latency
                                if first_chunk_latency.is_none() {
                                    first_chunk_latency = Some(start.elapsed().as_millis() as u64);
                                }

                                let response = SynthesisResponse {
                                    audio: audio_bytes,
                                    format,
                                    duration_ms: format.duration_ms(0), // Calculated on full chunk
                                    is_final: false,
                                    chunk_index,
                                    request_id: None,
                                    latency_ms: if chunk_index == 0 {
                                        first_chunk_latency
                                    } else {
                                        None
                                    },
                                };

                                if tx.send(Ok(response)).await.is_err() {
                                    break;
                                }
                                chunk_index += 1;
                            }
                            Ok(CartesiaResponse::Done { .. }) => {
                                // Send final marker
                                let final_response = SynthesisResponse {
                                    audio: Vec::new(),
                                    format,
                                    duration_ms: 0,
                                    is_final: true,
                                    chunk_index,
                                    request_id: None,
                                    latency_ms: None,
                                };
                                let _ = tx.send(Ok(final_response)).await;
                                break;
                            }
                            Ok(CartesiaResponse::Error { message, code }) => {
                                let error_msg = if let Some(c) = code {
                                    format!("Cartesia error [{}]: {}", c, message)
                                } else {
                                    format!("Cartesia error: {}", message)
                                };
                                let _ = tx
                                    .send(Err(Error::SynthesisFailed { message: error_msg }))
                                    .await;
                                return;
                            }
                            Err(e) => {
                                let _ = tx
                                    .send(Err(Error::SynthesisFailed {
                                        message: format!("Failed to parse response: {}", e),
                                    }))
                                    .await;
                                return;
                            }
                        }
                    }
                    Ok(Message::Close(_)) => {
                        // Connection closed by server
                        if chunk_index == 0 {
                            let _ = tx
                                .send(Err(Error::SynthesisFailed {
                                    message: "Connection closed before receiving data".to_string(),
                                }))
                                .await;
                        }
                        break;
                    }
                    Ok(_) => {
                        // Ignore ping/pong/binary messages
                    }
                    Err(e) => {
                        let _ = tx
                            .send(Err(Error::SynthesisFailed {
                                message: format!("WebSocket error: {}", e),
                            }))
                            .await;
                        return;
                    }
                }
            }
        });

        Ok(Box::pin(ReceiverStream { receiver: rx }))
    }

    async fn list_voices(&self) -> Result<Vec<String>> {
        // Cartesia has many voices, but we primarily use our mapped persona voices
        // In production, this could fetch from Cartesia's /voices endpoint
        Ok(vec![
            "ferni".to_string(),
            "maya".to_string(),
            "peter".to_string(),
            "jordan".to_string(),
            "alex".to_string(),
            "nayan".to_string(),
        ])
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

    fn test_config() -> CartesiaTtsConfig {
        CartesiaTtsConfig {
            api_key: "test-key".to_string(),
            endpoint: "wss://api.cartesia.ai/tts/websocket".to_string(),
            default_voice_id: "a0e99841-438c-4a64-b679-ae501e7d6091".to_string(),
            model_id: "sonic-english".to_string(),
            output_format: CartesiaOutputFormat::RawPcm24000,
            streaming: true,
            connect_timeout_ms: 5000,
        }
    }

    #[test]
    fn test_client_creation() {
        let config = test_config();
        let client = CartesiaClient::new(&config).unwrap();
        assert_eq!(client.name(), "cartesia");
    }

    #[test]
    fn test_empty_api_key_fails() {
        let mut config = test_config();
        config.api_key = "".to_string();
        let result = CartesiaClient::new(&config);
        assert!(result.is_err());
    }

    #[test]
    fn test_voice_mapping() {
        let config = test_config();
        let client = CartesiaClient::new(&config).unwrap();

        // Test known voice mappings
        assert_eq!(
            client.map_voice_id("ferni"),
            "a0e99841-438c-4a64-b679-ae501e7d6091"
        );

        // Unknown voices should fall back to default
        assert_eq!(
            client.map_voice_id("unknown"),
            "a0e99841-438c-4a64-b679-ae501e7d6091"
        );
    }

    #[test]
    fn test_ws_url_construction() {
        let config = test_config();
        let client = CartesiaClient::new(&config).unwrap();
        let url = client.get_ws_url();
        assert!(url.contains("api_key=test-key"));
        assert!(url.contains("cartesia_version="));
    }

    #[test]
    fn test_output_format_conversion() {
        let config = test_config();
        let client = CartesiaClient::new(&config).unwrap();
        let format = AudioFormat::default();

        let spec = client.get_output_format(&format);
        assert_eq!(spec.container, "raw");
        assert_eq!(spec.encoding, "pcm_s16le");
        assert_eq!(spec.sample_rate, 24000);
    }
}
