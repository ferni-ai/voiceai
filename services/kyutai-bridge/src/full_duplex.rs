//! Full-duplex STS WebSocket handler: /api/sts-full-duplex.
//!
//! Uses load_streaming_both_ways for bidirectional audio (user speaks and Moshi speaks
//! simultaneously). Target: ~160ms latency (Kyutai published).
//!
//! Protocol:
//!   - Client → Server: Binary PCM (Int16 16 kHz mono)
//!   - Server → Client: Binary PCM (Int16 24 kHz mono, agent audio)
//!   - Client → Server: Text `{"action":"stop"}` — graceful stop
//!   - Server → Client: Text `{"done":true}` — session complete
//!
//! The bidirectional inference loop processes user audio and generates agent audio
//! in lockstep at Mimi's frame rate (~12.5 fps / 80ms per frame). Each step:
//!   1. Encode user PCM frame → user audio codes (via Mimi encoder)
//!   2. LM forward with user codes → predict agent audio codes
//!   3. Decode agent codes → agent PCM (via Mimi decoder)
//!   4. Stream agent PCM back to client

use axum::extract::ws::{Message, WebSocket};
use candle_core::Tensor;
use candle_transformers::generation::LogitsProcessor;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;
use tracing::{debug, info, warn};

use crate::audio::{f32_to_i16_bytes, i16_bytes_to_f32, resample_16k_to_24k};
use crate::models::FullDuplexModels;

/// Bidirectional latency tracking.
struct StsLatency {
    session_start: Instant,
    first_user_pcm_at: Option<Instant>,
    first_agent_pcm_at: Option<Instant>,
    steps: usize,
}

impl StsLatency {
    fn new() -> Self {
        Self {
            session_start: Instant::now(),
            first_user_pcm_at: None,
            first_agent_pcm_at: None,
            steps: 0,
        }
    }

    fn log_first_response(&self) {
        if let (Some(user), Some(agent)) = (self.first_user_pcm_at, self.first_agent_pcm_at) {
            let ms = agent.duration_since(user).as_millis();
            info!(ms, target = "<160", "sts_first_response_ms");
        }
    }

    fn log_session_end(&self) {
        let duration = self.session_start.elapsed();
        info!(
            duration_ms = duration.as_millis(),
            steps = self.steps,
            "sts_session_complete"
        );
    }
}

