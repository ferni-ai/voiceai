//! TTS WebSocket handler: /api/tts_streaming.
//!
//! Client sends JSON { text, voice_id }; server sends binary PCM 24 kHz Int16 chunks,
//! then { done: true }, then close.
//! Uses moshi::tts_streaming::State for real Candle inference.
//!
//! Better-than-human target: TTFB < 250 ms.

use axum::extract::ws::{Message, WebSocket};
use candle_core::Tensor;
use candle_transformers::generation::LogitsProcessor;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;
use tracing::{debug, info, warn};

use crate::audio::f32_to_i16_bytes;
use crate::config::{TTS_MAX_STEPS, TTS_TEMPERATURE};
use crate::models::TtsModels;
use crate::protocol::{TtsDoneResponse, TtsRequest};

/// Latency: request received → first PCM chunk (target < 250 ms TTFB).
struct TtsLatency {
    request_at: Option<Instant>,
    first_chunk_at: Option<Instant>,
    done_at: Option<Instant>,
}

impl TtsLatency {
    fn new() -> Self {
        Self {
            request_at: None,
            first_chunk_at: None,
            done_at: None,
        }
    }

    fn log_ttfb(&self) {
        if let (Some(req), Some(first)) = (self.request_at, self.first_chunk_at) {
            let ms = first.duration_since(req).as_millis();
            info!(ms, target = "<250", "tts_ttfb_ms");
        }
    }

    fn log_total(&self) {
        if let (Some(req), Some(done)) = (self.request_at, self.done_at) {
            let ms = done.duration_since(req).as_millis();
            info!(ms, "tts_total_ms");
        }
    }
}

