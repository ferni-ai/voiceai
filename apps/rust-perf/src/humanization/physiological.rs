//! Physiological States — Body-level effects on voice.
//!
//! Models 7 physiological states that affect speech at the body level:
//! voice cracking, crying, laughing, tired, breathless, congested, and hoarse.
//! Each applies distinct DSP effects (pitch breaks, nasal resonance, noise, etc.)
//! scaled by an intensity parameter.

use std::f32::consts::PI;

/// Simple deterministic PRNG seeded from sample count for reproducible effects.
fn simple_rng(seed: u64, index: u64) -> f32 {
    let h = seed
        .wrapping_mul(6364136223846793005)
        .wrapping_add(index);
    let h = h ^ (h >> 33);
    // Map to -1.0..1.0
    ((h & 0x7FFFFFFF) as f32 / 0x7FFFFFFF as f32) * 2.0 - 1.0
}

#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum PhysiologicalState {
    Normal,
    VoiceCracking,
    Crying,
    Laughing,
    Tired,
    Breathless,
    Congested,
    Hoarse,
}

impl PhysiologicalState {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "voice_cracking" | "voicecracking" | "cracking" => Self::VoiceCracking,
            "crying" => Self::Crying,
            "laughing" => Self::Laughing,
            "tired" => Self::Tired,
            "breathless" => Self::Breathless,
            "congested" => Self::Congested,
            "hoarse" => Self::Hoarse,
            _ => Self::Normal,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Normal => "normal",
            Self::VoiceCracking => "voice_cracking",
            Self::Crying => "crying",
            Self::Laughing => "laughing",
            Self::Tired => "tired",
            Self::Breathless => "breathless",
            Self::Congested => "congested",
            Self::Hoarse => "hoarse",
        }
    }
}

#[derive(Debug, Clone)]
pub struct PhysiologicalResult {
    pub state_applied: PhysiologicalState,
    pub modifications: Vec<String>,
}

/// Apply physiological state effects to audio samples.
pub fn apply_physiological_state(
    samples: &mut Vec<f32>,
    sample_rate: u32,
    state: PhysiologicalState,
    intensity: f32,
) -> PhysiologicalResult {
    let intensity = intensity.clamp(0.0, 1.0);

    match state {
        PhysiologicalState::Normal => PhysiologicalResult {
            state_applied: state,
            modifications: vec![],
        },
        PhysiologicalState::VoiceCracking => apply_voice_cracking(samples, sample_rate, intensity),
        PhysiologicalState::Crying => apply_crying(samples, sample_rate, intensity),
        PhysiologicalState::Laughing => apply_laughing(samples, sample_rate, intensity),
        PhysiologicalState::Tired => apply_tired(samples, sample_rate, intensity),
        PhysiologicalState::Breathless => apply_breathless(samples, sample_rate, intensity),
        PhysiologicalState::Congested => apply_congested(samples, sample_rate, intensity),
        PhysiologicalState::Hoarse => apply_hoarse(samples, sample_rate, intensity),
    }
}

/// Voice cracking: random pitch breaks (1-3 per sentence), brief volume dips.
fn apply_voice_cracking(
    samples: &mut Vec<f32>,
    sample_rate: u32,
    intensity: f32,
) -> PhysiologicalResult {
    if samples.is_empty() {
        return PhysiologicalResult {
            state_applied: PhysiologicalState::VoiceCracking,
            modifications: vec![],
        };
    }

    let seed = samples.len() as u64;
    // 1-3 cracks depending on intensity
    let num_cracks = 1 + (intensity * 2.0) as usize;
    let crack_duration_samples = ((20.0 + 30.0 * intensity) / 1000.0 * sample_rate as f32) as usize;

    let mut modifications = Vec::new();

    for i in 0..num_cracks {
        // Pick a random position (avoiding very start/end)
        let margin = samples.len() / 10;
        let range = samples.len().saturating_sub(margin * 2);
        if range == 0 {
            break;
        }
        let rng_val = simple_rng(seed, i as u64);
        let pos = margin + ((rng_val.abs() * range as f32) as usize).min(range - 1);

        let end = (pos + crack_duration_samples).min(samples.len());
        for j in pos..end {
            let progress = (j - pos) as f32 / crack_duration_samples as f32;
            // Invert phase briefly and dip volume to simulate a crack
            let crack_factor = if progress < 0.3 {
                -0.5 * intensity // Phase inversion
            } else if progress < 0.7 {
                0.3 * (1.0 - intensity) // Volume dip
            } else {
                1.0 - (1.0 - progress) * intensity // Recovery
            };
            samples[j] *= crack_factor;
        }

        modifications.push(format!("pitch_break_at: {}ms", pos * 1000 / sample_rate as usize));
    }

    modifications.push(format!("cracks: {}", num_cracks));

    PhysiologicalResult {
        state_applied: PhysiologicalState::VoiceCracking,
        modifications,
    }
}

