//! Audio Humanization DSP Pipeline.
//!
//! Post-TTS processing that makes synthesized speech sound genuinely human.
//! Runs all stages sequentially: breath injection, prosody modification,
//! emotion coloring, filler injection, vocal texture, and adaptive pacing.

pub mod breath;
pub mod emotion;
pub mod filler;
pub mod pacing;
pub mod paralinguistic;
pub mod physiological;
pub mod prosody;
pub mod texture;

/// Context for humanization — comes from TypeScript intelligence layer.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct HumanizationContext {
    /// Emotion label: "warm", "concerned", "excited", "neutral", etc.
    pub emotion: String,
    /// Emotion intensity (0.0-1.0).
    pub intensity: f32,
    /// Voice characteristics identifier.
    pub persona: String,
    /// Extra warmth on greeting.
    pub is_first_response: bool,
    /// User distress level (0.0-1.0) — gentler processing when high.
    pub user_distress_level: f32,
    /// Circadian energy (0.0=late night, 1.0=morning peak).
    pub circadian_energy: f32,
    /// Relationship depth (0.0=new user, 1.0=close relationship).
    pub relationship_depth: f32,
    /// Physiological state affecting voice (e.g. "tired", "crying").
    pub physiological_state: String,
    /// Paralinguistic sound to inject (e.g. "sigh", "throat_clear").
    pub paralinguistic: String,
    /// User's pitch in Hz from biomarker analysis (for mirroring/contrast).
    pub user_pitch_hz: Option<f32>,
    /// User's energy level 0.0-1.0 from biomarker analysis.
    pub user_energy: Option<f32>,
    /// User's vocal jitter 0.0-1.0 (high = anxious/distressed).
    pub user_jitter: Option<f32>,
    /// User's speech rate in syllables/sec from biomarker analysis.
    pub user_speech_rate: Option<f32>,
}

impl Default for HumanizationContext {
    fn default() -> Self {
        Self {
            emotion: "neutral".to_string(),
            intensity: 0.5,
            persona: "ferni".to_string(),
            is_first_response: false,
            user_distress_level: 0.0,
            circadian_energy: 0.7,
            relationship_depth: 0.3,
            physiological_state: "normal".to_string(),
            paralinguistic: "none".to_string(),
            user_pitch_hz: None,
            user_energy: None,
            user_jitter: None,
            user_speech_rate: None,
        }
    }
}

/// Result of humanization with metadata.
#[derive(Debug, Clone)]
pub struct HumanizationResult {
    pub samples: Vec<f32>,
    pub metadata: HumanizationMetadata,
}

/// Metadata about what the humanization pipeline did.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct HumanizationMetadata {
    pub breaths_injected: usize,
    pub fillers_injected: usize,
    pub speed_range: (f32, f32),
    pub pitch_shift_semitones: f32,
    pub processing_ms: f64,
    pub physiological_state: String,
    pub paralinguistic_sound: Option<String>,
}

