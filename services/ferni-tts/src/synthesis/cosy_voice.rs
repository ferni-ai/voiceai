//! CosyVoice gRPC Client
//!
//! Client for the CosyVoice/BTCW TTS backend.

use super::{SynthesisClient, SynthesisRequest, SynthesisResponse, SynthesisStream};
use crate::audio::AudioFormat;
use crate::error::{Error, Result};
use async_trait::async_trait;
use futures::{Stream, StreamExt};
use std::pin::Pin;
use std::task::{Context, Poll};
use std::time::Instant;
use tokio::sync::mpsc;
use tonic::transport::Channel;

// For now, we'll use a simplified gRPC interface
// In production, this would use generated protobuf types
mod proto {
    tonic::include_proto!("ferni.tts");
}

/// CosyVoice TTS client
pub struct CosyVoiceClient {
    endpoint: String,
    channel: Option<Channel>,
    connected: bool,
}

impl CosyVoiceClient {
    /// Connect to CosyVoice backend
    pub async fn connect(endpoint: &str) -> Result<Self> {
        let channel = Channel::from_shared(endpoint.to_string())
            .map_err(|e| Error::Synthesis {
                backend: "cosy_voice".to_string(),
                message: format!("Invalid endpoint: {}", e),
            })?
            .connect()
            .await
            .map_err(|e| Error::Synthesis {
                backend: "cosy_voice".to_string(),
                message: format!("Connection failed: {}", e),
            })?;

        Ok(Self {
            endpoint: endpoint.to_string(),
            channel: Some(channel),
            connected: true,
        })
    }

    /// Create client without connecting (for lazy connection)
    pub fn new(endpoint: &str) -> Self {
        Self {
            endpoint: endpoint.to_string(),
            channel: None,
            connected: false,
        }
    }

    /// Ensure connected
    async fn ensure_connected(&mut self) -> Result<&Channel> {
        if self.channel.is_none() {
            let channel = Channel::from_shared(self.endpoint.clone())
                .map_err(|e| Error::Synthesis {
                    backend: "cosy_voice".to_string(),
                    message: format!("Invalid endpoint: {}", e),
                })?
                .connect()
                .await
                .map_err(|e| Error::Synthesis {
                    backend: "cosy_voice".to_string(),
                    message: format!("Connection failed: {}", e),
                })?;
            self.channel = Some(channel);
            self.connected = true;
        }
        Ok(self.channel.as_ref().unwrap())
    }

    /// Synthesize using direct HTTP call (fallback)
    async fn synthesize_http(&self, request: &SynthesisRequest) -> Result<SynthesisResponse> {
        let start = Instant::now();

        // Build request payload
        let payload = serde_json::json!({
            "text": request.text,
            "voice_id": request.voice_id,
            "sample_rate": request.output_format.sample_rate,
            "rate": request.rate,
            "pitch": request.pitch,
            "is_ssml": request.is_ssml,
        });

        let client = reqwest::Client::new();
        let http_endpoint = self.endpoint.replace("grpc://", "http://")
            .replace(":50051", ":8080"); // Adjust port for HTTP

        let response = client
            .post(format!("{}/synthesize", http_endpoint))
            .json(&payload)
            .send()
            .await
            .map_err(|e| Error::Synthesis {
                backend: "cosy_voice".to_string(),
                message: format!("HTTP request failed: {}", e),
            })?;

        if !response.status().is_success() {
            return Err(Error::Synthesis {
                backend: "cosy_voice".to_string(),
                message: format!("Synthesis failed with status: {}", response.status()),
            });
        }

        let audio = response.bytes().await.map_err(|e| Error::Synthesis {
            backend: "cosy_voice".to_string(),
            message: format!("Failed to read response: {}", e),
        })?;

        let latency = start.elapsed().as_millis() as u64;

        Ok(SynthesisResponse::new(audio.to_vec(), request.output_format)
            .with_latency(latency))
    }
}

#[async_trait]
impl SynthesisClient for CosyVoiceClient {
    fn name(&self) -> &'static str {
        "cosy_voice"
    }

    async fn health_check(&self) -> Result<bool> {
        // Try HTTP health endpoint
        let http_endpoint = self.endpoint.replace("grpc://", "http://")
            .replace(":50051", ":8080");

        let client = reqwest::Client::new();
        match client
            .get(format!("{}/health", http_endpoint))
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await
        {
            Ok(resp) => Ok(resp.status().is_success()),
            Err(_) => Ok(false),
        }
    }

    async fn synthesize(&self, request: SynthesisRequest) -> Result<SynthesisResponse> {
        // Use HTTP fallback for now (gRPC implementation would use proto client)
        self.synthesize_http(&request).await
    }

    async fn synthesize_stream(&self, request: SynthesisRequest) -> Result<SynthesisStream> {
        let endpoint = self.endpoint.clone();
        let (tx, rx) = mpsc::channel(16);

        // Spawn streaming task
        tokio::spawn(async move {
            let start = Instant::now();

            // Build request
            let payload = serde_json::json!({
                "text": request.text,
                "voice_id": request.voice_id,
                "sample_rate": request.output_format.sample_rate,
                "rate": request.rate,
                "pitch": request.pitch,
                "is_ssml": request.is_ssml,
                "streaming": true,
            });

            let http_endpoint = endpoint.replace("grpc://", "http://")
                .replace(":50051", ":8080");

            let client = reqwest::Client::new();
            let response = match client
                .post(format!("{}/synthesize/stream", http_endpoint))
                .json(&payload)
                .send()
                .await
            {
                Ok(resp) => resp,
                Err(e) => {
                    let _ = tx.send(Err(Error::Synthesis {
                        backend: "cosy_voice".to_string(),
                        message: format!("Request failed: {}", e),
                    })).await;
                    return;
                }
            };

            // Stream response chunks
            let mut stream = response.bytes_stream();
            let mut chunk_index = 0u32;
            let format = request.output_format;

            while let Some(chunk_result) = stream.next().await {
                match chunk_result {
                    Ok(bytes) => {
                        let is_final = false; // Will be set on last chunk
                        let response = SynthesisResponse {
                            audio: bytes.to_vec(),
                            format,
                            duration_ms: format.duration_ms(bytes.len()),
                            is_final,
                            chunk_index,
                            request_id: None,
                            latency_ms: if chunk_index == 0 {
                                Some(start.elapsed().as_millis() as u64)
                            } else {
                                None
                            },
                        };
                        if tx.send(Ok(response)).await.is_err() {
                            break;
                        }
                        chunk_index += 1;
                    }
                    Err(e) => {
                        let _ = tx.send(Err(Error::Synthesis {
                            backend: "cosy_voice".to_string(),
                            message: format!("Stream error: {}", e),
                        })).await;
                        return;
                    }
                }
            }

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
        });

        Ok(Box::pin(ReceiverStream { receiver: rx }))
    }

    async fn list_voices(&self) -> Result<Vec<String>> {
        // Return predefined Ferni voices
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

    #[test]
    fn test_client_creation() {
        let client = CosyVoiceClient::new("http://localhost:50051");
        assert_eq!(client.endpoint, "http://localhost:50051");
        assert!(!client.connected);
    }
}