/// Crying: irregular rhythm, pitch instability, volume swells, nasal resonance boost.
fn apply_crying(
    samples: &mut Vec<f32>,
    sample_rate: u32,
    intensity: f32,
) -> PhysiologicalResult {
    if samples.is_empty() {
        return PhysiologicalResult {
            state_applied: PhysiologicalState::Crying,
            modifications: vec![],
        };
    }

    let seed = samples.len() as u64;
    let mut modifications = Vec::new();

    // Slow pitch LFO (2-4Hz wavering)
    let lfo_freq = 2.0 + 2.0 * intensity;
    for (i, sample) in samples.iter_mut().enumerate() {
        let t = i as f32 / sample_rate as f32;

        // Pitch instability via amplitude modulation at LFO rate
        let pitch_wobble = 1.0 + intensity * 0.15 * (lfo_freq * 2.0 * PI * t).sin();

        // Random volume fluctuations
        let vol_noise = simple_rng(seed, i as u64) * intensity * 0.2;
        let vol_factor = 1.0 + vol_noise;

        *sample *= pitch_wobble * vol_factor;
    }
    modifications.push(format!("pitch_lfo: {:.1}Hz", lfo_freq));

    // Boost 200-400Hz band (nasal resonance from crying)
    apply_band_boost(samples, sample_rate, 200.0, 400.0, 3.0 * intensity);
    modifications.push(format!("nasal_boost: {:.1}dB", 3.0 * intensity));

    PhysiologicalResult {
        state_applied: PhysiologicalState::Crying,
        modifications,
    }
}

/// Laughing: periodic volume bursts, pitch spikes, rhythmic interruptions.
fn apply_laughing(
    samples: &mut Vec<f32>,
    sample_rate: u32,
    intensity: f32,
) -> PhysiologicalResult {
    if samples.is_empty() {
        return PhysiologicalResult {
            state_applied: PhysiologicalState::Laughing,
            modifications: vec![],
        };
    }

    let mut modifications = Vec::new();

    // Periodic bursts every 200-400ms
    let burst_interval = ((300.0 - 100.0 * intensity) / 1000.0 * sample_rate as f32) as usize;
    let burst_duration = (40.0 / 1000.0 * sample_rate as f32) as usize; // 40ms burst
    let mut burst_count = 0;

    if burst_interval > 0 {
        let mut pos = burst_interval;
        while pos + burst_duration < samples.len() {
            for j in 0..burst_duration {
                let idx = pos + j;
                if idx < samples.len() {
                    let env = 1.0 + intensity * 0.6 * (PI * j as f32 / burst_duration as f32).sin();
                    samples[idx] *= env;
                }
            }
            burst_count += 1;
            pos += burst_interval;
        }
    }

    modifications.push(format!("laugh_bursts: {}", burst_count));
    modifications.push(format!("burst_interval: {}ms", burst_interval * 1000 / sample_rate as usize));

    PhysiologicalResult {
        state_applied: PhysiologicalState::Laughing,
        modifications,
    }
}

/// Tired: slower pace, pitch monotone, slight hoarseness, lower volume.
fn apply_tired(
    samples: &mut Vec<f32>,
    sample_rate: u32,
    intensity: f32,
) -> PhysiologicalResult {
    if samples.is_empty() {
        return PhysiologicalResult {
            state_applied: PhysiologicalState::Tired,
            modifications: vec![],
        };
    }

    let mut modifications = Vec::new();

    // Reduce dynamic range (compress toward center)
    let compression = 0.3 * intensity;
    for sample in samples.iter_mut() {
        *sample *= 1.0 - compression;
    }
    modifications.push(format!("volume_reduction: {:.0}%", compression * 100.0));

    // Roll off high frequencies above 3kHz (gentle low-pass)
    let cutoff = 3000.0 - 1000.0 * intensity; // Lower cutoff = more tired
    apply_low_pass(samples, sample_rate, cutoff);
    modifications.push(format!("high_freq_rolloff: {:.0}Hz", cutoff));

    PhysiologicalResult {
        state_applied: PhysiologicalState::Tired,
        modifications,
    }
}

