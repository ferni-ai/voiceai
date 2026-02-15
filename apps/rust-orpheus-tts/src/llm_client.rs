//! HTTP streaming client for llama-server.
//!
//! Connects to a running llama-server instance and streams token generation
//! via the OpenAI-compatible `/v1/completions` endpoint.
//!
//! The Orpheus prompt format uses special tokens:
//!   <custom_token_3> = BOS
//!   <custom_token_4> = start of user turn
//!   <custom_token_5> = end of user turn
//!   <custom_token_1> = start of assistant (audio generation)

use anyhow::{Context, Result};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

/// Available Orpheus voices.
pub const VOICES: &[&str] = &["tara", "leah", "jess", "leo", "dan", "mia", "zac", "zoe"];
pub const DEFAULT_VOICE: &str = "tara";

/// Streaming LLM client for Orpheus token generation.
pub struct LlmClient {
    base_url: String,
    client: reqwest::Client,
    /// Max tokens to generate (Orpheus generates ~86 tokens/sec of audio)
    max_tokens: usize,
    /// Temperature for sampling (lower = more deterministic voice)
    temperature: f32,
    /// Repetition penalty
    repetition_penalty: f32,
}

impl LlmClient {
    pub fn new(base_url: &str) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            client: reqwest::Client::new(),
            max_tokens: 4096,
            temperature: 0.6,
            repetition_penalty: 1.1,
        }
    }

    /// Check if the llama-server is reachable.
    pub async fn health_check(&self) -> bool {
        self.client
            .get(format!("{}/health", self.base_url))
            .timeout(std::time::Duration::from_secs(2))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }

    /// Format the Orpheus prompt for a given voice and text.
    fn format_prompt(&self, text: &str, voice: &str) -> String {
        // Orpheus special token IDs:
        // <custom_token_3> = BOS marker
        // <custom_token_4> = user turn start
        // <custom_token_5> = user turn end
        // <custom_token_1> = assistant start (triggers audio generation)
        format!(
            "<custom_token_3><custom_token_4>voice: {}\n{}<custom_token_5><custom_token_1>",
            voice, text
        )
    }

    /// Stream tokens from llama-server for the given text and voice.
    ///
    /// Returns a channel receiver that yields individual token strings.
    /// The caller should parse these through `TokenParser` to extract SNAC codes.
    pub async fn stream_tokens(
        &self,
        text: &str,
        voice: &str,
    ) -> Result<mpsc::Receiver<String>> {
        let prompt = self.format_prompt(text, voice);
        let (tx, rx) = mpsc::channel::<String>(256);

        let url = format!("{}/v1/completions", self.base_url);

        // Scale max_tokens to text length: ~6 audio tokens per character of input,
        // with a minimum of 256 and a ceiling from self.max_tokens.
        let estimated_tokens = ((text.len() as f32 * 6.0) as usize + 128).min(self.max_tokens).max(256);

        let request_body = CompletionRequest {
            prompt: prompt.clone(),
            max_tokens: estimated_tokens,
            temperature: self.temperature,
            repetition_penalty: self.repetition_penalty,
            stream: true,
            // Stop when we hit end-of-text token
            stop: vec!["<|eot_id|>".to_string(), "<custom_token_2>".to_string()],
        };

        info!(
            text_len = text.len(),
            voice,
            max_tokens = self.max_tokens,
            "Starting Orpheus token generation"
        );

        let client = self.client.clone();
        let base_url = self.base_url.clone();

        tokio::spawn(async move {
            let result = stream_completions(&client, &url, &request_body, &tx).await;
            if let Err(e) = result {
                error!(error = %e, url = %base_url, "LLM streaming failed");
            }
            // tx drops here, closing the channel
        });

        Ok(rx)
    }
}

/// Internal: stream SSE completions from llama-server.
async fn stream_completions(
    client: &reqwest::Client,
    url: &str,
    body: &CompletionRequest,
    tx: &mpsc::Sender<String>,
) -> Result<()> {
    let response = client
        .post(url)
        .json(body)
        .send()
        .await
        .context("Failed to connect to llama-server")?;

    if !response.status().is_success() {
        let status = response.status();
        let err_text = response.text().await.unwrap_or_default();
        anyhow::bail!("llama-server returned {status}: {}", &err_text[..err_text.len().min(200)]);
    }

    // Parse SSE stream
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut token_count = 0u64;
    let start = std::time::Instant::now();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.context("Stream read error")?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        // Process complete SSE lines
        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if line.is_empty() || line.starts_with(':') {
                continue;
            }

            let data = if let Some(d) = line.strip_prefix("data: ") {
                d.trim()
            } else {
                continue;
            };

            if data == "[DONE]" {
                let elapsed_ms = start.elapsed().as_millis();
                let tps = if elapsed_ms > 0 {
                    token_count as f64 / (elapsed_ms as f64 / 1000.0)
                } else {
                    0.0
                };
                info!(
                    token_count,
                    elapsed_ms,
                    tokens_per_sec = format!("{:.1}", tps),
                    "LLM generation complete"
                );
                return Ok(());
            }

            // Parse the JSON completion chunk
            match serde_json::from_str::<CompletionChunk>(data) {
                Ok(chunk) => {
                    for choice in &chunk.choices {
                        if !choice.text.is_empty() {
                            token_count += 1;
                            if token_count == 1 {
                                let ttft = start.elapsed().as_millis();
                                debug!(ttft_ms = ttft, "First token from LLM");
                            }

                            if tx.send(choice.text.clone()).await.is_err() {
                                debug!("Token receiver dropped, stopping generation");
                                return Ok(());
                            }
                        }
                    }
                }
                Err(e) => {
                    // Not all lines are valid JSON (e.g., comments)
                    debug!(error = %e, data = &data[..data.len().min(100)], "Failed to parse SSE chunk");
                }
            }
        }
    }

    Ok(())
}

// ─── Request/Response types ─────────────────────────────────

#[derive(Serialize)]
struct CompletionRequest {
    prompt: String,
    max_tokens: usize,
    temperature: f32,
    repetition_penalty: f32,
    stream: bool,
    stop: Vec<String>,
}

#[derive(Deserialize)]
struct CompletionChunk {
    choices: Vec<CompletionChoice>,
}

#[derive(Deserialize)]
struct CompletionChoice {
    text: String,
}
