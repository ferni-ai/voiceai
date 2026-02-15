//! SNAC (Multi-Scale Neural Audio Codec) decoder via ONNX Runtime.
//!
//! Loads a pre-exported SNAC 24kHz decoder ONNX model and converts
//! quantized audio codes back to PCM waveform.
//!
//! The decoder takes 3 code tensors (one per codebook level) and outputs
//! a mono audio waveform at 24kHz.

use anyhow::{Context, Result};
use ort::session::Session;
use ort::value::Value;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tracing::info;

/// SNAC decoder wrapping an ONNX Runtime session.
pub struct SnacDecoder {
    session: Mutex<Session>,
}

impl SnacDecoder {
    /// Load SNAC decoder from an ONNX file.
    pub fn load(model_path: &Path) -> Result<Self> {
        info!(path = %model_path.display(), "Loading SNAC ONNX decoder");

        let session = Session::builder()
            .context("Failed to create ONNX session builder")?
            .commit_from_file(model_path)
            .context("Failed to load SNAC ONNX model")?;

        info!("SNAC decoder loaded successfully");

        Ok(Self {
            session: Mutex::new(session),
        })
    }

    /// Decode SNAC codes to f32 audio samples.
    ///
    /// - `codes_0`: Level 0 codes (coarsest, N values)
    /// - `codes_1`: Level 1 codes (2*N values)
    /// - `codes_2`: Level 2 codes (4*N values)
    ///
    /// Returns mono f32 samples at 24kHz.
    pub fn decode(
        &self,
        codes_0: &[i64],
        codes_1: &[i64],
        codes_2: &[i64],
    ) -> Result<Vec<f32>> {
        if codes_0.is_empty() {
            return Ok(Vec::new());
        }

        // Build ORT tensors using (shape, data) tuple format
        let val_0 = Value::from_array(([1usize, codes_0.len()], codes_0.to_vec()))
            .context("Failed to create ORT value for codes_0")?;
        let val_1 = Value::from_array(([1usize, codes_1.len()], codes_1.to_vec()))
            .context("Failed to create ORT value for codes_1")?;
        let val_2 = Value::from_array(([1usize, codes_2.len()], codes_2.to_vec()))
            .context("Failed to create ORT value for codes_2")?;

        let mut session = self
            .session
            .lock()
            .map_err(|e| anyhow::anyhow!("SNAC session lock poisoned: {e}"))?;

        let outputs = session
            .run(ort::inputs![val_0, val_1, val_2])
            .context("SNAC decode inference failed")?;

        // Output shape is (batch=1, channels=1, time) — extract the audio samples
        let audio_result = outputs[0]
            .try_extract_tensor::<f32>()
            .context("Failed to extract audio tensor")?;

        // try_extract_tensor returns (&Shape, &[f32]) — use the data slice
        let audio: Vec<f32> = audio_result.1.to_vec();

        Ok(audio)
    }
}

/// Thread-safe handle to a SNAC decoder.
pub type SharedSnacDecoder = Arc<SnacDecoder>;
