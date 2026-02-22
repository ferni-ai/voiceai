//! Neural Backchannel Timing Model
//!
//! Predicts when to emit backchannels based on audio features and transcript.
//! <50M params, exported as ONNX for Rust inference.
//! Falls back to heuristic rules when model is unavailable.

use ort::session::Session;
use ort::value::Value;
use std::path::Path;
use std::sync::Mutex;
use tracing::{debug, info, warn};

/// Backchannel type prediction.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BackchannelType {
    Verbal,    // "mm-hmm", "yeah", "right"
    Nonverbal, // head nod, "uh-huh"
    None,
}

/// Audio features for backchannel prediction (last 2s window).
#[derive(Debug, Clone)]
pub struct AudioFeatures {
    /// Mean energy over window (0.0-1.0).
    pub energy_mean: f32,
    /// Energy slope (declining = about to pause).
    pub energy_slope: f32,
    /// Mean pitch Hz.
    pub pitch_mean: f32,
    /// Pitch slope (falling = statement ending).
    pub pitch_slope: f32,
    /// Current pause duration in ms (0 if still speaking).
    pub pause_duration_ms: u32,
    /// Number of pauses in window.
    pub pause_count: u32,
    /// Speaking rate (syllables/sec).
    pub speaking_rate: f32,
}

/// Backchannel prediction result.
#[derive(Debug, Clone)]
pub struct BackchannelPrediction {
    pub probability: f32,
    pub bc_type: BackchannelType,
    pub confidence: f32,
}

/// Build AudioFeatures from a rolling window of f32 PCM (e.g. last 2s at 16kHz).
/// Used by ws_handler to feed the dynamics engine.
pub fn audio_features_from_window(window: &[f32], _sample_rate: u32) -> AudioFeatures {
    if window.is_empty() {
        return AudioFeatures {
            energy_mean: 0.0,
            energy_slope: 0.0,
            pitch_mean: 200.0,
            pitch_slope: 0.0,
            pause_duration_ms: 0,
            pause_count: 0,
            speaking_rate: 3.0,
        };
    }
    let n = window.len();
    let rms = (window.iter().map(|x| x * x).sum::<f32>() / n as f32).sqrt();
    let half = n / 2;
    let first_half_rms = if half > 0 {
        (window[..half].iter().map(|x| x * x).sum::<f32>() / half as f32).sqrt()
    } else {
        rms
    };
    let second_half_rms = if n - half > 0 {
        (window[half..].iter().map(|x| x * x).sum::<f32>() / (n - half) as f32).sqrt()
    } else {
        rms
    };
    let energy_slope = second_half_rms - first_half_rms;
    AudioFeatures {
        energy_mean: rms.min(1.0),
        energy_slope,
        pitch_mean: 200.0,
        pitch_slope: 0.0,
        pause_duration_ms: 0,
        pause_count: 0,
        speaking_rate: 3.0,
    }
}

/// Neural backchannel timing model.
pub struct BackchannelTimingModel {
    /// ONNX session (None = heuristic fallback).
    onnx_session: Option<Mutex<Session>>,
    use_neural: bool,
}

impl BackchannelTimingModel {
    /// Create model, loading ONNX if available.
    pub fn new(model_path: Option<&str>) -> Self {
        let (onnx_session, use_neural) = if let Some(path) = model_path {
            let path = Path::new(path);
            if path.exists() {
                match Session::builder().and_then(|b| b.commit_from_file(path)) {
                    Ok(session) => {
                        info!(path = %path.display(), "Loading neural backchannel model");
                        (Some(Mutex::new(session)), true)
                    }
                    Err(e) => {
                        warn!(path = %path.display(), error = %e, "Backchannel ONNX load failed, using heuristics");
                        (None, false)
                    }
                }
            } else {
                warn!(path = %path.display(), "Backchannel model not found, using heuristics");
                (None, false)
            }
        } else {
            debug!("No backchannel model path, using heuristics");
            (None, false)
        };

        Self {
            onnx_session,
            use_neural,
        }
    }

    /// Predict backchannel timing from audio features.
    pub fn predict(
        &self,
        features: &AudioFeatures,
        _transcript_fragment: &str,
    ) -> BackchannelPrediction {
        if self.use_neural {
            self.predict_neural(features, _transcript_fragment)
        } else {
            self.predict_heuristic(features, _transcript_fragment)
        }
    }

