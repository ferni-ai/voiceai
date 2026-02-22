//! Learned Conversation Dynamics
//!
//! Neural models for backchannel timing and turn prediction,
//! replacing hand-engineered heuristics.

pub mod backchannel_model;
pub mod turn_model;

/// Trait for conversation dynamics prediction.
/// Implementations can be heuristic (default) or neural (ONNX).
pub trait DynamicsEngine: Send + Sync {
    fn predict_backchannel(
        &self,
        features: &backchannel_model::AudioFeatures,
        transcript: &str,
    ) -> backchannel_model::BackchannelPrediction;
    fn predict_turn_completion(
        &self,
        features: &turn_model::TurnFeatures,
    ) -> turn_model::TurnPrediction;
    fn name(&self) -> &str;
}

/// Heuristic-based dynamics (default, no model needed).
pub struct HeuristicDynamics {
    backchannel: backchannel_model::BackchannelTimingModel,
    turn: turn_model::TurnPredictionModel,
}

impl HeuristicDynamics {
    pub fn new() -> Self {
        Self {
            backchannel: backchannel_model::BackchannelTimingModel::new(None),
            turn: turn_model::TurnPredictionModel::new(None),
        }
    }
}

impl Default for HeuristicDynamics {
    fn default() -> Self {
        Self::new()
    }
}

impl DynamicsEngine for HeuristicDynamics {
    fn predict_backchannel(
        &self,
        features: &backchannel_model::AudioFeatures,
        transcript: &str,
    ) -> backchannel_model::BackchannelPrediction {
        self.backchannel.predict(features, transcript)
    }

    fn predict_turn_completion(
        &self,
        features: &turn_model::TurnFeatures,
    ) -> turn_model::TurnPrediction {
        self.turn.predict(features)
    }

    fn name(&self) -> &str {
        "heuristic"
    }
}

/// Neural dynamics (ONNX models).
pub struct NeuralDynamics {
    backchannel: backchannel_model::BackchannelTimingModel,
    turn: turn_model::TurnPredictionModel,
}

impl NeuralDynamics {
    pub fn new(backchannel_path: Option<&str>, turn_path: Option<&str>) -> Self {
        Self {
            backchannel: backchannel_model::BackchannelTimingModel::new(backchannel_path),
            turn: turn_model::TurnPredictionModel::new(turn_path),
        }
    }
}

impl DynamicsEngine for NeuralDynamics {
    fn predict_backchannel(
        &self,
        features: &backchannel_model::AudioFeatures,
        transcript: &str,
    ) -> backchannel_model::BackchannelPrediction {
        self.backchannel.predict(features, transcript)
    }

    fn predict_turn_completion(
        &self,
        features: &turn_model::TurnFeatures,
    ) -> turn_model::TurnPrediction {
        self.turn.predict(features)
    }

    fn name(&self) -> &str {
        "neural"
    }
}

/// Create dynamics engine from environment config.
/// DYNAMICS_ENGINE=heuristic|neural
pub fn create_dynamics_engine() -> Box<dyn DynamicsEngine> {
    let engine_type = std::env::var("DYNAMICS_ENGINE").unwrap_or_else(|_| "heuristic".into());
    match engine_type.as_str() {
        "neural" => {
            let bc_path = std::env::var("BACKCHANNEL_MODEL_PATH").ok();
            let turn_path = std::env::var("TURN_MODEL_PATH").ok();
            Box::new(NeuralDynamics::new(
                bc_path.as_deref(),
                turn_path.as_deref(),
            ))
        }
        _ => Box::new(HeuristicDynamics::new()),
    }
}
