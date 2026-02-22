//! Ollama HTTP backend: streams text from POST /api/generate (stream: true).
//! Response format: NDJSON, each line has "response" (token chunk) and "done".

use std::pin::Pin;
use std::task::Poll;

use anyhow::{Context, Result};
use async_trait::async_trait;
use futures_util::Stream;
use reqwest::Client;
use tokio::sync::mpsc;

use super::{LlmBackend, TokenStream};

/// Ollama API base URL (e.g. http://127.0.0.1:11434).
#[derive(Debug, Clone)]
pub struct OllamaBackend {
    base_url: String,
    model: String,
    client: Client,
}

impl OllamaBackend {
    pub fn new(base_url: String, model: String) -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .unwrap_or_else(|_| Client::new());
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            model,
            client,
        }
    }

    fn url(&self) -> String {
        format!("{}/api/generate", self.base_url)
    }
}

#[async_trait]
impl LlmBackend for OllamaBackend {
    fn name(&self) -> &'static str {
        "ollama"
    }

    async fn generate_stream(
        &self,
        prompt: String,
        max_tokens: Option<u32>,
    ) -> Result<TokenStream> {
        let url = self.url();
        let model = self.model.clone();
        let client = self.client.clone();

        let mut body = serde_json::json!({
            "model": model,
            "prompt": prompt,
            "stream": true,
        });
        if let Some(n) = max_tokens {
            body["options"] = serde_json::json!({ "num_predict": n });
        }

        let response = client
            .post(&url)
            .json(&body)
            .send()
            .await
            .context("Ollama /api/generate request failed")?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            anyhow::bail!("Ollama returned {}: {}", status, text);
        }

        let (tx, rx) = mpsc::channel::<Result<String>>(32);
        let mut byte_stream = response.bytes_stream();
        let mut buf = Vec::new();

        tokio::spawn(async move {
            use futures_util::StreamExt;
            while let Some(chunk_result) = byte_stream.next().await {
                match chunk_result {
                    Ok(chunk) => {
                        buf.extend_from_slice(&chunk);
                        while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
                            let line: Vec<u8> = buf.drain(..=pos).collect();
                            let line = String::from_utf8_lossy(&line).trim().to_string();
                            if line.is_empty() {
                                continue;
                            }
                            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&line) {
                                if let Some(token) = parsed.get("response").and_then(|v| v.as_str()) {
                                    if !token.is_empty() && tx.send(Ok(token.to_string())).await.is_err() {
                                        return;
                                    }
                                }
                                if parsed.get("done").and_then(|v| v.as_bool()).unwrap_or(false) {
                                    let _ = tx.send(Ok(String::new()));
                                    return;
                                }
                            }
                        }
                    }
                    Err(e) => {
                        let _ = tx.send(Err(anyhow::anyhow!("Ollama stream: {}", e))).await;
                        return;
                    }
                }
            }
            let _ = tx.send(Ok(String::new()));
        });

        struct OllamaStream {
            rx: mpsc::Receiver<Result<String>>,
        }
        impl Stream for OllamaStream {
            type Item = Result<String>;
            fn poll_next(
                mut self: Pin<&mut Self>,
                cx: &mut std::task::Context<'_>,
            ) -> Poll<Option<Self::Item>> {
                match self.rx.poll_recv(cx) {
                    Poll::Ready(Some(Ok(s))) if s.is_empty() => Poll::Ready(None),
                    Poll::Ready(Some(item)) => Poll::Ready(Some(item)),
                    Poll::Ready(None) => Poll::Ready(None),
                    Poll::Pending => Poll::Pending,
                }
            }
        }
        Ok(Box::pin(OllamaStream { rx }))
    }
}
