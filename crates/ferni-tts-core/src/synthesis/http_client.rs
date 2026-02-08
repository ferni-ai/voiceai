//! HTTP Synthesis Client
//!
//! Calls ferni-tts service `/v1/synthesize` for production TTS (Cartesia/CosyVoice).
//! Use when FERNI_TTS_URL is set; otherwise use MockSynthesisClient for tests.

use super::{SynthesisClient, SynthesisRequest, SynthesisResponse, SynthesisStream};
use crate::audio::AudioFormat;
use crate::error::{Error, Result};
use async_trait::async_trait;
use futures::Stream;
use serde::Serialize;
use std::pin::Pin;
use std::time::Duration;

/// JSON body for ferni-tts POST /v1/synthesize (matches service SynthesizeRequest)
#[derive(Debug, Serialize)]
struct SynthesizeRequestBody {
    text: String,
    voice_id: String,
    sample_rate: u32,
    rate: f32,
    pitch: f32,
    volume: f32,
    output_format: String,
}

/// HTTP client that calls ferni-tts service for synthesis.
pub struct HttpSynthesisClient {
    base_url: String,
    client: reqwest::Client,
}

impl HttpSynthesisClient {
    /// Create client for ferni-tts base URL (e.g. `http://localhost:8080`).
    pub fn new(base_url: impl Into<String>) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            client,
        }
    }

    fn build_body(request: &SynthesisRequest) -> SynthesizeRequestBody {
        SynthesizeRequestBody {
            text: request.text.clone(),
            voice_id: request.voice_id.clone(),
            sample_rate: request.output_format.sample_rate,
            rate: request.rate,
            pitch: request.pitch,
            volume: request.volume,
            output_format: "pcm".to_string(),
        }
    }
}

#[async_trait]
impl SynthesisClient for HttpSynthesisClient {
    async fn synthesize(&self, request: SynthesisRequest) -> Result<SynthesisResponse> {
        let url = format!("{}/v1/synthesize", self.base_url);
        let body = Self::build_body(&request);
        let response = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| Error::SynthesisFailed {
                message: format!("ferni-tts HTTP request: {}", e),
            })?;
        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(Error::SynthesisFailed {
                message: format!("ferni-tts HTTP {}: {}", status, text),
            });
        }
        let duration_ms = response
            .headers()
            .get("X-Duration-Ms")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse().ok())
            .unwrap_or_else(|| {
                let bytes = response.bytes().await.as_ref().map(|b| b.len()).unwrap_or(0);
                request.output_format.duration_ms(bytes)
            });
        let bytes = response
            .bytes()
            .await
            .map_err(|e| Error::SynthesisFailed {
                message: format!("ferni-tts read body: {}", e),
            })?;
        let audio = bytes.to_vec();
        let format = request.output_format;
        Ok(SynthesisResponse::new(audio, format).with_latency(
            response
                .headers()
                .get("X-Latency-Ms")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse().ok())
                .unwrap_or(0),
        ))
    }

    async fn synthesize_stream(&self, request: SynthesisRequest) -> Result<SynthesisStream> {
        // Non-streaming: one full response then one chunk
        let response = self.synthesize(request).await?;
        let chunk = Ok(response);
        let stream = futures::stream::iter(vec![chunk]);
        Ok(Box::pin(stream))
    }
}
