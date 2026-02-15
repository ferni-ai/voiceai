//! Mock TTS WebSocket handler.
//!
//! Accepts JSON `{ "text": String, "voice_id": String }` requests and returns
//! binary PCM chunks (Int16, 24 kHz, mono) followed by `{ "done": true }`.

use std::time::Instant;

use axum::extract::ws::{Message, WebSocket};
use tracing::{debug, info, warn};

use crate::protocol::{TtsDone, TtsRequest, BYTES_PER_SAMPLE, TTS_CHUNK_SAMPLES, TTS_MOCK_CHUNKS};

/// Handle one TTS WebSocket connection (mock mode).
///
/// Protocol:
///   - Client sends a JSON text message with `{ "text", "voice_id" }`.
///   - Server responds with binary PCM Int16 24 kHz mono chunks.
///   - Server sends `{ "done": true }` when synthesis is complete.
///   - Connection is closed after completion.
pub async fn handle_tts(mut ws: WebSocket) {
    info!("TTS connection opened");

    while let Some(msg) = ws.recv().await {
        let msg = match msg {
            Ok(m) => m,
            Err(e) => {
                warn!(error = %e, "TTS recv error");
                break;
            }
        };

        match msg {
            Message::Text(text) => {
                let req: TtsRequest = match serde_json::from_str(&text) {
                    Ok(r) => r,
                    Err(e) => {
                        warn!(error = %e, "TTS invalid JSON request");
                        continue;
                    }
                };

                if req.text.is_empty() {
                    // Empty text: send done and close (matches Python bridge)
                    let _ = send_json(&mut ws, &TtsDone { done: true }).await;
                    let _ = ws.send(Message::Close(None)).await;
                    return;
                }

                let request_start = Instant::now();
                info!(
                    text = %req.text,
                    voice_id = %req.voice_id,
                    "TTS synthesizing (mock)"
                );

                // Generate silence PCM chunks (zero-filled Int16 at 24 kHz)
                let chunk_bytes = TTS_CHUNK_SAMPLES * BYTES_PER_SAMPLE;
                let silence_chunk = vec![0u8; chunk_bytes];

                for i in 0..TTS_MOCK_CHUNKS {
                    if i == 0 {
                        let ttfb_ms = request_start.elapsed().as_millis();
                        debug!(ttfb_ms, "TTS first audio chunk");
                    }
                    if ws.send(Message::Binary(silence_chunk.clone().into())).await.is_err() {
                        warn!("TTS send error on chunk {}", i);
                        return;
                    }
                }

                // Send done signal
                if send_json(&mut ws, &TtsDone { done: true }).await.is_err() {
                    return;
                }

                let total_ms = request_start.elapsed().as_millis();
                info!(total_ms, chunks = TTS_MOCK_CHUNKS, "TTS synthesis complete");

                // Close connection after completing (matches Python bridge)
                let _ = ws.send(Message::Close(None)).await;
                return;
            }
            Message::Close(_) => {
                debug!("TTS client sent close");
                break;
            }
            _ => {}
        }
    }
}

/// Send a JSON text message on the WebSocket.
async fn send_json<T: serde::Serialize>(ws: &mut WebSocket, value: &T) -> Result<(), ()> {
    let json = serde_json::to_string(value).map_err(|_| ())?;
    ws.send(Message::Text(json.into())).await.map_err(|e| {
        warn!(error = %e, "TTS send error");
    })
}
