//! xcodec audio decoder via ONNX Runtime.
//!
//! Loads a pre-exported xcodec decoder ONNX model and converts
//! quantized audio codes (8 codebooks) back to PCM waveform at 24kHz.
//!
//! The decoder takes a single (batch, codebooks, time) i64 tensor
//! and outputs (batch, 1, time * hop_length) f32 audio.

use anyhow::{Context, Result};
use ort::session::Session;
use ort::value::Value;
use std::path::Path;
use std::sync::Mutex;
use tracing::info;

/// xcodec decoder wrapping an ONNX Runtime session.
pub struct XcodecDecoder {
    session: Mutex<Session>,
    num_codebooks: usize,
}

impl XcodecDecoder {
    /// Load xcodec decoder from an ONNX file.
    pub fn load(model_path: &Path, num_codebooks: usize) -> Result<Self> {
        info!(path = %model_path.display(), num_codebooks, "Loading xcodec ONNX decoder");

        let session = Session::builder()
            .context("Failed to create ONNX session builder")?
            .commit_from_file(model_path)
            .context("Failed to load xcodec ONNX model")?;

        info!("xcodec decoder loaded successfully");

        Ok(Self {
            session: Mutex::new(session),
            num_codebooks,
        })
    }

    /// Decode audio codes to f32 samples at 24kHz.
    ///
    /// `codes`: shape (num_codebooks, time_steps) — flattened row-major.
    /// Each codebook row contains integer code indices (0..codebook_size-1).
    ///
    /// Returns mono f32 samples at 24kHz.
    pub fn decode(&self, codes: &[Vec<i64>]) -> Result<Vec<f32>> {
        if codes.is_empty() || codes[0].is_empty() {
            return Ok(Vec::new());
        }

        let time_steps = codes[0].len();

        // Flatten codes into (1, num_codebooks, time_steps) row-major
        let mut flat_codes: Vec<i64> = Vec::with_capacity(self.num_codebooks * time_steps);
        for cb in codes.iter() {
            if cb.len() != time_steps {
                anyhow::bail!(
                    "Codebook length mismatch: expected {}, got {}",
                    time_steps,
                    cb.len()
                );
            }
            flat_codes.extend_from_slice(cb);
        }

        let input = Value::from_array(
            ([1usize, self.num_codebooks, time_steps], flat_codes),
        )
        .context("Failed to create ORT input tensor")?;

        let mut session = self
            .session
            .lock()
            .map_err(|e| anyhow::anyhow!("xcodec session lock poisoned: {e}"))?;

        let outputs = session
            .run(ort::inputs![input])
            .context("xcodec decode inference failed")?;

        // Output shape: (1, 1, audio_samples)
        let audio_result = outputs[0]
            .try_extract_tensor::<f32>()
            .context("Failed to extract audio tensor")?;

        let audio: Vec<f32> = audio_result.1.to_vec();
        Ok(audio)
    }

    /// Decode a single frame of audio codes (for streaming).
    ///
    /// Takes one time step of codes across all codebooks.
    /// Returns a short chunk of f32 audio (one hop length).
    pub fn decode_frame(&self, frame_codes: &[i64]) -> Result<Vec<f32>> {
        if frame_codes.len() != self.num_codebooks {
            anyhow::bail!(
                "Expected {} codes per frame, got {}",
                self.num_codebooks,
                frame_codes.len()
            );
        }

        let codes: Vec<Vec<i64>> = frame_codes.iter().map(|&c| vec![c]).collect();
        self.decode(&codes)
    }
}
