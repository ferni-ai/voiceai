//! Silero VAD — Neural Voice Activity Detection via ONNX Runtime.
//!
//! Provides accurate speech/non-speech detection using the Silero VAD v5 model
//! (~2MB ONNX). Replaces the simple energy-based VAD for production use.
//!
//! The model processes 512-sample frames (32ms at 16kHz) and outputs a
//! probability of speech. A configurable threshold with hysteresis prevents
//! rapid toggling at speech boundaries.
//!
//! # Performance
//! - Model size: ~2MB ONNX
//! - Latency: <1ms per frame on CPU
//! - Accuracy: >95% on common benchmarks

use anyhow::{Context, Result};
use ort::session::Session;
use ort::value::Value;
use std::path::Path;
use tracing::{debug, info};

/// Silero VAD frame size: 512 samples (32ms at 16kHz).
pub const VAD_FRAME_SAMPLES: usize = 512;

/// Silero VAD expected sample rate.
pub const VAD_SAMPLE_RATE: u32 = 16000;

/// Result of a VAD frame analysis.
#[derive(Debug, Clone, Copy)]
pub struct VadResult {
    /// Speech probability (0.0 - 1.0).
    pub speech_probability: f32,
    /// Whether this frame is classified as speech (above threshold with hysteresis).
    pub is_speech: bool,
}

/// Silero VAD engine with ONNX Runtime inference.
///
/// Maintains internal LSTM hidden state across frames for temporal coherence.
/// Call `reset()` between utterances/sessions.
/// Silero LSTM state dimensions: (2, 1, 64) = 128 floats.
const LSTM_STATE_SIZE: usize = 2 * 1 * 64;

pub struct SileroVad {
    session: Session,
    /// Flat LSTM hidden state (shape: 2, 1, 64).
    h_state: Vec<f32>,
    /// Flat LSTM cell state (shape: 2, 1, 64).
    c_state: Vec<f32>,
    /// Speech detection threshold (0.0 - 1.0).
    threshold: f32,
    /// Negative threshold for hysteresis (prevents toggling).
    neg_threshold: f32,
    /// Current speech state (for hysteresis).
    currently_speaking: bool,
    /// Number of consecutive non-speech frames (for trailing silence detection).
    silence_frames: usize,
    /// Minimum silence frames before declaring end-of-speech.
    min_silence_frames: usize,
}

impl SileroVad {
    /// Load the Silero VAD ONNX model.
    ///
    /// # Arguments
    /// * `model_path` - Path to the `silero_vad.onnx` model file.
    /// * `threshold` - Speech detection threshold (default: 0.5).
    pub fn new(model_path: &str, threshold: Option<f32>) -> Result<Self> {
        let path = Path::new(model_path);
        info!(path = %path.display(), "Loading Silero VAD model...");

        let session = Session::builder()
            .context("Failed to create ONNX session builder")?
            .commit_from_file(path)
            .context("Failed to load Silero VAD ONNX model")?;

        let thresh = threshold.unwrap_or(0.5);
        let neg_thresh = thresh - 0.15; // Hysteresis gap

        info!(threshold = thresh, "Silero VAD model loaded");

        Ok(Self {
            session,
            h_state: vec![0.0f32; LSTM_STATE_SIZE],
            c_state: vec![0.0f32; LSTM_STATE_SIZE],
            threshold: thresh,
            neg_threshold: neg_thresh.max(0.05),
            currently_speaking: false,
            silence_frames: 0,
            min_silence_frames: 8, // ~256ms of silence before end-of-speech
        })
    }