/// Handle one full-duplex STS WebSocket connection with real bidirectional inference.
///
/// The inference loop runs at Mimi's codec frame rate. User audio is accumulated
/// into frame-sized buffers, then processed through encode → LM → decode in lockstep.
pub async fn handle_sts_full_duplex_socket(
    mut socket: WebSocket,
    models: Arc<Mutex<FullDuplexModels>>,
) {
    info!("Full-duplex STS connection opened (target ~160ms bidirectional)");
    let mut latency = StsLatency::new();

    // Send session info
    let _ = socket
        .send(Message::Text(
            r#"{"mode":"sts-full-duplex","target_latency_ms":160,"status":"active"}"#
                .to_string(),
        ))
        .await;

    // Clone models once at connection start (no mutex held during inference)
    let (lm, mimi, _tokenizer, device) = {
        let guard = models.lock().await;
        (
            guard.lm.clone(),
            guard.mimi.clone(),
            Arc::clone(&guard.tokenizer),
            guard.device.clone(),
        )
    };

    // Mimi codec config: frame_length = sample_rate / frame_rate
    // Typically 24000 / 12.5 = 1920 samples per frame at 24 kHz
    let mimi_config = mimi.config();
    let frame_length = (mimi_config.sample_rate / mimi_config.frame_rate).ceil() as usize;
    let in_codebooks = lm.in_audio_codebooks();

    info!(
        frame_length,
        in_codebooks,
        sample_rate = mimi_config.sample_rate,
        frame_rate = mimi_config.frame_rate,
        "STS: codec config"
    );

    // Mutable state for inference
    let mut mimi_encoder = mimi.clone();
    let mut mimi_decoder = mimi;
    let mut lm_state = lm;

    // Logits processor for sampling agent audio codes
    let mut audio_lp = LogitsProcessor::new(299792458, Some(0.6), None);

    // PCM buffer: accumulate user audio until we have a full Mimi frame
    // User sends 16 kHz Int16 PCM, we resample to 24 kHz for Mimi
    let mut pcm_buffer: Vec<f32> = Vec::with_capacity(frame_length * 2);
    let mut stop_requested = false;

    const IDLE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);
    const MAX_STEPS: usize = 2000; // ~160s of audio at 12.5 fps

    while !stop_requested && latency.steps < MAX_STEPS {
        let msg = match tokio::time::timeout(IDLE_TIMEOUT, socket.recv()).await {
            Ok(Some(Ok(msg))) => msg,
            Ok(Some(Err(e))) => {
                warn!(error = %e, "STS WebSocket error");
                break;
            }
            Ok(None) => break, // Connection closed
            Err(_) => {
                // Idle timeout — if we have buffered audio, process it; otherwise close
                if pcm_buffer.is_empty() {
                    debug!("STS idle timeout with empty buffer, closing");
                    break;
                }
                // Pad buffer to frame length and process
                pcm_buffer.resize(frame_length, 0.0);
                if let Err(e) = process_frame(
                    &pcm_buffer,
                    frame_length,
                    &mut mimi_encoder,
                    &mut mimi_decoder,
                    &mut lm_state,
                    &mut audio_lp,
                    in_codebooks,
                    &device,
                    &mut socket,
                    &mut latency,
                )
                .await
                {
                    warn!(error = %e, "STS frame processing error on timeout flush");
                }
                pcm_buffer.clear();
                continue;
            }
        };

        match msg {
            Message::Binary(data) => {
                if latency.first_user_pcm_at.is_none() {
                    latency.first_user_pcm_at = Some(Instant::now());
                }

                // Convert Int16 16 kHz → float32 → resample to 24 kHz
                let pcm_16k = i16_bytes_to_f32(&data);
                let pcm_24k = resample_16k_to_24k(&pcm_16k);
                pcm_buffer.extend_from_slice(&pcm_24k);

                // Process complete frames
                while pcm_buffer.len() >= frame_length {
                    let frame: Vec<f32> = pcm_buffer.drain(..frame_length).collect();

                    if let Err(e) = process_frame(
                        &frame,
                        frame_length,
                        &mut mimi_encoder,
                        &mut mimi_decoder,
                        &mut lm_state,
                        &mut audio_lp,
                        in_codebooks,
                        &device,
                        &mut socket,
                        &mut latency,
                    )
                    .await
                    {
                        warn!(error = %e, "STS frame processing error");
                        stop_requested = true;
                        break;
                    }
                }
            }
            Message::Text(text) => {
                if text.contains("stop") || text.contains("done") {
                    info!("STS: received stop signal");
                    stop_requested = true;
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    // Send done signal
    let _ = socket
        .send(Message::Text(
            r#"{"done":true}"#.to_string(),
        ))
        .await;

    latency.log_session_end();
    info!("Full-duplex STS connection closed");
}

/// Process one Mimi frame through the bidirectional inference pipeline.
///
/// encode user audio → LM forward → sample agent codes → decode agent audio
#[allow(clippy::too_many_arguments)]
async fn process_frame(
    pcm_frame: &[f32],
    _frame_length: usize,
    mimi_encoder: &mut moshi::mimi::Mimi,
    mimi_decoder: &mut moshi::mimi::Mimi,
    lm: &mut moshi::lm::LmModel,
    audio_lp: &mut LogitsProcessor,
    in_codebooks: usize,
    device: &candle_core::Device,
    socket: &mut WebSocket,
    latency: &mut StsLatency,
) -> Result<(), anyhow::Error> {
    // 1. Encode user PCM frame → audio codes via Mimi encoder
    let user_pcm_tensor = Tensor::from_vec(
        pcm_frame.to_vec(),
        (1, 1, pcm_frame.len()),
        device,
    )?;

    let user_stream: moshi::streaming::StreamTensor = user_pcm_tensor.into();
    let user_codes = mimi_encoder.encode_step(&user_stream, &().into())?;

    // Extract user audio code values for LM input
    let user_code_values: Vec<Option<Tensor>> = if let Some(codes_tensor) = user_codes.as_option() {
        // codes_tensor shape: (1, codebooks, 1) — extract per-codebook values
        let mut values = Vec::with_capacity(in_codebooks);
        for cb in 0..in_codebooks.min(codes_tensor.dim(1)?) {
            let code = codes_tensor.i((0, cb, 0))?;
            values.push(Some(code));
        }
        // Pad if fewer codebooks than expected
        while values.len() < in_codebooks {
            values.push(None);
        }
        values
    } else {
        // No codes produced yet (codec warmup) — pass None for all codebooks
        vec![None; in_codebooks]
    };

    // 2. LM forward: process user audio codes, get hidden states for agent generation
    let (_text_logits, hidden_states) = lm.forward(None, user_code_values, &().into())?;

    // 3. Sample agent audio codes from LM hidden states via depformer
    let agent_codes = lm.depformer_sample(&hidden_states, None, &[], audio_lp)?;

    // 4. Decode agent audio codes → PCM via Mimi decoder
    if !agent_codes.is_empty() {
        let codes_tensor = Tensor::from_vec(
            agent_codes.clone(),
            (1, agent_codes.len(), 1),
            device,
        )?;
        let agent_stream: moshi::streaming::StreamTensor = codes_tensor.into();
        let agent_pcm = mimi_decoder.decode_step(&agent_stream, &().into())?;

        if let Some(pcm_tensor) = agent_pcm.as_option() {
            let pcm_f32 = pcm_tensor
                .squeeze(0)?
                .squeeze(0)?
                .to_vec1::<f32>()?;

            if !pcm_f32.is_empty() {
                // Clamp and convert to Int16 bytes
                let pcm_clamped: Vec<f32> = pcm_f32.iter().map(|&s| s.clamp(-1.0, 1.0)).collect();
                let bytes = f32_to_i16_bytes(&pcm_clamped);

                // Track first response latency
                if latency.first_agent_pcm_at.is_none() {
                    latency.first_agent_pcm_at = Some(Instant::now());
                    latency.log_first_response();
                }

                // Stream agent audio back to client
                if socket.send(Message::Binary(bytes)).await.is_err() {
                    return Err(anyhow::anyhow!("Failed to send agent audio"));
                }
            }
        }
    }

    latency.steps += 1;
    if latency.steps % 100 == 0 {
        debug!(steps = latency.steps, "STS inference steps");
    }

    Ok(())
}

/// Mock handler for full-duplex STS (binary PCM protocol, not STT JSON protocol).
pub async fn handle_sts_full_duplex_mock(mut socket: WebSocket) {
    info!("Full-duplex STS mock connection opened");
    let _ = socket
        .send(Message::Text(
            r#"{"mode":"sts-full-duplex-mock","target_latency_ms":160}"#.to_string(),
        ))
        .await;

    while let Some(msg) = socket.recv().await {
        match msg {
            Ok(Message::Binary(data)) => {
                // Mock: echo silence of same length
                let silence = vec![0u8; data.len()];
                if socket.send(Message::Binary(silence)).await.is_err() {
                    break;
                }
            }
            Ok(Message::Close(_)) => break,
            _ => {}
        }
    }
    info!("Full-duplex STS mock connection closed");
}
