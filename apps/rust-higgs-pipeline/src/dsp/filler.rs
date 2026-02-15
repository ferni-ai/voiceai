//! Filler Injector — Context-aware disfluencies.
//!
//! Inserts natural speech fillers ("um", "hmm", lip smacks) at phrase
//! boundaries based on relationship depth, emotion, and conversational context.
//! Maximum 1-2 fillers per response to avoid overdoing it.

use rand::Rng;

use super::HumanizationContext;

/// Maximum fillers allowed per response.
const MAX_FILLERS: usize = 2;

/// Generate an "um" sound: shaped noise + low frequency hum (~150Hz, 200-400ms).
fn generate_um(sample_rate: u32) -> Vec<f32> {
    let mut rng = rand::thread_rng();
    let duration_ms = rng.gen_range(200.0..400.0);
    let duration_samples = (sample_rate as f64 * duration_ms as f64 / 1000.0) as usize;
    let mut samples = Vec::with_capacity(duration_samples);

    for i in 0..duration_samples {
        let t = i as f32 / sample_rate as f32;
        // Low frequency hum (~150Hz fundamental)
        let hum = 0.02 * (150.0 * 2.0 * std::f32::consts::PI * t).sin();
        // Add slight harmonic content
        let harmonic = 0.008 * (300.0 * 2.0 * std::f32::consts::PI * t).sin();
        // Add very quiet noise for breathiness
        let noise = 0.005 * rng.gen_range(-1.0..1.0f32);

        let raw = hum + harmonic + noise;

        // Envelope: smooth fade in/out
        let progress = i as f32 / duration_samples as f32;
        let env = if progress < 0.15 {
            progress / 0.15
        } else if progress > 0.8 {
            (1.0 - progress) / 0.2
        } else {
            1.0
        };

        samples.push(raw * env);
    }

    samples
}

/// Generate an "hmm" sound: nasal hum (~200Hz, 300-500ms).
fn generate_hmm(sample_rate: u32) -> Vec<f32> {
    let mut rng = rand::thread_rng();
    let duration_ms = rng.gen_range(300.0..500.0);
    let duration_samples = (sample_rate as f64 * duration_ms as f64 / 1000.0) as usize;
    let mut samples = Vec::with_capacity(duration_samples);

    for i in 0..duration_samples {
        let t = i as f32 / sample_rate as f32;
        // Nasal hum (~200Hz with odd harmonics for nasal quality)
        let fundamental = 0.025 * (200.0 * 2.0 * std::f32::consts::PI * t).sin();
        let h3 = 0.012 * (600.0 * 2.0 * std::f32::consts::PI * t).sin();
        let h5 = 0.006 * (1000.0 * 2.0 * std::f32::consts::PI * t).sin();

        let raw = fundamental + h3 + h5;

        // Smooth envelope
        let progress = i as f32 / duration_samples as f32;
        let env = if progress < 0.1 {
            progress / 0.1
        } else if progress > 0.85 {
            (1.0 - progress) / 0.15
        } else {
            1.0
        };

        samples.push(raw * env);
    }

    samples
}

/// Generate a lip smack: brief impulse + low-pass filter (~30ms).
fn generate_lip_smack(sample_rate: u32) -> Vec<f32> {
    let mut rng = rand::thread_rng();
    let duration_ms = 25.0 + rng.gen_range(0.0..10.0);
    let duration_samples = (sample_rate as f64 * duration_ms as f64 / 1000.0) as usize;
    let mut samples = Vec::with_capacity(duration_samples);

    // Generate impulse + filtered noise
    for i in 0..duration_samples {
        let progress = i as f32 / duration_samples as f32;
        // Sharp attack, fast decay
        let env = if progress < 0.1 {
            progress / 0.1
        } else {
            (1.0 - progress).max(0.0).powf(2.0)
        };

        let noise = rng.gen_range(-1.0..1.0f32);
        samples.push(0.04 * noise * env);
    }

    // Apply low-pass filter to soften the smack
    let lp_rc = 1.0 / (2.0 * std::f32::consts::PI * 1500.0);
    let lp_dt = 1.0 / sample_rate as f32;
    let lp_alpha = lp_dt / (lp_rc + lp_dt);
    let mut prev = 0.0f32;
    for sample in samples.iter_mut() {
        prev += lp_alpha * (*sample - prev);
        *sample = prev;
    }

    samples
}

/// Detect phrase boundaries suitable for filler insertion.
/// Returns indices where fillers could naturally occur.
fn detect_filler_points(samples: &[f32], sample_rate: u32) -> Vec<usize> {
    let hop = (sample_rate as usize) / 100; // 10ms hops
    let window = hop * 2;
    let min_silence = (sample_rate as f64 * 0.12) as usize; // 120ms minimum gap

    let mut points = Vec::new();
    let mut silence_start: Option<usize> = None;

    let mut i = 0;
    while i + window <= samples.len() {
        let rms = (samples[i..i + window]
            .iter()
            .map(|s| s * s)
            .sum::<f32>()
            / window as f32)
            .sqrt();

        if rms < 0.02 {
            if silence_start.is_none() {
                silence_start = Some(i);
            }
        } else if let Some(start) = silence_start {
            let silence_len = i - start;
            if silence_len >= min_silence {
                points.push(start);
            }
            silence_start = None;
        }

        i += hop;
    }

    points
}

