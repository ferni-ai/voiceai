use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use tracing::{debug, info, warn};

use crate::audio::TTS_CHUNK_SAMPLES;
use crate::protocol::{ClientMessage, ServerMessage};
use crate::server::AppState;

/// Handle a single WebSocket connection lifecycle.
pub async fn handle_ws(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();

    let mut current_session_id: Option<String> = None;

    while let Some(msg_result) = receiver.next().await {
        let msg = match msg_result {
            Ok(m) => m,
            Err(e) => {
                debug!("WebSocket receive error: {e}");
                break;
            }
        };

        match msg {
            Message::Text(text) => {
                let client_msg: ClientMessage = match serde_json::from_str(&text) {
                    Ok(m) => m,
                    Err(e) => {
                        warn!("Malformed client message: {e}");
                        let err = ServerMessage::Error {
                            code: "parse_error".into(),
                            message: format!("Failed to parse JSON: {e}"),
                            request_id: None,
                        };
                        if let Ok(json) = serde_json::to_string(&err) {
                            let _ = sender.send(Message::Text(json.into())).await;
                        } else {
                            warn!("Failed to serialize parse_error response");
                        }
                        continue;
                    }
                };

                match client_msg {
                    ClientMessage::StartSession {
                        session_id,
                        persona,
                    } => {
                        let persona_name = persona.unwrap_or_else(|| "ferni".into());
                        info!(session_id = %session_id, persona = %persona_name, "Starting session");

                        let mut sessions = state.sessions.write().await;
                        if sessions.create_session(session_id.clone(), persona_name) {
                            current_session_id = Some(session_id);
                        } else {
                            let err = ServerMessage::Error {
                                code: "session_exists".into(),
                                message: format!("Session already exists: {session_id}"),
                                request_id: None,
                            };
                            if let Ok(json) = serde_json::to_string(&err) {
                                let _ = sender.send(Message::Text(json.into())).await;
                            } else {
                                warn!("Failed to serialize session_exists response");
                            }
                        }
                    }

                    ClientMessage::Transcribe => {
                        let sid = match &current_session_id {
                            Some(id) => id.clone(),
                            None => {
                                let err = ServerMessage::Error {
                                    code: "no_session".into(),
                                    message: "Transcription failed: no active session".into(),
                                    request_id: None,
                                };
                                if let Ok(json) = serde_json::to_string(&err) {
                                    let _ = sender.send(Message::Text(json.into())).await;
                                } else {
                                    warn!("Failed to serialize no_session response");
                                }
                                continue;
                            }
                        };

                        let mut sessions = state.sessions.write().await;
                        let audio = sessions.drain_audio(&sid);
                        if let Some(session) = sessions.get_session_mut(&sid) {
                            session.total_transcriptions += 1;
                        }
                        drop(sessions);

                        let sample_count = audio.as_ref().map_or(0, |a| a.len());
                        debug!(session_id = %sid, samples = sample_count, "Transcribe requested");

                        let result = match audio {
                            Some(samples) if !samples.is_empty() => {
                                state.pipeline.transcribe(samples).await
                            }
                            _ => Ok(crate::pipeline::TranscribeResult {
                                text: String::new(),
                                biomarkers: None,
                                latency_ms: 0,
                            }),
                        };

                        match result {
                            Ok(tr) => {
                                // Store biomarkers in session for humanization feedback loop
                                if let Some(ref bio) = tr.biomarkers {
                                    let mut sessions = state.sessions.write().await;
                                    if let Some(session) = sessions.get_session_mut(&sid) {
                                        session.last_biomarkers = Some(bio.clone());
                                    }
                                }
                                let response = ServerMessage::Transcript {
                                    text: tr.text,
                                    biomarkers: tr.biomarkers,
                                    latency_ms: tr.latency_ms,
                                };
                                if let Ok(json) = serde_json::to_string(&response) {
                                    let _ = sender.send(Message::Text(json.into())).await;
                                } else {
                                    warn!("Failed to serialize transcript response");
                                }
                            }
                            Err(e) => {
                                warn!(error = %e, "Transcription failed");
                                let err = ServerMessage::Error {
                                    code: "stt_error".into(),
                                    message: format!("Transcription failed: {e}"),
                                    request_id: None,
                                };
                                if let Ok(json) = serde_json::to_string(&err) {
                                    let _ = sender.send(Message::Text(json.into())).await;
                                } else {
                                    warn!("Failed to serialize stt_error response");
                                }
                            }
                        }
                    }

                    ClientMessage::Synthesize {
                        text,
                        emotion,
                        intensity,
                        request_id,
                    } => {
                        let sid = match &current_session_id {
                            Some(id) => id.clone(),
                            None => {
                                let err = ServerMessage::Error {
                                    code: "no_session".into(),
                                    message: "Synthesis failed: no active session".into(),
                                    request_id,
                                };
                                if let Ok(json) = serde_json::to_string(&err) {
                                    let _ = sender.send(Message::Text(json.into())).await;
                                } else {
                                    warn!("Failed to serialize no_session response");
                                }
                                continue;
                            }
                        };

                        let mut sessions = state.sessions.write().await;
                        if let Some(session) = sessions.get_session_mut(&sid) {
                            session.total_syntheses += 1;
                        }
                        drop(sessions);

                        // Read session state for KV cache (with version), persona, and biomarkers
                        let (kv_tokens, kv_version, persona, last_bio) = {
                            let sessions = state.sessions.read().await;
                            match sessions.get_session(&sid) {
                                Some(s) => (s.kv_cache_tokens, s.kv_cache_version, s.persona.clone(), s.last_biomarkers.clone()),
                                None => (0, 0, "ferni".into(), None),
                            }
                        };

                        let emotion_str = emotion.unwrap_or_else(|| "neutral".into());
                        let intensity_val = intensity.unwrap_or(0.5);

                        debug!(
                            session_id = %sid,
                            text_len = text.len(),
                            emotion = %emotion_str,
                            intensity = intensity_val,
                            kv_tokens,
                            "Synthesize requested"
                        );

                        match state.pipeline.synthesize(text, emotion_str, intensity_val, kv_tokens, persona, last_bio.as_ref()).await {
                            Ok(result) => {
                                // Send AudioStart
                                let start_msg = ServerMessage::AudioStart {
                                    sample_rate: 24000,
                                    request_id,
                                };
                                if let Ok(json) = serde_json::to_string(&start_msg) {
                                    let _ = sender.send(Message::Text(json.into())).await;
                                } else {
                                    warn!("Failed to serialize AudioStart response");
                                }

                                // Stream audio in 200ms chunks (from audio::TTS_CHUNK_SAMPLES)
                                for chunk in result.audio_i16.chunks(TTS_CHUNK_SAMPLES) {
                                    let bytes: Vec<u8> = chunk.iter()
                                        .flat_map(|&s| s.to_le_bytes())
                                        .collect();
                                    let _ = sender.send(Message::Binary(bytes.into())).await;
                                }

                                // Update session KV cache tokens (optimistic locking)
                                {
                                    let mut sessions = state.sessions.write().await;
                                    if let Some(session) = sessions.get_session_mut(&sid) {
                                        if session.kv_cache_version == kv_version {
                                            session.set_kv_cache_tokens(result.kv_cache_tokens);
                                        } else {
                                            warn!(
                                                expected = kv_version,
                                                actual = session.kv_cache_version,
                                                "KV cache version mismatch, skipping update (newer request wins)"
                                            );
                                        }
                                    }
                                }

                                // Send AudioDone
                                let done = ServerMessage::AudioDone {
                                    duration_ms: result.duration_ms,
                                    humanization: Some(result.humanization),
                                    request_id,
                                };
                                if let Ok(json) = serde_json::to_string(&done) {
                                    let _ = sender.send(Message::Text(json.into())).await;
                                } else {
                                    warn!("Failed to serialize AudioDone response");
                                }
                            }
                            Err(e) => {
                                warn!(error = %e, "Synthesis failed");
                                let err = ServerMessage::Error {
                                    code: "tts_error".into(),
                                    message: format!("Synthesis failed: {e}"),
                                    request_id,
                                };
                                if let Ok(json) = serde_json::to_string(&err) {
                                    let _ = sender.send(Message::Text(json.into())).await;
                                } else {
                                    warn!("Failed to serialize tts_error response");
                                }
                            }
                        }
                    }

                    ClientMessage::SynthesizeStreaming {
                        text,
                        emotion,
                        intensity,
                        chunk_steps,
                        request_id,
                    } => {
                        let sid = match &current_session_id {
                            Some(id) => id.clone(),
                            None => {
                                let err = ServerMessage::Error {
                                    code: "no_session".into(),
                                    message: "Streaming synthesis failed: no active session".into(),
                                    request_id,
                                };
                                if let Ok(json) = serde_json::to_string(&err) {
                                    let _ = sender.send(Message::Text(json.into())).await;
                                } else {
                                    warn!("Failed to serialize no_session response");
                                }
                                continue;
                            }
                        };

                        let mut sessions = state.sessions.write().await;
                        if let Some(session) = sessions.get_session_mut(&sid) {
                            session.total_syntheses += 1;
                        }
                        drop(sessions);

                        // Read session state for KV cache (with version), persona, and biomarkers
                        let (kv_tokens, kv_version, persona, last_bio) = {
                            let sessions = state.sessions.read().await;
                            match sessions.get_session(&sid) {
                                Some(s) => (s.kv_cache_tokens, s.kv_cache_version, s.persona.clone(), s.last_biomarkers.clone()),
                                None => (0, 0, "ferni".into(), None),
                            }
                        };

                        let emotion_str = emotion.unwrap_or_else(|| "neutral".into());
                        let intensity_val = intensity.unwrap_or(0.5);

                        info!(
                            session_id = %sid,
                            text_len = text.len(),
                            emotion = %emotion_str,
                            "Streaming synthesis requested"
                        );

                        // Create async channel for streaming audio chunks
                        let (tx, mut rx) = tokio::sync::mpsc::channel::<Vec<i16>>(32);

                        // Spawn pipeline task — sends i16 chunks via tx, returns result
                        let state_clone = state.clone();
                        let pipeline_handle = tokio::spawn(async move {
                            state_clone
                                .pipeline
                                .synthesize_streaming(
                                    text,
                                    emotion_str,
                                    intensity_val,
                                    kv_tokens,
                                    persona,
                                    chunk_steps,
                                    tx,
                                    last_bio.as_ref(),
                                )
                                .await
                        });

                        // Send AudioStart immediately (first byte latency)
                        let start_msg = ServerMessage::AudioStart {
                            sample_rate: 24000,
                            request_id,
                        };
                        if let Ok(json) = serde_json::to_string(&start_msg) {
                            let _ = sender.send(Message::Text(json.into())).await;
                        } else {
                            warn!("Failed to serialize AudioStart response");
                        }

                        // Forward audio chunks as 200ms binary WebSocket frames
                        let mut leftover: Vec<i16> = Vec::new();

                        while let Some(chunk) = rx.recv().await {
                            leftover.extend_from_slice(&chunk);

                            // Send full 200ms frames, buffer remainder
                            while leftover.len() >= TTS_CHUNK_SAMPLES {
                                let frame: Vec<i16> =
                                    leftover.drain(..TTS_CHUNK_SAMPLES).collect();
                                let bytes: Vec<u8> =
                                    frame.iter().flat_map(|&s| s.to_le_bytes()).collect();
                                let _ = sender.send(Message::Binary(bytes.into())).await;
                            }
                        }

                        // Flush any remaining samples
                        if !leftover.is_empty() {
                            let bytes: Vec<u8> =
                                leftover.iter().flat_map(|&s| s.to_le_bytes()).collect();
                            let _ = sender.send(Message::Binary(bytes.into())).await;
                        }

                        // Await pipeline result for KV cache update and AudioDone metadata
                        match pipeline_handle.await {
                            Ok(Ok(result)) => {
                                // Optimistic locking for KV cache update
                                {
                                    let mut sessions = state.sessions.write().await;
                                    if let Some(session) = sessions.get_session_mut(&sid) {
                                        if session.kv_cache_version == kv_version {
                                            session.set_kv_cache_tokens(result.kv_cache_tokens);
                                        } else {
                                            warn!(
                                                expected = kv_version,
                                                actual = session.kv_cache_version,
                                                "KV cache version mismatch, skipping update (newer request wins)"
                                            );
                                        }
                                    }
                                }

                                let done = ServerMessage::AudioDone {
                                    duration_ms: result.duration_ms,
                                    humanization: Some(result.humanization),
                                    request_id,
                                };
                                if let Ok(json) = serde_json::to_string(&done) {
                                    let _ = sender.send(Message::Text(json.into())).await;
                                } else {
                                    warn!("Failed to serialize AudioDone response");
                                }
                            }
                            Ok(Err(e)) => {
                                warn!(error = %e, "Streaming synthesis failed");
                                let err = ServerMessage::Error {
                                    code: "tts_error".into(),
                                    message: format!("Streaming synthesis failed: {e}"),
                                    request_id,
                                };
                                if let Ok(json) = serde_json::to_string(&err) {
                                    let _ = sender.send(Message::Text(json.into())).await;
                                } else {
                                    warn!("Failed to serialize tts_error response");
                                }
                            }
                            Err(e) => {
                                warn!(error = %e, "Streaming synthesis task panicked");
                                let err = ServerMessage::Error {
                                    code: "tts_panic".into(),
                                    message: "Streaming synthesis task panicked".into(),
                                    request_id,
                                };
                                if let Ok(json) = serde_json::to_string(&err) {
                                    let _ = sender.send(Message::Text(json.into())).await;
                                } else {
                                    warn!("Failed to serialize tts_panic response");
                                }
                            }
                        }
                    }

                    ClientMessage::EndSession => {
                        if let Some(sid) = current_session_id.take() {
                            info!(session_id = %sid, "Ending session");
                            let mut sessions = state.sessions.write().await;
                            sessions.remove_session(&sid);
                        }
                    }
                }
            }

            Message::Binary(data) => {
                // Binary frames are raw i16 LE PCM audio
                if let Some(sid) = &current_session_id {
                    if data.len() < 2 {
                        warn!("Received too-small binary frame ({} bytes), skipping", data.len());
                        continue;
                    }
                    // 30 seconds of 16kHz i16 audio = 16000 * 2 * 30 = 960,000 bytes
                    const MAX_AUDIO_BYTES: usize = 16000 * 2 * 30;
                    if data.len() > MAX_AUDIO_BYTES {
                        warn!(
                            bytes = data.len(),
                            max = MAX_AUDIO_BYTES,
                            "Binary frame exceeds 30s limit, rejecting"
                        );
                        let err = ServerMessage::Error {
                            code: "validation_error".into(),
                            message: format!(
                                "Audio frame too large: {} bytes (max {} bytes / 30s)",
                                data.len(),
                                MAX_AUDIO_BYTES
                            ),
                            request_id: None,
                        };
                        if let Ok(json) = serde_json::to_string(&err) {
                            let _ = sender.send(Message::Text(json.into())).await;
                        } else {
                            warn!("Failed to serialize validation_error response");
                        }
                        continue;
                    }
                    if data.len() % 2 != 0 {
                        warn!("Received odd-length binary frame, skipping");
                        continue;
                    }
                    let samples: Vec<i16> = data
                        .chunks_exact(2)
                        .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]))
                        .collect();

                    let mut sessions = state.sessions.write().await;
                    if let Some(dropped) = sessions.append_audio(sid, &samples) {
                        if dropped > 0 {
                            warn!(session_id = %sid, dropped, "Audio buffer overflow, dropped oldest samples");
                        } else {
                            debug!(session_id = %sid, samples = samples.len(), "Appended audio");
                        }
                    }
                } else {
                    warn!("Binary audio received without active session");
                }
            }

            Message::Close(_) => {
                info!("WebSocket closed by client");
                break;
            }

            Message::Ping(_) | Message::Pong(_) => {
                // Axum handles ping/pong automatically
            }
        }
    }

    // Cleanup session on disconnect
    if let Some(sid) = current_session_id {
        info!(session_id = %sid, "Cleaning up session on disconnect");
        let mut sessions = state.sessions.write().await;
        sessions.remove_session(&sid);
    }
}