/// Breathless: shorter phrases with breath gaps, slight pitch rise.
fn apply_breathless(
    samples: &mut Vec<f32>,
    sample_rate: u32,
    intensity: f32,
) -> PhysiologicalResult {
    if samples.is_empty() {
        return PhysiologicalResult {
            state_applied: PhysiologicalState::Breathless,
            modifications: vec![],
        };
    }

    let seed = samples.len() as u64;
    let mut modifications = Vec::new();

    // Insert breath gaps (50-100ms silence) every 1-2 seconds
    let gap_interval = ((1.5 - 0.5 * intensity) * sample_rate as f32) as usize;
    let gap_duration = ((50.0 + 50.0 * intensity) / 1000.0 * sample_rate as f32) as usize;
    let mut gaps_inserted = 0;

    if gap_interval > 0 {
        let mut pos = gap_interval;
        while pos < samples.len() {
            let end = (pos + gap_duration).min(samples.len());
            // Fade out before gap
            let fade_len = (gap_duration / 4).max(1);
            for j in 0..fade_len {
                let idx = pos.saturating_sub(fade_len) + j;
                if idx < samples.len() {
                    samples[idx] *= j as f32 / fade_len as f32;
                }
            }
            // Silence for the gap
            for idx in pos..end {
                samples[idx] = 0.0;
            }
            // Add very quiet breath noise in the gap
            for idx in pos..end {
                samples[idx] = simple_rng(seed, idx as u64) * 0.01 * intensity;
            }
            gaps_inserted += 1;
            pos += gap_interval;
        }
    }

    // Slight pitch rise effect via gentle amplitude modulation
    let pitch_rise = intensity * 0.05;
    let total_len = samples.len();
    for (i, sample) in samples.iter_mut().enumerate() {
        let progress = i as f32 / total_len as f32;
        *sample *= 1.0 + pitch_rise * progress;
    }

    modifications.push(format!("breath_gaps: {}", gaps_inserted));
    modifications.push(format!("gap_duration: {}ms", gap_duration * 1000 / sample_rate as usize));

    PhysiologicalResult {
        state_applied: PhysiologicalState::Breathless,
        modifications,
    }
}

/// Congested: nasal resonance boost (200-400Hz), reduced high-freq clarity.
fn apply_congested(
    samples: &mut Vec<f32>,
    sample_rate: u32,
    intensity: f32,
) -> PhysiologicalResult {
    if samples.is_empty() {
        return PhysiologicalResult {
            state_applied: PhysiologicalState::Congested,
            modifications: vec![],
        };
    }

    let mut modifications = Vec::new();

    // Boost 200-400Hz band (nasal resonance)
    let boost_db = 4.0 * intensity;
    apply_band_boost(samples, sample_rate, 200.0, 400.0, boost_db);
    modifications.push(format!("nasal_boost: {:.1}dB", boost_db));

    // Attenuate 2-4kHz band (reduced clarity, muffled)
    let cut_db = 5.0 * intensity;
    apply_band_cut(samples, sample_rate, 2000.0, 4000.0, cut_db);
    modifications.push(format!("clarity_cut: {:.1}dB", cut_db));

    PhysiologicalResult {
        state_applied: PhysiologicalState::Congested,
        modifications,
    }
}

/// Hoarse: add noise to signal, reduce high-freq clarity, slight roughness.
fn apply_hoarse(
    samples: &mut Vec<f32>,
    sample_rate: u32,
    intensity: f32,
) -> PhysiologicalResult {
    if samples.is_empty() {
        return PhysiologicalResult {
            state_applied: PhysiologicalState::Hoarse,
            modifications: vec![],
        };
    }

    let seed = samples.len() as u64;
    let mut modifications = Vec::new();

    // Mix in low-level noise scaled by intensity and current signal amplitude
    let noise_level = 0.08 * intensity;
    for (i, sample) in samples.iter_mut().enumerate() {
        let noise = simple_rng(seed, i as u64) * noise_level;
        // Scale noise with signal amplitude so silence stays silent
        let signal_level = sample.abs().min(1.0);
        *sample += noise * (0.3 + 0.7 * signal_level);
    }
    modifications.push(format!("noise_mix: {:.1}%", noise_level * 100.0));

    // Slight high-freq reduction
    apply_low_pass(samples, sample_rate, 4000.0 - 1000.0 * intensity);
    modifications.push(format!("roughness_filter: {:.0}Hz", 4000.0 - 1000.0 * intensity));

    PhysiologicalResult {
        state_applied: PhysiologicalState::Hoarse,
        modifications,
    }
}

