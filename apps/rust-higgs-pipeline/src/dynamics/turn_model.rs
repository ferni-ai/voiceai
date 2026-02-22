//! Neural Turn Prediction Model
//!
//! Predicts whether the user has finished speaking.
//! <30M params, ONNX. Falls back to VAD + energy heuristics.

use ort::session::Session;
use ort::value::Value;
use std::path::Path;
use std::sync::Mutex;
use tracing::{debug, info, warn};

/// Turn completion prediction result.
#[derive(Debug, Clone)]
pub struct TurnPrediction {
    /// Probability that the user is done speaking (0.0-1.0).
    pub completion_probability: f32,
    /// Confidence in the prediction.
    pub confidence: f32,
    /// Whether to yield the turn to the agent.
    pub should_yield: bool,
}

/// Audio + text features for turn prediction.
#[derive(Debug, Clone)]
pub struct TurnFeatures {
    /// Energy contour of last 1s (10 values, 100ms each).
    pub energy_contour: [f32; 10],
    /// Pitch contour of last 1s.
    pub pitch_contour: [f32; 10],
    /// Pause history: durations of last 5 pauses in ms.
    pub pause_history: [u32; 5],
    /// Current silence duration in ms.
    pub silence_duration_ms: u32,
    /// Whether the last phrase seems syntactically complete.
    pub sentence_complete: bool,
    /// Speaking rate (syllables/sec).
    pub speaking_rate: f32,
    /// Total utterance duration so far in ms.
    pub utterance_duration_ms: u32,
}

/// Neural turn prediction model.
pub struct TurnPredictionModel {
    onnx_session: Option<Mutex<Session>>,
    use_neural: bool,
    /// Silence threshold for turn completion (ms).
    silence_threshold_ms: u32,
}

impl TurnPredictionModel {
    pub fn new(model_path: Option<&str>) -> Self {
        let (onnx_session, use_neural) = if let Some(path) = model_path {
            let path = Path::new(path);
            if path.exists() {
                match Session::builder().and_then(|b| b.commit_from_file(path)) {
                    Ok(session) => {
                        info!(path = %path.display(), "Loading neural turn prediction model");
                        (Some(Mutex::new(session)), true)
                    }
                    Err(e) => {
                        warn!(path = %path.display(), error = %e, "Turn ONNX load failed, using heuristics");
                        (None, false)
                    }
                }
            } else {
                warn!(path = %path.display(), "Turn model not found, using heuristics");
                (None, false)
            }
        } else {
            debug!("No turn model path, using heuristics");
            (None, false)
        };

        Self {
            onnx_session,
            use_neural,
            silence_threshold_ms: 700,
        }
    }

    /// Predict turn completion.
    pub fn predict(&self, features: &TurnFeatures) -> TurnPrediction {
        if self.use_neural {
            self.predict_neural(features)
        } else {
            self.predict_heuristic(features)
        }
    }

    fn predict_neural(&self, features: &TurnFeatures) -> TurnPrediction {
        let Some(session_guard) = &self.onnx_session else {
            return TurnPrediction {
                completion_probability: 0.0,
                confidence: 0.0,
                should_yield: false,
            };
        };
        let mut input_vec: Vec<f32> = Vec::with_capacity(29);
        input_vec.extend_from_slice(&features.energy_contour);
        input_vec.extend_from_slice(&features.pitch_contour);
        for &p in &features.pause_history {
            input_vec.push(p as f32 / 2000.0);
        }
        input_vec.push(features.silence_duration_ms as f32 / 2000.0);
        input_vec.push(if features.sentence_complete { 1.0 } else { 0.0 });
        input_vec.push(features.speaking_rate / 5.0);
        input_vec.push(features.utterance_duration_ms as f32 / 10000.0);

        let input = match Value::from_array(([1usize, 29], input_vec)) {
            Ok(t) => t,
            Err(_) => {
                return TurnPrediction {
                    completion_probability: 0.0,
                    confidence: 0.0,
                    should_yield: false,
                };
            }
        };
        let mut session = match session_guard.lock() {
            Ok(s) => s,
            Err(_) => {
                return TurnPrediction {
                    completion_probability: 0.0,
                    confidence: 0.0,
                    should_yield: false,
                };
            }
        };
        let outputs = match session.run(ort::inputs![input]) {
            Ok(o) => o,
            Err(_) => {
                return TurnPrediction {
                    completion_probability: 0.0,
                    confidence: 0.0,
                    should_yield: false,
                };
            }
        };
        let out = match outputs[0].try_extract_tensor::<f32>() {
            Ok((_, data)) => data,
            Err(_) => {
                return TurnPrediction {
                    completion_probability: 0.0,
                    confidence: 0.0,
                    should_yield: false,
                };
            }
        };
        let prob = if out.is_empty() {
            0.0f32
        } else if out.len() >= 2 {
            let exp_yield = out[1].exp();
            let exp_hold = out[0].exp();
            (exp_yield / (exp_yield + exp_hold)).min(1.0).max(0.0)
        } else {
            (out[0].exp() / (1.0 + out[0].exp())).min(1.0).max(0.0)
        };
        TurnPrediction {
            completion_probability: prob,
            confidence: 0.8,
            should_yield: prob > 0.6,
        }
    }

    fn predict_heuristic(&self, features: &TurnFeatures) -> TurnPrediction {
        let mut prob: f32 = 0.0;

        // Rule 1: Silence duration
        if features.silence_duration_ms > self.silence_threshold_ms {
            prob += 0.5;
        } else if features.silence_duration_ms > 400 {
            prob += 0.2;
        }

        // Rule 2: Energy trailing off
        let last_3_energy: f32 = features.energy_contour[7..10].iter().sum::<f32>() / 3.0;
        let first_3_energy: f32 = features.energy_contour[0..3].iter().sum::<f32>() / 3.0;
        if last_3_energy < first_3_energy * 0.5 {
            prob += 0.2;
        }

        // Rule 3: Pitch dropping (declarative ending)
        let last_pitch = features.pitch_contour[9];
        let mid_pitch = features.pitch_contour[5];
        if mid_pitch > 0.0 && last_pitch < mid_pitch * 0.85 {
            prob += 0.15;
        }

        // Rule 4: Sentence completeness
        if features.sentence_complete {
            prob += 0.25;
        }

        // Rule 5: Very short utterance (< 500ms) less likely to be complete
        if features.utterance_duration_ms < 500 {
            prob *= 0.5;
        }

        let should_yield = prob > 0.6;

        TurnPrediction {
            completion_probability: prob.min(1.0),
            confidence: 0.5,
            should_yield,
        }
    }
}
