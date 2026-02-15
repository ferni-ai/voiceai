//! STT WebSocket handler: /api/asr-streaming.
//!
//! Client sends binary PCM 16 kHz mono Int16; server sends JSON { text, is_final }.
//! Uses moshi::asr::State for real Candle inference with latency instrumentation.
//!
//! Better-than-human targets:
//!   - First interim: < 150 ms
//!   - Final transcript: < 300 ms from end of utterance
//!
//! Protocol:
//!   - Client → Server: Binary (PCM Int16 16kHz mono)
//!   - Client → Server: Text `{"action":"flush"}` — end of audio, trigger final
//!   - Server → Client: Text JSON `{ text, is_final, ... }`

use axum::extract::ws::{Message, WebSocket};
use candle_core::Tensor;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;
use tracing::{debug, info, warn};

use crate::audio::{i16_bytes_to_f32, resample_16k_to_24k};
use crate::config::{ASR_DELAY_IN_TOKENS, ASR_FLUSH_FRAMES, ASR_TEMPERATURE, STT_BYTES_PER_BLOCK};
use crate::models::SttModels;
use crate::protocol::SttResponse;

/// Latency timestamps for "better than human" metrics.
struct SttLatency {
    first_pcm_at: Option<Instant>,
    first_interim_at: Option<Instant>,
    last_pcm_at: Option<Instant>,
    final_at: Option<Instant>,
}

impl SttLatency {
    fn new() -> Self {
        Self {
            first_pcm_at: None,
            first_interim_at: None,
            last_pcm_at: None,
            final_at: None,
        }
    }

    fn log_first_interim(&self) {
        if let (Some(start), Some(interim)) = (self.first_pcm_at, self.first_interim_at) {
            let ms = interim.duration_since(start).as_millis();
            info!(ms, target = "<150", "stt_first_interim_ms");
        }
    }

    fn log_final(&self) {
        if let (Some(last), Some(fin)) = (self.last_pcm_at, self.final_at) {
            let ms = fin.duration_since(last).as_millis();
            info!(ms, target = "<300", "stt_final_from_last_pcm_ms");
        }
        if let (Some(first), Some(fin)) = (self.first_pcm_at, self.final_at) {
            let total_ms = fin.duration_since(first).as_millis();
            info!(total_ms, "stt_total_session_ms");
        }
    }
}

/// Extract word tokens from ASR messages.
/// Returns token IDs (not decoded text) — caller decodes in batch for proper spacing.
fn extract_word_tokens(msgs: &[moshi::asr::AsrMsg]) -> Vec<u32> {
    let mut tokens = Vec::new();
    for msg in msgs {
        if let moshi::asr::AsrMsg::Word { tokens: word_toks, .. } = msg {
            tokens.extend(word_toks.iter().copied().filter(|&t| t != 0 && t != 3));
        }
    }
    tokens
}

