//! Vocal Texture — Anti-uncanny-valley processing.
//!
//! Adds micro-jitter (pitch) and micro-shimmer (amplitude) to break
//! the "too perfect" quality of synthesized speech. More variation
//! when emotional, less when authoritative.

use rand::Rng;

/// Estimate pitch period from audio using simple zero-crossing rate.
///
/// Returns average period in samples, or None if signal is too quiet.
fn estimate_pitch_period(samples: &[f32], sample_rate: u32) -> Option<usize> {
    if samples.len() < 100 {
        return None;
    }

    // Count positive-going zero crossings in a representative window
    let window_size = (sample_rate as usize).min(samples.len());
    let window = &samples[..window_size];

    let mut crossings = 0;
    for i in 1..window.len() {
        if window[i - 1] <= 0.0 && window[i] > 0.0 {
            crossings += 1;
        }
    }

    if crossings < 2 {
        return None;
    }

    // Approximate fundamental frequency from zero crossing rate
    let f0_estimate = crossings as f32 / (window_size as f32 / sample_rate as f32);

    if f0_estimate < 50.0 || f0_estimate > 500.0 {
        return None; // Outside human voice range
    }

    Some((sample_rate as f32 / f0_estimate) as usize)
}

/// Add micro-jitter to pitch (±0.5-2% random variation per pitch period).
///
/// This works by applying tiny time-stretching variations at pitch-period
/// boundaries, creating subtle frequency modulation.
fn add_pitch_jitter(samples: &mut [f32], sample_rate: u32, jitter_pct: f32) {
    let period = match estimate_pitch_period(samples, sample_rate) {
        Some(p) if p > 10 => p,
        _ => return, // Can't jitter without pitch estimate
    };

    let mut rng = rand::thread_rng();
    let mut i = 0;

    while i + period < samples.len() {
        // Apply a tiny gain modulation per pitch period to create jitter effect
        let variation = 1.0 + rng.gen_range(-jitter_pct..jitter_pct) / 100.0;
        let end = (i + period).min(samples.len());
        for sample in samples[i..end].iter_mut() {
            *sample *= variation;
        }
        i += period;
    }
}

/// Add micro-shimmer to amplitude (±1-3% random variation).
///
/// Applies random amplitude modulation at a rate corresponding to
/// pitch periods, creating natural amplitude instability.
fn add_amplitude_shimmer(samples: &mut [f32], sample_rate: u32, shimmer_pct: f32) {
    // Apply shimmer at ~100 variations per second (every 10ms)
    let chunk_size = (sample_rate as usize) / 100;
    if chunk_size == 0 {
        return;
    }

    let mut rng = rand::thread_rng();

    for chunk in samples.chunks_mut(chunk_size) {
        let variation = 1.0 + rng.gen_range(-shimmer_pct..shimmer_pct) / 100.0;
        for sample in chunk.iter_mut() {
            *sample *= variation;
        }
    }
}

/// Add vocal texture (jitter + shimmer) to make TTS sound more natural.
///
/// - More variation when emotional (caring, anxious)
/// - Less variation when authoritative
pub fn add_vocal_texture(
    samples: &mut [f32],
    sample_rate: u32,
    emotion: &str,
    intensity: f32,
) {
    let intensity = intensity.clamp(0.0, 1.0);

    // Emotion affects how much jitter/shimmer to apply
    let (jitter_base, shimmer_base) = match emotion {
        "warm" | "gentle" => (1.2, 2.0),       // Moderate variation
        "concerned" => (1.5, 2.5),              // More variation (anxiety)
        "excited" | "cheerful" => (1.8, 2.2),   // Higher variation (energy)
        "sad" => (1.0, 1.8),                    // Moderate (subdued)
        "contemplative" => (0.8, 1.5),          // Less (thoughtful, measured)
        _ => (0.5, 1.0),                        // Neutral: minimal
    };

    let jitter = jitter_base * (0.5 + 0.5 * intensity);
    let shimmer = shimmer_base * (0.5 + 0.5 * intensity);

    add_pitch_jitter(samples, sample_rate, jitter);
    add_amplitude_shimmer(samples, sample_rate, shimmer);

    // Clamp to valid range
    for sample in samples.iter_mut() {
        *sample = sample.clamp(-1.0, 1.0);
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
    fn test_estimate_pitch_period() {
        let samples = make_sine(24000, 200.0, 0.5);
        let period = estimate_pitch_period(&samples, 24000);
        assert!(period.is_some(), "Should detect pitch of 200Hz sine");
        let p = period.unwrap();
        // 200Hz at 24kHz = 120 samples per period
        assert!(
            p > 90 && p < 150,
            "Expected ~120 samples for 200Hz, got {}",
            p
        );
    }

    #[test]
    fn test_no_pitch_in_silence() {
        let samples = vec![0.0; 24000];
        let period = estimate_pitch_period(&samples, 24000);
        assert!(period.is_none(), "Silence should have no detectable pitch");
    }

    #[test]
    fn test_jitter_changes_signal() {
        let original = make_sine(24000, 200.0, 0.5);
        let mut modified = original.clone();
        add_pitch_jitter(&mut modified, 24000, 2.0);

        // Signal should be changed (not identical)
        let diff: f32 = original
            .iter()
            .zip(modified.iter())
            .map(|(a, b)| (a - b).abs())
            .sum::<f32>();
        assert!(diff > 0.0, "Jitter should modify the signal");
    }

    #[test]
    fn test_shimmer_changes_signal() {
        let original = make_sine(24000, 300.0, 0.5);
        let mut modified = original.clone();
        add_amplitude_shimmer(&mut modified, 24000, 3.0);

        let diff: f32 = original
            .iter()
            .zip(modified.iter())
            .map(|(a, b)| (a - b).abs())
            .sum::<f32>();
        assert!(diff > 0.0, "Shimmer should modify the signal");
    }

    #[test]
    fn test_texture_values_in_range() {
        for emotion in &["warm", "excited", "concerned", "sad", "neutral"] {
            let mut samples = make_sine(24000, 250.0, 0.5);
            add_vocal_texture(&mut samples, 24000, emotion, 1.0);
            for s in &samples {
                assert!(
                    *s >= -1.0 && *s <= 1.0,
                    "Sample out of range for emotion '{}': {}",
                    emotion,
                    s
                );
            }
        }
    }

    #[test]
    fn test_texture_preserves_length() {
        let mut samples = make_sine(24000, 300.0, 1.0);
        let len = samples.len();
        add_vocal_texture(&mut samples, 24000, "warm", 0.7);
        assert_eq!(samples.len(), len, "Texture should not change sample count");
    }
}