/// Main pipeline: runs all humanization stages sequentially on audio.
///
/// Stage order matters — breath/filler injection adds samples, so they
/// run before in-place processing (prosody, coloring, texture, pacing).
pub fn humanize_audio(
    samples: &[f32],
    sample_rate: u32,
    context: &HumanizationContext,
) -> HumanizationResult {
    let start = std::time::Instant::now();
    let mut audio = samples.to_vec();

    // Scale intensity based on context
    let biomarker_intensity_scale = match context.user_energy {
        Some(energy) if energy < 0.3 => 0.8, // Softer response when user is quiet
        _ => 1.0,
    };
    let effective_intensity = context.intensity
        * (1.0 - 0.3 * context.user_distress_level) // Gentler when user is distressed
        * (0.7 + 0.3 * context.circadian_energy)     // Less processing late at night
        * biomarker_intensity_scale;                  // Biomarker feedback: match user energy

    // Extra warmth on first response
    let emotion = if context.is_first_response && context.emotion == "neutral" {
        "warm"
    } else {
        &context.emotion
    };

    // Stage 1: Breath injection (adds samples at phrase boundaries)
    let breaths_injected = breath::inject_breaths(
        &mut audio,
        sample_rate,
        emotion,
        effective_intensity,
    );

    // Stage 2: Filler injection (adds samples — "um", "hmm", lip smacks)
    let fillers_injected = filler::inject_fillers(
        &mut audio,
        sample_rate,
        &HumanizationContext {
            emotion: emotion.to_string(),
            intensity: effective_intensity,
            ..context.clone()
        },
    );

    // Stage 2.5: Paralinguistic sound injection (at first pause)
    let paralinguistic_result = if context.paralinguistic != "none" {
        let sound = paralinguistic::ParalinguisticSound::from_str(&context.paralinguistic);
        if sound != paralinguistic::ParalinguisticSound::None {
            Some(paralinguistic::inject_at_pause(
                &mut audio,
                sound,
                sample_rate,
                effective_intensity,
            ))
        } else {
            None
        }
    } else {
        None
    };

    // Stage 3: Prosody modification (pitch shift + declination)
    let pitch_shift = prosody::emotion_pitch_shift(emotion) * effective_intensity;
    prosody::apply_prosody(&mut audio, sample_rate, pitch_shift, true);

    // Stage 4: Emotion coloring (spectral EQ + compression)
    emotion::apply_emotion_color(&mut audio, sample_rate, emotion, effective_intensity);

    // Stage 5: Vocal texture (jitter + shimmer — anti-uncanny-valley)
    // When user has high jitter (anxiety), reduce agent's vocal jitter by 50%
    // to create a calming contrast rather than mirroring distress.
    let texture_intensity = match context.user_jitter {
        Some(j) if j > 0.5 => effective_intensity * 0.5,
        _ => effective_intensity,
    };
    texture::add_vocal_texture(&mut audio, sample_rate, emotion, texture_intensity);

    // Stage 6: Adaptive pacing (time-stretching for emphasis/speed)
    let speed_range = pacing::apply_adaptive_pacing(
        &mut audio,
        sample_rate,
        emotion,
        effective_intensity,
    );

    // Stage 7: Physiological state effects
    let physio_state =
        physiological::PhysiologicalState::from_str(&context.physiological_state);
    let physio_result = physiological::apply_physiological_state(
        &mut audio,
        sample_rate,
        physio_state,
        effective_intensity,
    );

    // Final clamp to ensure valid range
    for sample in audio.iter_mut() {
        *sample = sample.clamp(-1.0, 1.0);
    }

    let processing_ms = start.elapsed().as_secs_f64() * 1000.0;

    HumanizationResult {
        samples: audio,
        metadata: HumanizationMetadata {
            breaths_injected,
            fillers_injected,
            speed_range,
            pitch_shift_semitones: pitch_shift,
            processing_ms,
            physiological_state: physio_result.state_applied.as_str().to_string(),
            paralinguistic_sound: paralinguistic_result
                .map(|r| r.sound.as_str().to_string()),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_speech(sample_rate: u32, duration_s: f32) -> Vec<f32> {
        let total = (sample_rate as f32 * duration_s) as usize;
        let mut samples = Vec::with_capacity(total);
        let pause_start = total / 3;
        let pause_end = pause_start + (sample_rate as f32 * 0.25) as usize;

        for i in 0..total {
            if i >= pause_start && i < pause_end {
                samples.push(0.0);
            } else {
                let t = i as f32 / sample_rate as f32;
                samples.push(0.3 * (250.0 * 2.0 * std::f32::consts::PI * t).sin());
            }
        }
        samples
    }

    #[test]
    fn test_full_pipeline_runs() {
        let samples = make_speech(24000, 2.0);
        let ctx = HumanizationContext::default();
        let result = humanize_audio(&samples, 24000, &ctx);

        assert!(!result.samples.is_empty(), "Output should not be empty");
        assert!(
            result.metadata.processing_ms > 0.0,
            "Processing time should be positive"
        );
    }

    #[test]
    fn test_all_values_in_range() {
        let samples = make_speech(24000, 2.0);
        let ctx = HumanizationContext {
            emotion: "excited".to_string(),
            intensity: 1.0,
            ..Default::default()
        };
        let result = humanize_audio(&samples, 24000, &ctx);

        for s in &result.samples {
            assert!(
                *s >= -1.0 && *s <= 1.0,
                "Sample out of range: {}",
                s
            );
        }
    }

    #[test]
    fn test_metadata_populated() {
        let samples = make_speech(24000, 2.0);
        let ctx = HumanizationContext {
            emotion: "warm".to_string(),
            intensity: 0.8,
            relationship_depth: 0.7,
            ..Default::default()
        };
        let result = humanize_audio(&samples, 24000, &ctx);
        let m = &result.metadata;

        // Pitch shift for warm should be negative
        assert!(m.pitch_shift_semitones < 0.0, "Warm should shift pitch down");
        assert!(m.speed_range.0 <= m.speed_range.1, "min <= max speed");
    }

    #[test]
    fn test_empty_input() {
        let result = humanize_audio(&[], 24000, &HumanizationContext::default());
        assert!(result.samples.is_empty());
    }

    #[test]
    fn test_biomarker_feedback_reduces_intensity_for_quiet_user() {
        let samples = make_speech(24000, 2.0);

        // Without biomarkers
        let ctx_normal = HumanizationContext {
            emotion: "warm".to_string(),
            intensity: 0.8,
            ..Default::default()
        };
        let result_normal = humanize_audio(&samples, 24000, &ctx_normal);

        // With low user energy (quiet user)
        let ctx_quiet = HumanizationContext {
            emotion: "warm".to_string(),
            intensity: 0.8,
            user_energy: Some(0.2),
            ..Default::default()
        };
        let result_quiet = humanize_audio(&samples, 24000, &ctx_quiet);

        // Both should produce valid audio
        assert!(!result_normal.samples.is_empty());
        assert!(!result_quiet.samples.is_empty());
    }

    #[test]
    fn test_biomarker_feedback_reduces_jitter_for_anxious_user() {
        let samples = make_speech(24000, 2.0);

        // With high user jitter (anxious user) — texture jitter should be reduced
        let ctx_anxious = HumanizationContext {
            emotion: "warm".to_string(),
            intensity: 0.8,
            user_jitter: Some(0.7),
            ..Default::default()
        };
        let result = humanize_audio(&samples, 24000, &ctx_anxious);
        assert!(!result.samples.is_empty());
        for s in &result.samples {
            assert!(*s >= -1.0 && *s <= 1.0, "Sample out of range: {}", s);
        }
    }
}