// ── DSP Helpers ──────────────────────────────────────────────────────────

/// Simple single-pole low-pass filter.
fn apply_low_pass(samples: &mut [f32], sample_rate: u32, cutoff_hz: f32) {
    if samples.is_empty() || cutoff_hz <= 0.0 {
        return;
    }
    let rc = 1.0 / (2.0 * PI * cutoff_hz);
    let dt = 1.0 / sample_rate as f32;
    let alpha = dt / (rc + dt);

    let mut prev = samples[0];
    for sample in samples.iter_mut().skip(1) {
        prev += alpha * (*sample - prev);
        *sample = prev;
    }
}

/// Boost a frequency band using a simple resonant filter approach.
/// Adds a filtered version of the signal (band-passed) back into the original.
fn apply_band_boost(samples: &mut [f32], sample_rate: u32, low_hz: f32, high_hz: f32, boost_db: f32) {
    if samples.is_empty() || boost_db <= 0.0 {
        return;
    }

    let gain = (10.0f32).powf(boost_db / 20.0) - 1.0; // Linear gain to add

    // Extract band-passed signal: high-pass at low_hz then low-pass at high_hz
    let mut band = samples.to_vec();

    // High-pass at low_hz (subtract low-passed version)
    let mut lp_low = band.clone();
    apply_low_pass(&mut lp_low, sample_rate, low_hz);
    for (b, l) in band.iter_mut().zip(lp_low.iter()) {
        *b -= l;
    }

    // Low-pass at high_hz
    apply_low_pass(&mut band, sample_rate, high_hz);

    // Add boosted band back to original
    for (s, b) in samples.iter_mut().zip(band.iter()) {
        *s += b * gain;
    }
}

