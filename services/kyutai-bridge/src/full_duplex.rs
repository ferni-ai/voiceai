//! Full-duplex STS WebSocket handler: /api/sts-full-duplex.
//!
//! Uses load_streaming_both_ways for bidirectional audio (user speaks and Moshi speaks
//! simultaneously). Target: ~160ms latency (Kyutai published). Function calling / tool use
//! does not fit natively; requires a "pause and call" mechanism when integrated with the agent.
//!
//! NOTE: Bidirectional inference loop is not yet implemented. The main.rs startup
//! currently fast-fails when KYUTAI_FULL_DUPLEX=true to prevent wasting resources.

use axum::extract::ws::{Message, WebSocket};
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::info;

use crate::models::FullDuplexModels;

/// Handle one full-duplex STS WebSocket connection.
///
/// Protocol: client sends binary PCM (user audio); server streams back binary PCM (agent audio).
/// Bidirectional on the same socket.
pub async fn handle_sts_full_duplex_socket(
    mut socket: WebSocket,
    _models: Arc<Mutex<FullDuplexModels>>,
) {
    info!("Full-duplex STS connection opened (target ~160ms bidirectional)");
    let _ = socket
        .send(Message::Text(
            r#"{"mode":"sts-full-duplex","target_latency_ms":160,"status":"not_implemented","note":"Bidirectional inference loop TODO"}"#
                .to_string(),
        ))
        .await;

    while let Some(msg) = socket.recv().await {
        match msg {
            Ok(Message::Binary(_)) => {
                // TODO: decode PCM, step full-duplex model, encode and send agent PCM.
            }
            Ok(Message::Close(_)) => break,
            _ => {}
        }
    }
    info!("Full-duplex STS connection closed");
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
