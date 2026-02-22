//! Audio Embedding Encoder
//!
//! Extracts per-utterance audio embeddings using a pre-trained audio encoder
//! (e.g., Whisper encoder or CLAP). Sends embeddings to TypeScript client.

#![cfg(feature = "audio-encoder")]

use anyhow::{Context, Result};
use ort::session::Session;
use ort::value::Value;
use std::path::Path;
use std::sync::Mutex;
use tracing::{debug, info, warn};

use crate::audio_mel::{compute_mel_spectrogram, N_MELS};

/// Audio embedding dimension (Whisper encoder output).
pub const AUDIO_EMBED_DIM: usize = 768;

/// Audio embedding result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AudioEmbedding {
    pub embedding: Vec<f32>,
    pub model: String,
    pub timestamp_ms: u64,
    pub duration_ms: u64,
}

/// Audio encoder for extracting utterance embeddings via ONNX Whisper encoder.
pub struct AudioEncoder {
    session: Option<Mutex<Session>>,
    model_name: String,
    initialized: bool,
}

impl AudioEncoder {
    /// Create a new audio encoder. Loads ONNX model from `model_path` if present.
    pub fn new(model_path: Option<&str>) -> Self {
        let (session, initialized, model_name) = match model_path {
            Some(p) if !p.is_empty() => {
                let path = Path::new(p);
                if path.exists() {
                    match Session::builder()
                        .context("Audio encoder: session builder")
                        .and_then(|b| b.commit_from_file(path).context("Audio encoder: load ONNX"))
                    {
                        Ok(s) => {
                            info!(path = %p, "Audio encoder initialized");
                            (Some(Mutex::new(s)), true, p.to_string())
                        }
                        Err(e) => {
                            warn!(error = %e, "Audio encoder: failed to load ONNX, embeddings will be zeros");
                            (None, false, "none".to_string())
                        }
                    }
                } else {
                    warn!(path = %p, "Audio encoder: model file not found");
                    (None, false, "none".to_string())
                }
            }
            _ => {
                debug!("Audio encoder: no model path, embeddings will be zeros");
                (None, false, "none".to_string())
            }
        };

        Self {
            session,
            model_name,
            initialized,
        }
    }

    /// Extract embedding from audio utterance.
    /// Input: f32 PCM at 16kHz. Output: AUDIO_EMBED_DIM-dimensional vector.
    pub fn encode(&self, audio: &[f32], sample_rate: u32) -> Result<AudioEmbedding> {
        let duration_ms = (audio.len() as f64 / sample_rate as f64 * 1000.0) as u64;
        let timestamp_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        if !self.initialized {
            return Ok(AudioEmbedding {
                embedding: vec![0.0; AUDIO_EMBED_DIM],
                model: "none".to_string(),
                timestamp_ms: 0,
                duration_ms,
            });
        }

        let session_guard = match &self.session {
            Some(s) => s,
            None => {
                return Ok(AudioEmbedding {
                    embedding: vec![0.0; AUDIO_EMBED_DIM],
                    model: self.model_name.clone(),
                    timestamp_ms,
                    duration_ms,
                });
            }
        };

        debug!(
            samples = audio.len(),
            sample_rate,
            "Encoding audio utterance"
        );

        // 1. Compute mel spectrogram (n_frames, 80)
        let mel = compute_mel_spectrogram(audio, sample_rate);
        if mel.is_empty() {
            return Ok(AudioEmbedding {
                embedding: vec![0.0; AUDIO_EMBED_DIM],
                model: self.model_name.clone(),
                timestamp_ms,
                duration_ms,
            });
        }

        let n_frames = mel.len();
        // 2. Flatten to [1, 80, n_frames] (batch, mel_bins, time) for Whisper-style encoder
        let mut mel_flat = Vec::with_capacity(1 * N_MELS * n_frames);
        for frame in &mel {
            mel_flat.extend_from_slice(frame);
        }

        let input = Value::from_array(([1usize, N_MELS, n_frames], mel_flat))
            .context("Audio encoder: create mel input tensor")?;

        let mut session = session_guard
            .lock()
            .map_err(|e| anyhow::anyhow!("Audio encoder session lock: {e}"))?;

        let outputs = session
            .run(ort::inputs![input])
            .context("Audio encoder ONNX inference failed")?;

        let encoder_out = outputs[0]
            .try_extract_tensor::<f32>()
            .context("Audio encoder: extract output tensor")?;

        // Output shape is typically [1, n_frames, 768] or [1, n_frames+1, 768]
        let (shape, data) = encoder_out;
        let embedding = if data.len() >= AUDIO_EMBED_DIM {
            // Mean-pool over time: assume last dim is 768
            let seq_len = data.len() / AUDIO_EMBED_DIM;
            let mut pooled = vec![0.0f32; AUDIO_EMBED_DIM];
            for (i, p) in pooled.iter_mut().enumerate() {
                for t in 0..seq_len {
                    *p += data[t * AUDIO_EMBED_DIM + i];
                }
                *p /= seq_len as f32;
            }
            pooled
        } else {
            vec![0.0; AUDIO_EMBED_DIM]
        };

        let _ = shape; // used for debugging if needed

        Ok(AudioEmbedding {
            embedding,
            model: self.model_name.clone(),
            timestamp_ms,
            duration_ms,
        })
    }

    /// Whether the encoder has a loaded model.
    pub fn is_ready(&self) -> bool {
        self.initialized
    }
}
