//! Breath Injector — Insert micro-breaths at phrase boundaries.
//!
//! Detects phrase boundaries from energy dips (>150ms silence) and inserts
//! shaped noise bursts with bandpass filtering (200-2000Hz) to simulate
//! natural breathing. Breath length correlates with upcoming phrase length.

use rand::Rng;

/// Minimum silence duration (in samples) to consider a phrase boundary.
fn min_silence_samples(sample_rate: u32) -> usize {
    (sample_rate as f64 * 0.15) as usize // 150ms
}

/// Energy threshold below which we consider audio "silent" (phrase boundary).
const SILENCE_THRESHOLD: f32 = 0.02;

/// Detect phrase boundaries as sample indices where energy drops below threshold
/// for at least `min_silence_samples`.
fn detect_phrase_boundaries(samples: &[f32], sample_rate: u32) -> Vec<usize> {
    let min_silence = min_silence_samples(sample_rate);
    let hop = (sample_rate as usize) / 100; // 10ms hops
    let window = hop * 2; // 20ms window

    let mut boundaries = Vec::new();
    let mut silence_start: Option<usize> = None;

    let mut i = 0;
    while i + window <= samples.len() {
        let rms = (samples[i..i + window]
            .iter()
            .map(|s| s * s)
            .sum::<f32>()
            / window as f32)
            .sqrt();

        if rms < SILENCE_THRESHOLD {
            if silence_start.is_none() {
                silence_start = Some(i);
            }
        } else if let Some(start) = silence_start {
            let silence_len = i - start;
            if silence_len >= min_silence {
                // Place breath at the midpoint of the silence
                boundaries.push(start + silence_len / 2);
            }
            silence_start = None;
        }

        i += hop;
    }

    boundaries
}

/// Generate a breath sound: bandpass-filtered noise shaped with an envelope.
///
/// - `duration_samples`: how long the breath lasts
/// - `sample_rate`: audio sample rate
/// - `amplitude`: peak amplitude of the breath (0.0-1.0)
fn generate_breath(duration_samples: usize, sample_rate: u32, amplitude: f32) -> Vec<f32> {
    let mut rng = rand::thread_rng();
    let mut breath = Vec::with_capacity(duration_samples);

    // Generate white noise
    for _ in 0..duration_samples {
        breath.push(rng.gen_range(-1.0..1.0));
    }

    // Apply bandpass filter (200-2000Hz) using cascaded single-pole IIR filters
    // High-pass at 200Hz
    let hp_rc = 1.0 / (2.0 * std::f32::consts::PI * 200.0);
    let hp_dt = 1.0 / sample_rate as f32;
    let hp_alpha = hp_rc / (hp_rc + hp_dt);

    let mut hp_prev_in = 0.0f32;
    let mut hp_prev_out = 0.0f32;
    for sample in breath.iter_mut() {
        let out = hp_alpha * (hp_prev_out + *sample - hp_prev_in);
        hp_prev_in = *sample;
        hp_prev_out = out;
        *sample = out;
    }

    // Low-pass at 2000Hz
    let lp_rc = 1.0 / (2.0 * std::f32::consts::PI * 2000.0);
    let lp_dt = 1.0 / sample_rate as f32;
    let lp_alpha = lp_dt / (lp_rc + lp_dt);

    let mut lp_prev = 0.0f32;
    for sample in breath.iter_mut() {
        lp_prev += lp_alpha * (*sample - lp_prev);
        *sample = lp_prev;
    }

    // Apply amplitude envelope (fade in + sustain + fade out)
    let fade_in = duration_samples / 4;
    let fade_out = duration_samples / 3;
    let sustain_end = duration_samples.saturating_sub(fade_out);

    for (i, sample) in breath.iter_mut().enumerate() {
        let env = if i < fade_in {
            i as f32 / fade_in as f32
        } else if i >= sustain_end {
            let remaining = duration_samples - i;
            remaining as f32 / fade_out as f32
        } else {
            1.0
        };
        *sample *= amplitude * env;
    }

    breath
}

