//! LLM backends for generate_reply: Candle (local) or Ollama (HTTP).
//!
//! Prefer Candle when a model path is configured; otherwise use Ollama.

mod candle;
mod ollama;

use std::pin::Pin;

use anyhow::Result;
use async_trait::async_trait;
use futures_util::Stream;

pub use candle::CandleBackend;
pub use ollama::OllamaBackend;

/// Stream of LLM response tokens (e.g. word or subword pieces).
pub type TokenStream = Pin<Box<dyn Stream<Item = Result<String>> + Send>>;

/// LLM backend: generates a stream of text from a prompt.
#[async_trait]
pub trait LlmBackend: Send + Sync {
    /// Backend name for capability checks (e.g. "ollama", "candle", "none").
    fn name(&self) -> &'static str;

    /// Generate a streaming response for the given prompt.
    /// Prompt should include system context and user transcript.
    async fn generate_stream(
        &self,
        prompt: String,
        max_tokens: Option<u32>,
    ) -> Result<TokenStream>;
}

/// No-op backend when LLM is disabled (returns error).
pub struct NoLlm;

#[async_trait]
impl LlmBackend for NoLlm {
    fn name(&self) -> &'static str {
        "none"
    }

    async fn generate_stream(
        &self,
        _prompt: String,
        _max_tokens: Option<u32>,
    ) -> Result<TokenStream> {
        anyhow::bail!("LLM not configured. Set --ollama-url or OLLAMA_URL for Ollama, or use a Candle model (coming soon).");
    }
}

/// Build the default system prompt for voice assistant replies.
pub fn default_system_prompt(persona: &str) -> String {
    format!(
        "You are {persona}, a warm and supportive voice assistant. \
         Reply in 1-3 short sentences. Be concise and natural for spoken delivery. \
         Do not use markdown, bullet points, or special formatting."
    )
}

/// Build the full prompt from context (optional) and user transcript.
pub fn build_prompt(system: &str, context: Option<&str>, transcript: &str) -> String {
    let mut s = String::from(system);
    s.push_str("\n\n");
    if let Some(c) = context {
        if !c.is_empty() {
            s.push_str("Context: ");
            s.push_str(c);
            s.push_str("\n\n");
        }
    }
    s.push_str("User said: ");
    s.push_str(transcript);
    s.push_str("\n\nReply:");
    s
}