    /// Process a single 512-sample frame and return VAD result.
    ///
    /// The frame must be exactly 512 samples of 16kHz mono f32 audio.
    /// Internal LSTM state is updated across calls for temporal coherence.
    pub fn is_speech(&mut self, frame: &[f32]) -> Result<VadResult> {
        if frame.len() != VAD_FRAME_SAMPLES {
            anyhow::bail!(
                "VAD frame must be exactly {} samples, got {}",
                VAD_FRAME_SAMPLES,
                frame.len()
            );
        }

        // Prepare input tensors using ort v2 (shape_tuple, Vec<T>) API
        let input = Value::from_array(([1usize, VAD_FRAME_SAMPLES], frame.to_vec()))
            .context("Failed to create input tensor")?;
        let sr = Value::from_array(([1usize], vec![VAD_SAMPLE_RATE as i64]))
            .context("Failed to create sample rate tensor")?;
        let h = Value::from_array(([2usize, 1, 64], self.h_state.clone()))
            .context("Failed to create h_state tensor")?;
        let c = Value::from_array(([2usize, 1, 64], self.c_state.clone()))
            .context("Failed to create c_state tensor")?;

        // Run ONNX inference
        let outputs = self.session.run(ort::inputs![input, sr, h, c])
            .context("Silero VAD inference failed")?;

        // Extract speech probability from output tuple (Shape, &[f32])
        let output_data = outputs[0].try_extract_tensor::<f32>()
            .context("Failed to extract speech probability")?;
        let speech_probability = output_data.1[0];

        // Update LSTM hidden states for next frame
        let h_out = outputs[1].try_extract_tensor::<f32>()
            .context("Failed to extract h_state output")?;
        let c_out = outputs[2].try_extract_tensor::<f32>()
            .context("Failed to extract c_state output")?;
        self.h_state = h_out.1.to_vec();
        self.c_state = c_out.1.to_vec();

        // Apply hysteresis threshold
        let is_speech = if self.currently_speaking {
            // Currently speaking: stay in speech until below negative threshold
            if speech_probability < self.neg_threshold {
                self.silence_frames += 1;
                if self.silence_frames >= self.min_silence_frames {
                    self.currently_speaking = false;
                    self.silence_frames = 0;
                    false
                } else {
                    true // Still in grace period
                }
            } else {
                self.silence_frames = 0;
                true
            }
        } else {
            // Not speaking: trigger on high threshold
            if speech_probability >= self.threshold {
                self.currently_speaking = true;
                self.silence_frames = 0;
                true
            } else {
                false
            }
        };

        debug!(
            prob = format!("{:.3}", speech_probability),
            is_speech,
            speaking = self.currently_speaking,
            silence_frames = self.silence_frames,
        );

        Ok(VadResult {
            speech_probability,
            is_speech,
        })
    }

    /// Reset VAD state for a new utterance/session.
    pub fn reset(&mut self) {
        self.h_state.iter_mut().for_each(|v| *v = 0.0);
        self.c_state.iter_mut().for_each(|v| *v = 0.0);
        self.currently_speaking = false;
        self.silence_frames = 0;
        debug!("Silero VAD state reset");
    }

    /// Whether the VAD currently considers the speaker active.
    pub fn is_currently_speaking(&self) -> bool {
        self.currently_speaking
    }

    /// Get the configured speech threshold.
    pub fn threshold(&self) -> f32 {
        self.threshold
    }

    /// Number of consecutive silence frames since last speech.
    pub fn silence_frame_count(&self) -> usize {
        self.silence_frames
    }
}

/// Lightweight energy-based VAD fallback when the Silero model isn't available.
///
/// Uses RMS energy with a configurable threshold. Less accurate than neural VAD
/// but requires no model files and runs with zero latency.
pub struct EnergyVad {
    threshold: f32,
    currently_speaking: bool,
    silence_frames: usize,
    min_silence_frames: usize,
}

impl EnergyVad {
    /// Create with default threshold (~-40 dBFS).
    pub fn new() -> Self {
        Self {
            threshold: 0.01,
            currently_speaking: false,
            silence_frames: 0,
            min_silence_frames: 8,
        }
    }

    /// Process a frame and return whether speech is detected.
    pub fn is_speech(&mut self, samples: &[f32]) -> bool {
        if samples.is_empty() {
            return false;
        }

        let sum_sq: f32 = samples.iter().map(|&s| s * s).sum();
        let rms = (sum_sq / samples.len() as f32).sqrt();
        let has_energy = rms > self.threshold;

        if self.currently_speaking {
            if !has_energy {
                self.silence_frames += 1;
                if self.silence_frames >= self.min_silence_frames {
                    self.currently_speaking = false;
                    self.silence_frames = 0;
                    return false;
                }
                return true; // Grace period
            }
            self.silence_frames = 0;
            true
        } else {
            if has_energy {
                self.currently_speaking = true;
                self.silence_frames = 0;
                true
            } else {
                false
            }
        }
    }