/// Handle one STT WebSocket connection with real Candle ASR inference.
pub async fn handle_stt_socket_candle(mut socket: WebSocket, models: Arc<Mutex<SttModels>>) {
    info!("STT WebSocket connection accepted");
    let mut latency = SttLatency::new();
    const MAX_BUFFER_BYTES: usize = 10 * 1024 * 1024; // 10 MB safety limit
    const IDLE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);

    let mut buffer: Vec<u8> = Vec::with_capacity(STT_BYTES_PER_BLOCK * 4);
    let mut all_token_ids: Vec<u32> = Vec::new(); // Accumulate ALL token IDs for final decode
    let mut total_bytes: usize = 0;
    let mut chunk_count: usize = 0;
    let mut got_flush = false;

    // Clone models once at connection start (audit fix #1)
    info!("STT: acquiring model lock...");
    let (lm, mimi, tokenizer_arc) = {
        let models = models.lock().await;
        info!("STT: cloning models...");
        (models.lm.clone(), models.mimi.clone(), Arc::clone(&models.tokenizer))
    };
    info!("STT: models cloned");

    // Create ASR state (one per connection)
    info!("STT: creating ASR state...");
    let t0 = Instant::now();
    let asr_state = match moshi::asr::State::new(1, ASR_DELAY_IN_TOKENS, ASR_TEMPERATURE, mimi, lm)
    {
        Ok(state) => {
            info!(ms = t0.elapsed().as_millis(), "STT: ASR state created");
            state
        }
        Err(e) => {
            warn!(error = %e, "Failed to create ASR state");
            let _ = socket
                .send(Message::Text(
                    serde_json::to_string(&SttResponse::error(format!("ASR init failed: {e}")))
                        .unwrap_or_default(),
                ))
                .await;
            return;
        }
    };

    let asr_state = Arc::new(Mutex::new(asr_state));

    while let Ok(Some(msg)) = tokio::time::timeout(IDLE_TIMEOUT, socket.recv()).await {
        let Ok(msg) = msg else { break };
        match msg {
            Message::Binary(data) => {
                if latency.first_pcm_at.is_none() {
                    latency.first_pcm_at = Some(Instant::now());
                }
                latency.last_pcm_at = Some(Instant::now());
                total_bytes += data.len();

                // Buffer overflow protection (audit fix #2)
                if buffer.len() + data.len() > MAX_BUFFER_BYTES {
                    warn!(total = buffer.len() + data.len(), limit = MAX_BUFFER_BYTES, "STT buffer overflow, dropping connection");
                    break;
                }
                buffer.extend_from_slice(&data);

                // Process complete blocks
                while buffer.len() >= STT_BYTES_PER_BLOCK {
                    let chunk_bytes: Vec<u8> = buffer.drain(..STT_BYTES_PER_BLOCK).collect();
                    chunk_count += 1;

                    // Convert Int16 → float32 → resample 16k → 24k
                    let pcm_f32 = i16_bytes_to_f32(&chunk_bytes);
                    let audio_24k = resample_16k_to_24k(&pcm_f32);

                    // Run ASR inference
                    let new_tokens = {
                        let mut state = asr_state.lock().await;
                        let device = state.device().clone();
                        let audio_array = match Tensor::from_vec(
                            audio_24k.clone(),
                            (1, 1, audio_24k.len()),
                            &device,
                        ) {
                            Ok(t) => t,
                            Err(e) => {
                                warn!(error = %e, "Failed to create audio tensor");
                                continue;
                            }
                        };

                        let step_start = Instant::now();
                        let step_result = state.step_pcm(audio_array, None, &().into(), |_, _, _| {});
                        let step_ms = step_start.elapsed().as_millis();
                        if chunk_count <= 5 || step_ms > 500 {
                            info!(step_ms, chunk = chunk_count, "STT step_pcm");
                        }
                        match step_result {
                            Ok(msgs) => extract_word_tokens(&msgs),
                            Err(e) => {
                                warn!(error = %e, "ASR step_pcm error");
                                let _ = socket
                                    .send(Message::Text(
                                        serde_json::to_string(&SttResponse::error(e.to_string()))
                                            .unwrap_or_default(),
                                    ))
                                    .await;
                                vec![]
                            }
                        }
                    };

                    if !new_tokens.is_empty() {
                        all_token_ids.extend(&new_tokens);

                        // Decode accumulated tokens for interim (batch decode preserves SP spaces)
                        let interim_text = tokenizer_arc
                            .decode_piece_ids(&all_token_ids)
                            .unwrap_or_default();

                        if !interim_text.trim().is_empty() {
                            if latency.first_interim_at.is_none() {
                                latency.first_interim_at = Some(Instant::now());
                                latency.log_first_interim();
                            }

                            let resp = SttResponse::interim(interim_text.trim());
                            debug!(tokens = all_token_ids.len(), "STT interim");
                            if socket
                                .send(Message::Text(
                                    serde_json::to_string(&resp).unwrap_or_default(),
                                ))
                                .await
                                .is_err()
                            {
                                break;
                            }
                        }
                    }
                }
            }
            Message::Text(text) => {
                // Check for flush/done signal from client
                if text.contains("flush") || text.contains("done") {
                    info!("STT: received flush signal from client");
                    got_flush = true;
                    break;
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    // Process any remaining buffer bytes
    if !buffer.is_empty() && buffer.len() >= 2 {
        let pcm_f32 = i16_bytes_to_f32(&buffer);
        if !pcm_f32.is_empty() {
            let audio_24k = resample_16k_to_24k(&pcm_f32);
            let mut state = asr_state.lock().await;
            let device = state.device().clone();
            if let Ok(audio_tensor) =
                Tensor::from_vec(audio_24k.clone(), (1, 1, audio_24k.len()), &device)
            {
                if let Ok(msgs) = state.step_pcm(audio_tensor, None, &().into(), |_, _, _| {}) {
                    all_token_ids.extend(extract_word_tokens(&msgs));
                }
            }
        }
    }

    // Flush the ASR delay pipeline by feeding silence frames.
    // The ASR state delays output by asr_delay_in_tokens steps — feeding silence
    // causes the model to emit remaining buffered tokens.
    {
        let mut state = asr_state.lock().await;
        let device = state.device().clone();
        // Each Mimi frame = 1920 samples at 24kHz (80ms)
        let silence_frame_len = 1920;
        let silence_24k = vec![0.0f32; silence_frame_len];
        info!(frames = ASR_FLUSH_FRAMES, "STT: flushing with silence frames");
        for i in 0..ASR_FLUSH_FRAMES {
            if let Ok(silence_tensor) =
                Tensor::from_vec(silence_24k.clone(), (1, 1, silence_frame_len), &device)
            {
                match state.step_pcm(silence_tensor, None, &().into(), |_, _, _| {}) {
                    Ok(msgs) => {
                        let flushed = extract_word_tokens(&msgs);
                        if !flushed.is_empty() {
                            debug!(frame = i, tokens = flushed.len(), "STT flush yielded tokens");
                            all_token_ids.extend(flushed);
                        }
                    }
                    Err(e) => {
                        debug!(error = %e, frame = i, "STT flush step error (expected for final frames)");
                        break;
                    }
                }
            }
        }
    }

    // Decode ALL accumulated tokens in one batch for proper SentencePiece spacing
    let final_text = tokenizer_arc
        .decode_piece_ids(&all_token_ids)
        .unwrap_or_default();
    let final_text = final_text.trim().to_string();

    latency.final_at = Some(Instant::now());
    latency.log_final();

    info!(
        tokens = all_token_ids.len(),
        text_len = final_text.len(),
        flush = got_flush,
        "STT final transcript"
    );

    let resp = SttResponse::final_transcript(&final_text);
    let _ = socket
        .send(Message::Text(
            serde_json::to_string(&resp).unwrap_or_default(),
        ))
        .await;

    debug!(
        bytes = total_bytes,
        chunks = chunk_count,
        tokens = all_token_ids.len(),
        "STT session complete"
    );
}

/// Handle one STT WebSocket connection in mock mode (no models).
pub async fn handle_stt_socket_mock(mut socket: WebSocket) {
    let mut latency = SttLatency::new();
    let mut got_audio = false;
    let mut total_bytes: usize = 0;

    while let Some(msg) = socket.recv().await {
        let Ok(msg) = msg else { break };
        match msg {
            Message::Binary(ref data) => {
                if latency.first_pcm_at.is_none() {
                    latency.first_pcm_at = Some(Instant::now());
                }
                total_bytes += data.len();

                if !got_audio {
                    latency.first_interim_at = Some(Instant::now());
                    let resp = SttResponse::interim("mock");
                    if socket
                        .send(Message::Text(
                            serde_json::to_string(&resp).unwrap_or_default(),
                        ))
                        .await
                        .is_err()
                    {
                        break;
                    }
                    latency.log_first_interim();
                    got_audio = true;
                }

                if total_bytes >= STT_BYTES_PER_BLOCK && latency.final_at.is_none() {
                    latency.final_at = Some(Instant::now());
                    latency.last_pcm_at = Some(Instant::now());
                    let resp = SttResponse::final_transcript("mock transcript");
                    if socket
                        .send(Message::Text(
                            serde_json::to_string(&resp).unwrap_or_default(),
                        ))
                        .await
                        .is_err()
                    {
                        break;
                    }
                    latency.log_final();
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
}