/// Cut a frequency band (attenuate) using the inverse of band boost.
fn apply_band_cut(samples: &mut [f32], sample_rate: u32, low_hz: f32, high_hz: f32, cut_db: f32) {
    if samples.is_empty() || cut_db <= 0.0 {
        return;
    }

    let attenuation = 1.0 - (10.0f32).powf(-cut_db / 20.0); // How much to remove

    // Extract band-passed signal
    let mut band = samples.to_vec();
    let mut lp_low = band.clone();
    apply_low_pass(&mut lp_low, sample_rate, low_hz);
    for (b, l) in band.iter_mut().zip(lp_low.iter()) {
        *b -= l;
    }
    apply_low_pass(&mut band, sample_rate, high_hz);

    // Subtract attenuated band from original
    for (s, b) in samples.iter_mut().zip(band.iter()) {
        *s -= b * attenuation;
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
                0.5 * (freq * 2.0 * PI * t).sin()
            })
            .collect()
    }

    #[test]
    fn test_normal_is_noop() {
        let original = make_sine(24000, 250.0, 1.0);
        let mut samples = original.clone();
        let result = apply_physiological_state(&mut samples, 24000, PhysiologicalState::Normal, 0.8);
        assert_eq!(result.state_applied, PhysiologicalState::Normal);
        assert!(result.modifications.is_empty());
        assert_eq!(samples, original, "Normal state should not modify audio");
    }

    #[test]
    fn test_voice_cracking_processes() {
        let mut samples = make_sine(24000, 250.0, 2.0);
        let original = samples.clone();
        let result = apply_physiological_state(
            &mut samples, 24000, PhysiologicalState::VoiceCracking, 0.7,
        );
        assert_eq!(result.state_applied, PhysiologicalState::VoiceCracking);
        assert!(!result.modifications.is_empty());
        assert_ne!(samples, original, "Voice cracking should modify audio");
    }

    #[test]
    fn test_crying_processes() {
        let mut samples = make_sine(24000, 250.0, 2.0);
        let result = apply_physiological_state(
            &mut samples, 24000, PhysiologicalState::Crying, 0.6,
        );
        assert_eq!(result.state_applied, PhysiologicalState::Crying);
        assert!(result.modifications.iter().any(|m| m.contains("pitch_lfo")));
    }

    #[test]
    fn test_laughing_processes() {
        let mut samples = make_sine(24000, 250.0, 2.0);
        let result = apply_physiological_state(
            &mut samples, 24000, PhysiologicalState::Laughing, 0.8,
        );
        assert_eq!(result.state_applied, PhysiologicalState::Laughing);
        assert!(result.modifications.iter().any(|m| m.contains("laugh_bursts")));
    }

    #[test]
    fn test_tired_reduces_volume() {
        let mut samples = make_sine(24000, 250.0, 1.0);
        let original_energy: f32 = samples.iter().map(|s| s * s).sum();
        apply_physiological_state(&mut samples, 24000, PhysiologicalState::Tired, 0.8);
        let tired_energy: f32 = samples.iter().map(|s| s * s).sum();
        assert!(
            tired_energy < original_energy,
            "Tired state should reduce energy"
        );
    }

    #[test]
    fn test_breathless_inserts_gaps() {
        let mut samples = make_sine(24000, 250.0, 3.0);
        let result = apply_physiological_state(
            &mut samples, 24000, PhysiologicalState::Breathless, 0.7,
        );
        assert!(result.modifications.iter().any(|m| m.contains("breath_gaps")));
    }

    #[test]
    fn test_congested_boosts_nasal() {
        let mut samples = make_sine(24000, 250.0, 1.0);
        let result = apply_physiological_state(
            &mut samples, 24000, PhysiologicalState::Congested, 0.8,
        );
        assert!(result.modifications.iter().any(|m| m.contains("nasal_boost")));
    }

    #[test]
    fn test_hoarse_adds_noise() {
        let mut samples = make_sine(24000, 250.0, 1.0);
        let result = apply_physiological_state(
            &mut samples, 24000, PhysiologicalState::Hoarse, 0.7,
        );
        assert!(result.modifications.iter().any(|m| m.contains("noise_mix")));
    }

    #[test]
    fn test_intensity_scaling() {
        // Low intensity should produce less modification than high intensity
        let base = make_sine(24000, 250.0, 1.0);

        let mut low = base.clone();
        apply_physiological_state(&mut low, 24000, PhysiologicalState::Tired, 0.1);
        let low_energy: f32 = low.iter().map(|s| s * s).sum();

        let mut high = base.clone();
        apply_physiological_state(&mut high, 24000, PhysiologicalState::Tired, 1.0);
        let high_energy: f32 = high.iter().map(|s| s * s).sum();

        assert!(
            high_energy < low_energy,
            "Higher intensity tired should reduce more energy"
        );
    }

    #[test]
    fn test_output_in_valid_range() {
        let states = [
            PhysiologicalState::VoiceCracking,
            PhysiologicalState::Crying,
            PhysiologicalState::Laughing,
            PhysiologicalState::Tired,
            PhysiologicalState::Breathless,
            PhysiologicalState::Congested,
            PhysiologicalState::Hoarse,
        ];
        for state in &states {
            let mut samples = make_sine(24000, 250.0, 1.0);
            apply_physiological_state(&mut samples, 24000, *state, 1.0);
            // Clamp happens in the pipeline, but individual values shouldn't explode
            for s in &samples {
                assert!(
                    s.abs() < 5.0,
                    "Sample wildly out of range for {:?}: {}",
                    state,
                    s
                );
            }
        }
    }

    #[test]
    fn test_from_str_round_trips() {
        let cases = [
            ("voice_cracking", PhysiologicalState::VoiceCracking),
            ("crying", PhysiologicalState::Crying),
            ("laughing", PhysiologicalState::Laughing),
            ("tired", PhysiologicalState::Tired),
            ("breathless", PhysiologicalState::Breathless),
            ("congested", PhysiologicalState::Congested),
            ("hoarse", PhysiologicalState::Hoarse),
            ("normal", PhysiologicalState::Normal),
            ("unknown", PhysiologicalState::Normal),
        ];
        for (input, expected) in &cases {
            let parsed = PhysiologicalState::from_str(input);
            assert_eq!(parsed, *expected, "from_str('{}') failed", input);
        }
    }

    #[test]
    fn test_empty_input() {
        let mut samples = Vec::new();
        let result = apply_physiological_state(
            &mut samples, 24000, PhysiologicalState::Crying, 0.5,
        );
        assert!(samples.is_empty());
        assert!(result.modifications.is_empty());
    }
}
