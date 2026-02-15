//! Mock STT WebSocket handler.
//!
//! Accepts binary PCM frames (Int16, 16 kHz, mono) and returns JSON transcript
//! events that match the Kyutai/moshi-server protocol exactly.

use std::time::Instant;

use axum::extract::ws::{Message, WebSocket};
use tracing::{debug, info, warn};

use crate::protocol::{SttTranscript, SttVadStatus, STT_CHUNK_BYTES};

/// Handle one STT WebSocket connection (mock mode).
///
/// Protocol:
///   - Client sends binary messages containing raw PCM Int16 16 kHz mono.
///   - After receiving `STT_CHUNK_BYTES` bytes, emit an interim transcript.
///   - After receiving another batch, emit a final transcript + VAD off.
pub async fn handle_stt(mut ws: WebSocket) {
    let conn_start = Instant::now();
    let mut total_bytes: usize = 0;
    let mut frame_count: u64 = 0;
    let mut interim_sent = false;
    let mut final_sent = false;
    let mut first_audio_at: Option<Instant> = None;

    info!("STT connection opened");

    while let Some(msg) = ws.recv().await {
        let msg = match msg {
            Ok(m) => m,
            Err(e) => {
                warn!(error = %e, "STT recv error");
                break;
            }
        };

        match msg {
            Message::Binary(data) => {
                if first_audio_at.is_none() {
                    first_audio_at = Some(Instant::now());
                }
                total_bytes += data.len();
                frame_count += 1;

                // Emit interim after first chunk threshold
                if total_bytes >= STT_CHUNK_BYTES && !interim_sent {
                    interim_sent = true;
                    let latency_ms = first_audio_at
                        .map(|t| t.elapsed().as_millis())
                        .unwrap_or(0);
                    debug!(
                        bytes = total_bytes,
                        latency_ms, "Emitting interim transcript"
                    );

                    let interim = SttTranscript {
                        text: "mock".to_string(),
                        is_final: false,
                    };
                    if send_json(&mut ws, &interim).await.is_err() {
                        break;
                    }
                }

                // Emit final after same threshold (matches Python bridge behavior)
                if total_bytes >= STT_CHUNK_BYTES && !final_sent {
                    final_sent = true;
                    let latency_ms = first_audio_at
                        .map(|t| t.elapsed().as_millis())
                        .unwrap_or(0);
                    debug!(
                        bytes = total_bytes,
                        latency_ms, "Emitting final transcript"
                    );

                    let final_tx = SttTranscript {
                        text: "mock transcript".to_string(),
                        is_final: true,
                    };
                    if send_json(&mut ws, &final_tx).await.is_err() {
                        break;
                    }

                    let vad = SttVadStatus {
                        vad: false,
                        is_speaking: false,
                    };
                    if send_json(&mut ws, &vad).await.is_err() {
                        break;
                    }
                }
            }
            Message::Close(_) => {
                debug!("STT client sent close");
                break;
            }
            _ => {}
        }
    }

    let elapsed = conn_start.elapsed();
    info!(
        frames = frame_count,
        total_bytes,
        duration_ms = elapsed.as_millis() as u64,
        "STT connection closed"
    );
}

/// Send a JSON text message on the WebSocket.
async fn send_json<T: serde::Serialize>(ws: &mut WebSocket, value: &T) -> Result<(), ()> {
    let json = serde_json::to_string(value).map_err(|_| ())?;
    ws.send(Message::Text(json.into())).await.map_err(|e| {
        warn!(error = %e, "STT send error");
    })
}
