//! Backchannel system for full-duplex voice — pre-synthesized affirmations
//! ("mm-hmm", "yeah", "right", "oh") for active listening feedback.
//!
//! Requires `full-duplex` feature.

use std::f32::consts::PI;
use std::time::Instant;

use tracing::trace;

/// Sample rate for backchannel audio (matches mixer/TTS).
const SAMPLE_RATE: u32 = 24000;

/// Duration of each backchannel in seconds.
const BC_DURATION_SEC: f32 = 0.15;

/// Backchannel phrase types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum BackchannelType {
    MmHmm,
    Yeah,
    Right,
    Oh,
    Uh,
}

impl BackchannelType {
    pub fn as_str(&self) -> &'static str {
        match self {
            BackchannelType::MmHmm => "mm-hmm",
            BackchannelType::Yeah => "yeah",
            BackchannelType::Right => "right",
            BackchannelType::Oh => "oh",
            BackchannelType::Uh => "uh",
        }
    }
}

/// Generate a simple placeholder tone (sine-based) for a backchannel type.
///
/// Each type has a slightly different frequency and envelope for variety.
fn generate_placeholder_audio(bc_type: BackchannelType) -> Vec<f32> {
    let num_samples = (SAMPLE_RATE as f32 * BC_DURATION_SEC) as usize;
    let mut buf = Vec::with_capacity(num_samples);

    let (freq, decay) = match bc_type {
        BackchannelType::MmHmm => (200.0, 0.7),
        BackchannelType::Yeah => (250.0, 0.8),
        BackchannelType::Right => (180.0, 0.75),
        BackchannelType::Oh => (220.0, 0.85),
        BackchannelType::Uh => (190.0, 0.65),
    };

    for i in 0..num_samples {
        let t = i as f32 / SAMPLE_RATE as f32;
        let envelope = 1.0 - (i as f32 / num_samples as f32) * (1.0 - decay);
        let sample = (2.0 * PI * freq * t).sin() * envelope * 0.3;
        buf.push(sample.clamp(-1.0, 1.0));
    }

    buf
}

/// Engine for backchannel emission decisions and audio retrieval.
pub struct BackchannelEngine {
    bank: std::collections::HashMap<BackchannelType, Vec<f32>>,
    /// Last time user started speaking (for pause heuristic).
    user_speech_start: Option<Instant>,
    /// Last time we emitted a backchannel (cooldown).
    last_emit: Option<Instant>,
    /// Minimum pause after user speech before we can emit (ms).
    min_pause_after_speech_ms: u64,
    /// Cooldown between backchannels (ms).
    cooldown_ms: u64,
}

impl BackchannelEngine {
    pub fn new() -> Self {
        let mut bank = std::collections::HashMap::new();
        for bc_type in [
            BackchannelType::MmHmm,
            BackchannelType::Yeah,
            BackchannelType::Right,
            BackchannelType::Oh,
            BackchannelType::Uh,
        ] {
            bank.insert(bc_type, generate_placeholder_audio(bc_type));
        }
        Self {
            bank,
            user_speech_start: None,
            last_emit: None,
            min_pause_after_speech_ms: 2000,
            cooldown_ms: 1500,
        }
    }

    /// Update user speech state. Call when user starts speaking.
    pub fn on_user_speech_start(&mut self) {
        self.user_speech_start = Some(Instant::now());
    }

    /// Decide whether to emit a backchannel.
    ///
    /// Heuristics:
    /// - Emit when user pauses (vad_active=false) after speaking >2s
    /// - Emit when partial transcript ends with a question mark
    /// - Never emit when agent is speaking
    pub fn should_emit(
        &mut self,
        vad_active: bool,
        partial_transcript: &str,
        agent_speaking: bool,
    ) -> Option<BackchannelType> {
        if agent_speaking {
            return None;
        }

        let now = Instant::now();

        // Cooldown
        if let Some(last) = self.last_emit {
            if now.duration_since(last).as_millis() < self.cooldown_ms as u128 {
                return None;
            }
        }

        // User asked a question (partial ends with ?)
        if partial_transcript.trim_end().ends_with('?') {
            self.last_emit = Some(now);
            trace!("Backchannel: question detected, emitting MmHmm");
            return Some(BackchannelType::MmHmm);
        }

        // User paused after speaking
        if !vad_active {
            if let Some(start) = self.user_speech_start {
                let elapsed_ms = now.duration_since(start).as_millis();
                if elapsed_ms >= self.min_pause_after_speech_ms as u128 {
                    self.last_emit = Some(now);
                    self.user_speech_start = None;
                    trace!(
                        elapsed_ms,
                        "Backchannel: user paused after speaking, emitting Yeah"
                    );
                    return Some(BackchannelType::Yeah);
                }
            }
        } else {
            self.user_speech_start = Some(now);
        }

        None
    }

    /// Get PCM audio for a backchannel type.
    pub fn get_audio(&self, bc_type: BackchannelType) -> &[f32] {
        self.bank
            .get(&bc_type)
            .map(|v| v.as_slice())
            .unwrap_or(&[])
    }

    /// Predict backchannel using the dynamics engine (neural or heuristic).
    pub fn should_emit_with_dynamics(
        &self,
        dynamics: &dyn crate::dynamics::DynamicsEngine,
        audio_features: &crate::dynamics::backchannel_model::AudioFeatures,
        partial_transcript: &str,
    ) -> Option<BackchannelType> {
        let prediction = dynamics.predict_backchannel(audio_features, partial_transcript);
        if prediction.probability > 0.5 {
            match prediction.bc_type {
                crate::dynamics::backchannel_model::BackchannelType::Verbal => {
                    Some(BackchannelType::MmHmm)
                }
                crate::dynamics::backchannel_model::BackchannelType::Nonverbal => {
                    Some(BackchannelType::Uh)
                }
                crate::dynamics::backchannel_model::BackchannelType::None => None,
            }
        } else {
            None
        }
    }
}

impl Default for BackchannelEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_backchannel_audio_generated() {
        let engine = BackchannelEngine::new();
        let audio = engine.get_audio(BackchannelType::MmHmm);
        assert!(!audio.is_empty());
        assert_eq!(
            audio.len(),
            (SAMPLE_RATE as f32 * BC_DURATION_SEC) as usize
        );
    }

    #[test]
    fn test_no_emit_when_agent_speaking() {
        let mut engine = BackchannelEngine::new();
        assert!(engine
            .should_emit(true, "hello?", true)
            .is_none());
    }

    #[test]
    fn test_emit_on_question() {
        let mut engine = BackchannelEngine::new();
        let bc = engine.should_emit(false, "how are you? ", false);
        assert_eq!(bc, Some(BackchannelType::MmHmm));
    }
}
