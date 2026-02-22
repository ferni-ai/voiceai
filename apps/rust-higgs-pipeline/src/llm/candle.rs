//! Candle-based local LLM backend for generate_reply.
//!
//! When a model path is configured, this backend is preferred over Ollama.
//! Loads a Llama-format model (safetensors + tokenizer.json) from the given path
//! and streams decoded text tokens.

use std::path::Path;
use std::pin::Pin;
use std::task::Poll;

use anyhow::{Context, Result};
use async_trait::async_trait;
use candle_core::Device;
use candle_nn::VarBuilder;
use candle_transformers::generation::{LogitsProcessor, Sampling};
use candle_transformers::models::llama::{Cache, Llama, LlamaConfig, LlamaEosToks};
use candle_transformers::utils;
use futures_util::Stream;
use tokio::sync::mpsc;
use tokenizers::Tokenizer;

use super::{LlmBackend, TokenStream};

/// Default max tokens when not specified.
const DEFAULT_MAX_TOKENS: u32 = 256;

/// Temperature for sampling (deterministic when 0).
const DEFAULT_TEMPERATURE: f64 = 0.7;

/// Local LLM backend using Candle (Llama-format models).
#[derive(Clone)]
pub struct CandleBackend {
    /// Path to model directory (config.json, tokenizer.json, model.safetensors or shards).
    model_path: String,
    /// Device for inference (Metal GPU, CUDA, or CPU).
    device: Device,
}

impl CandleBackend {
    /// Create a Candle backend for the given model path and device.
    /// Uses the pipeline's device (e.g. Metal on macOS) when provided for faster inference.
    pub fn new(model_path: String, device: Device) -> Self {
        Self { model_path, device }
    }
}

#[async_trait]
impl LlmBackend for CandleBackend {
    fn name(&self) -> &'static str {
        "candle"
    }

    async fn generate_stream(
        &self,
        prompt: String,
        max_tokens: Option<u32>,
    ) -> Result<TokenStream> {
        let model_path = self.model_path.clone();
        let device = self.device.clone();
        let limit = max_tokens.unwrap_or(DEFAULT_MAX_TOKENS) as usize;

        let (tx, rx) = mpsc::channel::<Result<String>>(32);

        tokio::task::spawn_blocking(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                run_generation(&model_path, &prompt, limit, &device, &tx);
            }));
            if let Err(panic_err) = result {
                let msg = panic_err
                    .downcast_ref::<&str>()
                    .copied()
                    .unwrap_or("Candle generation panicked");
                let _ = tx.blocking_send(Err(anyhow::anyhow!("{}", msg)));
            }
        });

        struct CandleStream {
            rx: mpsc::Receiver<Result<String>>,
        }
        impl Stream for CandleStream {
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

        Ok(Box::pin(CandleStream { rx }))
    }
}

fn run_generation(
    model_path: &str,
    prompt: &str,
    sample_len: usize,
    device: &Device,
    tx: &mpsc::Sender<Result<String>>,
) {
    let result = run_generation_inner(model_path, prompt, sample_len, device, tx);
    if let Err(e) = result {
        let _ = tx.blocking_send(Err(e));
    }
}

fn run_generation_inner(
    model_path: &str,
    prompt: &str,
    sample_len: usize,
    device: &Device,
    tx: &mpsc::Sender<Result<String>>,
) -> Result<()> {
    let path = Path::new(model_path);

    let config_path = path.join("config.json");
    let config_json =
        std::fs::read(&config_path).with_context(|| format!("Read config: {}", config_path.display()))?;
    let llama_config: LlamaConfig =
        serde_json::from_slice(&config_json).context("Parse LlamaConfig")?;
    let config = llama_config.clone().into_config(false);

    let dtype = candle_core::DType::F16;
    let safetensor_paths = find_safetensors(path)?;
    let vb = unsafe {
        VarBuilder::from_mmaped_safetensors(&safetensor_paths, dtype, &device)
            .context("Load safetensors")?
    };
    let llama = Llama::load(vb, &config).context("Load Llama model")?;

    let tokenizer_path = path.join("tokenizer.json");
    let tokenizer =
        Tokenizer::from_file(&tokenizer_path).map_err(|e| anyhow::anyhow!("Tokenizer: {}", e))?;

    let mut tokens = tokenizer
        .encode(prompt, true)
        .map_err(|e| anyhow::anyhow!("Encode: {}", e))?
        .get_ids()
        .to_vec();

    let eos_token_id = config.eos_token_id.clone();
    let mut cache = Cache::new(true, dtype, &config, &device)?;
    let mut logits_processor = LogitsProcessor::from_sampling(
        299792458,
        Sampling::All {
            temperature: DEFAULT_TEMPERATURE,
        },
    );

    if tokens.is_empty() {
        let _ = tx.blocking_send(Ok(String::new()));
        return Ok(());
    }

    let mut index_pos = 0usize;
    for _ in 0..sample_len {
        let (context_size, context_index) = if cache.use_kv_cache && !tokens.is_empty() {
            (1, index_pos)
        } else {
            (tokens.len(), 0)
        };
        let ctxt = &tokens[tokens.len().saturating_sub(context_size)..];
        if ctxt.is_empty() {
            break;
        }
        let input = candle_core::Tensor::new(ctxt, &device)?.unsqueeze(0)?;
        let logits = llama.forward(&input, context_index, &mut cache)?;
        let logits = logits.squeeze(0)?;
        let logits = utils::apply_repeat_penalty(
            &logits,
            1.1,
            &tokens[tokens.len().saturating_sub(128)..],
        )?;
        index_pos += ctxt.len();

        let next_token = logits_processor.sample(&logits)?;
        tokens.push(next_token);

        let stop = match &eos_token_id {
            Some(LlamaEosToks::Single(id)) if next_token == *id => true,
            Some(LlamaEosToks::Multiple(ids)) if ids.contains(&next_token) => true,
            _ => false,
        };
        if stop {
            break;
        }

        if let Ok(decoded) = tokenizer.decode(&[next_token], false) {
            if !decoded.is_empty() && tx.blocking_send(Ok(decoded)).is_err() {
                break;
            }
        }
    }

    let _ = tx.blocking_send(Ok(String::new()));
    Ok(())
}

fn find_safetensors(dir: &Path) -> Result<Vec<std::path::PathBuf>> {
    let index_path = dir.join("model.safetensors.index.json");
    if index_path.exists() {
        let index: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&index_path)?).context("Parse index")?;
        let weight_map = index
            .get("weight_map")
            .and_then(|m| m.as_object())
            .context("weight_map")?;
        let mut paths: Vec<_> = weight_map
            .values()
            .filter_map(|v| v.as_str())
            .map(|s| dir.join(s))
            .collect();
        paths.sort();
        paths.dedup();
        return Ok(paths);
    }
    let single = dir.join("model.safetensors");
    if single.exists() {
        return Ok(vec![single]);
    }
    anyhow::bail!(
        "No model.safetensors or model.safetensors.index.json in {}",
        dir.display()
    );
}