/// Inject context-aware fillers at phrase boundaries.
///
/// Returns the number of fillers injected.
pub fn inject_fillers(
    samples: &mut Vec<f32>,
    sample_rate: u32,
    context: &HumanizationContext,
) -> usize {
    let points = detect_filler_points(samples, sample_rate);
    if points.is_empty() {
        return 0;
    }

    // Filler probability based on relationship depth (more casual = more fillers)
    let base_prob = 0.15 + 0.35 * context.relationship_depth;

    // Reduce fillers for authoritative/concerned emotions
    let emotion_factor = match context.emotion.as_str() {
        "concerned" | "sad" => 0.3,
        "excited" => 0.5,
        "warm" | "gentle" => 0.8,
        "contemplative" => 0.7,
        _ => 0.6,
    };

    let prob = base_prob * emotion_factor * (0.5 + 0.5 * context.intensity);

    let mut rng = rand::thread_rng();
    let mut injected = 0;
    let mut offset = 0usize;

    for point in &points {
        if injected >= MAX_FILLERS {
            break;
        }

        if rng.gen::<f32>() > prob {
            continue;
        }

        // Choose filler type
        let filler: Vec<f32> = match rng.gen_range(0..10) {
            0..=4 => generate_um(sample_rate),     // 50% chance: "um"
            5..=7 => generate_hmm(sample_rate),     // 30% chance: "hmm"
            _ => generate_lip_smack(sample_rate),   // 20% chance: lip smack
        };

        let insert_pos = (*point + offset).min(samples.len());
        let filler_len = filler.len();
        samples.splice(insert_pos..insert_pos, filler.into_iter());
        offset += filler_len;
        injected += 1;
    }

    injected
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_speech_with_pauses(sample_rate: u32) -> Vec<f32> {
        let mut samples = Vec::new();
        // 0.5s speech
        for i in 0..(sample_rate as usize / 2) {
            let t = i as f32 / sample_rate as f32;
            samples.push(0.3 * (250.0 * 2.0 * std::f32::consts::PI * t).sin());
        }
        // 0.3s silence
        for _ in 0..(sample_rate as usize * 3 / 10) {
            samples.push(0.0);
        }
        // 0.5s speech
        for i in 0..(sample_rate as usize / 2) {
            let t = i as f32 / sample_rate as f32;
            samples.push(0.3 * (300.0 * 2.0 * std::f32::consts::PI * t).sin());
        }
        // 0.2s silence
        for _ in 0..(sample_rate as usize / 5) {
            samples.push(0.0);
        }
        // 0.5s speech
        for i in 0..(sample_rate as usize / 2) {
            let t = i as f32 / sample_rate as f32;
            samples.push(0.3 * (350.0 * 2.0 * std::f32::consts::PI * t).sin());
        }
        samples
    }

    fn default_context() -> HumanizationContext {
        HumanizationContext {
            emotion: "warm".to_string(),
            intensity: 0.7,
            persona: "ferni".to_string(),
            is_first_response: false,
            user_distress_level: 0.0,
            circadian_energy: 0.8,
            relationship_depth: 0.6,
            physiological_state: "normal".to_string(),
            paralinguistic: "none".to_string(),
            user_pitch_hz: None,
            user_energy: None,
            user_jitter: None,
            user_speech_rate: None,
        }
    }

    #[test]
    fn test_generate_um_valid() {
        let um = generate_um(24000);
        assert!(um.len() > 4000); // At least 200ms at 24kHz
        assert!(um.len() < 10000); // At most 400ms at 24kHz
        for s in &um {
            assert!(s.abs() <= 1.0, "Um sample out of range: {}", s);
        }
    }

    #[test]
    fn test_generate_hmm_valid() {
        let hmm = generate_hmm(24000);
        assert!(hmm.len() > 7000); // At least 300ms
        for s in &hmm {
            assert!(s.abs() <= 1.0, "Hmm sample out of range: {}", s);
        }
    }

    #[test]
    fn test_generate_lip_smack_short() {
        let smack = generate_lip_smack(24000);
        assert!(smack.len() < 1000, "Lip smack should be < 40ms");
        for s in &smack {
            assert!(s.abs() <= 1.0, "Lip smack sample out of range: {}", s);
        }
    }

    #[test]
    fn test_max_fillers_respected() {
        let mut samples = make_speech_with_pauses(24000);
        let mut ctx = default_context();
        ctx.relationship_depth = 1.0; // Maximum filler probability
        ctx.intensity = 1.0;
        let count = inject_fillers(&mut samples, 24000, &ctx);
        assert!(
            count <= MAX_FILLERS,
            "Should not exceed {} fillers, got {}",
            MAX_FILLERS,
            count
        );
    }

    #[test]
    fn test_fillers_add_samples() {
        let mut samples = make_speech_with_pauses(24000);
        let original_len = samples.len();
        let ctx = default_context();
        let count = inject_fillers(&mut samples, 24000, &ctx);
        if count > 0 {
            assert!(samples.len() > original_len, "Fillers should add samples");
        }
    }

    #[test]
    fn test_no_fillers_in_continuous_audio() {
        let sample_rate = 24000u32;
        let mut samples: Vec<f32> = (0..sample_rate as usize)
            .map(|i| {
                let t = i as f32 / sample_rate as f32;
                0.3 * (300.0 * 2.0 * std::f32::consts::PI * t).sin()
            })
            .collect();
        let ctx = default_context();
        let count = inject_fillers(&mut samples, sample_rate, &ctx);
        assert_eq!(count, 0, "Continuous audio should have no filler injection");
    }
}