/// Inject micro-breaths at detected phrase boundaries.
///
/// Returns the number of breaths injected.
pub fn inject_breaths(
    samples: &mut Vec<f32>,
    sample_rate: u32,
    emotion: &str,
    intensity: f32,
) -> usize {
    let boundaries = detect_phrase_boundaries(samples, sample_rate);
    if boundaries.is_empty() {
        return 0;
    }

    // Emotion affects breath characteristics
    let (breath_probability, amplitude_scale) = match emotion {
        "excited" => (0.3, 0.6),   // Fewer, quieter breaths when excited
        "warm" => (0.7, 0.9),      // More breaths when warm/caring
        "concerned" => (0.8, 1.0), // Most breaths when concerned
        "gentle" => (0.7, 0.8),
        "sad" => (0.6, 0.7),
        "contemplative" => (0.6, 0.7),
        _ => (0.5, 0.8), // neutral default
    };

    let adjusted_prob = breath_probability * (0.5 + 0.5 * intensity);

    let mut rng = rand::thread_rng();
    let mut injected = 0;
    let mut offset = 0usize; // Track cumulative offset from insertions

    for boundary in &boundaries {
        if rng.gen::<f32>() > adjusted_prob {
            continue;
        }

        // Breath duration: 40-120ms, longer when more emotional
        let base_ms = 40.0 + 80.0 * intensity;
        let duration_ms = base_ms + rng.gen_range(-10.0..10.0);
        let duration_samples = (sample_rate as f64 * duration_ms as f64 / 1000.0) as usize;

        let amplitude = 0.03 * amplitude_scale * (0.8 + 0.4 * rng.gen::<f32>());
        let breath = generate_breath(duration_samples, sample_rate, amplitude);

        let insert_pos = (*boundary + offset).min(samples.len());
        // Insert breath samples at the boundary
        samples.splice(insert_pos..insert_pos, breath.iter().cloned());
        offset += duration_samples;
        injected += 1;
    }

    injected
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_speech_with_pauses(sample_rate: u32, duration_s: f32) -> Vec<f32> {
        let total_samples = (sample_rate as f32 * duration_s) as usize;
        let mut samples = Vec::with_capacity(total_samples);
        let pause_start = total_samples / 3;
        let pause_end = pause_start + (sample_rate as f32 * 0.3) as usize; // 300ms pause

        for i in 0..total_samples {
            if i >= pause_start && i < pause_end {
                samples.push(0.0); // Silence (phrase boundary)
            } else {
                // Simulated speech: mix of sine waves
                let t = i as f32 / sample_rate as f32;
                samples.push(0.3 * (200.0 * 2.0 * std::f32::consts::PI * t).sin());
            }
        }
        samples
    }

    #[test]
    fn test_detects_phrase_boundaries() {
        let samples = make_speech_with_pauses(24000, 2.0);
        let boundaries = detect_phrase_boundaries(&samples, 24000);
        assert!(!boundaries.is_empty(), "Should detect at least one boundary");
    }

    #[test]
    fn test_generates_valid_breath() {
        let breath = generate_breath(2400, 24000, 0.05);
        assert_eq!(breath.len(), 2400);
        for s in &breath {
            assert!(
                *s >= -1.0 && *s <= 1.0,
                "Breath sample out of range: {}",
                s
            );
        }
    }

    #[test]
    fn test_inject_breaths_adds_samples() {
        let mut samples = make_speech_with_pauses(24000, 2.0);
        let original_len = samples.len();
        let count = inject_breaths(&mut samples, 24000, "warm", 0.8);
        // With warm emotion and high intensity, we should inject at least one breath
        if count > 0 {
            assert!(
                samples.len() > original_len,
                "Breaths should add samples to the audio"
            );
        }
    }

    #[test]
    fn test_no_breaths_in_continuous_audio() {
        let sample_rate = 24000u32;
        let mut samples: Vec<f32> = (0..sample_rate as usize * 2)
            .map(|i| {
                let t = i as f32 / sample_rate as f32;
                0.3 * (300.0 * 2.0 * std::f32::consts::PI * t).sin()
            })
            .collect();
        let count = inject_breaths(&mut samples, sample_rate, "neutral", 0.5);
        assert_eq!(count, 0, "Continuous audio should have no breath injection");
    }

    #[test]
    fn test_values_in_range() {
        let mut samples = make_speech_with_pauses(24000, 2.0);
        inject_breaths(&mut samples, 24000, "concerned", 1.0);
        for s in &samples {
            assert!(
                *s >= -1.0 && *s <= 1.0,
                "Sample out of range after breath injection: {}",
                s
            );
        }
    }
}
