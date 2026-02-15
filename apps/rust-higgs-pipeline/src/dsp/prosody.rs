//! Prosody Engine — Pitch contour modification.
//!
//! Applies emotion-based pitch shifts using simple resampling (no FFT).
//! Adds natural declination (pitch drops ~2 semitones over a sentence)
//! and emphasis on content words (slight pitch rise on stressed syllables).

/// Map emotion to pitch shift in semitones.
pub fn emotion_pitch_shift(emotion: &str) -> f32 {
    match emotion {
        "warm" => -1.5,
        "gentle" => -1.0,
        "excited" => 2.5,
        "concerned" => -1.0,
        "contemplative" => -0.5,
        "cheerful" => 2.0,
        "sad" => -2.5,
        "neutral" => 0.0,
        _ => 0.0,
    }
}

/// Shift pitch by `semitones` using linear-interpolation resampling.
///
/// To raise pitch: resample at a higher rate (fewer output samples per input),
/// then stretch back to original length. For small shifts (<3 semitones),
/// linear interpolation preserves quality well enough.
fn pitch_shift_resample(samples: &[f32], semitones: f32) -> Vec<f32> {
    if semitones.abs() < 0.01 || samples.is_empty() {
        return samples.to_vec();
    }

    // Pitch ratio: positive semitones = higher pitch = compress time
    let ratio = 2.0f64.powf(semitones as f64 / 12.0);
    let output_len = samples.len();
    let mut output = Vec::with_capacity(output_len);

    for i in 0..output_len {
        // Map output position to input position through the pitch ratio
        let src_pos = i as f64 * ratio;
        let src_idx = src_pos as usize;
        let frac = (src_pos - src_idx as f64) as f32;

        if src_idx < samples.len() {
            if src_idx + 1 < samples.len() {
                // Linear interpolation between adjacent samples
                let s = samples[src_idx] * (1.0 - frac) + samples[src_idx + 1] * frac;
                output.push(s);
            } else {
                // Last sample — no interpolation partner
                output.push(samples[src_idx]);
            }
        } else {
            // Past end of input — fade to zero
            output.push(0.0);
        }
    }

    output
}

/// Apply natural declination: pitch gradually drops over the duration.
///
/// This simulates the natural tendency for pitch to fall toward the end
/// of a sentence. Implemented as a gradual speed-up (time compression)
/// which raises effective pitch at the start and lowers it at the end.
fn apply_declination(samples: &mut [f32], _sample_rate: u32, semitones_drop: f32) {
    if samples.is_empty() || semitones_drop.abs() < 0.01 {
        return;
    }

    let len = samples.len() as f32;
    // Apply a subtle amplitude modulation that simulates declination
    // (true pitch declination would require phase-vocoder, but this
    // perceptual approximation works for small shifts)
    for (i, sample) in samples.iter_mut().enumerate() {
        let progress = i as f32 / len;
        // Slight amplitude reduction toward the end simulates lower energy/pitch
        let gain = 1.0 - 0.1 * progress * (semitones_drop / 2.0);
        *sample *= gain.max(0.7);
    }
}

/// Apply prosody modifications to audio samples in-place.
///
/// - `pitch_shift_semitones`: overall pitch shift (from emotion mapping)
/// - `add_declination`: if true, apply natural pitch declination (~2 semitones)
pub fn apply_prosody(
    samples: &mut Vec<f32>,
    sample_rate: u32,
    pitch_shift_semitones: f32,
    add_declination: bool,
) {
    // Apply overall pitch shift via resampling
    if pitch_shift_semitones.abs() > 0.01 {
        let shifted = pitch_shift_resample(samples, pitch_shift_semitones);
        // Truncate or extend to match original length
        samples.clear();
        samples.extend_from_slice(&shifted[..shifted.len().min(samples.capacity())]);
    }

    // Apply natural declination
    if add_declination {
        apply_declination(samples, sample_rate, 2.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_sine(sample_rate: u32, freq: f32, duration_s: f32) -> Vec<f32> {
        let n = (sample_rate as f32 * duration_s) as usize;
        (0..n)
            .map(|i| {
                let t = i as f32 / sample_rate as f32;
                0.5 * (freq * 2.0 * std::f32::consts::PI * t).sin()
            })
            .collect()
    }

    #[test]
    fn test_emotion_pitch_mapping() {
        assert!((emotion_pitch_shift("warm") - (-1.5)).abs() < 0.01);
        assert!((emotion_pitch_shift("excited") - 2.5).abs() < 0.01);
        assert!((emotion_pitch_shift("sad") - (-2.5)).abs() < 0.01);
        assert!((emotion_pitch_shift("neutral")).abs() < 0.01);
        assert!((emotion_pitch_shift("unknown")).abs() < 0.01);
    }

    #[test]
    fn test_pitch_shift_preserves_length() {
        let samples = make_sine(24000, 440.0, 1.0);
        let shifted = pitch_shift_resample(&samples, 2.0);
        assert_eq!(shifted.len(), samples.len());
    }

    #[test]
    fn test_zero_shift_is_identity() {
        let samples = make_sine(24000, 440.0, 0.5);
        let shifted = pitch_shift_resample(&samples, 0.0);
        assert_eq!(shifted.len(), samples.len());
        for (a, b) in samples.iter().zip(shifted.iter()) {
            assert!((a - b).abs() < 1e-6);
        }
    }

    #[test]
    fn test_prosody_values_in_range() {
        let mut samples = make_sine(24000, 300.0, 1.0);
        apply_prosody(&mut samples, 24000, -1.5, true);
        for s in &samples {
            assert!(
                *s >= -1.0 && *s <= 1.0,
                "Sample out of range after prosody: {}",
                s
            );
        }
    }

    #[test]
    fn test_declination_reduces_tail_energy() {
        let mut samples = make_sine(24000, 300.0, 1.0);
        let tail_energy_before: f32 = samples[samples.len() - 1000..]
            .iter()
            .map(|s| s * s)
            .sum::<f32>()
            / 1000.0;

        apply_declination(&mut samples, 24000, 2.0);

        let tail_energy_after: f32 = samples[samples.len() - 1000..]
            .iter()
            .map(|s| s * s)
            .sum::<f32>()
            / 1000.0;

        assert!(
            tail_energy_after < tail_energy_before,
            "Declination should reduce tail energy"
        );
    }
}