    /// Neural model prediction (when ONNX model is loaded).
    fn predict_neural(
        &self,
        features: &AudioFeatures,
        _transcript: &str,
    ) -> BackchannelPrediction {
        let Some(session_guard) = &self.onnx_session else {
            return BackchannelPrediction {
                probability: 0.0,
                bc_type: BackchannelType::None,
                confidence: 0.0,
            };
        };
        let input_vec = [
            features.energy_mean,
            features.energy_slope,
            features.pitch_mean / 500.0f32,
            features.pitch_slope / 100.0f32,
            features.pause_duration_ms as f32 / 2000.0,
            features.pause_count as f32 / 10.0,
            features.speaking_rate / 5.0,
        ];
        let input = match Value::from_array(([1usize, 7], input_vec.to_vec())) {
            Ok(t) => t,
            Err(_) => {
                return BackchannelPrediction {
                    probability: 0.0,
                    bc_type: BackchannelType::None,
                    confidence: 0.0,
                };
            }
        };
        let mut session = match session_guard.lock() {
            Ok(s) => s,
            Err(_) => {
                return BackchannelPrediction {
                    probability: 0.0,
                    bc_type: BackchannelType::None,
                    confidence: 0.0,
                };
            }
        };
        let outputs = match session.run(ort::inputs![input]) {
            Ok(o) => o,
            Err(_) => {
                return BackchannelPrediction {
                    probability: 0.0,
                    bc_type: BackchannelType::None,
                    confidence: 0.0,
                };
            }
        };
        let logits = match outputs[0].try_extract_tensor::<f32>() {
            Ok((_, data)) => data,
            Err(_) => {
                return BackchannelPrediction {
                    probability: 0.0,
                    bc_type: BackchannelType::None,
                    confidence: 0.0,
                };
            }
        };
        if logits.len() < 3 {
            return BackchannelPrediction {
                probability: 0.0,
                bc_type: BackchannelType::None,
                confidence: 0.0,
            };
        }
        let max_idx = if logits[0] >= logits[1] && logits[0] >= logits[2] {
            0
        } else if logits[1] >= logits[2] {
            1
        } else {
            2
        };
        let exp0 = logits[0].exp();
        let exp1 = logits[1].exp();
        let exp2 = logits[2].exp();
        let sum = exp0 + exp1 + exp2;
        let probs = [exp0 / sum, exp1 / sum, exp2 / sum];
        let probability = probs[max_idx];
        let bc_type = match max_idx {
            0 => BackchannelType::Verbal,
            1 => BackchannelType::Nonverbal,
            _ => BackchannelType::None,
        };
        BackchannelPrediction {
            probability,
            bc_type,
            confidence: 0.8,
        }
    }

    /// Heuristic-based backchannel prediction (fallback).
    fn predict_heuristic(&self, features: &AudioFeatures, transcript: &str) -> BackchannelPrediction {
        let mut probability: f32 = 0.0;

        // Rule 1: Pause after speech → likely backchannel moment
        if features.pause_duration_ms > 300 && features.pause_duration_ms < 2000 {
            probability += 0.3;
        }

        // Rule 2: Falling pitch → end of phrase
        if features.pitch_slope < -10.0 {
            probability += 0.2;
        }

        // Rule 3: Energy decline → speaker winding down
        if features.energy_slope < -0.1 {
            probability += 0.15;
        }

        // Rule 4: Question detected in transcript
        if transcript.trim_end().ends_with('?') {
            probability += 0.25;
        }

        // Rule 5: Long utterance → listener feedback expected
        if features.speaking_rate > 0.0 && features.pause_count > 2 {
            probability += 0.1;
        }

        let bc_type = if probability > 0.5 {
            if features.pause_duration_ms > 500 {
                BackchannelType::Verbal
            } else {
                BackchannelType::Nonverbal
            }
        } else {
            BackchannelType::None
        };

        BackchannelPrediction {
            probability: probability.min(1.0),
            bc_type,
            confidence: if self.use_neural { 0.8 } else { 0.5 },
        }
    }
}
