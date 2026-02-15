//! WebSocket real-time streaming TTS endpoint.
//!
//! Clients connect to `GET /ws/v1/audio/speech` and exchange JSON control
//! messages + binary PCM audio frames over a persistent WebSocket connection.
//!
//! ## Protocol
//!
//! **Client → Server (JSON text):**
//! - `{"type":"synthesize","text":"...","voice":"ferni","emotion":"warm","speed":1.0}`
//! - `{"type":"cancel"}` — abort in-progress synthesis
//! - `{"type":"ping"}` — keepalive
//!
//! **Server → Client:**
//! - `{"type":"metadata","sample_rate":24000,"format":"pcm-s16le","emotion":"warm"}` (text)
//! - Binary frames: s16le PCM chunks as generated
//! - `{"type":"done","total_samples":48000,"elapsed_ms":350}` (text)
//! - `{"type":"pong"}` (text)
//! - `{"type":"error","message":"..."}` (text)

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::IntoResponse;
use serde::{Deserialize, Serialize};
use tracing::{error, info, warn};

use crate::audio::f32_to_s16le;
use crate::emotion::resolve_emotion;
use crate::synthesize_voice_design;
use crate::AppState;

// ─── Wire Types ─────────────────────────────────────────────

/// Incoming client message (JSON text frame).
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientMessage {
    Synthesize(SynthesizeParams),
    Cancel,
    Ping,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct SynthesizeParams {
    text: String,
    #[serde(default = "default_voice")]
    voice: String,
    #[serde(default)]
    emotion: Option<String>,
    #[serde(default)]
    speed: Option<f32>,
    #[serde(default)]
    volume: Option<f32>,
    #[serde(default)]
    output_format: Option<String>,
}

fn default_voice() -> String {
    "ferni".to_string()
}

/// Outgoing server metadata message.
#[derive(Debug, Serialize)]
struct MetadataMessage {
    r#type: &'static str,
    sample_rate: u32,
    format: &'static str,
    emotion: String,
}

/// Outgoing server done message.
#[derive(Debug, Serialize)]
struct DoneMessage {
    r#type: &'static str,
    total_samples: usize,
    elapsed_ms: u64,
}

/// Outgoing server error message.
#[derive(Debug, Serialize)]
struct ErrorMessage {
    r#type: &'static str,
    message: String,
}

// ─── Handler ────────────────────────────────────────────────

/// Axum handler for WebSocket upgrade at `GET /ws/v1/audio/speech`.
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    info!("WebSocket connection upgrade requested");
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

/// Main WebSocket connection loop.
async fn handle_socket(mut socket: WebSocket, state: Arc<AppState>) {
    info!("WebSocket client connected");

    // Shared cancellation flag — set by "cancel" message, checked by synthesis callback.
    let cancel_flag = Arc::new(AtomicBool::new(false));

    loop {
        let msg = match socket.recv().await {
            Some(Ok(msg)) => msg,
            Some(Err(e)) => {
                warn!(error = %e, "WebSocket receive error");
                break;
            }
            None => {
                // Client disconnected cleanly.
                break;
            }
        };

        match msg {
            Message::Text(text) => {
                let parsed: ClientMessage = match serde_json::from_str(&text) {
                    Ok(m) => m,
                    Err(e) => {
                        let err_msg = serde_json::to_string(&ErrorMessage {
                            r#type: "error",
                            message: format!("Invalid JSON: {e}"),
                        })
                        .unwrap_or_default();
                        if socket.send(Message::Text(err_msg.into())).await.is_err() {
                            break;
                        }
                        continue;
                    }
                };

                match parsed {
                    ClientMessage::Ping => {
                        let pong = r#"{"type":"pong"}"#.to_string();
                        if socket.send(Message::Text(pong.into())).await.is_err() {
                            break;
                        }
                    }
                    ClientMessage::Cancel => {
                        cancel_flag.store(true, Ordering::SeqCst);
                        info!("Synthesis cancelled by client");
                    }
                    ClientMessage::Synthesize(params) => {
                        // Reset cancel flag for new synthesis.
                        cancel_flag.store(false, Ordering::SeqCst);

                        if let Err(_) =
                            handle_synthesize(&mut socket, &state, params, cancel_flag.clone())
                                .await
                        {
                            // Socket error — connection is dead.
                            break;
                        }
                    }
                }
            }
            Message::Binary(_) => {
                // We don't expect binary from clients; ignore.
            }
            Message::Close(_) => {
                break;
            }
            // Ping/Pong at the WebSocket protocol level are handled by axum automatically.
            _ => {}
        }
    }

    info!("WebSocket client disconnected");
}

/// Run a single synthesis request, streaming PCM chunks back over the WebSocket.
///
/// Returns `Err(())` if the WebSocket is broken and the connection should close.
async fn handle_synthesize(
    socket: &mut WebSocket,
    state: &Arc<AppState>,
    params: SynthesizeParams,
    cancel_flag: Arc<AtomicBool>,
) -> Result<(), ()> {
    let text = params.text.trim().to_string();
    if text.is_empty() {
        let err = serde_json::to_string(&ErrorMessage {
            r#type: "error",
            message: "text is required and must be non-empty".into(),
        })
        .unwrap_or_default();
        return socket
            .send(Message::Text(err.into()))
            .await
            .map_err(|_| ());
    }

    let emotion_params = resolve_emotion(params.emotion.as_deref());

    // Send metadata before audio starts.
    let metadata = serde_json::to_string(&MetadataMessage {
        r#type: "metadata",
        sample_rate: crate::SAMPLE_RATE,
        format: "pcm-s16le",
        emotion: emotion_params.emotion.clone(),
    })
    .unwrap_or_default();
    socket
        .send(Message::Text(metadata.into()))
        .await
        .map_err(|_| ())?;

    // Channel for streaming PCM chunks from blocking thread → async WebSocket sender.
    let (tx, mut rx) = tokio::sync::mpsc::channel::<SynthChunk>(32);

    let voice = params.voice.clone();
    let emotion = params.emotion.clone();
    let explicit_speed = params.speed;
    let state_clone = Arc::clone(state);
    let cancel = Arc::clone(&cancel_flag);

    // Spawn blocking synthesis.
    tokio::task::spawn_blocking(move || {
        let model = match state_clone.model.lock() {
            Ok(m) => m,
            Err(e) => {
                let _ = tx.blocking_send(SynthChunk::Error(format!("Model lock failed: {e}")));
                return;
            }
        };

        let start = Instant::now();
        let mut total_samples = 0usize;

        let result = synthesize_voice_design(
            &model,
            &text,
            &voice,
            emotion.as_deref(),
            explicit_speed,
            None,
            None,
        );

        match result {
            Ok((samples, _sample_rate, _emotion_params)) => {
                // Check cancellation before sending.
                if cancel.load(Ordering::SeqCst) {
                    let _ = tx.blocking_send(SynthChunk::Cancelled);
                    return;
                }

                // Send chunks (split large results for more granular streaming).
                let chunk_size = 4800; // 200ms at 24kHz
                for chunk in samples.chunks(chunk_size) {
                    if cancel.load(Ordering::SeqCst) {
                        let _ = tx.blocking_send(SynthChunk::Cancelled);
                        return;
                    }
                    total_samples += chunk.len();
                    let pcm = f32_to_s16le(chunk);
                    if tx.blocking_send(SynthChunk::Audio(pcm)).is_err() {
                        return; // Receiver dropped (client disconnected)
                    }
                }

                let elapsed_ms = start.elapsed().as_millis() as u64;
                let _ = tx.blocking_send(SynthChunk::Done {
                    total_samples,
                    elapsed_ms,
                });
            }
            Err(e) => {
                error!(error = %e, "WebSocket synthesis failed");
                let _ = tx.blocking_send(SynthChunk::Error(e.to_string()));
            }
        }
    });

    // Relay chunks from the blocking thread to the WebSocket.
    while let Some(chunk) = rx.recv().await {
        match chunk {
            SynthChunk::Audio(pcm) => {
                if socket.send(Message::Binary(pcm.into())).await.is_err() {
                    return Err(());
                }
            }
            SynthChunk::Done {
                total_samples,
                elapsed_ms,
            } => {
                let done = serde_json::to_string(&DoneMessage {
                    r#type: "done",
                    total_samples,
                    elapsed_ms,
                })
                .unwrap_or_default();
                socket
                    .send(Message::Text(done.into()))
                    .await
                    .map_err(|_| ())?;
            }
            SynthChunk::Error(msg) => {
                let err = serde_json::to_string(&ErrorMessage {
                    r#type: "error",
                    message: msg,
                })
                .unwrap_or_default();
                // Send error but don't kill connection — client can retry.
                let _ = socket.send(Message::Text(err.into())).await;
            }
            SynthChunk::Cancelled => {
                let cancelled = r#"{"type":"cancelled"}"#.to_string();
                let _ = socket.send(Message::Text(cancelled.into())).await;
            }
        }
    }

    Ok(())
}

/// Internal message type for the synthesis channel.
enum SynthChunk {
    Audio(Vec<u8>),
    Done { total_samples: usize, elapsed_ms: u64 },
    Error(String),
    Cancelled,
}

// ─── Tests ──────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── Message parsing ───────────────────────────────────────

    #[test]
    fn parse_synthesize_message() {
        let json = r#"{"type":"synthesize","text":"Hello world","voice":"ferni","emotion":"warm","speed":1.0}"#;
        let msg: ClientMessage = serde_json::from_str(json).unwrap();
        match msg {
            ClientMessage::Synthesize(params) => {
                assert_eq!(params.text, "Hello world");
                assert_eq!(params.voice, "ferni");
                assert_eq!(params.emotion, Some("warm".to_string()));
                assert_eq!(params.speed, Some(1.0));
            }
            _ => panic!("expected Synthesize"),
        }
    }

    #[test]
    fn parse_synthesize_minimal() {
        let json = r#"{"type":"synthesize","text":"Hi"}"#;
        let msg: ClientMessage = serde_json::from_str(json).unwrap();
        match msg {
            ClientMessage::Synthesize(params) => {
                assert_eq!(params.text, "Hi");
                assert_eq!(params.voice, "ferni"); // default
                assert_eq!(params.emotion, None);
                assert_eq!(params.speed, None);
                assert_eq!(params.volume, None);
                assert_eq!(params.output_format, None);
            }
            _ => panic!("expected Synthesize"),
        }
    }

    #[test]
    fn parse_cancel_message() {
        let json = r#"{"type":"cancel"}"#;
        let msg: ClientMessage = serde_json::from_str(json).unwrap();
        assert!(matches!(msg, ClientMessage::Cancel));
    }

    #[test]
    fn parse_ping_message() {
        let json = r#"{"type":"ping"}"#;
        let msg: ClientMessage = serde_json::from_str(json).unwrap();
        assert!(matches!(msg, ClientMessage::Ping));
    }

    #[test]
    fn parse_unknown_type_fails() {
        let json = r#"{"type":"unknown_action"}"#;
        let result = serde_json::from_str::<ClientMessage>(json);
        assert!(result.is_err());
    }

    #[test]
    fn parse_invalid_json_fails() {
        let json = r#"not json at all"#;
        let result = serde_json::from_str::<ClientMessage>(json);
        assert!(result.is_err());
    }

    #[test]
    fn parse_missing_text_fails() {
        let json = r#"{"type":"synthesize","voice":"ferni"}"#;
        let result = serde_json::from_str::<ClientMessage>(json);
        assert!(result.is_err());
    }

    // ── Response construction ─────────────────────────────────

    #[test]
    fn metadata_response_serializes() {
        let meta = MetadataMessage {
            r#type: "metadata",
            sample_rate: 24000,
            format: "pcm-s16le",
            emotion: "warm".to_string(),
        };
        let json = serde_json::to_string(&meta).unwrap();
        assert!(json.contains(r#""type":"metadata""#));
        assert!(json.contains(r#""sample_rate":24000"#));
        assert!(json.contains(r#""format":"pcm-s16le""#));
        assert!(json.contains(r#""emotion":"warm""#));
    }

    #[test]
    fn done_response_serializes() {
        let done = DoneMessage {
            r#type: "done",
            total_samples: 48000,
            elapsed_ms: 350,
        };
        let json = serde_json::to_string(&done).unwrap();
        assert!(json.contains(r#""type":"done""#));
        assert!(json.contains(r#""total_samples":48000"#));
        assert!(json.contains(r#""elapsed_ms":350"#));
    }

    #[test]
    fn error_response_serializes() {
        let err = ErrorMessage {
            r#type: "error",
            message: "synthesis failed".to_string(),
        };
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains(r#""type":"error""#));
        assert!(json.contains(r#""message":"synthesis failed""#));
    }

    // ── Synthesize params defaults ────────────────────────────

    #[test]
    fn synthesize_params_with_all_fields() {
        let json = r#"{
            "type": "synthesize",
            "text": "Test",
            "voice": "maya",
            "emotion": "excited",
            "speed": 1.2,
            "volume": 0.8,
            "output_format": "pcm-s16le"
        }"#;
        let msg: ClientMessage = serde_json::from_str(json).unwrap();
        match msg {
            ClientMessage::Synthesize(params) => {
                assert_eq!(params.voice, "maya");
                assert_eq!(params.emotion, Some("excited".to_string()));
                assert_eq!(params.speed, Some(1.2));
                assert_eq!(params.volume, Some(0.8));
                assert_eq!(params.output_format, Some("pcm-s16le".to_string()));
            }
            _ => panic!("expected Synthesize"),
        }
    }
}