/// Handle one TTS WebSocket connection with real Candle TTS inference.
pub async fn handle_tts_socket_candle(mut socket: WebSocket, models: Arc<Mutex<TtsModels>>) {
    let mut latency = TtsLatency::new();
    const IDLE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);
    const MAX_TEXT_LEN: usize = 10_000; // Safety limit (audit fix #9)

    // Clone models once at connection start (audit fix #1 — no mutex held during inference)
    let models_snapshot = {
        let guard = models.lock().await;
        TtsModels {
            lm: guard.lm.clone(),
            mimi: guard.mimi.clone(),
            tokenizer: Arc::clone(&guard.tokenizer),
            device: guard.device.clone(),
        }
    };

    while let Ok(Some(msg)) = tokio::time::timeout(IDLE_TIMEOUT, socket.recv()).await {
        let Ok(msg) = msg else { break };
        match msg {
            Message::Text(s) => {
                let req: TtsRequest = match serde_json::from_str(&s) {
                    Ok(r) => r,
                    Err(e) => {
                        warn!(error = %e, "Invalid TTS request JSON");
                        continue;
                    }
                };

                let text = req.text.unwrap_or_default();
                if text.is_empty() {
                    let _ = socket
                        .send(Message::Text(
                            serde_json::to_string(&TtsDoneResponse::success()).unwrap_or_default(),
                        ))
                        .await;
                    break;
                }

                // Text length limit (audit fix #9)
                if text.len() > MAX_TEXT_LEN {
                    warn!(len = text.len(), limit = MAX_TEXT_LEN, "TTS text too long");
                    let _ = socket
                        .send(Message::Text(
                            serde_json::to_string(&TtsDoneResponse::with_error("Text too long"))
                                .unwrap_or_default(),
                        ))
                        .await;
                    break;
                }

                latency.request_at = Some(Instant::now());
                // voice_id (e.g. "ferni") reserved for speaker conditioning: load precomputed
                // embedding and pass as Condition to State::step (see docs/plans/KYUTAI-VOICE-CLONE-FERNI.md).
                let _voice_id = req.voice_id.unwrap_or_default();

                // Generate TTS audio (no global mutex held — audit fix #1)
                let result = generate_tts_audio(
                    &text,
                    &models_snapshot,
                    &mut socket,
                    &mut latency,
                )
                .await;

                match result {
                    Ok(chunks_sent) => {
                        latency.done_at = Some(Instant::now());
                        latency.log_total();
                        debug!(chunks = chunks_sent, text_len = text.len(), "TTS generation complete");
                    }
                    Err(e) => {
                        warn!(error = %e, "TTS generation failed");
                        let _ = socket
                            .send(Message::Text(
                                serde_json::to_string(&TtsDoneResponse::with_error(e.to_string()))
                                    .unwrap_or_default(),
                            ))
                            .await;
                        break;
                    }
                }

                // Send done
                let _ = socket
                    .send(Message::Text(
                        serde_json::to_string(&TtsDoneResponse::success()).unwrap_or_default(),
                    ))
                    .await;
                break;
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
}

/// TTS streaming config for 7B / 32k vocab (v0_1-compat).
/// v202501() targets 8001 vocab; 7B model has 32001 — use this when v202501 fails on shape mismatch.
fn tts_streaming_config_v0_1_compat() -> moshi::tts_streaming::Config {
    moshi::tts_streaming::Config {
        acoustic_delay: 2,
        text_pad_token: 3,
        text_bos_token: 1,
        text_eos_token: 2,
        text_eop_token: 0,
        text_start_token: 8000,
        text_audio_delay_in_tokens: 25,
        max_consecutive_pads: 10,
        extra_steps: 5,
        speaker_cond_duration_s: 10.,
        speaker_cond_dim: 2048,
        speaker_cond_n_speakers: 5,
    }
}

/// Run TTS generation and stream PCM chunks to the WebSocket.
/// Audio is buffered during config probing to prevent mixed-config garbage on fallback.
async fn generate_tts_audio(
    text: &str,
    models: &TtsModels,
    socket: &mut WebSocket,
    latency: &mut TtsLatency,
) -> Result<usize, anyhow::Error> {
    if text.trim().is_empty() {
        return Ok(0);
    }

    // Try v202501() first, buffering audio. Only flush to socket on success.
    let mut audio_buffer: Vec<Vec<u8>> = Vec::new();
    match try_generate_tts_buffered(
        text,
        models,
        &mut audio_buffer,
        latency,
        moshi::tts_streaming::Config::v202501(),
    ) {
        Ok(n) => {
            // Success: flush buffered audio to socket
            for chunk in &audio_buffer {
                if socket.send(Message::Binary(chunk.clone())).await.is_err() {
                    return Ok(n);
                }
            }
            return Ok(n);
        }
        Err(e) => {
            let err_str = e.to_string();
            // Only fall back on vocab/shape mismatch errors (specific to model config):
            // "32001" or "8001" = vocab size numbers from moshi error messages
            let is_vocab_mismatch = err_str.contains("32001") || err_str.contains("8001");
            // "size mismatch" = candle's VarBuilder shape error prefix
            let is_shape_mismatch = err_str.contains("size mismatch")
                || err_str.contains("doesn't match")
                || (err_str.contains("expected") && err_str.contains("got"));
            if is_vocab_mismatch || is_shape_mismatch {
                info!("TTS: v202501 config failed on model mismatch, retrying with v0_1-compat (7B / 32k vocab)");
                audio_buffer.clear();
            } else {
                return Err(e);
            }
        }
    };

    // Retry with v0_1-compat config, streaming directly to socket (no second fallback)
    try_generate_tts_with_config(
        text, models, socket, latency,
        tts_streaming_config_v0_1_compat(),
    ).await
}

/// Buffered TTS generation: collects audio in memory instead of streaming to socket.
/// Used for the first config attempt so we can discard on failure without sending mixed audio.
fn try_generate_tts_buffered(
    text: &str,
    models: &TtsModels,
    audio_buffer: &mut Vec<Vec<u8>>,
    latency: &mut TtsLatency,
    tts_config: moshi::tts_streaming::Config,
) -> Result<usize, anyhow::Error> {
    let lm = models.lm.clone();
    let device = models.device.clone();
    let mut mimi = models.mimi.clone();
    mimi.reset_state();

    let audio_lp = LogitsProcessor::new(299792458, Some(TTS_TEMPERATURE), None);
    let text_lp = LogitsProcessor::new(299792459, Some(0.0), None);
    let max_steps = TTS_MAX_STEPS;

    let mut tts_state = moshi::tts_streaming::State::new(
        lm, None, max_steps, audio_lp, text_lp, None, tts_config.clone(),
    );

    let prompt = moshi::tts_streaming::tokenize_prompt(
        &[text.to_string()],
        tts_config.text_bos_token,
        tts_config.text_eos_token,
        |word| -> Result<Vec<u32>, anyhow::Error> {
            let pieces = models.tokenizer.encode(word)
                .map_err(|e| anyhow::anyhow!("encode: {e}"))?;
            Ok(pieces.into_iter().map(|p| p.id).collect())
        },
    )?;

    let mut prompt_tokens: Vec<u32> = Vec::new();
    for (tokens, _speaker) in &prompt {
        prompt_tokens.extend(tokens);
    }

    let mut chunks = 0;
    let mut step = 0;

    for &token in &prompt_tokens {
        let allowed = moshi::tts_streaming::AllowedTokens::Text(token);
        tts_state.step(token, allowed, None)?;
        step += 1;
        if let Some(audio_tokens) = tts_state.last_audio_tokens() {
            let pcm = decode_audio_tokens(&audio_tokens, &mut mimi, &device)?;
            if !pcm.is_empty() {
                if latency.first_chunk_at.is_none() {
                    latency.first_chunk_at = Some(Instant::now());
                    latency.log_ttfb();
                }
                audio_buffer.push(f32_to_i16_bytes(&pcm));
                chunks += 1;
            }
        }
    }

    let mut prev_token = *prompt_tokens.last().unwrap_or(&tts_config.text_bos_token);
    while step < max_steps {
        let allowed = moshi::tts_streaming::AllowedTokens::PadOrEpad;
        let text_token = tts_state.step(prev_token, allowed, None)?;
        if text_token == tts_config.text_eos_token { break; }
        prev_token = text_token;
        step += 1;
        if let Some(audio_tokens) = tts_state.last_audio_tokens() {
            let pcm = decode_audio_tokens(&audio_tokens, &mut mimi, &device)?;
            if !pcm.is_empty() {
                if latency.first_chunk_at.is_none() {
                    latency.first_chunk_at = Some(Instant::now());
                    latency.log_ttfb();
                }
                audio_buffer.push(f32_to_i16_bytes(&pcm));
                chunks += 1;
            }
        }
    }

    Ok(chunks)
}

/// Inner TTS generation with a given tts_streaming::Config.
async fn try_generate_tts_with_config(
    text: &str,
    models: &TtsModels,
    socket: &mut WebSocket,
    latency: &mut TtsLatency,
    tts_config: moshi::tts_streaming::Config,
) -> Result<usize, anyhow::Error> {
    let lm = models.lm.clone();
    let device = models.device.clone();
    let mut mimi = models.mimi.clone();
    mimi.reset_state();

    let audio_lp = LogitsProcessor::new(299792458, Some(TTS_TEMPERATURE), None);
    let text_lp = LogitsProcessor::new(299792459, Some(0.0), None);

    let max_steps = TTS_MAX_STEPS;

    let mut tts_state = moshi::tts_streaming::State::new(
        lm,
        None, // no cross-attention source
        max_steps,
        audio_lp,
        text_lp,
        None, // no CFG alpha
        tts_config.clone(),
    );

    // Build prompt: tokenized text with BOS/EOS markers
    let prompt = moshi::tts_streaming::tokenize_prompt(
        &[text.to_string()],
        tts_config.text_bos_token,
        tts_config.text_eos_token,
        |word| -> Result<Vec<u32>, anyhow::Error> {
            let pieces = models
                .tokenizer
                .encode(word)
                .map_err(|e| anyhow::anyhow!("encode: {e}"))?;
            Ok(pieces.into_iter().map(|p| p.id).collect())
        },
    )?;

    // Flatten prompt tokens
    let mut prompt_tokens: Vec<u32> = Vec::new();
    for (tokens, _speaker) in &prompt {
        prompt_tokens.extend(tokens);
    }

    let mut chunks_sent = 0;
    let mut step = 0;

    // Feed prompt tokens, then generate
    for &token in &prompt_tokens {
        let allowed = moshi::tts_streaming::AllowedTokens::Text(token);
        tts_state.step(token, allowed, None)?;
        step += 1;

        // Check for audio tokens to decode
        if let Some(audio_tokens) = tts_state.last_audio_tokens() {
            let pcm = decode_audio_tokens(&audio_tokens, &mut mimi, &device)?;
            if !pcm.is_empty() {
                if latency.first_chunk_at.is_none() {
                    latency.first_chunk_at = Some(Instant::now());
                    latency.log_ttfb();
                }
                let bytes = f32_to_i16_bytes(&pcm);
                if socket.send(Message::Binary(bytes)).await.is_err() {
                    return Ok(chunks_sent);
                }
                chunks_sent += 1;
            }
        }
    }

    // Continue generating until EOS or max steps
    let mut prev_token = *prompt_tokens.last().unwrap_or(&tts_config.text_bos_token);
    while step < max_steps {
        let allowed = moshi::tts_streaming::AllowedTokens::PadOrEpad;
        let text_token = tts_state.step(prev_token, allowed, None)?;

        // Check for EOS
        if text_token == tts_config.text_eos_token {
            break;
        }
        prev_token = text_token;
        step += 1;

        // Decode and stream audio
        if let Some(audio_tokens) = tts_state.last_audio_tokens() {
            let pcm = decode_audio_tokens(&audio_tokens, &mut mimi, &device)?;
            if !pcm.is_empty() {
                if latency.first_chunk_at.is_none() {
                    latency.first_chunk_at = Some(Instant::now());
                    latency.log_ttfb();
                }
                let bytes = f32_to_i16_bytes(&pcm);
                if socket.send(Message::Binary(bytes)).await.is_err() {
                    return Ok(chunks_sent);
                }
                chunks_sent += 1;
            }
        }
    }

    // If no chunks sent, send silence so client gets something
    if chunks_sent == 0 {
        warn!("TTS generated no audio; sending silence");
        let silence = vec![0u8; 4800]; // 2400 samples * 2 bytes
        let _ = socket.send(Message::Binary(silence)).await;
        chunks_sent = 1;
    }

    Ok(chunks_sent)
}

/// Decode audio token IDs through Mimi to get PCM float32.
fn decode_audio_tokens(
    audio_tokens: &[u32],
    mimi: &mut moshi::mimi::Mimi,
    device: &candle_core::Device,
) -> Result<Vec<f32>, anyhow::Error> {
    let codebooks = audio_tokens.len();

    // Create tensor: (1, codebooks, 1)
    let tokens_vec: Vec<u32> = audio_tokens.to_vec();
    let tokens_tensor = Tensor::from_vec(tokens_vec, (1, codebooks, 1), device)?;

    // Convert Tensor to StreamTensor via .into()
    let stream_tensor: moshi::streaming::StreamTensor = tokens_tensor.into();
    let pcm = mimi.decode_step(&stream_tensor, &().into())?;
    if let Some(pcm_tensor) = pcm.as_option() {
        let pcm_f32 = pcm_tensor
            .squeeze(0)?
            .squeeze(0)?
            .to_vec1::<f32>()?;
        // Clamp to [-1, 1]
        let pcm_clamped: Vec<f32> = pcm_f32.iter().map(|&s| s.clamp(-1.0, 1.0)).collect();
        Ok(pcm_clamped)
    } else {
        Ok(vec![])
    }
}

/// Handle one TTS WebSocket connection in mock mode (no models).
pub async fn handle_tts_socket_mock(mut socket: WebSocket) {
    let mut latency = TtsLatency::new();

    while let Some(msg) = socket.recv().await {
        let Ok(msg) = msg else { break };
        match msg {
            Message::Text(s) => {
                let _req: Result<TtsRequest, _> = serde_json::from_str(&s);
                latency.request_at = Some(Instant::now());

                // Mock: send silence chunks
                for _ in 0..5 {
                    let silence = vec![0u8; 480]; // 240 samples * 2 bytes
                    if latency.first_chunk_at.is_none() {
                        latency.first_chunk_at = Some(Instant::now());
                        latency.log_ttfb();
                    }
                    if socket.send(Message::Binary(silence)).await.is_err() {
                        break;
                    }
                }

                latency.done_at = Some(Instant::now());
                latency.log_total();

                let _ = socket
                    .send(Message::Text(
                        serde_json::to_string(&TtsDoneResponse::success()).unwrap_or_default(),
                    ))
                    .await;
                break;
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
}