    pub fn reset(&mut self) {
        self.currently_speaking = false;
        self.silence_frames = 0;
    }
}

impl Default for EnergyVad {
    fn default() -> Self {
        Self::new()
    }
}

/// Unified VAD interface supporting both Silero neural and energy-based fallback.
pub enum VadEngine {
    /// Neural VAD via Silero ONNX model (preferred).
    Silero(SileroVad),
    /// Simple energy-based fallback.
    Energy(EnergyVad),
}

impl VadEngine {
    /// Load Silero VAD, falling back to energy-based if model unavailable.
    pub fn new(silero_model_path: Option<&str>) -> Self {
        if let Some(path) = silero_model_path {
            match SileroVad::new(path, None) {
                Ok(vad) => {
                    info!("Using Silero neural VAD");
                    return VadEngine::Silero(vad);
                }
                Err(e) => {
                    tracing::warn!(error = %e, "Silero VAD failed to load, using energy-based fallback");
                }
            }
        }
        info!("Using energy-based VAD fallback");
        VadEngine::Energy(EnergyVad::new())
    }

    /// Process audio samples and return speech detection result.
    ///
    /// For Silero: processes in 512-sample frames.
    /// For Energy: processes the entire buffer at once.
    pub fn is_speech(&mut self, samples: &[f32]) -> bool {
        match self {
            VadEngine::Silero(vad) => {
                // Process in VAD_FRAME_SAMPLES chunks, return true if any chunk has speech
                let mut has_speech = false;
                for chunk in samples.chunks(VAD_FRAME_SAMPLES) {
                    if chunk.len() == VAD_FRAME_SAMPLES {
                        match vad.is_speech(chunk) {
                            Ok(result) => {
                                if result.is_speech {
                                    has_speech = true;
                                }
                            }
                            Err(e) => {
                                debug!(error = %e, "Silero VAD frame error, assuming speech");
                                has_speech = true;
                            }
                        }
                    }
                }
                has_speech
            }
            VadEngine::Energy(vad) => vad.is_speech(samples),
        }
    }

    pub fn reset(&mut self) {
        match self {
            VadEngine::Silero(vad) => vad.reset(),
            VadEngine::Energy(vad) => vad.reset(),
        }
    }

    /// Human-readable name of the active VAD engine.
    pub fn engine_name(&self) -> &'static str {
        match self {
            VadEngine::Silero(_) => "silero",
            VadEngine::Energy(_) => "energy",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_energy_vad_silence() {
        let mut vad = EnergyVad::new();
        let silence = vec![0.0f32; 320];
        assert!(!vad.is_speech(&silence));
    }

    #[test]
    fn test_energy_vad_speech() {
        let mut vad = EnergyVad::new();
        let speech: Vec<f32> = (0..320)
            .map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 16000.0).sin() * 0.3)
            .collect();
        assert!(vad.is_speech(&speech));
    }

    #[test]
    fn test_energy_vad_hysteresis() {
        let mut vad = EnergyVad::new();

        // Trigger speech
        let speech: Vec<f32> = (0..320)
            .map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 16000.0).sin() * 0.3)
            .collect();
        assert!(vad.is_speech(&speech));

        // First silence frame should still be "speech" (grace period)
        let silence = vec![0.0f32; 320];
        assert!(vad.is_speech(&silence)); // Grace period active
    }

    #[test]
    fn test_energy_vad_reset() {
        let mut vad = EnergyVad::new();
        let speech: Vec<f32> = vec![0.3; 320];
        vad.is_speech(&speech);
        assert!(vad.currently_speaking);

        vad.reset();
        assert!(!vad.currently_speaking);
    }

    #[test]
    fn test_vad_engine_energy_fallback() {
        let engine = VadEngine::new(None);
        assert_eq!(engine.engine_name(), "energy");
    }

    #[test]
    fn test_vad_engine_invalid_silero_path_falls_back() {
        let engine = VadEngine::new(Some("/nonexistent/silero_vad.onnx"));
        assert_eq!(engine.engine_name(), "energy");
    }

    #[test]
    fn test_energy_vad_empty() {
        let mut vad = EnergyVad::new();
        assert!(!vad.is_speech(&[]));
    }
}
